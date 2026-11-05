-- Ice Bank schema.
-- Every business table is partitioned by sandbox_id and keyed by (sandbox_id, id), so every
-- sandbox has identical IDs after a reset. Locally there is one sandbox: sandbox_id = 1.
-- Seed rows use IDs below 1,000,000; rows created at runtime take IDs from global_id_seq.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE global_id_seq START WITH 1000000;

CREATE TABLE sandboxes (
  id                    INT PRIMARY KEY,
  name                  TEXT NOT NULL,
  key_hash              TEXT NOT NULL UNIQUE,
  clock_offset_seconds  BIGINT NOT NULL DEFAULT 0,
  -- Daily jobs (interest accrual, monthly interest, loan payments) have run for every day up to this one.
  processed_through     DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Virtual "now" for a sandbox: real time shifted by the sandbox clock offset.
CREATE FUNCTION app_now(p_sandbox_id INT) RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE AS $$
  SELECT now() + make_interval(secs => s.clock_offset_seconds) FROM sandboxes s WHERE s.id = p_sandbox_id
$$;

CREATE TABLE users (
  sandbox_id          INT NOT NULL REFERENCES sandboxes(id),
  id                  BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  email               TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'ADMIN', 'INSTRUCTOR')),
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED', 'DISABLED')),
  failed_login_count  INT NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until        TIMESTAMPTZ,
  classic_view        BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL,
  updated_at          TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  CHECK (email = lower(email))
);
CREATE UNIQUE INDEX ux_users_email ON users (sandbox_id, email);

CREATE TABLE password_history (
  sandbox_id     INT NOT NULL,
  id             BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  user_id        BIGINT NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, user_id) REFERENCES users (sandbox_id, id) ON DELETE CASCADE
);

CREATE TABLE customers (
  sandbox_id     INT NOT NULL,
  id             BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  user_id        BIGINT NOT NULL,
  first_name     TEXT NOT NULL CHECK (length(first_name) BETWEEN 1 AND 50),
  last_name      TEXT NOT NULL CHECK (length(last_name) BETWEEN 1 AND 50),
  date_of_birth  DATE NOT NULL,
  phone          TEXT NOT NULL CHECK (phone ~ '^\(\d{3}\) \d{3}-\d{4}$'),
  address_line1  TEXT NOT NULL,
  address_line2  TEXT,
  city           TEXT NOT NULL,
  province       TEXT NOT NULL CHECK (province IN ('AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT')),
  postal_code    TEXT NOT NULL CHECK (postal_code ~ '^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$'),
  sin_hash       TEXT NOT NULL,
  sin_last3      CHAR(3) NOT NULL CHECK (sin_last3 ~ '^\d{3}$'),
  created_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  UNIQUE (sandbox_id, user_id),
  FOREIGN KEY (sandbox_id, user_id) REFERENCES users (sandbox_id, id),
  CONSTRAINT customers_age_18_check CHECK (date_of_birth <= (created_at AT TIME ZONE 'America/Toronto')::date - INTERVAL '18 years')
);

CREATE TABLE accounts (
  sandbox_id         INT NOT NULL,
  id                 BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id        BIGINT NOT NULL,
  account_number     TEXT NOT NULL CHECK (account_number ~ '^999-\d{5}-\d{7}$'),
  type               TEXT NOT NULL CHECK (type IN ('CHEQUING', 'SAVINGS', 'CREDIT', 'LOAN')),
  nickname           TEXT CHECK (nickname IS NULL OR length(nickname) BETWEEN 1 AND 30),
  balance            NUMERIC(14,2) NOT NULL DEFAULT 0,
  available_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_limit       NUMERIC(14,2),
  interest_rate      NUMERIC(6,4),
  accrued_interest   NUMERIC(14,6) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FROZEN', 'CLOSED')),
  opened_at          TIMESTAMPTZ NOT NULL,
  closed_at          TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, id),
  UNIQUE (sandbox_id, account_number),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  CONSTRAINT accounts_deposit_balance_check CHECK (type NOT IN ('CHEQUING', 'SAVINGS') OR balance >= 0),
  CONSTRAINT accounts_credit_limit_check CHECK (type <> 'CREDIT' OR (credit_limit IS NOT NULL AND balance >= -credit_limit)),
  CONSTRAINT accounts_loan_balance_check CHECK (type <> 'LOAN' OR balance <= 0)
);
CREATE INDEX ix_accounts_customer ON accounts (sandbox_id, customer_id);

