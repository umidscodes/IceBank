/* Tutorial 5: Manual QA fundamentals. Business rules quoted from docs/SPEC.md and PLAN.md (the test oracle). */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "qa",
  number: 5,
  title: "Manual QA fundamentals",
  summary: "The thinking behind good tests: test design techniques, exploratory testing and bug reports, all applied to Ice Bank's real rules.",
  intro: `
<p>Automation runs tests; it does not decide which tests are worth running. That is test design, and it is the skill interviewers probe most. Ice Bank is useful here
because every rule is exact: you can always say what the correct result is <em>before</em> you test. Keep the business rules (Swagger descriptions, README) open as your
<strong>oracle</strong>, the source that tells you the expected result.</p>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "sdlc-stlc",
      title: "SDLC and STLC",
      summary: "Where testing fits in building software, and the phases of the testing work itself.",
      body: `
<p>The <strong>Software Development Life Cycle (SDLC)</strong> is the path from idea to running software: requirements → design → build → test → release → maintain. In Waterfall these
are long sequential phases; in Agile (lesson 11) the same steps happen in small loops every sprint. Either way, the cost of a bug grows the later it is found: a wrong rule
caught while reading a requirement costs a conversation, the same rule caught in production costs money, support calls and trust.</p>

<h3>The Software Testing Life Cycle (STLC)</h3>
<ol>
<li><strong>Requirement analysis</strong>: read the rules and ask questions. Is "daily limit" a calendar day or 24 hours? In which time zone? (Ice Bank: Toronto calendar day.)
Every open question is a potential bug.</li>
<li><strong>Test planning</strong>: scope, approach, environments, who does what, entry and exit criteria (lesson 2).</li>
<li><strong>Test case design</strong>: write the cases with techniques such as boundaries and decision tables (lessons 3 to 6), and prepare test data.</li>
<li><strong>Environment setup</strong>: Ice Bank local with a known state (reset), QA sandbox, personas, DB access.</li>
<li><strong>Test execution</strong>: run the cases, log results, raise bugs (lesson 8), re-test fixes.</li>
<li><strong>Test closure</strong>: summary report (what was tested, what passed, open bugs, risks), lessons learned.</li>
</ol>

<h3>Verification vs validation</h3>
<p><strong>Verification</strong>: are we building the product right (does it match the spec)? <strong>Validation</strong>: are we building the right product (does it solve the customer's
problem)? A transfer screen can match the spec perfectly and still confuse every user.</p>

<h3>Shift left</h3>
<p>Testers add the most value early: reviewing requirements, asking "what happens when…" before code exists, agreeing on acceptance criteria. On this course you see a finished
app, but practise the habit: for each feature, write your questions before you click anything.</p>`,
      examples: [
        {
          title: "Requirement analysis: questions about one Ice Bank rule",
          lang: "text",
          code: `
Rule: "Interac e-Transfer: per transfer $0.01 to $3,000; daily $3,000; rolling 30-day $10,000;
       pending transfers count toward limits."

