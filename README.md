# Ice Bank

Ice Bank is a **fictional Canadian bank built only as a test target**. It behaves like a real online bank (real validation, business rules and error messages) so you can practise REST Assured, Selenium, SQL/JDBC and JMeter against something realistic.

> Not a real bank. Never enter real personal or financial information.

- **App:** http://localhost:3000
- **Swagger UI:** http://localhost:3000/swagger (OpenAPI JSON at `/api/v1/openapi.json`)
- **Ice Mail** (the fake email inbox, where sign-in codes arrive): http://localhost:3000/mail
- **Tutorials:** `npm run tutorials`, then open http://localhost:4000
- **Locator list:** [docs/LOCATORS.md](docs/LOCATORS.md) (every `data-testid`)

## 1. Setup (Windows 11, macOS or Linux)

You only need **Node.js 22 or newer** (LTS recommended) and **Git**. No Docker and no separate database install.

```bash
git clone https://github.com/umidscodes/IceBank.git
cd IceBank
npm install
npm run dev
```

The first `npm run dev`:
1. starts an embedded PostgreSQL 16 on port **5433** (data stays in `.icebank/pgdata`)
2. creates the tables, triggers, views and roles
3. seeds the demo data
4. starts the app on http://localhost:3000

Press **Ctrl+C** to stop both. Later runs start in a few seconds.

| Command | What it does |
| --- | --- |
| `npm run dev` | Database + migrations + seed (first run) + app on 3000 |
| `npm start` | Same, but with a production build (faster pages) |
| `npm run reset` | Puts the data back to the seed state (same as `POST /api/v1/test/reset`) |
| `npm run seed:perf` | Adds the Perf User (50,000 transactions) for JMeter. A reset keeps it. |
| `npm run db:start` | Runs only the database (for DBeaver / JDBC practice) |
| `npm run tutorials` | Tutorial site on http://localhost:4000 |
| `npm test` | The app's own smoke tests (50+ business rules, against a separate test database) |

**Settings:** you can override defaults through environment variables (see `.env.example`):
- `PORT` (default 3000) and `DB_PORT` (default 5433)
- `PERF_MODE=true` turns off rate limits, for JMeter load tests
- `DATABASE_URL` points the app at your own PostgreSQL instead of the embedded one

**If the embedded database will not start** (usually antivirus on Windows):
```bash
docker compose up -d
set DATABASE_URL=postgres://postgres:postgres@localhost:5433/icebank
npm run dev
```
In PowerShell, use `$env:DATABASE_URL="postgres://postgres:postgres@localhost:5433/icebank"` instead of the `set` line.

## 2. Sign in

Every seeded user has the password **`IceBank#2026`**. Sign-in takes two steps:
1. Enter email and password.
2. Enter the 6-digit code sent to **Ice Mail**. It is valid for 5 minutes and allows 3 attempts.

| Persona | Email | Customer id | Scenario |
| --- | --- | --- | --- |
| Emma Tremblay | `emma.tremblay@icebank.test` | 1 | Happy path: all four account types, contacts, payees, a scheduled monthly bill, a received pending e-Transfer |
| Liam Chen | `liam.chen@icebank.test` | 2 | Locked out. Stays locked until a teller unlocks him (user id 2). |
| Olivia Singh | `olivia.singh@icebank.test` | 3 | Credit card $40 under its $5,000 limit |
| Noah Martin | `noah.martin@icebank.test` | 4 | Brand-new customer, chequing only, no history |
| Ava Roy | `ava.roy@icebank.test` | 5 | Chequing account frozen by a teller |
| Lucas Gagnon | `lucas.gagnon@icebank.test` | 6 | Loan application in manual review (id 2) and a pending $850 cheque deposit (id 1) |
| Teller | `teller@icebank.test` | user 51 | `ADMIN` role: the teller portal at `/admin` |
| Perf User | `perf.user@icebank.test` | 900 | 50,000 transactions on account 900. Only after `npm run seed:perf`. |

There are about 50 customers in total (ids 1 to 50), each with two years of history.

**Persona accounts after a reset**

