# Ice Bank build plan (v2)

## Decisions
- Build everything first, then teach. Build order is chosen to keep the work simple, not to match the teaching weeks.
- **Two separate codebases:**
  - `ice-bank` (the student copy). It has no bugs, no bug packs, no training pages or routes, no `training_state` table, and no override hooks. Each student runs it on their own PC.
  - `ice-bank-trainer` (the instructor copy). It is built later. It starts as a fork of `ice-bank`, and each bug pack is planted as an ordinary code change on its own branch or patch. That covers bugs in the browser (Pack 7), the HTTP layer (Pack 6) and the database (Pack 5), so no hooks are needed. The instructor deploys it. Fixes made in `ice-bank` get merged into it.
- Current scope: `ice-bank` only, plus the tutorials and docs that go with it.

## Fixes built into the student copy
1. **Login automation:** `GET /inbox?email=...` works with the sandbox key and needs no login, so a test can read its OTP.
2. *(Moved to the trainer repo.)*
3. **IDs per sandbox:** `(sandbox_id, id)` and `(sandbox_id, account_number)` are unique within a sandbox instead of across the whole database. A new registration joins the sandbox given by its key, or the default sandbox when there is none.
4. **Reset:** reset runs in a transaction that turns off `trg_transactions_immutable` for that one sandbox only, through a session setting the trigger checks. Every other path stays blocked.
5. **Clock:** reset sets the sandbox's app clock back to a fixed start date (seed date `2026-01-15`, America/Toronto). `POST /test/clock` moves the clock and runs any payments that are due straight away, before it returns.
6. **Cheque upload:** the app runs locally, so Vercel's limit no longer applies. Each image is limited to 5 MB and stored in Postgres (`bytea`) so it works the same on every OS.
7. *(Moved to the trainer repo.)*

## Default rules (change these if you want something else)
- Money is stored as integer cents and rounded half-up to the cent. Interest and loan schedules are rounded per period, and any leftover cents go into the last payment.
- Time zone is America/Toronto for daily limits, business days and the clock. Holidays follow the Ontario bank holiday list.
- Loan decision inputs are annual income, monthly debt payments and the amount requested. The rule is a debt-to-income ratio of at most 40%.
- The Perf User (50,000 transactions) is seeded only when you run `npm run seed:perf`, never by default.
- Windows is a first-class target: embedded Postgres plus a cross-platform script runner, with CI running on Windows and macOS.