Questions a tester asks (and Ice Bank's answers, from PLAN.md):
- Which time zone is "daily"?                     -> America/Toronto calendar day
- Is "rolling 30 days" 30 calendar days or 720 h? -> now minus 30 x 24 hours
- Do cancelled or expired transfers count?        -> No; PENDING and DEPOSITED do
- Is $3,000.00 itself allowed?                    -> Yes (limits are inclusive)
- Are amounts with 3 decimals rounded?            -> No, rejected with 400`,
        },
      ],
      exercises: [
        "Pick the bill payments feature from the business rules. Write at least eight questions you would ask in requirement analysis, then find the answer to each in Swagger, the README or by trying it on Ice Bank local.",
        "Map this course onto the STLC: for each phase, write what you will actually produce in the next three weeks (e.g. test plan document, Postman collection, REST Assured suite, bug reports).",
        "Find one thing in Ice Bank that matches the spec but that you think a real customer would find confusing (a validation problem, not a verification one). Write it up in three sentences.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "plan-vs-strategy",
      title: "Test plan vs test strategy",
      summary: "The long-lived approach versus the concrete plan for one release or project.",
      body: `
<p>Both documents answer "how will we test?", at different levels.</p>
<div class="table-wrap"><table>
<thead><tr><th></th><th>Test strategy</th><th>Test plan</th></tr></thead>
<tbody>
<tr><td>Scope</td><td>Organisation or product, long-lived</td><td>One project, release or sprint</td></tr>
<tr><td>Answers</td><td><em>How</em> we test in general: levels, types, tools, automation approach, environments, standards</td><td><em>What, when, who</em>: features in and out of scope, schedule, people, entry/exit criteria, risks</td></tr>
<tr><td>Changes</td><td>Rarely</td><td>Every release</td></tr>
<tr><td>Ice Bank example</td><td>"API tests in REST Assured are the main layer; UI tests only for critical journeys; DB checks for every money movement; every suite runs on local and QA with <code>-Denv</code>."</td><td>"Week 2: e-Transfer and bill payments; Ava, Lucas personas; exit when every pack 2 and 6 bug is caught."</td></tr>
</tbody></table></div>

<h3>What goes in a test plan (IEEE 829 style, trimmed to what matters)</h3>
<ul>
<li><strong>Scope</strong>: features in scope and explicitly out of scope (e.g. "French UI and mobile are out of scope for v1").</li>
<li><strong>Approach</strong>: which test types and levels for which features.</li>
<li><strong>Environments and data</strong>: local clean build, QA buggy build, personas, reset strategy.</li>
<li><strong>Entry criteria</strong>: when testing can start ("app starts, health is UP, seed data loaded").</li>
<li><strong>Exit criteria</strong>: when you are done ("all high-priority cases run, no open Critical bugs, 20+ green API tests on local").</li>
<li><strong>Risks and mitigations</strong>: "QA environment shared and may be paused → run the keep-alive health check; keep local as a fallback".</li>
<li><strong>Deliverables and schedule</strong>.</li>
</ul>

<h3>The test pyramid in a strategy</h3>
<p>Most checks at the fastest, most stable layer (API and DB), fewer at the UI. A rule such as "transfer amount must have at most 2 decimals" is tested twenty ways through the API
in seconds; through Selenium you only need one case to prove the UI shows the error.</p>`,
      examples: [
        {
          title: "One-page test plan skeleton for a week of Ice Bank testing",
          lang: "markdown",
          code: `
# Test plan: Ice Bank API, week 2 (transfers, e-Transfers, bill payments)

## Scope
In:  POST/GET /transfers, /etransfers (+cancel/accept), /payees, /bill-payments
Out: UI layout, admin portal, cheque images, performance

## Approach
API functional + negative + boundary (REST Assured); DB verification of money movement (JDBC);
one UI smoke journey per feature (Selenium)

## Environments & data
local (clean, reset before suite), QA sandbox <n> (packs 2 and 6 enabled)
Personas: Emma (happy path), Ava (frozen), Olivia (near card limit), Noah (empty)

## Entry criteria
GET /api/v1/test/health is UP on both environments; Postman collection green on local

## Exit criteria
All P1 cases run on both envs; suite green on local; every failure on QA has a bug report

## Risks
Shared QA data changed by others -> each test creates its own data
Clock-dependent rules -> use POST /test/clock only in my own sandbox`,
        },
      ],
      exercises: [
        "Write a half-page test strategy for your team's Ice Bank framework: layers, tools, environments, what is automated where, and how test data is handled.",
        "Write a one-page test plan for the week 1 exercise map (REST Assured foundations), including measurable entry and exit criteria.",
        "List five risks to your testing over the next three weeks (technical or practical) with a mitigation for each.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "test-case",
      title: "Anatomy of a test case",
      summary: "Write cases that anyone can run and that give the same verdict every time.",
      body: `
<p>A test case is a precise recipe: from a known starting state, do these steps, and expect exactly this result. A good case can be run by someone else (or turned into code)
without asking you anything.</p>

<h3>The fields</h3>
<div class="table-wrap"><table>
<thead><tr><th>Field</th><th>Purpose</th></tr></thead>
<tbody>
<tr><td>ID and title</td><td>Unique and specific: <code>TC-ET-007 Daily limit: second transfer that reaches exactly $3,000.00 is accepted</code></td></tr>
<tr><td>Requirement / rule</td><td>Traceability: which rule this checks</td></tr>
<tr><td>Preconditions</td><td>Starting state: environment, persona, data. "Sandbox reset; Emma has sent $0 today; signed in as Emma"</td></tr>
<tr><td>Test data</td><td>Exact values: accounts, amounts, emails</td></tr>
<tr><td>Steps</td><td>Numbered, one action each</td></tr>
<tr><td>Expected result</td><td>Observable and exact: status, code, message, balances, DB rows. Never "works correctly".</td></tr>
<tr><td>Priority</td><td>How important to run</td></tr>
<tr><td>Actual result / status</td><td>Filled in on execution: Pass, Fail (with bug id), Blocked, Not run</td></tr>
</tbody></table></div>

<h3>Qualities of a good case</h3>
<ul>
<li><strong>One purpose</strong>: it checks one rule, so a failure points at one cause.</li>
<li><strong>Independent</strong>: does not rely on another case having run first.</li>
<li><strong>Deterministic</strong>: Ice Bank's seed data and reset make this possible; do not depend on "today" without controlling the clock.</li>
<li><strong>Exact expected results</strong>, including side effects: a transfer case expects the 201, both balances, the history rows and the notification.</li>
<li><strong>Positive and negative</strong>: for every "accepted" case, write the matching "rejected" cases.</li>
</ul>
<p>Good manual cases translate directly into automated tests: preconditions → <code>@BeforeEach</code> setup, steps → the request, expected result → assertions.</p>`,
      examples: [
        {
          title: "A complete test case",
          lang: "text",
          code: `
ID:            TC-TR-004
Title:         Transfer of exactly the available balance is accepted
Rule:          Transfers: cannot exceed available balance (equal is allowed)
Priority:      High
Preconditions: Ice Bank local; signed in as emma.tremblay@icebank.test (OTP from Ice Mail).
               Note Emma's available balance on account 1 (= B) and account 2 (= S).
Test data:     fromAccountId 1, toAccountId 2, amount = B (2 decimals), new Idempotency-Key
Steps:         1. POST /api/v1/transfers with the data above
               2. GET /api/v1/accounts/1 and /api/v1/accounts/2
               3. GET /api/v1/accounts/1/transactions?size=1
Expected:      1. 201 Created, Location /api/v1/transfers/{id}, amount = B, status COMPLETED
               2. Account 1 availableBalance = "0.00"; account 2 balance = S + B
               3. Newest row: DEBIT, amount B, balanceAfter "0.00", type TRANSFER
Cleanup:       Transfer B back from 2 to 1, or reset the sandbox`,
        },
        {
          title: "The same case as an automated test outline",
          lang: "java",
          code: `
@Test
@DisplayName("TC-TR-004 Transfer of exactly the available balance is accepted")
void transferOfExactlyAvailableBalanceIsAccepted() {
    BigDecimal available = accounts.get(1).availableBalance();      // precondition
    BigDecimal savings   = accounts.get(2).balance();

    Transfer t = transfers.create(1, 2, available);                 // step 1 (201 asserted inside)

    assertEquals(0, accounts.get(1).availableBalance().compareTo(BigDecimal.ZERO));
    assertEquals(0, accounts.get(2).balance().compareTo(savings.add(available)));
    assertEquals(t.referenceId(), transactions.latest(1).referenceId());
}`,
        },
      ],
      exercises: [
        "Write five complete test cases for opening a savings account (<code>POST /api/v1/accounts</code>): at least two positive and three negative (hint: max 3 savings accounts, nickname 1 to 30 characters). Run them on Ice Bank local and fill in the actual results.",
        "Take a teammate's case and run it exactly as written without asking them anything. Note every place you had to guess, and give it back with suggestions.",
        "Rewrite this weak case into a good one: \"Login works. Steps: log in. Expected: it works.\" Use Ice Bank's real sign-in flow with OTP.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "ep-bva",
      title: "Equivalence partitioning and boundary values (e-Transfer limits)",
      summary: "Choose a few values that cover a whole range, and test exactly where the rules change.",
      body: `
<p>You cannot test every amount between $0.01 and $3,000. Two techniques tell you which few values are worth it.</p>

<h3>Equivalence partitioning (EP)</h3>
<p>Split the input into groups (partitions) where the system should behave the same way, and test one value from each. For the per-transfer e-Transfer amount:</p>
<div class="table-wrap"><table>
<thead><tr><th>Partition</th><th>Example</th><th>Expected</th></tr></thead>
<tbody>
<tr><td>Not a number / wrong format</td><td><code>"abc"</code>, <code>"10.005"</code></td><td>400 <code>VALIDATION_FAILED</code></td></tr>
<tr><td>Zero or negative</td><td><code>"0.00"</code>, <code>"-5.00"</code></td><td>400 <code>VALIDATION_FAILED</code></td></tr>
<tr><td>Valid</td><td><code>"150.00"</code></td><td>201</td></tr>
<tr><td>Above per-transfer limit</td><td><code>"5000.00"</code></td><td>422 <code>LIMIT_PER_TRANSFER</code></td></tr>
</tbody></table></div>

<h3>Boundary value analysis (BVA)</h3>
<p>Bugs cluster at the edges, where a developer wrote <code>&lt;</code> instead of <code>&lt;=</code>. For each boundary test the value <em>on</em> it and the closest values on each side.
With money the step is one cent:</p>
<ul>
<li>Lower edge: <code>0.00</code> (invalid), <code>0.01</code> (valid), <code>0.02</code> (valid).</li>
<li>Upper edge: <code>2999.99</code> (valid), <code>3000.00</code> (valid), <code>3000.01</code> (422).</li>
</ul>

<h3>Boundaries that depend on state</h3>
<p>Ice Bank's other limits are cumulative, which makes them more interesting:</p>
<div class="callout rule"><p><strong>Rules.</strong> Daily: total of PENDING + DEPOSITED e-Transfers sent on the current Toronto calendar day ≤ $3,000.00 (<code>DAILY_LIMIT_EXCEEDED</code>).
Rolling: total over the last 30 × 24 hours ≤ $10,000.00 (<code>ROLLING_LIMIT_EXCEEDED</code>). Cancelled and expired transfers do not count.</p></div>
<p>So the boundary is "already sent today + this amount". If Emma has sent $1,200.00 today, the daily edge for the next transfer is $1,800.00 (valid) and $1,800.01 (422). Other partitions
appear from the rule's details: a pending transfer counts, a cancelled one frees the allowance, the day changes at midnight <em>Toronto</em> time (not UTC), and the rolling window
moves by the hour. The time-based boundaries need the sandbox clock (<code>POST /api/v1/test/clock</code>, in your own sandbox only) or careful waiting.</p>
<p>The same thinking applies to text lengths (security answer 3 to 25 characters: test 2, 3, 25, 26), counts (max 3 savings accounts, 50 contacts), dates (dispute within 60
days of posting) and the card POS limit ($500 to $5,000 in $100 steps: test 400, 500, 550, 5,000, 5,100).</p>`,
      examples: [
        {
          title: "Boundary table for the per-transfer and daily limits",
          lang: "text",
          code: `
Per transfer (sent today = $0.00)
  amount     expected
  0.00       400 VALIDATION_FAILED (must be at least 0.01)
  0.01       201
  2999.99    201
  3000.00    201
  3000.01    422 LIMIT_PER_TRANSFER

Daily (sent today = T, PENDING + DEPOSITED, Toronto day)
  amount         expected
  3000.00 - T    201
  3000.01 - T    422 DAILY_LIMIT_EXCEEDED
  after cancelling an earlier transfer of X: 3000.00 - T + X   201`,
        },
        {
          title: "Boundary tests as a parameterised JUnit 5 test",
          lang: "java",
          code: `
@ParameterizedTest(name = "amount {0} -> {1} {2}")
@CsvSource({
    "0.00,    400, VALIDATION_FAILED",
    "0.01,    201, ",
    "2999.99, 201, ",
    "3000.00, 201, ",
    "3000.01, 422, LIMIT_PER_TRANSFER",
})
void perTransferLimit(String amount, int status, String code) {
    ValidatableResponse r = etransfers.send(freshSender(), "liam.chen@icebank.test", amount).then();
    r.statusCode(status);
    if (code != null) r.body("code", equalTo(code));
}`,
          note: "<code>freshSender()</code> is a placeholder for a helper that gives each case a customer with no e-Transfers today, so the daily limit does not interfere.",
        },
      ],
      exercises: [
        "Write the full EP and BVA table for the security answer (3 to 25 characters, case-insensitive, must not appear in the message). Include the partitions you get from \"case-insensitive\" and \"not in the message\". Run at least six of them on Ice Bank local.",
        "Using the SQL from Tutorial 1 (lesson 3), find Emma's remaining daily allowance, then test the exact daily boundary with two e-Transfers: the one that reaches exactly the limit and one more cent. Record statuses and codes.",
        "Design the boundary cases for the rolling 30-day limit, including the time boundary (a transfer sent 30 × 24 hours ago minus/plus one minute). Write which ones need the sandbox clock and why.",
        "Apply BVA to the debit card daily POS limit (<code>PATCH /api/v1/cards/1/limits</code>, $500 to $5,000 in $100 steps). Run the cases and note which partition each failure belongs to.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "decision-tables",
      title: "Decision tables (loan decisions)",
      summary: "Test rules that combine several conditions without missing a combination.",
      body: `
<p>When a result depends on several conditions at once, list every combination in a <strong>decision table</strong>: conditions as rows, combinations as columns (rules), and the
expected action for each column. It finds missing rules ("what if both are true?") and gives you one test case per column.</p>

<h3>Ice Bank's personal loan decision</h3>
<div class="callout rule"><p><strong>Rules.</strong> Amount $1,000 to $50,000; term 12 to 60 months; APR fixed at 8.99%. Monthly payment = standard annuity
<code>P × r / (1 − (1 + r)<sup>−n</sup>)</code> with <code>r = APR / 12</code>, rounded to the cent.
DTI % = (existing monthly debt payments + new loan payment) ÷ (annual income ÷ 12) × 100, rounded to 2 decimals.
<strong>Under 35.00 → APPROVED</strong> (loan created and money paid into the chequing account at once), <strong>35.00 to 45.00 inclusive → MANUAL_REVIEW</strong>,
<strong>over 45.00 → DECLINED</strong>. Only one application in review at a time (<code>409 APPLICATION_IN_REVIEW</code>).</p></div>
<p>Conditions: is the input valid (amount, term, income &gt; 0, disbursement account is my chequing)? Which DTI band? Is another application already in review? That gives a table like
the one below. Notice rule R6: it only appears because you asked "what about combinations?".</p>

<h3>Choosing the numbers</h3>
<p>Each column needs concrete inputs that land in the right band, ideally right on the band edges (34.99, 35.00, 45.00, 45.01). Work backwards: pick the loan, compute its monthly payment
with the formula, then choose income and existing debts to hit the DTI you want. Do the arithmetic in a spreadsheet or in Java with <code>BigDecimal</code> and
<code>RoundingMode.HALF_UP</code>; the API response's <code>monthlyPayment</code> and <code>dtiPercent</code> then let you check your oracle.</p>
<p>Seed data gives you a ready-made state: Lucas Gagnon (customer 6) already has an application in <code>MANUAL_REVIEW</code> (DTI 36.26), which is precondition for R6.</p>`,
      examples: [
        {
          title: "Decision table for POST /api/v1/loans/applications",
          lang: "text",
          code: `
                                    R1   R2   R3   R4   R5   R6
Input valid (amount, term, income)   N    Y    Y    Y    Y    Y
Already an application in review     -    N    N    N    N    Y
DTI band                             -   <35  =35  =45  >45   -
------------------------------------------------------------------
400 VALIDATION_FAILED                X
201 status APPROVED + loan created        X
201 status MANUAL_REVIEW                       X    X
201 status DECLINED                                      X
409 APPLICATION_IN_REVIEW                                     X`,
        },
        {
          title: "Oracle: compute payment and DTI the same way the bank does",
          lang: "java",
          code: `
static BigDecimal monthlyPayment(BigDecimal principal, int months) {
    MathContext mc = MathContext.DECIMAL128;
    BigDecimal r = new BigDecimal("0.0899").divide(BigDecimal.valueOf(12), mc);
    BigDecimal factor = BigDecimal.ONE.subtract(BigDecimal.ONE.add(r).pow(-months, mc), mc);
    return principal.multiply(r, mc).divide(factor, mc).setScale(2, RoundingMode.HALF_UP);
}

static BigDecimal dti(BigDecimal debts, BigDecimal payment, BigDecimal annualIncome) {
    BigDecimal monthlyIncome = annualIncome.divide(BigDecimal.valueOf(12), MathContext.DECIMAL128);
    return debts.add(payment).divide(monthlyIncome, MathContext.DECIMAL128)
                .multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP);
}`,
        },
        {
          title: "Request shape",
          lang: "json",
          code: `