| Customer | Account id | Type | Number | Balance | Available | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Emma 1 | 1 | CHEQUING | 999-10045-1007919 | 5703.95 | 5703.95 | OPEN |
| Emma 1 | 2 | SAVINGS | 999-20012-1015838 | 76178.63 | 76178.63 | OPEN |
| Emma 1 | 3 | CREDIT | 999-30077-1023757 | -195.35 | -195.35 | OPEN |
| Emma 1 | 4 | LOAN | 999-10021-1031676 | -6402.47 | -6402.47 | OPEN |
| Liam 2 | 5 | CHEQUING | 999-10045-1039595 | 5315.64 | 5315.64 | OPEN |
| Liam 2 | 6 | SAVINGS | 999-20012-1047514 | 43552.17 | 43552.17 | OPEN |
| Olivia 3 | 7 | CHEQUING | 999-30077-1055433 | 38925.46 | 38925.46 | OPEN |
| Olivia 3 | 8 | CREDIT | 999-10021-1063352 | -4960.00 | -4960.00 | OPEN |
| Noah 4 | 9 | CHEQUING | 999-10045-1071271 | 0.00 | 0.00 | OPEN |
| Ava 5 | 10 | CHEQUING | 999-20012-1079190 | 5474.74 | 5474.74 | FROZEN |
| Ava 5 | 11 | SAVINGS | 999-30077-1087109 | 44694.02 | 44694.02 | OPEN |
| Lucas 6 | 12 | CHEQUING | 999-10021-1095028 | 8080.53 | 7330.53 | OPEN |
| Lucas 6 | 13 | SAVINGS | 999-10045-1102947 | 68839.97 | 68839.97 | OPEN |

Credit card and loan balances are **negative when money is owed**; the UI shows them as "balance owing". Seeded rows have ids below 1,000,000; anything created later gets an id from 1,000,000 up.

## 3. Test support: reset, clock and Ice Mail API

Send the header **`X-Sandbox-Key: ICEBANK-LOCAL-KEY`** to these endpoints.

| Call | Use |
| --- | --- |
| `GET /api/v1/test/health` | Health check (no key needed) |
| `POST /api/v1/test/reset` | Restores the exact seed data, same ids and balances, and sets the clock back to **Mon 2026-11-02 09:00 Toronto** |
| `GET /api/v1/test/clock` | The sandbox's virtual date and time |
| `POST /api/v1/test/clock` | Moves the clock forward. Send exactly one of `{"advanceDays": 30}`, `{"advanceMinutes": 16}`, `{"date": "2026-12-01"}` or `{"dateTime": "2026-12-01T09:00:00-05:00"}`. Due work (scheduled payments, interest, loan payments, e-Transfer expiry) runs **before the response**. The clock never moves backwards. |
| `GET /api/v1/inbox?email=...&kind=OTP` | Reads any inbox in your sandbox without signing in. Each message has an `otpCode` and a `link` field. |

The app uses the sandbox clock for everything business-related: lockouts, OTP and reset-link expiry, limits, scheduling and statements. Real time keeps ticking forward from wherever you set the clock.

**Automated sign-in, step by step:**
1. `POST /auth/login` returns an `mfaToken`.
2. `GET /inbox?email=<you>&kind=OTP&size=1`, with the sandbox key, returns the code in `otpCode`.
3. `POST /auth/mfa/verify` with `{mfaToken, code}` returns `accessToken` (15 min) and `refreshToken` (7 days).
4. Send `Authorization: Bearer <accessToken>` on later calls.

### Postman

The `postman/` folder has a ready-made collection with 55 requests, covering every area of the API.

1. In Postman, click **Import** and select both `postman/IceBank.postman_collection.json` and `postman/IceBank-local.postman_environment.json`.
2. Choose the **Ice Bank - local** environment (top right).
3. Open **1. Sign in** and send the three requests in order. They save `accessToken`, and every other request then uses it automatically.

Notes:
- **Another persona:** change `email` in the environment. The password stays `IceBank#2026`.
- **Admin requests:** they have their own sign-in at the top of **10. Admin (teller)**.
- **Expired token:** access tokens last 15 minutes. Send **Refresh tokens**, or sign in again.
- **Cheque deposit:** it uploads `postman/sample-cheque-front.png` and `-back.png`. If Postman says a file is missing, click each file field and pick the images from the `postman` folder.
- **Whole-collection run:** use the Collection Runner, or `npx newman run postman/IceBank.postman_collection.json -e postman/IceBank-local.postman_environment.json --working-dir postman`. It starts with a reset, so it can run again and again.
- **Changing the collection:** if you change endpoints, regenerate it with `node scripts/postman/build.mjs`.

## 4. API conventions