CREATE TABLE transactions (
  sandbox_id     INT NOT NULL,
  id             BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  account_id     BIGINT NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  balance_after  NUMERIC(14,2),
  status         TEXT NOT NULL CHECK (status IN ('PENDING', 'POSTED', 'REVERSED')),
  type           TEXT NOT NULL CHECK (type IN ('TRANSFER', 'ETRANSFER', 'BILL_PAYMENT', 'CHEQUE_DEPOSIT', 'INTEREST',
                                               'FEE', 'PURCHASE', 'PAYROLL', 'LOAN_DISBURSEMENT', 'LOAN_PAYMENT',
                                               'REVERSAL', 'ATM', 'CARD_PAYMENT', 'PREAUTHORIZED_DEBIT', 'ADJUSTMENT')),
  description    TEXT NOT NULL,
  reference_id   TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL,
  posted_at      TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, account_id) REFERENCES accounts (sandbox_id, id),
  CHECK (status = 'PENDING' OR balance_after IS NOT NULL)
);
CREATE INDEX ix_transactions_account ON transactions (sandbox_id, account_id, created_at DESC, id DESC);
CREATE INDEX ix_transactions_reference ON transactions (sandbox_id, reference_id);

CREATE TABLE transfers (
  sandbox_id       INT NOT NULL,
  id               BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id      BIGINT NOT NULL,
  from_account_id  BIGINT NOT NULL,
  to_account_id    BIGINT NOT NULL,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  memo             TEXT,
  status           TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED')),
  reference_id     TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, from_account_id) REFERENCES accounts (sandbox_id, id),
  FOREIGN KEY (sandbox_id, to_account_id) REFERENCES accounts (sandbox_id, id),
  CHECK (from_account_id <> to_account_id)
);

CREATE TABLE etransfers (
  sandbox_id             INT NOT NULL,
  id                     BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  sender_customer_id     BIGINT NOT NULL,
  from_account_id        BIGINT NOT NULL,
  recipient_name         TEXT NOT NULL,
  recipient_email        TEXT NOT NULL CHECK (recipient_email = lower(recipient_email)),
  recipient_customer_id  BIGINT,
  deposit_account_id     BIGINT,
  amount                 NUMERIC(14,2) NOT NULL CHECK (amount > 0 AND amount <= 3000),
  message                TEXT CHECK (message IS NULL OR length(message) <= 400),
  security_question      TEXT,
  security_answer_hash   TEXT,
  autodeposit            BOOLEAN NOT NULL DEFAULT FALSE,
  status                 TEXT NOT NULL CHECK (status IN ('PENDING', 'DEPOSITED', 'CANCELLED', 'EXPIRED')),
  reference_id           TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL,
  expires_at             TIMESTAMPTZ NOT NULL,
  deposited_at           TIMESTAMPTZ,
  cancelled_at           TIMESTAMPTZ,
  expired_at             TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, sender_customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, from_account_id) REFERENCES accounts (sandbox_id, id),
  FOREIGN KEY (sandbox_id, recipient_customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, deposit_account_id) REFERENCES accounts (sandbox_id, id),
  CHECK (autodeposit OR (security_question IS NOT NULL AND security_answer_hash IS NOT NULL))
);
CREATE INDEX ix_etransfers_sender ON etransfers (sandbox_id, sender_customer_id, created_at DESC);
CREATE INDEX ix_etransfers_recipient ON etransfers (sandbox_id, recipient_email);

CREATE TABLE etransfer_contacts (
  sandbox_id   INT NOT NULL,
  id           BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id  BIGINT NOT NULL,
  name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  email        TEXT NOT NULL CHECK (email = lower(email)),
  created_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  UNIQUE (sandbox_id, customer_id, email),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id)
);