POST /api/v1/loans/applications
{
  "amount": "15000.00",
  "termMonths": 48,
  "purpose": "Home renovation",
  "annualIncome": "62000.00",
  "monthlyDebtPayments": "1500.00",
  "disbursementAccountId": 1
}`,
        },
      ],
      exercises: [
        "Extend the decision table with the input-validation conditions split out (amount below $1,000, above $50,000, term 11 and 61, disbursement account that is savings or not yours). How many columns do you get after removing impossible ones?",
        "Using the oracle, choose inputs for a $10,000, 36-month loan that land on DTI exactly 34.99, 35.00, 45.00 and 45.01. Show your arithmetic.",
        "Run R2 to R5 on Ice Bank local as Noah or Emma and record <code>status</code>, <code>monthlyPayment</code> and <code>dtiPercent</code> from each response. Do they match your oracle to the cent?",
        "Run R6 as Lucas Gagnon. Then, as the teller, decide his application (<code>POST /api/v1/admin/loans/{id}/decision</code>) and check whether he can apply again.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "state-transitions",
      title: "State transitions (account lockout)",
      summary: "Model a feature as states and events, then test every valid and invalid transition.",
      body: `
<p>Some features are best described as a <strong>state machine</strong>: the system is in one state at a time, and events move it to another state (or keep it where it is). State
transition testing covers each <em>transition</em>, not just each screen, and especially the transitions that should be impossible.</p>