- Base path `/api/v1`, JSON only, camelCase fields.
- Money is a decimal **string** with 2 places (`"1250.00"`), stored as `NUMERIC(14,2)`. Use `BigDecimal`, not `double`. Inputs accept a string or a JSON number with **at most 2 decimals**; 3 decimals is a 400, never rounded.
- Dates are ISO 8601 with offset (`2026-11-04T21:15:00-05:00`); plain dates are `2026-11-04`.
- Errors are RFC 7807 `application/problem+json`: `type`, `title`, `status`, `detail`, `instance`, `code` (machine-readable), and for validation `errors: [{field, message}]`.
- Status codes:
  - 200, or 201 with a `Location` header, or 204 on success
  - 400 for malformed or invalid input, and 401 for no token or a bad one
  - 403 for the wrong role, and 404 for not found, including another customer's resource
  - 409 for a duplicate or a state conflict
  - 422 when a business rule is broken (e.g. `INSUFFICIENT_FUNDS`, `DAILY_LIMIT_EXCEEDED`)
  - 429 when rate limited, with a `Retry-After` header
  - A wrong login is 401 `INVALID_CREDENTIALS` (with `attemptsRemaining`); a locked user is 401 `ACCOUNT_LOCKED`.
- Pagination: `?page=0&size=20&sort=createdAt,desc` returns `{content, page, size, totalElements, totalPages}`. Page size is 1 to 100.
- Idempotency: money-moving POSTs need an `Idempotency-Key` header. Same key + same body replays the first response (header `Idempotent-Replayed: true`); same key + a different body is 409. This covers transfers, e-Transfers including cancel and accept, bill payments and cheque deposits.
- Every response carries `X-Request-Id`. Send your own and it is echoed back.
- Rate limits: login endpoints 10 per minute per IP; everything else 120 per minute per user. `PERF_MODE=true` turns them off.

## 5. Business rules (the test oracle)

All times use **America/Toronto**. Amounts are rounded half-up to the cent.

| Area | Rules |
| --- | --- |
| Registration | Age 18+ on the sandbox date (422 `UNDERAGE`); postal code `A1A 1A1` (Canadian letters only); phone `(###) ###-####`; province one of the 13 codes; SIN 9 digits, Luhn-valid, not starting with 0 or 8; email unique per sandbox (409 `EMAIL_TAKEN`). A new customer gets a chequing account and a debit card. |
| Password | 8 to 64 characters with an uppercase letter, a lowercase letter, a digit and a special character. A new password cannot equal any of the last 3. |
| Sign-in | 5 failed logins lock the user for 15 minutes (the 5th failure locks). OTP expires after 5 minutes, 3 attempts. Idle session: warning modal at 9 minutes, sign-out at 10. |
| Reset link | Valid 30 minutes, single use. Sent to Ice Mail. |
| Accounts | Number = `999` (fictional institution) - 5-digit transit - 7-digit account. Savings 2.25% a year, accrued daily, paid after the last day of each month. Credit card limit $5,000, APR 20.99% (shown, not charged in v1), minimum payment = greater of $10 or 3% of the amount owing. Up to 3 savings accounts; nickname 1 to 30 characters. |
| Transactions | Filters: date range inclusive at both ends, type, direction, status, min/max amount, text search. Newest first. Page size 1 to 100, default 20. |
| Transfers | Between your own accounts, instant. $0.01 to $999,999.99, max 2 decimals. Cannot exceed the available balance (a credit card can use its available credit). Source and target must differ. Frozen accounts are blocked. Loan accounts can receive, not send. |
| e-Transfer | Per transfer $0.01 to $3,000; per Toronto day $3,000; rolling 30 days $10,000. Pending and deposited count; cancelled and expired don't. Security answer: 3 to 25 characters, case-insensitive, not in the message. Recipients with autodeposit get it instantly (no question needed); otherwise it stays pending until accepted. The sender can cancel while pending (full refund, `REVERSAL` row). It expires after 30 days (refund). Up to 50 contacts. The autodeposit email must be your own and is confirmed by OTP. |
| Bill payments | Pay now: money held at once, posts on the next business day. Scheduled: posts on the chosen date, or the next business day if it is a weekend or holiday; funds are checked on that day (`FAILED` if short). Weekly, biweekly or monthly; a monthly payment on the 29th to 31st falls on the last day of shorter months. Payee account numbers must match the biller's format. A payee with scheduled payments cannot be deleted. |
| Holidays | New Year's Day, Family Day, Good Friday, Victoria Day, Canada Day, Civic Holiday, Labour Day, National Day for Truth and Reconciliation, Thanksgiving, Remembrance Day, Christmas, Boxing Day. A holiday on a weekend is observed on the next weekday. |
| Cheque deposit | JPG or PNG (checked by content), max 5 MB each side. Daily limit $5,000. The first $100 is available immediately; the rest is held until a teller approves. A rejection reverses the deposit. |
| Cards | Lock and unlock instantly. Report lost cancels the card and issues a new Luhn-valid number. Daily debit POS limit $500 to $5,000 in $100 steps. Numbers are always masked to the last 4. |
| Loans | $1,000 to $50,000, 12 to 60 months, APR 8.99%. Payment = P·r/(1−(1+r)^−n) with r = APR/12, rounded to the cent. DTI % = (monthly debts + new payment) ÷ (annual income ÷ 12) × 100, rounded to 2 decimals: **under 35.00 approved**, **35.00 to 45.00 manual review**, **over 45.00 declined**. Each schedule row's interest is rounded; the last row absorbs the leftover cents. Installments are collected from the chequing account on their due dates. |
| Disputes | Posted debits only. Within 60 Toronto calendar days of posting. One open dispute per transaction. |
| Notifications | Created on every money movement, sign-in and security change. |