CREATE TABLE autodeposit_registrations (
  sandbox_id    INT NOT NULL,
  id            BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id   BIGINT NOT NULL,
  email         TEXT NOT NULL CHECK (email = lower(email)),
  account_id    BIGINT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('PENDING_CONFIRMATION', 'ACTIVE')),
  created_at    TIMESTAMPTZ NOT NULL,
  confirmed_at  TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, id),
  UNIQUE (sandbox_id, customer_id),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, account_id) REFERENCES accounts (sandbox_id, id)
);
CREATE UNIQUE INDEX ux_autodeposit_active_email ON autodeposit_registrations (sandbox_id, email) WHERE status = 'ACTIVE';

CREATE TABLE billers (
  sandbox_id              INT NOT NULL,
  id                      BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  name                    TEXT NOT NULL,
  category                TEXT NOT NULL,
  account_number_pattern  TEXT NOT NULL,
  account_number_hint     TEXT NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  UNIQUE (sandbox_id, name)
);

CREATE TABLE payees (
  sandbox_id      INT NOT NULL,
  id              BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id     BIGINT NOT NULL,
  biller_id       BIGINT NOT NULL,
  nickname        TEXT CHECK (nickname IS NULL OR length(nickname) BETWEEN 1 AND 30),
  account_number  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  deleted_at      TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, biller_id) REFERENCES billers (sandbox_id, id)
);
CREATE UNIQUE INDEX ux_payees_active ON payees (sandbox_id, customer_id, biller_id, account_number) WHERE deleted_at IS NULL;

CREATE TABLE bill_payments (
  sandbox_id       INT NOT NULL,
  id               BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id      BIGINT NOT NULL,
  payee_id         BIGINT NOT NULL,
  from_account_id  BIGINT NOT NULL,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  requested_date   DATE NOT NULL,
  posting_date     DATE NOT NULL,
  recurrence       TEXT NOT NULL DEFAULT 'NONE' CHECK (recurrence IN ('NONE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY')),
  series_id        TEXT,
  occurrence       INT NOT NULL DEFAULT 1,
  end_date         DATE,
  status           TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'PENDING', 'POSTED', 'CANCELLED', 'FAILED')),
  failure_reason   TEXT,
  transaction_id   BIGINT,
  reference_id     TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL,
  posted_at        TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, payee_id) REFERENCES payees (sandbox_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (sandbox_id, from_account_id) REFERENCES accounts (sandbox_id, id),
  FOREIGN KEY (sandbox_id, transaction_id) REFERENCES transactions (sandbox_id, id),
  CHECK (posting_date >= requested_date)
);
CREATE INDEX ix_bill_payments_due ON bill_payments (sandbox_id, status, posting_date);

CREATE TABLE cheque_deposits (
  sandbox_id        INT NOT NULL,
  id                BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id       BIGINT NOT NULL,
  account_id        BIGINT NOT NULL,
  amount            NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  immediate_amount  NUMERIC(14,2) NOT NULL CHECK (immediate_amount >= 0),
  held_amount       NUMERIC(14,2) NOT NULL CHECK (held_amount >= 0),
  front_image       BYTEA NOT NULL CHECK (octet_length(front_image) <= 5242880),
  front_mime        TEXT NOT NULL CHECK (front_mime IN ('image/jpeg', 'image/png')),
  back_image        BYTEA NOT NULL CHECK (octet_length(back_image) <= 5242880),
  back_mime         TEXT NOT NULL CHECK (back_mime IN ('image/jpeg', 'image/png')),
  status            TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reject_reason     TEXT,
  transaction_id    BIGINT,
  decided_by        BIGINT,
  decided_at        TIMESTAMPTZ,
  reference_id      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, account_id) REFERENCES accounts (sandbox_id, id),
  CHECK (immediate_amount + held_amount = amount)
);

