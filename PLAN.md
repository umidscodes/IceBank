# Ice Bank build plan (v3)

The spec is in [`docs/SPEC.md`](docs/SPEC.md). This file records where the build differs from the spec, and the rules the spec leaves open.

## Repos
- **`IceBank`** (this repo) is the **clean student build**. It contains no bug code, no `src/bugs`, no `instructor/`, no `training_state`, no Training Console, no `/training/*` routes and no `hookable()` wrapper.
- **`IceBank-Trainer`** (private, built later) starts as a fork of this repo. Each bug pack is a plain code change switched by per-sandbox state. Because the trainer can change any layer directly, the browser-level bugs (Pack 7), request and response contract bugs (Pack 6) and database bugs (Pack 5) need no special hooks. Fixes made here get merged into the trainer.
- So `npm run export:student` isn't needed. The instructor pack and the tutorial answer keys go into the trainer repo.

## Deviations from the spec
| Spec | Build | Why |
| --- | --- | --- |
| Prisma for data access | `pg` with hand-written SQL in `src/server/db` | Prisma's engine downloads are the most common reason `npm install` fails on Windows behind a proxy. Triggers, views and the function are raw SQL anyway. Plain SQL in the code base is also something students can read and learn from. |
| `account_number` unique; numeric PKs | Every business table has PK `(sandbox_id, id)`, and `account_number` and `email` are unique per sandbox | Every sandbox has the same IDs after a reset, so one test suite runs unchanged against `local` and `qa`. New rows take IDs from a shared sequence that starts at 1,000,000. |
| `clock_offset_days` | `sandboxes.clock_offset_seconds` (the API still reports `offsetDays`) | Reset sets the clock to the fixed seed instant **2026-11-02T09:00 America/Toronto**, so "59 days ago" always means the same thing. `POST /test/clock` changes the offset and runs any due work before it returns. SQL function `app_now(sandbox_id)` gives the virtual time inside the database. |
| `GET /inbox` needs login | `GET /inbox` also accepts `X-Sandbox-Key` plus `?email=` with no token | Automated login: a test can read the OTP before it has a token. |
| Reset blocked by `trg_transactions_immutable` | The trigger allows a delete only while `icebank.reset_sandbox` is set for that transaction to the same sandbox. Only `reset_sandbox()` sets it. | Reset works, and every other path stays blocked. |
| Hosted cheque images | 5 MB per image, as the spec says | The clean build runs locally, so Vercel's request size limit doesn't apply. The trainer's QA deploy will need 2 MB. |
| Perf User in every sandbox | Seeded only by `npm run seed:perf` (local) | Keeps the default database small and a reset fast. |

## Rules the spec leaves open (documented in the README as the oracle)
- **Time zone:** America/Toronto for "today", daily and rolling limits, business days and statement months.
- **Holidays (no posting):** New Year's Day, Family Day, Good Friday, Victoria Day, Canada Day, Civic Holiday, Labour Day, National Day for Truth and Reconciliation, Thanksgiving, Remembrance Day, Christmas Day, Boxing Day. A holiday that falls on a weekend moves to the next business day.
- **Rounding:** half-up to the cent at every posted amount.
  - Savings interest: daily accrual is kept to 6 decimals, then rounded when paid on the 1st of each month.
  - Credit card: interest is charged on the 1st of each month at owed × 20.99% / 12.
  - Loans: monthly rate = APR / 12. The payment is the standard annuity amount rounded to the cent. Each row's interest is rounded to the cent, and the last row absorbs any leftover cents, so the schedule sums exactly to principal plus interest.
- **Loans:** APR is fixed at 8.99%.
  - DTI % = (existing monthly debt payments + new loan payment) ÷ (annual income ÷ 12) × 100, rounded to 2 decimals.
  - Under 35.00 is approved, 35.00 to 45.00 inclusive goes to manual review, and over 45.00 is declined.
  - Inputs are `annualIncome`, `monthlyDebtPayments`, `amount`, `termMonths` and `purpose`.
- **Signs:** credit card and loan balances are stored negative when money is owed. The UI shows them as "amount owing". The dashboard total is the sum of all balances.
- **e-Transfer limits:** "daily" is the Toronto calendar day. "Rolling 30 days" is now minus 30 × 24 hours. Pending and deposited transfers count toward both; cancelled and expired ones don't.
- **Cheque deposits:** the first $100 (or the whole amount, if smaller) is available at once. The rest stays held until an admin approves. If the deposit is rejected, the $100 already made available is reversed.
