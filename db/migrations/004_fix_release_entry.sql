-- release_entry: cancelling a pending hold must also fill balance_after.
-- The transactions table requires balance_after on every non-PENDING row, so a REVERSED hold
-- records the ledger balance at the moment it was released (the hold never touched the ledger,
-- so this is simply the account's current balance). Without this, cancelling a bill payment
-- that was paid "now" failed with 422 CONSTRAINT_VIOLATION.
CREATE OR REPLACE FUNCTION release_entry(p_sandbox_id INT, p_tx_id BIGINT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  t transactions%ROWTYPE;
  v_balance NUMERIC(14,2);
BEGIN
  SELECT * INTO t FROM transactions WHERE sandbox_id = p_sandbox_id AND id = p_tx_id FOR UPDATE;
  IF NOT FOUND OR t.status <> 'PENDING' THEN
    RAISE EXCEPTION 'NOT_PENDING: transaction % is not pending', p_tx_id USING ERRCODE = 'P0001';
  END IF;
  UPDATE accounts SET available_balance = available_balance + t.amount
   WHERE sandbox_id = p_sandbox_id AND id = t.account_id
   RETURNING balance INTO v_balance;
  UPDATE transactions SET status = 'REVERSED', balance_after = v_balance
   WHERE sandbox_id = p_sandbox_id AND id = p_tx_id;
END $$;