<h3>Ice Bank's sign-in lockout</h3>
<div class="callout rule"><p><strong>Rules.</strong> Each wrong password increments <code>users.failed_login_count</code> and the response says <code>attemptsRemaining</code>.
The <strong>5th consecutive failure</strong> locks the user: <code>status = 'LOCKED'</code>, <code>locked_until = now + 15 minutes</code>, response <code>401 ACCOUNT_LOCKED</code>.
While locked, even the right password is refused. After 15 minutes the next login attempt unlocks automatically and the count starts again from 0. A correct password before the
lock resets the count to 0. An admin can unlock immediately (<code>POST /api/v1/admin/users/{id}/unlock</code>). A user locked by an admin without an expiry (Liam Chen in the seed)
stays locked until an admin unlocks.</p></div>

<h3>States and events</h3>
<p>States: <code>ACTIVE(0)</code>, <code>ACTIVE(1)</code> … <code>ACTIVE(4)</code> (the number is failed attempts), <code>LOCKED</code>. Events: wrong password, right password, 15 minutes pass,
admin unlock. Draw it as a diagram or a table; the table makes invalid transitions visible, because every cell must be filled.</p>
<p>Test coverage levels: <strong>all states</strong> (weak), <strong>all valid transitions</strong> (the usual target), <strong>all invalid transitions</strong> (event in a state where it must not
change anything, e.g. right password while locked), and <strong>sequences</strong> (fail 4, succeed, fail 4 again: still not locked).</p>
<p>The OTP step is another small state machine: OTP sent → verified (correct code) / attempt used (wrong code, max 3) / expired (after 5 minutes). And e-Transfers have
<code>PENDING → DEPOSITED | CANCELLED | EXPIRED</code>, with no way back out of the final states.</p>`,
      examples: [
        {
          title: "State transition table for sign-in lockout",
          lang: "text",
          code: `
