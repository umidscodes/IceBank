-- Database objects students test over JDBC: posting functions, post_transfer,
-- triggers on transactions and the summary views.
--
-- Session settings read by triggers (set with SET LOCAL by the app):
--   icebank.actor_user_id   who is acting (audit_log.actor_user_id)
--   icebank.reset_sandbox   only set by reset_sandbox(); lets the reset delete POSTED rows
--   icebank.skip_audit      set while seeding history so the seed does not double the audit log

CREATE FUNCTION current_actor() RETURNS BIGINT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('icebank.actor_user_id', true), '')::BIGINT
$$;

-- --------------------------------------------------------------------------------------------
-- Ledger primitives. Every money movement goes through these, so balances, available balances
-- and balance_after always agree.
-- --------------------------------------------------------------------------------------------

-- Post a completed entry: moves balance and available balance, writes one POSTED transaction row.
CREATE FUNCTION post_entry(
  p_sandbox_id INT, p_account_id BIGINT, p_direction TEXT, p_amount NUMERIC,
  p_type TEXT, p_description TEXT, p_reference TEXT
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_delta NUMERIC(14,2);
  v_balance NUMERIC(14,2);
  v_tx_id BIGINT;
  v_now TIMESTAMPTZ := app_now(p_sandbox_id);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be greater than 0' USING ERRCODE = 'P0001';
  END IF;
  v_delta := CASE p_direction WHEN 'CREDIT' THEN p_amount WHEN 'DEBIT' THEN -p_amount END;
  IF v_delta IS NULL THEN
    RAISE EXCEPTION 'INVALID_DIRECTION: %', p_direction USING ERRCODE = 'P0001';
  END IF;

  UPDATE accounts
     SET balance = balance + v_delta,
         available_balance = available_balance + v_delta
   WHERE sandbox_id = p_sandbox_id AND id = p_account_id
  RETURNING balance INTO v_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: account % does not exist', p_account_id USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO transactions (sandbox_id, account_id, direction, amount, balance_after, status, type,
                            description, reference_id, created_at, posted_at)
  VALUES (p_sandbox_id, p_account_id, p_direction, p_amount, v_balance, 'POSTED', p_type,
          p_description, p_reference, v_now, v_now)
  RETURNING id INTO v_tx_id;
  RETURN v_tx_id;
END $$;

-- Place a pending debit: reduces available balance only. balance_after stays NULL until settled.
CREATE FUNCTION hold_entry(
  p_sandbox_id INT, p_account_id BIGINT, p_amount NUMERIC,
  p_type TEXT, p_description TEXT, p_reference TEXT
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_tx_id BIGINT;
BEGIN
  UPDATE accounts SET available_balance = available_balance - p_amount
   WHERE sandbox_id = p_sandbox_id AND id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: account % does not exist', p_account_id USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO transactions (sandbox_id, account_id, direction, amount, balance_after, status, type,
                            description, reference_id, created_at)
  VALUES (p_sandbox_id, p_account_id, 'DEBIT', p_amount, NULL, 'PENDING', p_type,
          p_description, p_reference, app_now(p_sandbox_id))
  RETURNING id INTO v_tx_id;
  RETURN v_tx_id;
END $$;