## 6. Database (SQL / JDBC)

| Setting | Value |
| --- | --- |
| JDBC URL | `jdbc:postgresql://localhost:5433/icebank` |
| Read-only user | `qa_reader` / `qa_reader` |
| Read-write user (test setup) | `qa_writer` / `qa_writer` |
| App user (not for tests) | `icebank_app` |

Every business table has `sandbox_id`, which is always `1` locally, and a primary key of `(sandbox_id, id)`. The objects worth testing:

- **`post_transfer(from_account, to_account, amount, reference [, sandbox])`** moves money atomically and returns the debit transaction id. It writes two transaction rows sharing `reference_id`, two balance updates and one `TRANSFER_POSTED` audit row, or nothing at all. Errors use SQLSTATE `P0001`, with messages starting `INSUFFICIENT_FUNDS:`, `SAME_ACCOUNT:`, `ACCOUNT_FROZEN:` and so on. JDBC: `{? = call post_transfer(?, ?, ?, ?)}`.
- **`trg_transactions_audit`** writes an `audit_log` row on every insert (`TRANSACTION_CREATED`) and every status change.
- **`trg_transactions_immutable`** blocks changing amount, direction or account, and blocks deleting any `POSTED` row.
- **Views:** `v_account_summary` (balance, pending count, last transaction date) and `v_daily_etransfer_totals` (per customer per Toronto day).
- **`app_now(sandbox_id)`** returns the sandbox's virtual time.
- **Constraints:** `balance >= 0` for chequing and savings, `balance >= -credit_limit` for credit, one open dispute per transaction (partial unique index), payees `ON DELETE RESTRICT`, and CHECK constraints on postal code, province, phone and status values.

## 7. Selenium practice map

| Challenge | Where |
| --- | --- |
| Explicit waits | Transfer and e-Transfer confirm: a "Processing" state for 1 to 3 seconds |
| Disappearing toasts | Success and error toasts hide after 4 seconds (`toast-success`, `toast-error`) |
| Modal dialog | Session-timeout warning at 9 minutes idle (`session-timeout-modal`). To shorten it while practising, run `localStorage.setItem("icebank-idle-warning-seconds","20")` and `localStorage.setItem("icebank-idle-logout-seconds","40")` in DevTools. |
| Multi-step form | Registration wizard at `/register` |
| Native dropdowns | Province, account selectors |
| Custom autocomplete | Biller search when adding a payee (`/bills/payees`) |
| Date picker | Scheduled bill payment date (`/bills`) |
| File upload / download | Cheque images (`/deposit`); CSV and statement PDF (`/statements`, account page) |
| New tab or window | Ice Mail, "View PDF" statements |
| iframe | Loan calculator on `/loans` |
| Browser alert | Native `confirm()` when cancelling an e-Transfer (`/etransfer`) |
| Hover menu | Top navigation sub-menus |
| Dynamic table | Transactions table: sortable, filterable, paginated (`/accounts/{id}`) |
| Hard mode | Profile → **Classic view**. The dashboard, transactions and payees pages switch to an old layout with no `data-testid`, ids that change on every load, and nested tables. |

## 8. Project layout

```
src/app/            pages (App Router) and /api/v1 route files (thin; handlers live in src/server/api)
src/server/api/     REST handlers + OpenAPI docs, one module per area
src/server/         db pool, request handling (auth, idempotency, rate limits, errors), due-work processor
src/lib/            money, dates/business days, validation, loans
src/ui/             shared UI components and page helpers
db/migrations/      SQL schema, functions, triggers, views, roles
db/seed/            deterministic seed and personas
scripts/            dev.ts (embedded Postgres + app), reset, perf seed
tests/              smoke tests (Vitest)
tutorials/          static tutorial site
docs/               SPEC.md, LOCATORS.md
```

## 9. Starter test project

`starter/` is a ready-to-run Java test project (Maven, JUnit 5, REST Assured, Selenium, JDBC, Allure) that Tutorials 7 to 10 build on.
With Ice Bank running, `cd starter && mvn test` runs its API, DB and UI examples against your local app. It never resets your data
or moves the clock unless you ask for the `destructive` tests. Setup, commands, environments and the project map are in
[starter/README.md](starter/README.md).