State \\ Event   wrong password       right password            15 min pass      admin unlock
ACTIVE(0)       ACTIVE(1), 401       ACTIVE(0), 200 + OTP      ACTIVE(0)        409 not locked
ACTIVE(1..3)    ACTIVE(n+1), 401     ACTIVE(0), 200 + OTP      ACTIVE(n)        409 not locked
ACTIVE(4)       LOCKED, 401          ACTIVE(0), 200 + OTP      ACTIVE(4)        409 not locked
                ACCOUNT_LOCKED
LOCKED          LOCKED, 401          LOCKED, 401               (next attempt     ACTIVE(0)
                ACCOUNT_LOCKED       ACCOUNT_LOCKED            unlocks first)`,
          note: "\"409 not locked\" is the admin endpoint's <code>INVALID_STATE</code> answer: \"This user is not locked.\"",
        },
        {
          title: "Watch the state in the database while you test",
          lang: "sql",
          code: `
SELECT id, email, status, failed_login_count, locked_until, app_now(sandbox_id) AS sandbox_now
FROM users
WHERE sandbox_id = 1
  AND email = 'noah.martin@icebank.test';`,
        },
      ],
      exercises: [
        "Draw the lockout state diagram (states as circles, events as arrows). Then list every transition and give each a test case id.",
        "As Noah, run the sequence: 4 wrong passwords, 1 right password (stop before OTP), 4 wrong passwords. Check <code>attemptsRemaining</code> each time and the database after each step. Is Noah locked at the end? Should he be?",
        "Lock Noah with 5 wrong passwords, then try the right password. Record the response. Then unlock him as the teller and confirm he can sign in. Note the audit rows (<code>USER_LOCKED</code>, <code>USER_UNLOCKED</code>).",
        "Draw the e-Transfer state machine and list three invalid transitions (for example accepting a cancelled transfer). Test them on local and record the status and <code>code</code> of each.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "exploratory",
      title: "Exploratory testing with charters",
      summary: "Structured, time-boxed exploration that finds the bugs scripted cases miss.",
      body: `
<p>Exploratory testing is simultaneous learning, test design and execution: you decide the next test based on what the last one showed you. It is not random clicking. It is
structured by a <strong>charter</strong> and a <strong>time box</strong>, and it produces notes, bugs and new test ideas.</p>

<h3>A charter</h3>
<p>A one-line mission: <strong>Explore</strong> &lt;target&gt; <strong>with</strong> &lt;resources&gt; <strong>to discover</strong> &lt;information&gt;. For example:
"Explore <em>scheduled bill payments</em> with <em>the sandbox clock and the 2026 holiday list</em> to discover <em>wrong posting dates around weekends and holidays</em>."</p>

<h3>A session</h3>
<ol>
<li>Pick a charter and a time box (45 to 90 minutes). Turn off distractions.</li>
<li>Explore. Keep running notes: what you tried, what you saw, questions, ideas for later.</li>
<li>Raise bugs as you find them (or note them and write up at the end).</li>
<li>Debrief (5 to 10 minutes, with a teammate if possible): what you covered, what you did not, bugs, new charters.</li>
</ol>

<h3>Heuristics that generate ideas</h3>
<ul>
<li><strong>Boundaries and zero</strong>: empty, one, many, maximum, maximum + 1.</li>
<li><strong>Interrupt</strong>: back button, refresh mid-flow, two tabs, session timeout at 10 minutes idle (warning at 9).</li>
<li><strong>Time</strong>: end of day/month, weekends, holidays (Canada Day, Thanksgiving…), the 29th to 31st for monthly payments, DST changes in Toronto.</li>
<li><strong>Roles and ownership</strong>: other customers' ids, admin endpoints as a customer, frozen accounts (Ava).</li>
<li><strong>Consistency</strong>: does the dashboard agree with the account page, the CSV, the statement PDF, the API and the database?</li>
<li><strong>Format</strong>: postal codes with lower case or no space, phone formats, emails with <code>+</code>, accents in names, very long nicknames.</li>
</ul>
<p>Exploratory and scripted testing complement each other: exploration finds the surprising bugs, and each surprise becomes a scripted (then automated) regression test.</p>`,
      examples: [
        {
          title: "Session sheet",
          lang: "text",
          code: `
Charter:  Explore Interac e-Transfer cancel and accept, as Emma and Liam/Olivia,
          to discover refund and state bugs
Tester:   <name>      Env: local      Time box: 60 min      Start: 14:00
Personas: emma.tremblay@icebank.test (sender), olivia.singh@icebank.test (recipient)