CREATE TABLE cards (
  sandbox_id           INT NOT NULL,
  id                   BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id          BIGINT NOT NULL,
  account_id           BIGINT NOT NULL,
  type                 TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
  number_encrypted     TEXT NOT NULL,
  last4                CHAR(4) NOT NULL CHECK (last4 ~ '^\d{4}$'),
  expiry_month         INT NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year          INT NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('ACTIVE', 'LOCKED', 'CANCELLED')),
  daily_pos_limit      NUMERIC(14,2) CHECK (daily_pos_limit IS NULL OR (daily_pos_limit BETWEEN 500 AND 5000 AND mod(daily_pos_limit, 100) = 0)),
  replaced_by_card_id  BIGINT,
  cancel_reason        TEXT,
  created_at           TIMESTAMPTZ NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, account_id) REFERENCES accounts (sandbox_id, id),
  CHECK (type <> 'DEBIT' OR daily_pos_limit IS NOT NULL)
);

CREATE TABLE loan_applications (
  sandbox_id             INT NOT NULL,
  id                     BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id            BIGINT NOT NULL,
  amount                 NUMERIC(14,2) NOT NULL CHECK (amount BETWEEN 1000 AND 50000),
  term_months            INT NOT NULL CHECK (term_months BETWEEN 12 AND 60),
  purpose                TEXT NOT NULL,
  annual_income          NUMERIC(14,2) NOT NULL CHECK (annual_income > 0),
  monthly_debt_payments  NUMERIC(14,2) NOT NULL CHECK (monthly_debt_payments >= 0),
  apr                    NUMERIC(6,4) NOT NULL,
  monthly_payment        NUMERIC(14,2) NOT NULL,
  dti_percent            NUMERIC(7,2) NOT NULL,
  disbursement_account_id BIGINT NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('APPROVED', 'MANUAL_REVIEW', 'DECLINED')),
  decision_source        TEXT NOT NULL CHECK (decision_source IN ('AUTOMATIC', 'ADMIN')),
  decision_reason        TEXT,
  decided_by             BIGINT,
  decided_at             TIMESTAMPTZ,
  loan_id                BIGINT,
  created_at             TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, disbursement_account_id) REFERENCES accounts (sandbox_id, id)
);

CREATE TABLE loans (
  sandbox_id               INT NOT NULL,
  id                       BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id              BIGINT NOT NULL,
  application_id           BIGINT NOT NULL,
  account_id               BIGINT NOT NULL,
  principal                NUMERIC(14,2) NOT NULL CHECK (principal > 0),
  apr                      NUMERIC(6,4) NOT NULL,
  term_months              INT NOT NULL,
  monthly_payment          NUMERIC(14,2) NOT NULL,
  total_interest           NUMERIC(14,2) NOT NULL,
  first_payment_date       DATE NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAID_OFF')),
  created_at               TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  UNIQUE (sandbox_id, application_id),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, application_id) REFERENCES loan_applications (sandbox_id, id),
  FOREIGN KEY (sandbox_id, account_id) REFERENCES accounts (sandbox_id, id)
);

CREATE TABLE loan_schedule (
  sandbox_id         INT NOT NULL,
  loan_id            BIGINT NOT NULL,
  installment_no     INT NOT NULL CHECK (installment_no >= 1),
  due_date           DATE NOT NULL,
  payment            NUMERIC(14,2) NOT NULL CHECK (payment > 0),
  principal          NUMERIC(14,2) NOT NULL CHECK (principal >= 0),
  interest           NUMERIC(14,2) NOT NULL CHECK (interest >= 0),
  remaining_balance  NUMERIC(14,2) NOT NULL CHECK (remaining_balance >= 0),
  status             TEXT NOT NULL DEFAULT 'DUE' CHECK (status IN ('DUE', 'PAID', 'MISSED')),
  paid_at            TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, loan_id, installment_no),
  FOREIGN KEY (sandbox_id, loan_id) REFERENCES loans (sandbox_id, id) ON DELETE CASCADE,
  CHECK (payment = principal + interest)
);