-- Settle a pending debit: PENDING -> POSTED, the balance moves now.
CREATE FUNCTION settle_entry(p_sandbox_id INT, p_tx_id BIGINT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  t transactions%ROWTYPE;
  v_balance NUMERIC(14,2);
BEGIN
  SELECT * INTO t FROM transactions WHERE sandbox_id = p_sandbox_id AND id = p_tx_id FOR UPDATE;
  IF NOT FOUND OR t.status <> 'PENDING' THEN
    RAISE EXCEPTION 'NOT_PENDING: transaction % is not pending', p_tx_id USING ERRCODE = 'P0001';
  END IF;
  UPDATE accounts SET balance = balance - t.amount
   WHERE sandbox_id = p_sandbox_id AND id = t.account_id
  RETURNING balance INTO v_balance;
  UPDATE transactions SET status = 'POSTED', balance_after = v_balance, posted_at = app_now(p_sandbox_id)
   WHERE sandbox_id = p_sandbox_id AND id = p_tx_id;
END $$;

-- Release a pending debit without posting it: PENDING -> REVERSED, available balance restored.
CREATE FUNCTION release_entry(p_sandbox_id INT, p_tx_id BIGINT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  t transactions%ROWTYPE;
BEGIN
  SELECT * INTO t FROM transactions WHERE sandbox_id = p_sandbox_id AND id = p_tx_id FOR UPDATE;
  IF NOT FOUND OR t.status <> 'PENDING' THEN
    RAISE EXCEPTION 'NOT_PENDING: transaction % is not pending', p_tx_id USING ERRCODE = 'P0001';
  END IF;
  UPDATE accounts SET available_balance = available_balance + t.amount
   WHERE sandbox_id = p_sandbox_id AND id = t.account_id;
  UPDATE transactions SET status = 'REVERSED' WHERE sandbox_id = p_sandbox_id AND id = p_tx_id;
END $$;

-- --------------------------------------------------------------------------------------------
-- post_transfer: moves money between two accounts atomically.
-- Two transaction rows (DEBIT + CREDIT sharing reference_id), two balance updates and one
-- TRANSFER_POSTED audit row - or nothing at all. Returns the DEBIT transaction id.
--
-- JDBC:  {? = call post_transfer(?, ?, ?, ?)}     (sandbox defaults to 1)
-- Errors are raised with SQLSTATE P0001 and a message starting with a code, e.g.
--   INSUFFICIENT_FUNDS, SAME_ACCOUNT, ACCOUNT_FROZEN, ACCOUNT_NOT_FOUND, INVALID_AMOUNT
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION post_transfer(
  from_account BIGINT, to_account BIGINT, amount NUMERIC, reference TEXT, sandbox INT DEFAULT 1
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_from accounts%ROWTYPE;
  v_to accounts%ROWTYPE;
  v_available NUMERIC(14,2);
  v_debit_id BIGINT;
  v_credit_id BIGINT;
  v_desc_from TEXT;
  v_desc_to TEXT;
BEGIN
  IF amount IS NULL OR amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be greater than 0' USING ERRCODE = 'P0001';
  END IF;
  IF amount <> round(amount, 2) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must have at most 2 decimal places' USING ERRCODE = 'P0001';
  END IF;
  IF amount > 999999.99 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be at most 999999.99' USING ERRCODE = 'P0001';
  END IF;
  IF from_account = to_account THEN
    RAISE EXCEPTION 'SAME_ACCOUNT: source and target accounts must differ' USING ERRCODE = 'P0001';
  END IF;
  IF reference IS NULL OR length(trim(reference)) = 0 THEN
    RAISE EXCEPTION 'INVALID_REFERENCE: reference is required' USING ERRCODE = 'P0001';
  END IF;

  -- Lock both rows in id order so concurrent transfers cannot deadlock.
  PERFORM 1 FROM accounts a WHERE a.sandbox_id = sandbox AND a.id IN (from_account, to_account)
    ORDER BY a.id FOR UPDATE;
  SELECT * INTO v_from FROM accounts a WHERE a.sandbox_id = sandbox AND a.id = from_account;
  SELECT * INTO v_to FROM accounts a WHERE a.sandbox_id = sandbox AND a.id = to_account;
  IF v_from.id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: account % does not exist', from_account USING ERRCODE = 'P0001';
  END IF;
  IF v_to.id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: account % does not exist', to_account USING ERRCODE = 'P0001';
  END IF;
  IF v_from.status = 'FROZEN' OR v_to.status = 'FROZEN' THEN
    RAISE EXCEPTION 'ACCOUNT_FROZEN: frozen accounts cannot send or receive transfers' USING ERRCODE = 'P0001';
  END IF;
  IF v_from.status <> 'OPEN' OR v_to.status <> 'OPEN' THEN
    RAISE EXCEPTION 'ACCOUNT_CLOSED: closed accounts cannot send or receive transfers' USING ERRCODE = 'P0001';
  END IF;
  IF v_from.type = 'LOAN' THEN
    RAISE EXCEPTION 'INVALID_SOURCE: money cannot be transferred out of a loan account' USING ERRCODE = 'P0001';
  END IF;

  v_available := CASE WHEN v_from.type = 'CREDIT'
                      THEN v_from.available_balance + v_from.credit_limit
                      ELSE v_from.available_balance END;
  IF amount > v_available THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: available balance is %', v_available USING ERRCODE = 'P0001';
  END IF;
  IF v_to.type IN ('LOAN') AND v_to.balance + amount > 0 THEN
    RAISE EXCEPTION 'OVERPAYMENT: amount is more than the loan balance owing' USING ERRCODE = 'P0001';
  END IF;

  v_desc_from := 'Transfer to ' || initcap(v_to.type) || ' ' || right(v_to.account_number, 4);
  v_desc_to := 'Transfer from ' || initcap(v_from.type) || ' ' || right(v_from.account_number, 4);

  v_debit_id := post_entry(sandbox, from_account, 'DEBIT', amount,
                           CASE WHEN v_to.type = 'LOAN' THEN 'LOAN_PAYMENT'
                                WHEN v_to.type = 'CREDIT' THEN 'CARD_PAYMENT' ELSE 'TRANSFER' END,
                           v_desc_from, reference);
  v_credit_id := post_entry(sandbox, to_account, 'CREDIT', amount,
                            CASE WHEN v_to.type = 'LOAN' THEN 'LOAN_PAYMENT'
                                 WHEN v_to.type = 'CREDIT' THEN 'CARD_PAYMENT' ELSE 'TRANSFER' END,
                            v_desc_to, reference);

  INSERT INTO audit_log (sandbox_id, actor_user_id, action, entity_type, entity_id, old_value, new_value, created_at)
  VALUES (sandbox, current_actor(), 'TRANSFER_POSTED', 'transfer', v_debit_id,
          jsonb_build_object('fromBalance', v_from.balance, 'toBalance', v_to.balance),
          jsonb_build_object('fromAccountId', from_account, 'toAccountId', to_account,
                             'amount', amount, 'reference', reference,
                             'debitTransactionId', v_debit_id, 'creditTransactionId', v_credit_id),
          app_now(sandbox));
  RETURN v_debit_id;
END $$;

-- --------------------------------------------------------------------------------------------
-- Triggers on transactions
-- --------------------------------------------------------------------------------------------

-- trg_transactions_audit: one audit row on every insert and on every status change.
CREATE FUNCTION fn_transactions_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('icebank.skip_audit', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (sandbox_id, actor_user_id, action, entity_type, entity_id, old_value, new_value, created_at)
    VALUES (NEW.sandbox_id, current_actor(), 'TRANSACTION_CREATED', 'transaction', NEW.id, NULL,
            jsonb_build_object('accountId', NEW.account_id, 'direction', NEW.direction, 'amount', NEW.amount,
                               'status', NEW.status, 'type', NEW.type, 'balanceAfter', NEW.balance_after,
                               'referenceId', NEW.reference_id),
            app_now(NEW.sandbox_id));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO audit_log (sandbox_id, actor_user_id, action, entity_type, entity_id, old_value, new_value, created_at)
    VALUES (NEW.sandbox_id, current_actor(), 'TRANSACTION_STATUS_CHANGED', 'transaction', NEW.id,
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status, 'balanceAfter', NEW.balance_after),
            app_now(NEW.sandbox_id));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_transactions_audit
AFTER INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION fn_transactions_audit();

-- trg_transactions_immutable: amount and account can never change; POSTED rows can never be
-- deleted. The only exception is reset_sandbox(), which sets icebank.reset_sandbox for its own
-- transaction and may only delete rows of that sandbox.
CREATE FUNCTION fn_transactions_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.account_id IS DISTINCT FROM OLD.account_id
       OR NEW.sandbox_id IS DISTINCT FROM OLD.sandbox_id OR NEW.direction IS DISTINCT FROM OLD.direction THEN
      RAISE EXCEPTION 'IMMUTABLE_TRANSACTION: amount, direction and account of transaction % cannot be changed', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status = 'POSTED' AND NEW.status NOT IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'IMMUTABLE_TRANSACTION: a POSTED transaction can only become REVERSED'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- The flag alone is not enough: it only counts inside reset_sandbox(), which runs as its
    -- owner (SECURITY DEFINER), never as one of the application or test roles.
    IF OLD.status = 'POSTED'
       AND (current_setting('icebank.reset_sandbox', true) IS DISTINCT FROM OLD.sandbox_id::TEXT
            OR current_user IN ('icebank_app', 'qa_writer', 'qa_reader')) THEN
      RAISE EXCEPTION 'IMMUTABLE_TRANSACTION: POSTED transaction % cannot be deleted', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_transactions_immutable
BEFORE UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION fn_transactions_immutable();

-- --------------------------------------------------------------------------------------------
-- Views
-- --------------------------------------------------------------------------------------------

CREATE VIEW v_account_summary AS
SELECT a.sandbox_id,
       a.id                AS account_id,
       a.customer_id,
       a.account_number,
       a.type,
       a.nickname,
       a.status,
       a.balance,
       a.available_balance,
       COALESCE(p.pending_count, 0) AS pending_count,
       l.last_transaction_at
FROM accounts a
LEFT JOIN LATERAL (
  SELECT count(*)::INT AS pending_count FROM transactions t
  WHERE t.sandbox_id = a.sandbox_id AND t.account_id = a.id AND t.status = 'PENDING'
) p ON TRUE
LEFT JOIN LATERAL (
  SELECT max(t.created_at) AS last_transaction_at FROM transactions t
  WHERE t.sandbox_id = a.sandbox_id AND t.account_id = a.id
) l ON TRUE;

-- One row per sender per Toronto calendar day. Cancelled and expired transfers do not count.
CREATE VIEW v_daily_etransfer_totals AS
SELECT e.sandbox_id,
       e.sender_customer_id AS customer_id,
       (e.created_at AT TIME ZONE 'America/Toronto')::DATE AS day,
       count(*)::INT AS transfer_count,
       sum(e.amount)::NUMERIC(14,2) AS total_amount
FROM etransfers e
WHERE e.status IN ('PENDING', 'DEPOSITED')
GROUP BY e.sandbox_id, e.sender_customer_id, (e.created_at AT TIME ZONE 'America/Toronto')::DATE;

-- --------------------------------------------------------------------------------------------
-- Reset: removes every row of one sandbox (the seed then re-inserts the same rows).
-- --------------------------------------------------------------------------------------------
CREATE FUNCTION reset_sandbox(p_sandbox_id INT) RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('icebank.reset_sandbox', p_sandbox_id::TEXT, true);
  DELETE FROM audit_log WHERE sandbox_id = p_sandbox_id;
  DELETE FROM idempotency_keys WHERE sandbox_id = p_sandbox_id;
  DELETE FROM refresh_tokens WHERE sandbox_id = p_sandbox_id;
  DELETE FROM password_reset_tokens WHERE sandbox_id = p_sandbox_id;
  DELETE FROM otp_codes WHERE sandbox_id = p_sandbox_id;
  DELETE FROM inbox_messages WHERE sandbox_id = p_sandbox_id;
  DELETE FROM notifications WHERE sandbox_id = p_sandbox_id;
  DELETE FROM disputes WHERE sandbox_id = p_sandbox_id;
  DELETE FROM loan_schedule WHERE sandbox_id = p_sandbox_id;
  UPDATE loan_applications SET loan_id = NULL WHERE sandbox_id = p_sandbox_id;
  DELETE FROM loans WHERE sandbox_id = p_sandbox_id;
  DELETE FROM loan_applications WHERE sandbox_id = p_sandbox_id;
  DELETE FROM cards WHERE sandbox_id = p_sandbox_id;
  DELETE FROM cheque_deposits WHERE sandbox_id = p_sandbox_id;
  DELETE FROM bill_payments WHERE sandbox_id = p_sandbox_id;
  DELETE FROM payees WHERE sandbox_id = p_sandbox_id;
  DELETE FROM billers WHERE sandbox_id = p_sandbox_id;
  DELETE FROM autodeposit_registrations WHERE sandbox_id = p_sandbox_id;
  DELETE FROM etransfer_contacts WHERE sandbox_id = p_sandbox_id;
  DELETE FROM etransfers WHERE sandbox_id = p_sandbox_id;
  DELETE FROM transfers WHERE sandbox_id = p_sandbox_id;
  DELETE FROM transactions WHERE sandbox_id = p_sandbox_id;
  DELETE FROM accounts WHERE sandbox_id = p_sandbox_id;
  DELETE FROM customers WHERE sandbox_id = p_sandbox_id;
  DELETE FROM password_history WHERE sandbox_id = p_sandbox_id;
  DELETE FROM users WHERE sandbox_id = p_sandbox_id;
  PERFORM set_config('icebank.reset_sandbox', '', true);
END $$;