Notes
14:05  Sent $12.34 to Olivia with question; status PENDING; chequing debited at once
14:11  Cancelled from UI: confirm() dialog; status CANCELLED; REVERSAL row +12.34 (SQL ok)
14:16  Cancel again via API: 409 INVALID_STATE (good)
14:24  ?? Olivia accepts a cancelled transfer -> 409. Message wording unclear -> question
...
Bugs:      none / IB-xx
Questions: does an e-Transfer to an email with autodeposit skip the question?
New charters: expiry after 30 days with the clock (own sandbox)
Coverage:  cancel, accept, wrong answer x3; NOT covered: autodeposit, expiry`,
        },
        {
          title: "Charter ideas for Ice Bank",
          lang: "text",
          code: `
Explore the registration wizard with invalid postal codes, phones and SINs to discover validation gaps
Explore the transactions table with sorting, filtering and paging to discover inconsistencies with the CSV
Explore frozen accounts (Ava Roy) with every money movement to discover where the freeze is not enforced
Explore session handling with two tabs and idle time to discover timeout and token bugs
Explore cards with lock, unlock, report lost and limit changes to discover state and masking bugs`,
        },
      ],
      exercises: [
        "Write four charters for Ice Bank features you have not tested yet, using the Explore / with / to discover format.",
        "Run one 60-minute session on Ice Bank local with a session sheet. Debrief with a teammate for 10 minutes and write down the new charters it produced.",
        "Run the same charter on QA with bug packs enabled (your sandbox). Compare the two session sheets: which observations were bugs, and which were just how Ice Bank works?",
        "Turn the two most interesting findings from your sessions into scripted test cases (lesson 3 format).",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "bug-reports",
      title: "Bug report anatomy, severity vs priority",
      summary: "Write reports developers can act on immediately, and classify them correctly.",
      body: `
<p>A bug report is a product. If a developer cannot reproduce it in five minutes, it bounces back. A great report is short, exact and has evidence.</p>

<h3>The fields</h3>
<ul>
<li><strong>Title</strong>: what is wrong, where, under which condition. "Transfer of exactly the available balance is rejected with 422 INSUFFICIENT_FUNDS", not "transfer broken".</li>
<li><strong>Environment</strong>: local/QA, sandbox, build (<code>GET /test/health</code> shows <code>build</code> and <code>version</code>), browser if UI.</li>
<li><strong>Preconditions and test data</strong>: persona, account ids, balances.</li>
<li><strong>Steps to reproduce</strong>: numbered, minimal. Include the exact request (curl with tokens removed).</li>
<li><strong>Expected result</strong> with the rule it comes from, and <strong>actual result</strong>: status, <code>code</code>, body, screenshot.</li>
<li><strong>Evidence</strong>: <code>X-Request-Id</code>, response body, SQL query and result, HAR, screenshot or video.</li>
<li><strong>Severity, priority</strong>, frequency (always / 3 of 10 times), and the layer (UI / API / DB) if you traced it.</li>
</ul>