CREATE TABLE disputes (
  sandbox_id      INT NOT NULL,
  id              BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  customer_id     BIGINT NOT NULL,
  transaction_id  BIGINT NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('UNAUTHORIZED', 'DUPLICATE', 'INCORRECT_AMOUNT', 'NOT_RECEIVED', 'CANCELLED_SERVICE', 'OTHER')),
  description     TEXT CHECK (description IS NULL OR length(description) <= 500),
  status          TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'REJECTED')),
  created_at      TIMESTAMPTZ NOT NULL,
  resolved_at     TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, customer_id) REFERENCES customers (sandbox_id, id),
  FOREIGN KEY (sandbox_id, transaction_id) REFERENCES transactions (sandbox_id, id)
);
CREATE UNIQUE INDEX ux_disputes_one_open ON disputes (sandbox_id, transaction_id) WHERE status = 'OPEN';

CREATE TABLE notifications (
  sandbox_id  INT NOT NULL,
  id          BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  user_id     BIGINT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('MONEY_MOVEMENT', 'LOGIN', 'SECURITY', 'ACCOUNT', 'LOAN', 'DEPOSIT')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL,
  read_at     TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, user_id) REFERENCES users (sandbox_id, id)
);
CREATE INDEX ix_notifications_user ON notifications (sandbox_id, user_id, created_at DESC);

CREATE TABLE inbox_messages (
  sandbox_id  INT NOT NULL REFERENCES sandboxes(id),
  id          BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  to_email    TEXT NOT NULL CHECK (to_email = lower(to_email)),
  from_name   TEXT NOT NULL DEFAULT 'Ice Bank',
  kind        TEXT NOT NULL CHECK (kind IN ('OTP', 'PASSWORD_RESET', 'ETRANSFER', 'EMAIL_CHANGE', 'AUTODEPOSIT', 'WELCOME', 'NOTICE')),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  otp_code    TEXT,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL,
  read_at     TIMESTAMPTZ,
  PRIMARY KEY (sandbox_id, id)
);
CREATE INDEX ix_inbox_email ON inbox_messages (sandbox_id, to_email, created_at DESC);

CREATE TABLE otp_codes (
  sandbox_id   INT NOT NULL,
  id           BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  user_id      BIGINT NOT NULL,
  purpose      TEXT NOT NULL CHECK (purpose IN ('LOGIN', 'EMAIL_CHANGE', 'AUTODEPOSIT')),
  code_hash    TEXT NOT NULL,
  token_hash   TEXT,
  target       TEXT,
  attempts     INT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, user_id) REFERENCES users (sandbox_id, id)
);

CREATE TABLE password_reset_tokens (
  sandbox_id  INT NOT NULL,
  id          BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  user_id     BIGINT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, user_id) REFERENCES users (sandbox_id, id)
);

CREATE TABLE refresh_tokens (
  sandbox_id  INT NOT NULL,
  id          BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  user_id     BIGINT NOT NULL,
  session_id  TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  FOREIGN KEY (sandbox_id, user_id) REFERENCES users (sandbox_id, id)
);
CREATE INDEX ix_refresh_session ON refresh_tokens (sandbox_id, session_id);

CREATE TABLE idempotency_keys (
  sandbox_id        INT NOT NULL,
  id                BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  user_id           BIGINT NOT NULL,
  idempotency_key   TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 100),
  method            TEXT NOT NULL,
  path              TEXT NOT NULL,
  request_hash      TEXT NOT NULL,
  response_status   INT,
  response_body     JSONB,
  response_headers  JSONB,
  created_at        TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id),
  UNIQUE (sandbox_id, user_id, idempotency_key),
  FOREIGN KEY (sandbox_id, user_id) REFERENCES users (sandbox_id, id)
);

CREATE TABLE audit_log (
  sandbox_id     INT NOT NULL REFERENCES sandboxes(id),
  id             BIGINT NOT NULL DEFAULT nextval('global_id_seq'),
  actor_user_id  BIGINT,
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      BIGINT,
  old_value      JSONB,
  new_value      JSONB,
  created_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (sandbox_id, id)
);
CREATE INDEX ix_audit_entity ON audit_log (sandbox_id, entity_type, entity_id);
CREATE INDEX ix_audit_created ON audit_log (sandbox_id, created_at DESC);