<h3>Severity vs priority</h3>
<p><strong>Severity</strong> is the impact on the system or user (a tester's judgement). <strong>Priority</strong> is how soon it must be fixed (a business decision, often by the product owner).
They usually move together, but not always:</p>
<div class="table-wrap"><table>
<thead><tr><th></th><th>High priority</th><th>Low priority</th></tr></thead>
<tbody>
<tr><td><strong>High severity</strong></td><td>A scheduled bill payment is taken twice (money lost). Full card numbers visible in an API response.</td><td>Crash in a rarely used admin export that has a manual workaround.</td></tr>
<tr><td><strong>Low severity</strong></td><td>The bank's name misspelled on the login page (embarrassing, trivial to fix).</td><td>Tooltip text slightly misaligned on one screen.</td></tr>
</tbody></table></div>
<p>Common severity scale: <strong>Critical</strong> (data loss, money wrong, security, no workaround), <strong>Major</strong> (feature broken, workaround exists), <strong>Minor</strong>
(incorrect but low impact), <strong>Trivial</strong> (cosmetic).</p>
<h3>Habits</h3>
<ul>
<li>One bug per report. Search for duplicates first.</li>
<li>Facts, not blame or emotion. "The response is 200; the contract says 201 with Location."</li>
<li>Reduce the steps to the minimum that still reproduces it.</li>
<li>Remove tokens and QA keys from anything you attach.</li>
</ul>`,
      examples: [
        {
          title: "A complete bug report",
          lang: "text",
          code: `
Title:       PUT /payees/{id} accepts a nickname of 31 characters (limit is 30)
Env:         QA, sandbox 2, build "qa" 1.0.0, API only
Severity:    Minor        Priority: Low        Frequency: always        Layer: API + DB
Preconditions: signed in as emma.tremblay+s2@icebank.test; payee 1 (Niagara Power Co) exists
Steps:
  1. PUT /api/v1/payees/1  {"nickname":"ABCDEFGHIJKLMNOPQRSTUVWXYZ12345"}   (31 characters)
Expected:    400 VALIDATION_FAILED, errors[0].field = "nickname"
             (Swagger: Bill payments > PUT /payees/{id}; nickname at most 30 characters)
Actual:      200 OK, body shows the 31-character nickname
Evidence:    X-Request-Id 6b1d4c2e-...; request/response attached;
             SELECT id, nickname, length(nickname) FROM payees WHERE sandbox_id = 2 AND id = 1;
Notes:       Illustrative example. Local (clean build) returns 400 for the same request.`,
        },
      ],
      exercises: [
        "Rate severity and priority for each of these and justify in one line: a scheduled bill payment is taken twice; full card numbers appear in an API response; the CSV export takes 40 seconds for Perf User; a typo on the Ice Mail page; a 500 when an unknown query parameter is sent.",
        "Rewrite this report so a developer can act on it: \"e-transfer doesn't work for Ava. Please fix ASAP!!!\". Find out on Ice Bank local what actually happens for Ava Roy (frozen chequing) and decide whether it is even a bug.",
        "Find a real bug on QA (any pack) and write the full report with evidence from at least two layers (API response plus SQL, or UI plus Network tab).",
        "Swap reports with a teammate and try to reproduce theirs using only the report. Give feedback on anything that was missing.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "jira",
      title: "Jira workflow",
      summary: "How bugs and stories move through a tracker, and what QA does at each step.",
      body: `
<p>Most teams track work in <strong>Jira</strong> (or something like it: Azure Boards, Linear, GitHub Issues). The tool matters less than the workflow, which is the same everywhere:
work items move through statuses, and everyone can see what state each one is in.</p>

<h3>Issue types</h3>
<ul>
<li><strong>Epic</strong>: a large feature, e.g. "Interac e-Transfer".</li>
<li><strong>Story</strong>: a user-visible piece of an epic, written as "As a customer, I want to cancel a pending e-Transfer so that I get my money back", with
<strong>acceptance criteria</strong> (often Given/When/Then).</li>
<li><strong>Task / Sub-task</strong>: work that is not user-visible ("add JDBC utility").</li>
<li><strong>Bug</strong>: something that does not behave as specified.</li>
</ul>

<h3>A typical bug workflow</h3>
<p><strong>Open</strong> (reported) → <strong>Triaged / To Do</strong> (accepted, prioritised) → <strong>In Progress</strong> (developer fixing) → <strong>In Review</strong> (code review) →
<strong>Ready for QA</strong> → <strong>In QA</strong> (you re-test) → <strong>Done / Closed</strong>. Side exits: <strong>Rejected / Won't fix / Duplicate / Cannot reproduce</strong>, and
<strong>Reopened</strong> when the fix does not work.</p>
<p>QA's jobs in this flow: write the report; answer questions during triage; <strong>re-test</strong> the fix with the original steps <em>and</em> nearby cases (regression around the fix);
close it or reopen it with evidence. "Fixed" is not "done" until you verified it.</p>

<h3>Fields that make a tracker useful</h3>
<p>Component (Auth, Transfers, Bill payments…), affected version/build, environment, labels (<code>api</code>, <code>db</code>, <code>ui</code>), links ("is caused by", "relates to"
the story, "is tested by" a test case), and attachments. Use JQL to build views, for example all open API bugs found on QA.</p>

<h3>For this course</h3>
<p>Use a free Jira Cloud board or GitHub Issues for your team. Each bug you find on QA gets a ticket; link it to the automated test that catches it once you have written one.</p>`,
      examples: [
        {
          title: "A story with acceptance criteria in Given/When/Then",
          lang: "gherkin",
          code: `
Story: As a customer I want to cancel a pending e-Transfer so that I get my money back

Scenario: Cancel a pending e-Transfer
  Given Emma sent a $25.00 e-Transfer that is PENDING
  When she cancels it
  Then its status is CANCELLED
  And a REVERSAL credit of $25.00 appears on the source account
  And her available balance is back to what it was before sending

Scenario: Cannot cancel a deposited e-Transfer
  Given an e-Transfer from Emma has been DEPOSITED
  When she tries to cancel it
  Then the API answers 409 with code INVALID_STATE`,
        },
        {
          title: "Useful JQL filters",
          lang: "text",
          code: `
project = ICEBANK AND issuetype = Bug AND status not in (Done, Closed) ORDER BY priority DESC
project = ICEBANK AND issuetype = Bug AND labels = api AND environment ~ "QA"
project = ICEBANK AND status = "Ready for QA" AND assignee = currentUser()
project = ICEBANK AND issuetype = Bug AND status changed to Reopened AFTER -14d`,
        },
      ],
      exercises: [
        "Create a board (Jira Cloud free or GitHub Projects) for your team with the bug workflow above. Add the components Auth, Accounts, Transfers, e-Transfer, Bill payments, Cards, Loans, Admin.",
        "Write two stories with acceptance criteria in Given/When/Then for Ice Bank features (e.g. lock a card, add a payee), based on the business rules. Check each criterion against Ice Bank local.",
        "Log the bugs you found in the previous lessons as tickets with severity, priority, component and environment. Move one through the full workflow including a re-test.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "smoke-sanity-regression",
      title: "Smoke, sanity and regression",
      summary: "Three kinds of test run with different goals, sizes and timing.",
      body: `
<p>These terms describe <em>why</em> and <em>when</em> you run tests, not how. They are often confused in interviews, so be precise.</p>
<div class="table-wrap"><table>
<thead><tr><th></th><th>Smoke</th><th>Sanity</th><th>Regression</th></tr></thead>
<tbody>
<tr><td>Question</td><td>Is this build stable enough to test at all?</td><td>Does this specific fix or change work?</td><td>Did the change break anything that used to work?</td></tr>
<tr><td>Breadth</td><td>Wide and shallow</td><td>Narrow and deep</td><td>Wide and deep</td></tr>
<tr><td>Size</td><td>5 to 20 checks, minutes</td><td>A handful around the change</td><td>Everything (or a risk-based selection), can take hours</td></tr>
<tr><td>When</td><td>Every new build/deploy, first</td><td>After a bug fix or small change</td><td>Before a release, nightly, after big changes</td></tr>
<tr><td>If it fails</td><td>Reject the build, stop testing</td><td>Reopen the bug</td><td>Raise regression bugs</td></tr>
</tbody></table></div>

<h3>An Ice Bank smoke suite</h3>
<ol>
<li><code>GET /api/v1/test/health</code> → 200, <code>status</code> and <code>database</code> are UP.</li>
<li>Sign in as Emma with OTP from Ice Mail.</li>
<li><code>GET /accounts</code> returns her four accounts.</li>
<li><code>GET /accounts/1/transactions</code> returns a page.</li>
<li>One $1.00 transfer from 1 to 2 succeeds (201).</li>
<li>Swagger page and <code>/api/v1/openapi.json</code> load.</li>
<li>UI: login page renders and Emma reaches the dashboard.</li>
</ol>
<p>If any of these fail on QA, there is no point running the other 200 tests: report the environment problem first.</p>

<h3>Regression in practice</h3>
<p>Every bug you find becomes a regression test, so it can never silently return. Automate regression; it is the main reason test frameworks exist. Select a smaller
<strong>risk-based</strong> regression set when time is short: money movement, auth and security first, cosmetics last. In JUnit 5 use <code>@Tag("smoke")</code> and
<code>@Tag("regression")</code> to run each set separately (Tutorial 6).</p>
<p>Also useful: <strong>re-testing</strong> (confirmation testing) means running the exact failed case again after a fix; regression means checking everything <em>around</em> it.</p>`,
      examples: [
        {
          title: "Run the smoke set and the regression set separately",
          lang: "bash",
          code: `
mvn test -Dgroups=smoke -Denv=qa          # minutes; run first on every new QA deploy
mvn test -Dgroups=regression -Denv=local  # everything; before merging framework changes`,
        },
        {
          title: "Tagging tests (JUnit 5)",
          lang: "java",
          code: `
@Tag("smoke")
@Test
void healthIsUp() {
    given().spec(base).when().get("/test/health")
        .then().statusCode(200).body("status", equalTo("UP")).body("database", equalTo("UP"));
}

@Tag("regression") @Tag("etransfer")
@Test
void cancelledETransferIsRefundedInFull() { /* ... */ }`,
        },
      ],
      exercises: [
        "Write the Ice Bank smoke suite above as a manual checklist and run it on local and QA. Time each run.",
        "Automate at least five smoke checks with <code>@Tag(\"smoke\")</code> and run only them with <code>-Dgroups=smoke</code>.",
        "Your teammate says a bug in idempotency was fixed on QA. Write the sanity (re-test) cases you would run, and the wider regression cases around it (which other endpoints use <code>Idempotency-Key</code>?).",
        "Rank the Ice Bank feature areas by risk for a 30-minute regression window and justify the top three.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "agile",
      title: "QA in Agile ceremonies",
      summary: "What a tester contributes in planning, stand-up, refinement, review and retro.",
      body: `
<p>In Scrum, work happens in sprints (usually two weeks), and testing happens <em>inside</em> the sprint, not after it. The tester is part of the team from the first conversation about a
story, not someone who receives finished code.</p>

<h3>The ceremonies and QA's role</h3>
<div class="table-wrap"><table>
<thead><tr><th>Ceremony</th><th>What it is</th><th>What QA brings</th></tr></thead>
<tbody>
<tr><td><strong>Backlog refinement</strong></td><td>Clarify and size upcoming stories</td><td>Questions, edge cases, testability, acceptance criteria ("what if the e-Transfer is pending when the day changes?")</td></tr>
<tr><td><strong>Sprint planning</strong></td><td>Choose stories for the sprint and plan the work</td><td>Testing effort in the estimate, test data and environment needs, automation tasks</td></tr>
<tr><td><strong>Daily stand-up</strong></td><td>15 minutes: done, next, blockers</td><td>Bugs blocking stories, environments down, stories waiting for testing</td></tr>
<tr><td><strong>Sprint review / demo</strong></td><td>Show the increment to stakeholders</td><td>What was tested, known issues, quality risks</td></tr>
<tr><td><strong>Retrospective</strong></td><td>Improve how the team works</td><td>Process problems: late handovers, flaky tests, missing criteria</td></tr>
</tbody></table></div>

<h3>Definition of Ready and Definition of Done</h3>
<p><strong>Ready</strong>: a story can enter a sprint only with clear acceptance criteria and known test data. <strong>Done</strong>: code reviewed, acceptance criteria verified, automated tests
added and green, no open Critical/Major bugs, documentation updated. QA helps write both, and holds the team to them.</p>

<h3>The three amigos</h3>
<p>Before a story is built, a developer, a tester and the product owner discuss it together for 15 minutes: business view, technical view, testing view. Many bugs die here, for free.
Writing the acceptance criteria as Given/When/Then examples (BDD style) makes them directly testable.</p>

<h3>Testing within the sprint</h3>
<p>Test as soon as a story is in a testable state (API first, before the UI exists), automate as you go, and keep a regression suite running in the background. The goal is that
"done" really means shippable.</p>`,
      examples: [
        {
          title: "Refinement: a tester's questions for one story",
          lang: "text",
          code: `
Story: As a customer I can schedule a monthly bill payment.

QA questions in refinement
- If the 31st is chosen, what happens in 30-day months and February?   -> last day of the month
- What if the posting date is a weekend or a statutory holiday?        -> next business day
- Can a payee with scheduled payments be deleted?                      -> no, 409
- Can one occurrence be cancelled without the series?                  -> yes, ?scope=occurrence
- How do we test dates months ahead without waiting?                   -> sandbox clock (own sandbox)
- Which persona/test data? Emma, payee 2 (IceTel Mobile)`,
        },
        {
          title: "A Definition of Done for your team's framework work",
          lang: "markdown",
          code: `
- [ ] Tests follow the naming and tagging conventions
- [ ] Green on -Denv=local three runs in a row (no flakiness)
- [ ] Run against QA; failures explained or reported as bugs
- [ ] No secrets, sleeps or hard-coded ids that a reset would not restore
- [ ] Reviewed and approved in a pull request
- [ ] README updated if a new command, config key or helper was added`,
        },
      ],
      exercises: [
        "Run a 15-minute \"three amigos\" with your teammates on one Ice Bank feature (one plays product owner with the business rules, one developer, one tester). Write the agreed acceptance criteria in Given/When/Then.",
        "Write your team's Definition of Ready and Definition of Done for the next three weeks and add them to the framework README.",
        "Hold a stand-up every working day for one week (5 minutes, done / next / blockers). At the end, write a short retro with one thing to keep, one to stop and one to try.",
      ],
    },
  ],
});
