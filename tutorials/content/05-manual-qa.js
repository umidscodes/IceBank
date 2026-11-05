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
app, but practise the habit: for each feature, write your questions before you click anything.</p>
<h3>The STLC applied to one feature: Interac e-Transfer</h3>
<div class="table-wrap"><table>
<thead><tr><th>Phase</th><th>What you do for e-Transfer</th><th>What you produce</th><th>Done when</th></tr></thead>
<tbody>
<tr><td>Requirement analysis</td><td>Read the limits, security answer, cancel and expiry rules; list questions; agree the answers</td><td>Question log (example 2), list of testable rules</td><td>Every question has an answer and a source</td></tr>
<tr><td>Test planning</td><td>Decide scope (API + DB + one UI journey), environments, personas, risks</td><td>Test plan (lesson 2)</td><td>Plan reviewed by the team</td></tr>
<tr><td>Test design</td><td>EP/BVA for the limits, state transitions for the status, decision table where conditions combine</td><td>Test cases with exact expected results, test data</td><td>Every rule has at least one positive and one negative case</td></tr>
<tr><td>Environment setup</td><td>Local reset, QA sandbox key, personas checked, SQL access as <code>qa_reader</code></td><td>Environment checklist, smoke result</td><td>Smoke suite green on local</td></tr>
<tr><td>Execution</td><td>Run cases, compare with the oracle, raise bugs, re-test fixes</td><td>Results (pass/fail/blocked), bug reports</td><td>Exit criteria of the plan met</td></tr>
<tr><td>Closure</td><td>Summarise coverage, open bugs, residual risk, lessons learned</td><td>Test summary report</td><td>Report shared; regression tests added for every bug</td></tr>
</tbody></table></div>

<h3>The same bug, found at different phases</h3>
<p>Suppose the developer counts the daily limit per <em>UTC</em> day instead of the Toronto day (UTC midnight is 19:00 or 20:00 in Toronto). Found in <strong>requirement analysis</strong>, it is one
question: "which time zone is a day?". Found in <strong>design</strong>, it is a test case that sends at 19:30 Toronto. Found in <strong>execution</strong>, it is a bug report, a fix, a re-test and a
regression test. Found <strong>in production</strong>, customers are wrongly refused (or wrongly allowed) evening transfers, the call centre takes complaints, and the bank must explain itself to
the regulator. Same bug, rising cost.</p>

<h3>Test levels and test types</h3>
<p><strong>Levels</strong> say how much of the system is under test: <em>unit</em> (one class, by developers), <em>integration</em> (pieces together: the API with its database, which is where most
of your REST Assured and JDBC work sits), <em>system</em> (the whole app through the UI, Selenium), <em>acceptance</em> (does it meet the business need; often the product owner's call).
<strong>Types</strong> say what quality you check: functional (rules, as in this tutorial) and non-functional (performance with JMeter, security, accessibility, usability).</p>`,
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
        {
          title: "Requirement analysis: a question log you can keep in a spreadsheet",
          lang: "text",
          code: `
ID   Rule / area             Question                                          Answer                          Source             Status
Q-01 e-Transfer daily limit  Which day: calendar day or 24 h? Which time zone?  Toronto calendar day            README rules       Closed
Q-02 e-Transfer limits       Do PENDING transfers count?                        Yes, PENDING and DEPOSITED      README, Swagger    Closed
Q-03 Security answer         Is "halifax" accepted when the answer is Halifax?  Yes, case-insensitive           README rules       Closed
Q-04 Security answer         Is a substring of the message a leak ("fax")?      ?                               try on local       Open
Q-05 Cancel                  Can the sender cancel after it was deposited?      No, only while PENDING          Swagger (cancel)   Closed
Q-06 Expiry                  What happens to the money after 30 days?           Refunded (REVERSAL row)         README rules       Closed`,
          note: "Open questions are risks: each one is either a missing rule or a bug waiting to happen. Close them before writing expected results.",
        },
      ],
      exercises: [
        "Pick the bill payments feature from the business rules. Write at least eight questions you would ask in requirement analysis, then find the answer to each in Swagger, the README or by trying it on Ice Bank local.",
        "Map this course onto the STLC: for each phase, write what you will actually produce in the next three weeks (e.g. test plan document, Postman collection, REST Assured suite, bug reports).",
        "Find one thing in Ice Bank that matches the spec but that you think a real customer would find confusing (a validation problem, not a verification one). Write it up in three sentences.",
        "Using the e-Transfer table above as a model, write the STLC table for the cheque deposit feature: for each phase, what you would do, what you would produce, and when the phase is done. Include at least three requirement-analysis questions about the deposit rules.",
      ],
      quiz: [
        {
          q: "The rule says \"daily e-Transfer limit $3,000\". In which STLC phase should \"daily in which time zone?\" ideally be asked?",
          options: ["Requirement analysis", "Test execution", "Test closure", "After release, when a customer complains"],
          answer: 0,
          explain: "Ambiguity is cheapest to fix before anything is built or tested. In Ice Bank the answer is the Toronto calendar day.",
        },
        {
          q: "The transfer screen matches the spec exactly, but most users in a usability session cannot find the \"from\" account selector. This is a problem of:",
          options: ["Verification", "Validation", "Regression", "Smoke testing"],
          answer: 1,
          explain: "Verification asks \"did we build it as specified?\" (yes). Validation asks \"did we build the right thing for the user?\" (no).",
        },
        {
          q: "Which exit criterion is measurable?",
          options: [
            "\"Testing is complete when quality is good\"",
            "\"All P1 cases run on local and QA, no open Critical bugs, suite green on local three runs in a row\"",
            "\"When the team feels confident\"",
            "\"When the deadline arrives\"",
          ],
          answer: 1,
          explain: "Exit criteria must be checkable by anyone: counts, priorities, statuses. The others are opinions or dates.",
        },
        {
          q: "Your REST Assured test calls <code>POST /transfers</code> and then checks the <code>transactions</code> rows with JDBC. Which test level is that?",
          options: ["Unit", "Integration", "Acceptance", "Static testing"],
          answer: 1,
          explain: "It exercises the API, its business logic and the database together, without the UI: integration level (sometimes called API or service level).",
        },
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
in seconds; through Selenium you only need one case to prove the UI shows the error.</p>
<h3>A complete test plan outline</h3>
<p>The skeleton above is enough for a week. A full plan for a feature release has more sections; the first example below is a complete outline for releasing Interac e-Transfer, written
the way you would hand it to a lead. Two sections are often forgotten:</p>
<ul>
<li><strong>Suspension and resumption criteria</strong>: when you stop testing and what has to happen before you start again ("suspend if health is DOWN or the smoke suite fails; resume
after a new deploy passes smoke").</li>
<li><strong>Out of scope, with a reason</strong>: it protects you later ("autodeposit UI: not in this release", "load testing: Tutorial 10, separate plan").</li>
</ul>

<h3>Risk-based prioritisation</h3>
<p>You never have time to test everything equally. Score each feature or rule for <strong>likelihood</strong> that it is broken (complex logic, new code, many conditions, time and
time zones, history of bugs) and <strong>impact</strong> if it is (money wrong, security, legal, many users), each from 1 (low) to 3 (high). <strong>Risk = likelihood × impact</strong>.
The score decides <em>order</em> and <em>depth</em>: test the 9s and 6s first and with every technique, the 1s and 2s with a quick check.</p>
<div class="table-wrap"><table>
<thead><tr><th>e-Transfer item</th><th>Likelihood</th><th>Impact</th><th>Risk</th><th>Priority and depth</th></tr></thead>
<tbody>
<tr><td>Daily limit on the Toronto day, pending counted</td><td>3 (cumulative, time zone, several statuses)</td><td>3 (money, regulation)</td><td>9</td><td>P1: full BVA, every status, evening and midnight times</td></tr>
<tr><td>Rolling 30-day limit</td><td>3 (moving window, needs the clock)</td><td>3</td><td>9</td><td>P1: amount and time boundaries in your own sandbox</td></tr>
<tr><td>Cancel refunds in full</td><td>2</td><td>3 (customer loses money)</td><td>6</td><td>P1: API + DB (REVERSAL row, balance, audit)</td></tr>
<tr><td>Expiry after 30 days refunds</td><td>2 (scheduled job)</td><td>3</td><td>6</td><td>P1: clock in own sandbox, DB check</td></tr>
<tr><td>Per-transfer limit $0.01 to $3,000</td><td>1 (simple comparison)</td><td>3</td><td>3</td><td>P2: the five boundary values</td></tr>
<tr><td>Security answer rules</td><td>2 (case, trimming, "not in message")</td><td>2 (wrong person could deposit)</td><td>4</td><td>P2: EP table</td></tr>
<tr><td>Contacts (max 50)</td><td>1</td><td>1</td><td>1</td><td>P3: one positive, one at the limit</td></tr>
<tr><td>Wording of the confirmation page</td><td>2</td><td>1</td><td>2</td><td>P3: look at it during the UI journey</td></tr>
</tbody></table></div>
<p>Re-score as you learn: bugs cluster, so an area where you just found two bugs gets a higher likelihood, and its neighbours deserve another look.</p>`,
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
        {
          title: "Complete test plan outline: Interac e-Transfer release",
          lang: "markdown",
          code: `
# Test plan: Interac e-Transfer (Ice Bank v1.0)          Owner: <name>   Version 1.0, 2026-11-09

## 1. Purpose and references
Verify e-Transfer send, accept, cancel, expiry and limits against the business rules.
Oracle: README "Business rules", Swagger (/swagger, tag "Interac e-Transfer"), seed reference.

## 2. Scope
In:  POST/GET /etransfers, /etransfers/{id}/cancel, /etransfers/{id}/accept, contacts,
     limits (per transfer, Toronto day, rolling 30 days), refunds, audit and notifications
Out: autodeposit registration UI (next release), French text, load testing (separate plan)

## 3. Risks and priorities (see risk table: likelihood x impact)
P1: daily and rolling limits, cancel refund, expiry refund
P2: per-transfer limit, security answer rules, idempotency on send/cancel/accept
P3: contacts, wording, layout

## 4. Approach
API: functional, negative and boundary tests (REST Assured), the main layer
DB:  every money movement checked with SQL as qa_reader (transactions, etransfers, audit_log)
UI:  one Selenium journey: send, see PENDING, cancel with the confirm() dialog
Techniques: EP/BVA for amounts and text lengths; state transitions for the status;
            exploratory charters for cancel/accept races and two-tab use

## 5. Environments
local (clean build): reset before the suite, oracle checks
QA sandbox <n> (buggy build): same suite, failures become bug reports

## 6. Test data
Emma (sender, has contacts), Olivia (recipient), Noah (empty balance: funds checks),
Ava (frozen chequing). Each test creates its own e-Transfers; no reliance on test order.

## 7. Entry criteria
GET /api/v1/test/health UP on both environments; sign-in with OTP works; smoke suite green on local

## 8. Exit criteria
All P1 and P2 cases run on local and QA; suite green on local three runs in a row;
no open Critical bug without a decision; every QA failure explained or reported

## 9. Suspension and resumption
Suspend: health DOWN, smoke fails, or QA sandbox shared state is unusable
Resume:  after a new deploy or reset passes the smoke suite

## 10. Deliverables
Test cases (repo /docs/test-cases), automated suite (@Tag("etransfer")), bug reports, summary report

## 11. Schedule and roles
Mon design (B), Tue-Wed automation (B), Wed review (C), Thu QA run and bugs (B + C), Fri report

## 12. Approval
Reviewed by: <teammates>, accepted by: <instructor>`,
        },
        {
          title: "Turning the risk table into an order of work",
          lang: "text",
          code: `
Risk  Item                                   Order  Depth
9     Daily limit (Toronto day, pending)     1      BVA on amounts + every status + evening/midnight times
9     Rolling 30-day limit                   2      BVA on amounts + time edge (own sandbox clock)
6     Cancel refund                          3      API + DB: status, REVERSAL row, balance, audit row
6     Expiry refund                          4      clock +30 days (own sandbox), DB check
4     Security answer                        5      EP table, accept with other case
3     Per-transfer limit                     6      0.00, 0.01, 2999.99, 3000.00, 3000.01
2     Confirmation wording                   7      glance during the UI journey
1     Contacts limit                         8      49 -> 50 ok, 51st refused (if time allows)`,
        },
      ],
      exercises: [
        "Write a half-page test strategy for your team's Ice Bank framework: layers, tools, environments, what is automated where, and how test data is handled.",
        "Write a one-page test plan for the week 1 exercise map (REST Assured foundations), including measurable entry and exit criteria.",
        "List five risks to your testing over the next three weeks (technical or practical) with a mitigation for each.",
        "Build a risk table (likelihood and impact from 1 to 3, risk = likelihood × impact) for the sub-features of bill payments: pay now, scheduled single payment, weekly/biweekly/monthly series, weekend and holiday posting dates, the 29th-31st rule, payee account-number formats, deleting payees. Order your testing by it and justify the two highest scores and the lowest.",
      ],
      quiz: [
        {
          q: "Which statement belongs in a test <em>strategy</em> rather than a test plan?",
          options: [
            "\"Week 2: B tests e-Transfers on Tuesday and Wednesday\"",
            "\"API tests are the main layer; UI tests only for critical journeys; every money movement is checked in the database\"",
            "\"Exit when all P1 cases for bill payments have run\"",
            "\"The autodeposit UI is out of scope for this release\"",
          ],
          answer: 1,
          explain: "The strategy is the long-lived \"how we test\". Schedules, people, scope and exit criteria for one release belong in the plan.",
        },
        {
          q: "Likelihood 3, impact 2 for one item; likelihood 1, impact 3 for another. Using risk = likelihood × impact, which do you test first?",
          options: ["The second one: impact matters most", "The first one: 6 versus 3", "Both at the same time", "Neither; only 9s are tested"],
          answer: 1,
          explain: "The product decides the order. The second item still gets tested, with less depth.",
        },
        {
          q: "What are suspension criteria for?",
          options: [
            "Deciding when a bug is serious enough to suspend the developer",
            "Saying when to stop testing because results would be meaningless (for example the environment is down), and what must happen before resuming",
            "Listing the features that will never be tested",
            "Deciding which tests to delete",
          ],
          answer: 1,
          explain: "Testing a broken environment wastes time and floods the tracker with false bugs. Stop, fix or redeploy, pass smoke, resume.",
        },
        {
          q: "You just found two bugs in cancel refunds. What should happen to your risk table?",
          options: [
            "Nothing; it was approved",
            "Raise the likelihood for cancel and its neighbours (expiry refunds, REVERSAL rows) and test them more deeply",
            "Lower the impact, since the bugs are now known",
            "Remove cancel from the table",
          ],
          answer: 1,
          explain: "Bugs cluster. A risk table is a living document; update it with what testing teaches you.",
        },
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
<p>Good manual cases translate directly into automated tests: preconditions → <code>@BeforeEach</code> setup, steps → the request, expected result → assertions.</p>
<h3>Test cases in a table: transfers between your own accounts</h3>
<p>The format above (one case per page) is good for complex cases. For a set of related cases, a table is faster to write, review and automate. The rules being tested: $0.01 to
$999,999.99 with at most 2 decimals; cannot exceed the available balance; source and target must differ; frozen accounts blocked; loan accounts can receive but not send; another
customer's account is a 404. Unless stated, the precondition is: Ice Bank local, signed in as Emma (accounts 1 chequing, 2 savings, 3 credit card, 4 loan), balances noted before the step
(B1, B2), new <code>Idempotency-Key</code> per request.</p>
<div class="table-wrap"><table>
<thead><tr><th>ID</th><th>Preconditions</th><th>Steps</th><th>Data</th><th>Expected</th></tr></thead>
<tbody>
<tr><td>TC-TR-001<br>Valid transfer</td><td>Default</td><td>1. POST /transfers<br>2. GET /accounts/1, /accounts/2<br>3. SQL: transactions with the response's referenceId</td><td>from 1, to 2, <code>"25.00"</code>, memo "Rent savings"</td><td>1. 201, <code>Location</code> /api/v1/transfers/{id}, status COMPLETED, amount "25.00"<br>2. acct 1 = B1 − 25.00, acct 2 = B2 + 25.00<br>3. Two rows (DEBIT on 1, CREDIT on 2), same reference id, type TRANSFER</td></tr>
<tr><td>TC-TR-002<br>Smallest amount</td><td>Default</td><td>As 001</td><td><code>"0.01"</code></td><td>201; balances move by exactly 0.01</td></tr>
<tr><td>TC-TR-003<br>Three decimals rejected</td><td>Default</td><td>1. POST /transfers<br>2. GET both accounts</td><td><code>"10.005"</code></td><td>1. 400 VALIDATION_FAILED, <code>errors[0]</code>: field <code>amount</code>, "must have at most 2 decimal places"<br>2. B1 and B2 unchanged (never rounded)</td></tr>
<tr><td>TC-TR-004<br>Exactly the available balance</td><td>Default</td><td>See the full case above</td><td>amount = B1</td><td>201; acct 1 available "0.00"</td></tr>
<tr><td>TC-TR-005<br>One cent over available</td><td>Default</td><td>1. POST /transfers<br>2. GET both accounts</td><td>amount = B1 + 0.01</td><td>1. 422 INSUFFICIENT_FUNDS<br>2. Unchanged; no new transactions rows</td></tr>
<tr><td>TC-TR-006<br>Same account</td><td>Default</td><td>POST /transfers</td><td>from 1, to 1, <code>"10.00"</code></td><td>422 SAME_ACCOUNT; balance unchanged</td></tr>
<tr><td>TC-TR-007<br>Another customer's account</td><td>Default; note Liam's account 5 balance (SQL)</td><td>1. POST /transfers<br>2. SQL: account 5</td><td>from 1, to 5, <code>"10.00"</code></td><td>1. 404 NOT_FOUND (does not reveal that account 5 exists)<br>2. Account 5 unchanged</td></tr>
<tr><td>TC-TR-008<br>Loan account cannot send</td><td>Default</td><td>POST /transfers</td><td>from 4, to 1, <code>"10.00"</code></td><td>422 INVALID_SOURCE</td></tr>
<tr><td>TC-TR-009<br>Frozen account blocked</td><td>Signed in as Ava Roy (10 chequing FROZEN, 11 savings)</td><td>POST /transfers</td><td>from 11, to 10, <code>"10.00"</code></td><td>422 ACCOUNT_FROZEN (frozen accounts can neither send nor receive)</td></tr>
<tr><td>TC-TR-010<br>Replay with the same key</td><td>TC-TR-001 just ran with key K</td><td>1. Repeat the identical request with K<br>2. GET both accounts</td><td>same body, <code>Idempotency-Key: K</code></td><td>1. 201, same transfer id, header <code>Idempotent-Replayed: true</code><br>2. Balances moved once only</td></tr>
<tr><td>TC-TR-011<br>Same key, different body</td><td>After TC-TR-010</td><td>POST /transfers</td><td>key K, amount <code>"26.00"</code></td><td>409 IDEMPOTENCY_KEY_REUSED; nothing moves</td></tr>
</tbody></table></div>

<h3>Weak versus strong expected results</h3>
<div class="table-wrap"><table>
<thead><tr><th>Weak</th><th>Strong</th></tr></thead>
<tbody>
<tr><td>"Transfer works"</td><td>"201; account 1 = B1 − 25.00; account 2 = B2 + 25.00; two transaction rows with the same reference id"</td></tr>
<tr><td>"Error is shown"</td><td>"400, <code>code</code> VALIDATION_FAILED, <code>errors[0].field</code> = amount, message 'must have at most 2 decimal places'; balances unchanged"</td></tr>
<tr><td>"User is locked"</td><td>"401 ACCOUNT_LOCKED; <code>users.status</code> = LOCKED, <code>locked_until</code> = sandbox time + 15 minutes; one USER_LOCKED audit row"</td></tr>
</tbody></table></div>

<h3>Traceability</h3>
<p>A <strong>traceability matrix</strong> maps each rule to the cases that test it (example 4). Read it both ways: a rule with no case is a coverage gap; a case with no rule is either
testing something undocumented (ask!) or is waste.</p>`,
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
        {
          title: "The same table as CSV (import into a spreadsheet, Jira or a test management tool)",
          lang: "text",
          code: `
ID,Title,Preconditions,Steps,Data,Expected,Priority
TC-TR-001,Valid transfer,"Local; Emma signed in; note B1, B2","POST /transfers; GET /accounts/1 and /2","from 1, to 2, 25.00","201 + Location; acct1 = B1-25.00; acct2 = B2+25.00; 2 rows same referenceId",High
TC-TR-003,Three decimals rejected,"Local; Emma signed in","POST /transfers; GET both accounts","from 1, to 2, 10.005","400 VALIDATION_FAILED field amount; balances unchanged",High
TC-TR-006,Same account,"Local; Emma signed in","POST /transfers","from 1, to 1, 10.00","422 SAME_ACCOUNT",Medium
TC-TR-010,Replay with same key,"TC-TR-001 ran with key K","repeat request with K","same body, key K","201, Idempotent-Replayed: true, balances moved once",High`,
        },
        {
          title: "Traceability matrix (rule to test cases)",
          lang: "text",
          code: `
Rule (README "Transfers")                          Test cases
$0.01 minimum                                      TC-TR-002, (0.00 -> lesson 4 BVA)
$999,999.99 maximum, max 2 decimals                TC-TR-003, lesson 4 BVA table
Cannot exceed available balance (equal allowed)    TC-TR-004, TC-TR-005
Source and target must differ                      TC-TR-006
Only your own accounts                             TC-TR-007
Frozen accounts are blocked                        TC-TR-009
Loan accounts can receive, not send                TC-TR-008, (receive: ?)      <- gap: no case yet
Idempotency-Key replay / reuse                     TC-TR-010, TC-TR-011`,
          note: "The gap in the last-but-one row is deliberate: spotting such a gap is exactly what the matrix is for.",
        },
      ],
      exercises: [
        "Write five complete test cases for opening a savings account (<code>POST /api/v1/accounts</code>): at least two positive and three negative (hint: max 3 savings accounts, nickname 1 to 30 characters). Run them on Ice Bank local and fill in the actual results.",
        "Take a teammate's case and run it exactly as written without asking them anything. Note every place you had to guess, and give it back with suggestions.",
        "Rewrite this weak case into a good one: \"Login works. Steps: log in. Expected: it works.\" Use Ice Bank's real sign-in flow with OTP.",
        "Write six test cases in the table format (ID, preconditions, steps, data, expected) for cancelling an e-Transfer (<code>POST /api/v1/etransfers/{id}/cancel</code>): a pending one (happy path, including the refund checks), one already cancelled, one already deposited, someone else's, a repeat with the same <code>Idempotency-Key</code>, and one more of your choice. Run them on Ice Bank local and record the actual results.",
      ],
      quiz: [
        {
          q: "Which expected result is good enough to give the same verdict every time?",
          options: [
            "\"The transfer is successful\"",
            "\"201; account 1 decreases by 25.00, account 2 increases by 25.00; two transaction rows with the same reference id\"",
            "\"No errors appear\"",
            "\"Works as in production\"",
          ],
          answer: 1,
          explain: "Exact, observable values, including side effects. Anyone can check it, and it translates straight into assertions.",
        },
        {
          q: "TC-TR-005 (one cent over the available balance) depends on TC-TR-001 having run first to set the balance. What is wrong?",
          options: [
            "Nothing; ordering saves time",
            "It is not independent: run alone or in a different order it gives a different result. It should read the balance in its own preconditions",
            "It should be merged into TC-TR-001",
            "It needs a higher priority",
          ],
          answer: 1,
          explain: "Independent cases can run alone, in any order, in parallel, and their failures point at one cause.",
        },
        {
          q: "A rule appears in the traceability matrix with no test case next to it. What does that mean?",
          options: ["The rule is not important", "A coverage gap: write a case or record why it is not tested", "The rule is already automated", "The matrix is out of date and should be deleted"],
          answer: 1,
          explain: "Finding untested rules (and tests with no rule) is the purpose of the matrix.",
        },
        {
          q: "Why does TC-TR-007 expect 404 and not 403 for another customer's account?",
          options: [
            "404 is shorter",
            "Ice Bank's convention: another customer's resource is reported as not found, so the API does not reveal that it exists",
            "403 is only for the UI",
            "Because the account does not exist",
          ],
          answer: 1,
          explain: "The README's API conventions: \"404 for not found, including another customer's resource\". 403 is for the wrong role, such as a customer calling an admin endpoint.",
        },
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
days of posting) and the card POS limit ($500 to $5,000 in $100 steps: test 400, 500, 550, 5,000, 5,100).</p>
<h3>Worked example: the transfer amount (between your own accounts)</h3>
<p>Rules: $0.01 to $999,999.99, at most 2 decimals (more is rejected, never rounded), not more than the available balance. The input has a <em>format</em> dimension and a
<em>value</em> dimension, and the value has two upper limits: a fixed one (999,999.99) and a state-dependent one (the balance B). Signed in as Emma, from account 1 to 2:</p>
<div class="table-wrap"><table>
<thead><tr><th>#</th><th>Partition or boundary</th><th>Value</th><th>Expected</th></tr></thead>
<tbody>
<tr><td>1</td><td>Not a number</td><td><code>"abc"</code></td><td>400 VALIDATION_FAILED, message <em>must be a decimal amount such as "25.00"</em></td></tr>
<tr><td>2</td><td>Thousands separator or missing digits</td><td><code>"1,000.00"</code>, <code>".50"</code>, <code>"10."</code></td><td>400 VALIDATION_FAILED</td></tr>
<tr><td>3</td><td>Too many decimals</td><td><code>"10.005"</code></td><td>400 "must have at most 2 decimal places"</td></tr>
<tr><td>4</td><td>Negative</td><td><code>"-1.00"</code></td><td>400 "must be greater than 0"</td></tr>
<tr><td>5</td><td>Lower boundary, invalid side</td><td><code>"0.00"</code></td><td>400 "must be at least 0.01"</td></tr>
<tr><td>6</td><td>Lower boundary</td><td><code>"0.01"</code></td><td>201</td></tr>
<tr><td>7</td><td>Valid, sent as a JSON number</td><td><code>10.5</code></td><td>201, amount "10.50"</td></tr>
<tr><td>8</td><td>Balance boundary</td><td>B (available on account 1)</td><td>201</td></tr>
<tr><td>9</td><td>Balance boundary + 1 cent</td><td>B + 0.01</td><td>422 INSUFFICIENT_FUNDS</td></tr>
<tr><td>10</td><td>Upper format boundary</td><td><code>"999999.99"</code></td><td>Passes validation; Emma's chequing does not hold it, so 422 INSUFFICIENT_FUNDS (not 400)</td></tr>
<tr><td>11</td><td>Upper format boundary + 1 cent</td><td><code>"1000000.00"</code></td><td>400 "must be at most 999999.99"</td></tr>
</tbody></table></div>
<p>Rows 10 and 11 show a useful trick: you can prove where a validation boundary is <em>without having the money</em>, because the two sides fail with different codes (422 means "valid
input, business rule refused"; 400 means "invalid input").</p>

<h3>Worked example: all three e-Transfer limits and the "pending counts" rule</h3>
<p>Write <strong>T</strong> for the total of the sender's PENDING + DEPOSITED e-Transfers sent today (Toronto day), and <strong>S</strong> for the same total over the last 30 days.
The partitions come from each rule in turn:</p>
<div class="table-wrap"><table>
<thead><tr><th>Rule</th><th>State</th><th>Amount</th><th>Expected</th></tr></thead>
<tbody>
<tr><td>Per transfer</td><td>T = 0</td><td>0.00 / 0.01 / 3000.00 / 3000.01</td><td>400 / 201 / 201 / 422 LIMIT_PER_TRANSFER</td></tr>
<tr><td>Daily</td><td>T = 1200.00</td><td>1800.00</td><td>201 (today's total exactly 3,000.00)</td></tr>
<tr><td>Daily</td><td>T = 1200.00</td><td>1800.01</td><td>422 DAILY_LIMIT_EXCEEDED, <code>remaining</code> "1800.00"</td></tr>
<tr><td>Pending counts</td><td>T = 1200.00, all of it still PENDING</td><td>1800.01</td><td>422 DAILY_LIMIT_EXCEEDED (pending money is committed)</td></tr>
<tr><td>Deposited counts</td><td>T = 1200.00, recipient already accepted</td><td>1800.01</td><td>422 DAILY_LIMIT_EXCEEDED</td></tr>
<tr><td>Cancelled frees the allowance</td><td>Two transfers today, 700.00 and 500.00; the 500.00 one cancelled (T = 700.00)</td><td>2300.00</td><td>201</td></tr>
<tr><td>Rolling</td><td>T = 0, S = 9000.00 (from earlier days)</td><td>1000.00 / 1000.01</td><td>201 / 422 ROLLING_LIMIT_EXCEEDED</td></tr>
<tr><td>Funds</td><td>Noah (balance 0.00), limits untouched</td><td>10.00</td><td>422 INSUFFICIENT_FUNDS</td></tr>
</tbody></table></div>
<p><strong>One rule at a time.</strong> A value can sit in two invalid partitions at once: 3000.01 with T = 2000 breaks both the per-transfer and the daily rule. The API reports the first
rule it checks, so such a case tells you nothing about the second rule. Ice Bank checks input format first (400), then the per-transfer limit, then the daily limit, then the rolling limit,
then the balance. To test the daily limit, keep each amount at or below 3,000.00; to test the rolling limit, keep today's total low.</p>
<p><strong>Hidden partitions in "today"</strong>: Toronto is UTC−5 in November (UTC−4 in summer), so UTC midnight falls at 19:00 (or 20:00) Toronto time. A transfer at 19:30
Toronto is on the <em>same</em> Toronto day as one at 09:00, although its UTC date is the next day. "Before 19:00", "between 19:00 and midnight" and "after midnight" are three
partitions for the daily limit. They need the sandbox clock, in your own sandbox only.</p>`,
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
        {
          title: "Transfer amount BVA as a parameterised test",
          lang: "java",
          code: `
@ParameterizedTest(name = "{0} -> {1} {2}")
@CsvSource({
    "abc,        400, VALIDATION_FAILED",
    "10.005,     400, VALIDATION_FAILED",
    "-1.00,      400, VALIDATION_FAILED",
    "0.00,       400, VALIDATION_FAILED",
    "0.01,       201, ",
    "999999.99,  422, INSUFFICIENT_FUNDS",   // valid input, Emma lacks the money
    "1000000.00, 400, VALIDATION_FAILED",
})
void transferAmountBoundaries(String amount, int status, String code) {
    ValidatableResponse r = transfers.post(1, 2, amount).then().statusCode(status);
    if (code != null) r.body("code", equalTo(code));
}`,
          note: "The balance boundary (B and B + 0.01) is not in the list: B changes, so that pair reads the balance first (TC-TR-004 and TC-TR-005 in lesson 3).",
        },
        {
          title: "Daily-limit partitions, as a manual script",
          lang: "text",
          code: `
Setup: own sandbox or local after reset; sender Emma; recipient olivia.singh@icebank.test
       (no autodeposit, so transfers stay PENDING); read T with SQL before each step

Step  Action                                           Expected
1     Send 1200.00                                     201 PENDING          (T = 1200.00)
2     Send 1800.01                                     422 DAILY_LIMIT_EXCEEDED, remaining "1800.00"
3     Cancel the transfer from step 1                  200 CANCELLED, REVERSAL +1200.00 (T = 0.00)
4     Send 3000.00                                     201 PENDING          (T = 3000.00)
5     Send 0.01                                        422 DAILY_LIMIT_EXCEEDED, remaining "0.00"
Cleanup: cancel step 4 (or reset your sandbox)`,
        },
      ],
      exercises: [
        "Write the full EP and BVA table for the security answer (3 to 25 characters, case-insensitive, must not appear in the message). Include the partitions you get from \"case-insensitive\" and \"not in the message\". Run at least six of them on Ice Bank local.",
        "Using the SQL from Tutorial 1 (lesson 3), find Emma's remaining daily allowance, then test the exact daily boundary with two e-Transfers: the one that reaches exactly the limit and one more cent. Record statuses and codes.",
        "Design the boundary cases for the rolling 30-day limit, including the time boundary (a transfer sent 30 × 24 hours ago minus/plus one minute). Write which ones need the sandbox clock and why.",
        "Apply BVA to the debit card daily POS limit (<code>PATCH /api/v1/cards/1/limits</code>, $500 to $5,000 in $100 steps). Run the cases and note which partition each failure belongs to.",
        "Do EP and BVA for the other e-Transfer text inputs: <code>recipientName</code> (1 to 60 characters), <code>message</code> (optional, at most 400) and <code>securityQuestion</code> (5 to 100, required when the recipient has no autodeposit). Write the table, then run at least five rows on Ice Bank local without moving any money (hint: think about which persona's balance turns a valid request into a harmless 422).",
        "Design the cases that prove the \"pending and deposited count, cancelled and expired don't\" rule for the <em>daily</em> limit, one per status of an earlier transfer sent today. For each, give the state, the amount and the expected result. Then explain whether the EXPIRED case can be observed at all for the daily limit, and why.",
      ],
      quiz: [
        {
          q: "Which set of amounts gives the best boundary coverage for the e-Transfer per-transfer rule ($0.01 to $3,000.00)?",
          options: [
            "1.00, 100.00, 1000.00",
            "0.00, 0.01, 2999.99, 3000.00, 3000.01",
            "-1.00, 5000.00",
            "3000.00 only",
          ],
          answer: 1,
          explain: "On each boundary and one cent either side. The other sets are all inside one partition or skip the edges where off-by-one bugs live.",
        },
        {
          q: "Emma has sent $1,200.00 today (still PENDING). Which amount is the exact valid edge of the daily limit for her next e-Transfer?",
          options: ["$3,000.00", "$1,800.00", "$1,800.01", "$1,200.00"],
          answer: 1,
          explain: "Pending transfers count, so the remaining allowance is 3,000.00 − 1,200.00 = 1,800.00. 1,800.01 is the first invalid value.",
        },
        {
          q: "With $2,000 already sent today, you send $3,000.01 and get 422 <code>LIMIT_PER_TRANSFER</code>. What did this case prove about the daily limit?",
          options: [
            "That the daily limit works",
            "Nothing: the per-transfer rule fired first, so the daily rule was never reached",
            "That the daily limit is broken",
            "That pending transfers do not count",
          ],
          answer: 1,
          explain: "A value in two invalid partitions only exercises the rule checked first. Test the daily limit with amounts of $3,000.00 or less.",
        },
        {
          q: "<code>\"999999.99\"</code> as a transfer from Emma's chequing returns 422 <code>INSUFFICIENT_FUNDS</code>, and <code>\"1000000.00\"</code> returns 400. What does that tell you?",
          options: [
            "The upper validation boundary is exactly 999,999.99: the first value passed validation, the second did not",
            "Both are bugs",
            "The limit is Emma's balance",
            "Nothing, because neither transfer succeeded",
          ],
          answer: 0,
          explain: "Different codes on either side of a boundary locate it precisely, even when the valid side is refused for another reason.",
        },
        {
          q: "Why are \"19:30 Toronto time\" and \"09:00 Toronto time\" on the same day different partitions worth testing for the daily limit?",
          options: [
            "Ice Bank has a different limit in the evening",
            "19:30 Toronto is already the next day in UTC, so an implementation that wrongly uses UTC days would treat them as different days",
            "Transfers after 19:00 are always pending",
            "They are not; one is enough",
          ],
          answer: 1,
          explain: "Partitions come from how the system could plausibly be wrong, not only from the rule's text. The rule says Toronto day.",
        },
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
<p>Seed data gives you a ready-made state: Lucas Gagnon (customer 6) already has an application in <code>MANUAL_REVIEW</code> (DTI 36.26), which is precondition for R6.</p>
<h3>Worked example: choosing inputs that land on each band edge</h3>
<p>Take a $20,000 loan over 60 months and an annual income of $60,000.00. Step by step:</p>
<ol>
<li><strong>Monthly rate</strong>: r = 0.0899 ÷ 12 = 0.00749167.</li>
<li><strong>Payment</strong>: (1 + r)<sup>−60</sup> = 0.63902, so P × r ÷ (1 − 0.63902) = 20,000 × 0.00749167 ÷ 0.36098 = <strong>415.07</strong> (rounded to the cent).</li>
<li><strong>Monthly income</strong>: 60,000.00 ÷ 12 = 5,000.00. So DTI = (debts + 415.07) ÷ 5,000.00 × 100.</li>
<li><strong>Work backwards</strong>: DTI 35.00 needs debts + payment = 1,750.00, so debts = 1,334.93. Do the same for each target.</li>
</ol>
<div class="table-wrap"><table>
<thead><tr><th>Target</th><th>monthlyDebtPayments</th><th>Debts + payment</th><th>DTI before rounding</th><th>dtiPercent</th><th>Expected status</th></tr></thead>
<tbody>
<tr><td>Clearly approved</td><td>500.00</td><td>915.07</td><td>18.3014</td><td>18.30</td><td>APPROVED (loan created, money paid into chequing)</td></tr>
<tr><td>Just under 35</td><td>1,334.43</td><td>1,749.50</td><td>34.9900</td><td>34.99</td><td>APPROVED</td></tr>
<tr><td>Rounding edge</td><td>1,334.67</td><td>1,749.74</td><td>34.9948</td><td>34.99</td><td>APPROVED</td></tr>
<tr><td>Rounding edge</td><td>1,334.68</td><td>1,749.75</td><td>34.9950</td><td>35.00</td><td>MANUAL_REVIEW</td></tr>
<tr><td>Exactly 35</td><td>1,334.93</td><td>1,750.00</td><td>35.0000</td><td>35.00</td><td>MANUAL_REVIEW</td></tr>
<tr><td>Exactly 45</td><td>1,834.93</td><td>2,250.00</td><td>45.0000</td><td>45.00</td><td>MANUAL_REVIEW</td></tr>
<tr><td>Rounding edge</td><td>1,835.17</td><td>2,250.24</td><td>45.0048</td><td>45.00</td><td>MANUAL_REVIEW</td></tr>
<tr><td>Rounding edge</td><td>1,835.18</td><td>2,250.25</td><td>45.0050</td><td>45.01</td><td>DECLINED</td></tr>
<tr><td>Just over 45</td><td>1,835.43</td><td>2,250.50</td><td>45.0100</td><td>45.01</td><td>DECLINED</td></tr>
</tbody></table></div>
<p>The rounding rows matter: the band is decided on the <em>rounded</em> DTI. 34.995 rounds half-up to 35.00, which is manual review, not approval. An implementation that compared the
unrounded value would approve it; only a case right at that edge can tell the two apart. These figures were computed with Ice Bank's own formula; the API's <code>monthlyPayment</code>
and <code>dtiPercent</code> fields let you confirm them.</p>

<h3>Reading and reducing a decision table</h3>
<p>With n yes/no conditions a full table has 2<sup>n</sup> columns. Many are impossible or irrelevant and can be merged: a dash (<code>-</code>) means "does not matter in this column".
In the table above, once the input is invalid (R1) the DTI band does not matter, because nothing is computed. Be careful when you merge: you are claiming the system really ignores that
condition. Ice Bank checks the target account, then "already in review", then DTI; if the order were different, R6 would need a band too.</p>`,
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
        {
          title: "The worked example as test data",
          lang: "text",
          code: `
amount 20000.00   termMonths 60   annualIncome 60000.00   expected monthlyPayment 415.07

monthlyDebtPayments   expected dtiPercent   expected status
500.00                18.30                 APPROVED
1334.43               34.99                 APPROVED
1334.67               34.99                 APPROVED
1334.68               35.00                 MANUAL_REVIEW
1334.93               35.00                 MANUAL_REVIEW
1834.93               45.00                 MANUAL_REVIEW
1835.17               45.00                 MANUAL_REVIEW
1835.18               45.01                 DECLINED
1835.43               45.01                 DECLINED`,
          note: "Each APPROVED result creates a loan and pays $20,000 into chequing, and a MANUAL_REVIEW result blocks that customer's next application (R6). Run these in your own sandbox, or reset local between cases.",
        },
        {
          title: "Decision table as a JUnit 5 data source",
          lang: "java",
          code: `
@ParameterizedTest(name = "debts {0} -> DTI {1} {2}")
@CsvSource({
    "1334.43, 34.99, APPROVED",
    "1334.68, 35.00, MANUAL_REVIEW",
    "1834.93, 45.00, MANUAL_REVIEW",
    "1835.18, 45.01, DECLINED",
})
void dtiBands(String debts, String dti, String status) {
    customerWithNoApplicationInReview();                       // precondition for R2-R5
    loans.apply("20000.00", 60, "60000.00", debts)
         .then().statusCode(201)
         .body("monthlyPayment", equalTo("415.07"))
         .body("dtiPercent", equalTo(dti))
         .body("status", equalTo(status));
}`,
          note: "<code>customerWithNoApplicationInReview()</code> is a placeholder for your own setup (a fresh customer or a reset), because a MANUAL_REVIEW row changes the next case's precondition.",
        },
      ],
      exercises: [
        "Extend the decision table with the input-validation conditions split out (amount below $1,000, above $50,000, term 11 and 61, disbursement account that is savings or not yours). How many columns do you get after removing impossible ones?",
        "Using the oracle, choose inputs for a $10,000, 36-month loan that land on DTI exactly 34.99, 35.00, 45.00 and 45.01. Show your arithmetic.",
        "Run R2 to R5 on Ice Bank local as Noah or Emma and record <code>status</code>, <code>monthlyPayment</code> and <code>dtiPercent</code> from each response. Do they match your oracle to the cent?",
        "Run R6 as Lucas Gagnon. Then, as the teller, decide his application (<code>POST /api/v1/admin/loans/{id}/decision</code>) and check whether he can apply again.",
        "For a $5,000 loan over 24 months with an annual income of $48,000.00, find the <code>monthlyDebtPayments</code> values on both sides of each rounding edge (unrounded DTI 34.995 and 45.005) and predict <code>dtiPercent</code> and <code>status</code> for each. Show the payment and your arithmetic.",
      ],
      quiz: [
        {
          q: "With monthly income $5,000.00 and a new payment of $415.07, which existing monthly debts give DTI exactly 35.00?",
          options: ["$1,750.00", "$1,334.93", "$1,749.50", "$2,250.00"],
          answer: 1,
          explain: "35.00% of 5,000.00 is 1,750.00 of total monthly payments, so debts = 1,750.00 − 415.07 = 1,334.93.",
        },
        {
          q: "The unrounded DTI is 34.995. What does Ice Bank decide?",
          options: [
            "APPROVED, because 34.995 is under 35",
            "MANUAL_REVIEW, because the DTI is rounded half-up to 35.00 before the band is chosen",
            "DECLINED",
            "400, because DTI must have 2 decimals",
          ],
          answer: 1,
          explain: "The rule rounds to 2 decimals first. That rounding edge is exactly where an implementation could go wrong, so it deserves its own case.",
        },
        {
          q: "Lucas Gagnon already has an application in MANUAL_REVIEW. He applies again with a DTI of 12.00. What should happen?",
          options: [
            "201 APPROVED: a low DTI always wins",
            "409 APPLICATION_IN_REVIEW: only one application in review at a time",
            "201 MANUAL_REVIEW",
            "422 DECLINED",
          ],
          answer: 1,
          explain: "That is rule R6. The DTI band does not matter in that column, which is why the table shows a dash there.",
        },
        {
          q: "Why use a decision table rather than just EP/BVA for the loan decision?",
          options: [
            "Decision tables need fewer test cases in every situation",
            "The result depends on combinations of conditions (valid input, application in review, DTI band); the table makes every combination, and missing rules, visible",
            "EP/BVA cannot be used for money",
            "Decision tables replace the need for an oracle",
          ],
          answer: 1,
          explain: "EP/BVA picks good values for one input; a decision table organises how several conditions combine. You use both: BVA chooses the numbers inside each column.",
        },
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
<code>PENDING → DEPOSITED | CANCELLED | EXPIRED</code>, with no way back out of the final states.</p>
<h3>The lockout as a diagram, with the exact responses</h3>
<p>The first example below draws the machine. The details that matter for test cases, all from the clean build's behaviour:</p>
<div class="table-wrap"><table>
<thead><tr><th>Situation</th><th>Response</th><th>Database afterwards</th></tr></thead>
<tbody>
<tr><td>Wrong password, 1st to 4th time</td><td>401 <code>INVALID_CREDENTIALS</code>, <code>attemptsRemaining</code> 4, 3, 2, 1</td><td><code>failed_login_count</code> 1 to 4</td></tr>
<tr><td>Wrong password, 5th time</td><td>401 <code>ACCOUNT_LOCKED</code>, "Too many failed sign-in attempts. Try again in 15 minutes.", <code>lockedUntil</code></td><td><code>status</code> LOCKED, count 5, <code>locked_until</code> = sandbox time + 15 min; audit <code>USER_LOCKED</code>; a SECURITY notification</td></tr>
<tr><td>Any password while locked</td><td>401 <code>ACCOUNT_LOCKED</code>, "Try again in N minutes"</td><td>Unchanged: the count is not increased and the lock is not extended</td></tr>
<tr><td>Any attempt once <code>locked_until</code> has passed</td><td>The lock is lifted first (audit <code>USER_UNLOCKED</code>, count 0), then the password is checked as usual: right gives 200 and an OTP, wrong gives 401 with <code>attemptsRemaining</code> 4</td><td>ACTIVE, count 0 or 1</td></tr>
<tr><td>Right password before the lock</td><td>200 <code>mfaRequired</code>, OTP sent to Ice Mail</td><td>count back to 0</td></tr>
<tr><td>Unknown email</td><td>401 <code>INVALID_CREDENTIALS</code> with no <code>attemptsRemaining</code> (the API does not reveal which emails exist)</td><td>Nothing</td></tr>
<tr><td>Teller unlock while LOCKED / while ACTIVE</td><td>200 <code>{status: ACTIVE, failedLoginCount: 0}</code> / 409 <code>INVALID_STATE</code></td><td>ACTIVE, count 0 / unchanged</td></tr>
</tbody></table></div>
<p>Practical note: sign-in endpoints allow 10 requests per minute per IP address. A lockout sequence plus OTP steps can hit 429 <code>RATE_LIMITED</code>; wait for the
<code>Retry-After</code> seconds rather than reporting a bug.</p>

<h3>The OTP step: a second, smaller machine</h3>
<p>States: SENT with 0, 1 or 2 wrong attempts, then SIGNED IN, EXHAUSTED or EXPIRED. Events: correct code, wrong code, 5 minutes pass. The second example has the full table. Two
details turn into good test cases: once a code is exhausted it stays exhausted even after it would have expired (the attempts check comes first), and wrong codes do <em>not</em> count
toward the 5-failure password lockout; they only use up that code's 3 attempts.</p>

<h3>e-Transfer status</h3>
<p>The third example shows the valid transitions, each with the side effects to verify. A state-transition test checks more than the new status: on every transition look at the money (which
account moved, by how much, which <code>transactions</code> row), the <code>audit_log</code> row and the notifications. The final states (DEPOSITED, CANCELLED, EXPIRED) must refuse every
further event; finding and testing those invalid transitions is exercise 4.</p>

<h3>Sequences (switch coverage)</h3>
<p>Testing each transition once is <em>0-switch coverage</em>. <em>1-switch coverage</em> tests every pair of consecutive transitions, which finds bugs in counters that are not reset or
reset at the wrong moment (example 4). For the lockout, the interesting sequences mix wrong and right passwords and the passing of time.</p>`,
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
        {
          title: "Lockout state diagram",
          lang: "text",
          code: `
 ACTIVE(0) <-------------------------+   right password (200 + OTP, count to 0)
    | wrong (401, 4 left)            |   from any ACTIVE(n)
    v                                |
 ACTIVE(1) --------------------------+
    | wrong (3 left)                 |
    v                                |
 ACTIVE(2) --------------------------+
    | wrong (2 left)                 |
    v                                |
 ACTIVE(3) --------------------------+
    | wrong (1 left)                 |
    v                                |
 ACTIVE(4) --------------------------+
    | wrong, the 5th: 401 ACCOUNT_LOCKED
    v
 LOCKED ---- any password: 401 ACCOUNT_LOCKED, no change ----+
    ^                                                         |
    +---------------------------------------------------------+
    |
    +-- teller unlock ------------------------------> ACTIVE(0)
    +-- first attempt at or after locked_until -----> ACTIVE(0), then that attempt is evaluated`,
        },
        {
          title: "OTP state transition table",
          lang: "text",
          code: `
State            correct code (in time)        wrong code                                  5 minutes pass
SENT(0 wrong)    SIGNED IN: 200 tokens         SENT(1): 401 OTP_INVALID, attemptsRemaining 2   EXPIRED
SENT(1 wrong)    SIGNED IN                     SENT(2): 401 OTP_INVALID, attemptsRemaining 1   EXPIRED
SENT(2 wrong)    SIGNED IN                     EXHAUSTED: 401 OTP_ATTEMPTS_EXCEEDED, 0         EXPIRED
EXHAUSTED        401 OTP_ATTEMPTS_EXCEEDED     401 OTP_ATTEMPTS_EXCEEDED                   stays EXHAUSTED
EXPIRED          401 OTP_EXPIRED               401 OTP_EXPIRED                             stays EXPIRED
SIGNED IN        401 MFA_TOKEN_INVALID (the mfaToken was used up)

Leaving EXHAUSTED or EXPIRED: start again with POST /auth/login (a new code and a new mfaToken).`,
        },
        {
          title: "e-Transfer status: valid transitions and what to verify",
          lang: "text",
          code: `
 send, recipient has autodeposit ---------------------> DEPOSITED
 send, no autodeposit ----> PENDING
                              |-- accept, right answer --> DEPOSITED
                              |-- sender cancels --------> CANCELLED   (full refund)
                              |-- 30 days pass ----------> EXPIRED     (full refund)
                              +-- accept, wrong answer: stays PENDING (422 WRONG_ANSWER)

 DEPOSITED, CANCELLED and EXPIRED are final.

Transition            Money                                      Audit row
send                  sender DEBIT at once (type ETRANSFER)      ETRANSFER_SENT
accept                recipient CREDIT (ETRANSFER)               ETRANSFER_ACCEPTED
cancel                sender CREDIT, type REVERSAL (full)        ETRANSFER_CANCELLED
expire                sender CREDIT, type REVERSAL (full)        ETRANSFER_EXPIRED
autodeposit send      sender DEBIT and recipient CREDIT          ETRANSFER_SENT`,
          note: "Arrows that are not drawn (for example anything leaving DEPOSITED, CANCELLED or EXPIRED) are the invalid transitions to test.",
        },
        {
          title: "Sequence cases (1-switch coverage) for the lockout",
          lang: "text",
          code: `
ID       Sequence (Noah, sandbox time t0)                       Expected at the end
SEQ-01   wrong x5                                               LOCKED, locked_until = t0 + 15 min
SEQ-02   wrong x5, right                                        401 ACCOUNT_LOCKED, count still 5
SEQ-03   wrong x5, wait until locked_until, wrong               401 INVALID_CREDENTIALS, attemptsRemaining 4
SEQ-04   wrong x5, wait until locked_until, right               200 + OTP, count 0
SEQ-05   wrong x5, teller unlock, wrong x4                      ACTIVE(4), not locked
SEQ-06   wrong x2, right, wrong OTP x3, wrong password x3       ACTIVE(3): OTP failures do not add to the count`,
          note: "SEQ-03 and SEQ-04 need 15 minutes of sandbox time: wait, or move the clock in your own sandbox only.",
        },
      ],
      exercises: [
        "Draw the lockout state diagram (states as circles, events as arrows). Then list every transition and give each a test case id.",
        "As Noah, run the sequence: 4 wrong passwords, 1 right password (stop before OTP), 4 wrong passwords. Check <code>attemptsRemaining</code> each time and the database after each step. Is Noah locked at the end? Should he be?",
        "Lock Noah with 5 wrong passwords, then try the right password. Record the response. Then unlock him as the teller and confirm he can sign in. Note the audit rows (<code>USER_LOCKED</code>, <code>USER_UNLOCKED</code>).",
        "Draw the e-Transfer state machine and list three invalid transitions (for example accepting a cancelled transfer). Test them on local and record the status and <code>code</code> of each.",
        "Test the OTP machine on Ice Bank local as Noah: (a) three wrong codes, then the correct one; (b) two wrong codes, then the correct one; (c) sign in successfully, then send the same <code>mfaToken</code> and code again; (d) let a code expire (wait 5 minutes, or use the clock in your own sandbox). Record status, <code>code</code> and <code>attemptsRemaining</code> for every request and compare with the table.",
      ],
      quiz: [
        {
          q: "Noah is locked (5 failures). He tries again with the <em>wrong</em> password 3 minutes later. What changes?",
          options: [
            "The count goes to 6 and the lock is extended by 15 minutes",
            "Nothing: 401 ACCOUNT_LOCKED, the count stays 5 and <code>locked_until</code> stays the same",
            "He is unlocked",
            "The account is disabled permanently",
          ],
          answer: 1,
          explain: "While locked, the password is not even checked. The lock ends at the original <code>locked_until</code>.",
        },
        {
          q: "Noah's lock has just expired. His first attempt uses a wrong password. What is the result?",
          options: [
            "401 ACCOUNT_LOCKED again",
            "401 INVALID_CREDENTIALS with <code>attemptsRemaining</code> 4: the lock is lifted, the count restarts at 0, then this failure counts as the first",
            "200, because the lock expired",
            "401 with <code>attemptsRemaining</code> 0",
          ],
          answer: 1,
          explain: "Unlocking happens on the next attempt, and that attempt is then evaluated normally. A sequence case (SEQ-03) catches counters that are not reset.",
        },
        {
          q: "Which is an <em>invalid</em> transition that a state-transition test should try?",
          options: [
            "Cancel a PENDING e-Transfer",
            "Accept a PENDING e-Transfer with the right answer",
            "Cancel an e-Transfer that is already DEPOSITED",
            "Send an e-Transfer to a recipient without autodeposit",
          ],
          answer: 2,
          explain: "DEPOSITED is final. The other three are valid transitions shown in the diagram.",
        },
        {
          q: "After three wrong OTP codes, the user enters the correct code. What happens?",
          options: [
            "Signed in, because the code is correct",
            "401 OTP_ATTEMPTS_EXCEEDED: the code is used up; start again from the login step",
            "The account is locked for 15 minutes",
            "401 OTP_EXPIRED",
          ],
          answer: 1,
          explain: "The code allows 3 attempts. OTP failures do not lock the account; they only exhaust that code.",
        },
        {
          q: "What does 1-switch coverage add to \"test every transition once\"?",
          options: [
            "It tests every state once",
            "It tests every pair of consecutive transitions, which catches counters and flags that are not reset correctly",
            "It tests only invalid transitions",
            "It tests the UI and API at the same time",
          ],
          answer: 1,
          explain: "\"Fail 4, succeed, fail 4\" is a pair-of-transitions test: the counter must have been reset by the success.",
        },
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
<p>Exploratory and scripted testing complement each other: exploration finds the surprising bugs, and each surprise becomes a scripted (then automated) regression test.</p>
<h3>SFDIPOT: a checklist for test ideas</h3>
<p>When you run out of ideas, walk through the product elements of the Heuristic Test Strategy Model (James Bach), often remembered as SFDIPOT: <strong>Structure</strong> (what it is made
of: pages, API, DB tables, jobs), <strong>Function</strong> (what it does), <strong>Data</strong> (what it processes), <strong>Interfaces</strong> (UI, API, files, emails),
<strong>Platform</strong> (what it depends on: browser, database, clock), <strong>Operations</strong> (how real people use it) and <strong>Time</strong> (anything involving dates,
order, duration, concurrency). Example 3 applies it to e-Transfer.</p>

<h3>Tours</h3>
<p>A tour is a theme for a session. Useful ones for a bank: the <strong>money tour</strong> (follow one dollar through every place it appears: balance, history, CSV, statement, DB, audit),
the <strong>bad-neighbourhood tour</strong> (go back to areas where bugs were found), the <strong>back-alley tour</strong> (the screens and endpoints nobody uses: teller portal, classic view),
and the <strong>interruption tour</strong> (refresh, back, two tabs, timeout mid-flow).</p>

<h3>Session-based test management (SBTM)</h3>
<p>To make exploration accountable, record at the end of each session: the charter, the time box, the split of time between <em>setup</em>, <em>testing</em> and
<em>bug investigation</em> (a session that was 60% setup tells the team the environment is the problem), bugs, issues/questions, and what was not covered. A debrief can follow the
PROOF prompts: <strong>P</strong>ast (what happened), <strong>R</strong>esults (what you found), <strong>O</strong>bstacles (what got in the way), <strong>O</strong>utlook (what next),
<strong>F</strong>eelings (how confident you are about the area).</p>`,
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
        {
          title: "A complete session, from charter to debrief",
          lang: "text",
          code: `
CHARTER   Explore the money tour of one e-Transfer (send, cancel) as Emma
          with the UI, the API, SQL as qa_reader and the statement CSV
          to discover places where the amount, sign or status disagree
TIME BOX  60 min    ENV local (clean)    TESTER <name>    DATE 2026-11-09
TIME      setup 10%   testing 70%   bug investigation 20%

NOTES
09:05  Sent $12.34 to Olivia (UI). Toast, status PENDING. Chequing -12.34 on dashboard
09:12  API GET /etransfers?direction=sent: same amount, PENDING. SQL etransfers row matches
09:18  transactions: one DEBIT 12.34, type ETRANSFER, balance_after consistent (SQL)
09:25  Cancelled in UI (confirm dialog). REVERSAL +12.34; dashboard back to start
09:31  GET /accounts/1/transactions: DEBIT 12.34 and CREDIT 12.34 type REVERSAL, same referenceId
09:40  Olivia's Ice Mail: "Emma Tremblay cancelled the $12.34 e-Transfer sent to you." ? should the
       PENDING notification on her side disappear too? -> question
09:48  Two tabs: cancel in tab 1, cancel again in tab 2 -> error toast, no second refund (good)

BUGS       none
QUESTIONS  Q1 what happens to the recipient's "received" notification after a cancel?
NOT COVERED accept path, autodeposit, expiry
NEW CHARTERS  money tour of an accepted e-Transfer (Olivia's side); expiry with the clock (own sandbox)
DEBRIEF (PROOF)  Past: send + cancel via 4 interfaces. Results: consistent, 1 question.
                 Obstacles: none. Outlook: accept path next. Feelings: confident about cancel.`,
        },
        {
          title: "Coverage map: what the team has explored so far",
          lang: "text",
          code: `
Area / interface        UI      API     DB      CSV/PDF   Sessions
e-Transfer send         x       x       x       x         S-03, S-07
e-Transfer cancel       x       x       x       x         S-07
e-Transfer accept       -       x       x       -         S-05
Bill payments (now)     x       x       -       -         S-02
Bill payments (sched.)  -       -       -       -         (none yet)   <- next charter
Cards                   x       -       -       -         S-04
Loans                   -       x       x       -         S-06`,
        },
        {
          title: "SFDIPOT applied to Interac e-Transfer",
          lang: "text",
          code: `
Structure   send page, received page, /etransfers API, etransfers table, expiry job, Ice Mail
Function    send, accept, cancel, expire, limits, contacts, autodeposit
Data        amounts at limits, 3 decimals, answers with spaces/accents/case, 400-char messages
Interfaces  UI forms, confirm() dialog, API errors (problem+json), emails in Ice Mail
Platform    browser back/refresh, sandbox clock, database time zone
Operations  send to a contact vs a new email, recipient who is also a customer, a frozen account
Time        19:00-24:00 Toronto (after UTC midnight), 30-day expiry, two cancels at once,
            accept and cancel at the same moment`,
        },
      ],
      exercises: [
        "Write four charters for Ice Bank features you have not tested yet, using the Explore / with / to discover format.",
        "Run one 60-minute session on Ice Bank local with a session sheet. Debrief with a teammate for 10 minutes and write down the new charters it produced.",
        "Run the same charter on QA with bug packs enabled (your sandbox). Compare the two session sheets: which observations were bugs, and which were just how Ice Bank works?",
        "Turn the two most interesting findings from your sessions into scripted test cases (lesson 3 format).",
        "Use SFDIPOT on the bill payments feature: write at least two test ideas per letter. Pick the three ideas you think are riskiest and turn them into one charter in the Explore / with / to discover format.",
      ],
      quiz: [
        {
          q: "Which charter is well formed?",
          options: [
            "\"Test bill payments\"",
            "\"Explore scheduled bill payments with the sandbox clock and the holiday list to discover wrong posting dates around weekends and holidays\"",
            "\"Click around the app for an hour and see what breaks\"",
            "\"Run TC-BP-001 to TC-BP-020\"",
          ],
          answer: 1,
          explain: "Target, resources and the information you are looking for. The first is too vague, the third has no mission, the fourth is scripted testing.",
        },
        {
          q: "A session's time split was 65% setup, 25% testing, 10% bug investigation. What should the debrief take away?",
          options: [
            "The tester was slow",
            "Setup is the bottleneck (environment, data or sign-in); fix that before scheduling more sessions",
            "More bugs will be found next time",
            "Nothing; the split is not important",
          ],
          answer: 1,
          explain: "SBTM metrics are about the work, not the person. Heavy setup usually means missing test data helpers or an unstable environment.",
        },
        {
          q: "What is the \"money tour\"?",
          options: [
            "Testing only the most expensive features",
            "Following one amount through every place it appears (UI, API, DB, CSV, statement, audit) and checking they agree",
            "Load testing payments",
            "Testing currency conversion",
          ],
          answer: 1,
          explain: "Consistency between interfaces is a rich source of bugs: sign errors, rounding, missing rows, wrong status.",
        },
        {
          q: "How do exploratory and scripted testing relate?",
          options: [
            "Exploratory replaces scripted testing",
            "Scripted testing makes exploration unnecessary",
            "They complement each other: exploration finds surprises; each surprise becomes a scripted, then automated, regression test",
            "Exploratory testing is only for UI",
          ],
          answer: 2,
          explain: "Scripts check what you already know to check; exploration finds what you did not know to ask.",
        },
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
</ul>
<h3>A model bug report</h3>
<p>The first new example below is a complete report with evidence from two layers. Its defect is <strong>invented for this lesson</strong> (it is not one of the bugs the instructor
planted on QA), so do not go looking for it; use it as a template. Notice what makes it actionable: a title that states the condition, the rule it breaks with its source, a minimal
request that anyone can paste, and a database query that shows the effect independently of the API.</p>

<h3>Isolate the layer before you report</h3>
<ol>
<li>Seen in the UI? Open DevTools → Network and find the API call behind it. Is the <strong>API response</strong> already wrong, or does the UI show a correct response wrongly?</li>
<li>Response wrong? Check the <strong>database</strong> as <code>qa_reader</code>: is the stored data wrong (a write bug) or only the response (a read or mapping bug)?</li>
<li>Reproduce with the smallest request (Postman or curl, token removed) and on <strong>local</strong>: if local is correct, say so; it tells the developer the bug is specific to that build.</li>
<li>Report once, at the lowest layer that is wrong, and mention what you saw at the others.</li>
</ol>

<h3>More severity and priority examples</h3>
<div class="table-wrap"><table>
<thead><tr><th>Defect (invented examples)</th><th>Severity</th><th>Priority</th><th>Why</th></tr></thead>
<tbody>
<tr><td>Sign-in returns 500 for every user after a deploy</td><td>Critical</td><td>Highest</td><td>Nobody can use the bank; no workaround.</td></tr>
<tr><td>Statement PDF shows the previous year in its footer</td><td>Trivial</td><td>Low</td><td>Cosmetic, no customer impact.</td></tr>
<tr><td>CSV export header reads "Ammount" instead of "Amount"</td><td>Minor</td><td>High</td><td>Trivial-looking, but customers' import tools match header names, so their imports break. Business impact drives priority.</td></tr>
<tr><td>Teller portal crashes when exporting more than 10,000 audit rows; filtering by date works</td><td>Major</td><td>Low</td><td>Feature broken, but rarely used by a few staff with a workaround.</td></tr>
<tr><td>e-Transfer email to the recipient shows the amount without cents ("$75" for $75.00)</td><td>Minor</td><td>Medium</td><td>Information correct but inconsistent; customer-facing.</td></tr>
<tr><td>A customer can read another customer's transaction by changing the id in the URL</td><td>Critical</td><td>Highest</td><td>Security and privacy; legal exposure.</td></tr>
</tbody></table></div>
<p>Severity is yours to justify with impact. Priority you <em>propose</em>; the product owner decides, and may know things you do not (a demo tomorrow, a regulator's deadline).</p>`,
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
        {
          title: "Model bug report (invented defect, for format only)",
          lang: "text",
          code: `
Title:        GET /accounts/1/transactions with minAmount > maxAmount returns 200 and an empty page
              instead of 400
Environment:  QA, sandbox 2, build "qa" 1.0.0 (GET /api/v1/test/health), API only
Severity:     Minor     Priority (proposed): Low     Frequency: always (5 of 5)     Layer: API
Rule:         minAmount must not be greater than maxAmount (Swagger: GET /accounts/{id}/transactions;
              README "API conventions": 400 for malformed or invalid input)
Preconditions: signed in as emma.tremblay+s2@icebank.test; account 1 has transactions
Steps:
  1. GET /api/v1/accounts/1/transactions?minAmount=100.00&maxAmount=50.00
Expected:     400 VALIDATION_FAILED, errors[0] = {field "minAmount", "must not be greater than maxAmount"}
Actual:       200 OK, {"content":[],"page":0,"size":20,"totalElements":0,"totalPages":0}
Evidence:     X-Request-Id 3c9f6a1e-...; full response attached (token removed)
              SQL (qa_reader): SELECT count(*) FROM transactions
                               WHERE sandbox_id = 2 AND account_id = 1;   -> rows exist (data is fine)
Impact:       A UI filter typo silently shows "no transactions", which customers read as missing money.
Notes:        Local (clean build) returns the expected 400 for the same request.
              minAmount=50.00&maxAmount=100.00 returns rows on both builds.`,
          note: "Count how many questions a developer would still need to ask. For a good report the answer is zero.",
        },
        {
          title: "Weak report, rewritten",
          lang: "text",
          code: `
WEAK
  Title: contacts broken!!
  Body:  I can add way too many contacts. Please fix ASAP.

STRONG
  Title: POST /etransfer-contacts returns 201 for a 51st contact (limit is 50)
  Env:   QA, sandbox 3, build "qa" 1.0.0
  Preconditions: signed in as emma.tremblay+s3@icebank.test; she has exactly 50 contacts:
            SELECT count(*) FROM etransfer_contacts WHERE sandbox_id = 3 AND customer_id = 1; -> 50
  Steps: 1. POST /api/v1/etransfer-contacts {"name":"Test Contact 51","email":"c51@example.com"}
  Expected: 422 CONTACT_LIMIT "You can have at most 50 contacts." (Swagger: POST /etransfer-contacts)
  Actual:   201 Created; the same query now returns 51
  Evidence: X-Request-Id ..., request and response, both SQL results`,
          note: "Also invented. The rewrite replaces feelings with facts, names the rule, and proves the precondition with SQL.",
        },
      ],
      exercises: [
        "Rate severity and priority for each of these and justify in one line: a scheduled bill payment is taken twice; full card numbers appear in an API response; the CSV export takes 40 seconds for Perf User; a typo on the Ice Mail page; a 500 when an unknown query parameter is sent.",
        "Rewrite this report so a developer can act on it: \"e-transfer doesn't work for Ava. Please fix ASAP!!!\". Find out on Ice Bank local what actually happens for Ava Roy (frozen chequing) and decide whether it is even a bug.",
        "Find a real bug on QA (any pack) and write the full report with evidence from at least two layers (API response plus SQL, or UI plus Network tab).",
        "Swap reports with a teammate and try to reproduce theirs using only the report. Give feedback on anything that was missing.",
        "Take one bug you reported and write it for two audiences: the full report for the developer, and a three-sentence summary for the product owner (impact on customers, how often, suggested priority). Note what you left out of the summary and why.",
      ],
      quiz: [
        {
          q: "A CSV export header is misspelled, and it breaks customers' accounting imports. Which classification fits best?",
          options: [
            "Trivial severity, low priority: it is only a typo",
            "Minor severity, high priority: small defect, but big business impact",
            "Critical severity, low priority",
            "It is not a bug",
          ],
          answer: 1,
          explain: "Severity is the defect's technical impact; priority reflects the business. They often differ, and this is the classic example.",
        },
        {
          q: "You see a wrong balance in the UI. What should you check before writing the report?",
          options: [
            "Nothing; report what you saw",
            "The API response in the Network tab and the database row, to find the lowest layer that is wrong",
            "Whether another browser shows the same",
            "Only the server logs",
          ],
          answer: 1,
          explain: "A correct API with a wrong screen is a UI bug; a wrong API with correct data is a read/mapping bug; wrong data is a write bug. Each goes to a different developer.",
        },
        {
          q: "Which title is best?",
          options: [
            "\"e-Transfer bug\"",
            "\"URGENT!!! money missing\"",
            "\"Cancelled e-Transfer: REVERSAL row amount is 0.00 instead of the transfer amount\" (invented)",
            "\"Problem in etransfers.ts line 245\"",
          ],
          answer: 2,
          explain: "What is wrong, where, and under which condition. Emotion and vague words do not help; guessing the code location is not the tester's job.",
        },
        {
          q: "Who usually decides a bug's priority?",
          options: [
            "The tester alone",
            "The developer who fixes it",
            "The product owner (or triage group), using the tester's severity and impact information",
            "Whoever opened the ticket first",
          ],
          answer: 2,
          explain: "Testers propose; the business decides, because priority depends on things like release dates, customers and contracts.",
        },
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
<p>Use a free Jira Cloud board or GitHub Issues for your team. Each bug you find on QA gets a ticket; link it to the automated test that catches it once you have written one.</p>
<h3>The bug workflow as a diagram</h3>
<p>The first example below draws the statuses and who moves the ticket at each step. Your board's columns should follow it, so anyone can see at a glance what is waiting for whom.</p>

<h3>Re-testing a fix: what to write</h3>
<p>When a bug reaches <strong>Ready for QA</strong>, re-run the original steps on the build that contains the fix (check <code>GET /test/health</code> for the build and version), then
the neighbouring cases: the boundaries either side, the same rule through another interface (UI and API), and anything the fix could have touched. Record it in a comment
(example 2), then close it or reopen it with new evidence. Never close on "the developer says it is fixed".</p>

<h3>Linking work items</h3>
<p>Links make the tracker a map: a bug <em>relates to</em> the story whose acceptance criteria it breaks; it <em>is tested by</em> the automated test that now catches it; a duplicate is
linked to the original and closed. When you open a PR in the framework, put the ticket key in the PR title or description so the tracker shows the code that tests it.</p>`,
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
        {
          title: "Bug workflow and who moves the ticket",
          lang: "text",
          code: `
            tester                 triage (PO + lead)          developer
 [Open] ------------------> [Triaged / To Do] ------------> [In Progress] --> [In Review]
   |                              |                                                  |
   +-> Duplicate / Cannot         +-> Won't fix (with a reason)                      |
       reproduce (with evidence)                                                     v
                                                                           [Ready for QA]
                                                                                     |  tester
                                          +------------- fix fails ----------------- +
                                          v                                          v
                                     [Reopened] --> back to In Progress         [Done / Closed]`,
        },
        {
          title: "Re-test comment template",
          lang: "text",
          code: `
Re-tested on: QA sandbox 3, build "qa" 1.0.1 (GET /test/health at 2026-11-12 10:05)
Original steps: PASS (201, balances as expected, 2 transaction rows)
Around the fix:
  - same rule via the UI transfer page: PASS
  - boundary B - 0.01 and B + 0.01: PASS / PASS (422 INSUFFICIENT_FUNDS)
  - credit card as source (uses available credit): PASS
Automated: TransferBalanceTest#transferOfExactlyAvailableBalanceIsAccepted now green on QA
Result: Closed`,
        },
      ],
      exercises: [
        "Create a board (Jira Cloud free or GitHub Projects) for your team with the bug workflow above. Add the components Auth, Accounts, Transfers, e-Transfer, Bill payments, Cards, Loans, Admin.",
        "Write two stories with acceptance criteria in Given/When/Then for Ice Bank features (e.g. lock a card, add a payee), based on the business rules. Check each criterion against Ice Bank local.",
        "Log the bugs you found in the previous lessons as tickets with severity, priority, component and environment. Move one through the full workflow including a re-test.",
      ],
      quiz: [
        {
          q: "A developer moves your bug to Ready for QA. What do you do?",
          options: [
            "Close it, since the developer fixed it",
            "Re-run the original steps on the build with the fix, plus nearby cases, then close or reopen with evidence",
            "Wait for the next release",
            "Assign it back to the developer",
          ],
          answer: 1,
          explain: "Fixed is not done until verified. Checking around the fix catches fixes that move the bug instead of removing it.",
        },
        {
          q: "You cannot reproduce a bug a teammate reported. Which status change, with what, is appropriate?",
          options: [
            "Delete the ticket",
            "Cannot reproduce, with what you tried (environment, build, data, steps) so the reporter can add what is missing",
            "Won't fix",
            "Done",
          ],
          answer: 1,
          explain: "\"Cannot reproduce\" without details is a dead end. With details, it often reveals a missing precondition.",
        },
        {
          q: "What is the main purpose of acceptance criteria on a story?",
          options: [
            "To estimate the story",
            "To state, testably, when the story is done; each criterion becomes at least one test",
            "To list the developer's tasks",
            "To replace bug reports",
          ],
          answer: 1,
          explain: "Given/When/Then criteria are examples the whole team agrees on before the work starts.",
        },
        {
          q: "Which link is most useful once you have automated a regression test for a bug?",
          options: ["\"blocks\" the epic", "\"is tested by\" the automated test (or its PR)", "\"clones\" the story", "No link is needed"],
          answer: 1,
          explain: "Anyone looking at the bug later can see that it is guarded, and where.",
        },
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
<p>Also useful: <strong>re-testing</strong> (confirmation testing) means running the exact failed case again after a fix; regression means checking everything <em>around</em> it.</p>
<h3>Smoke checks with pass and fail criteria</h3>
<p>A smoke suite is only useful if its verdict is unambiguous. For each check, write what "pass" means and what you do on failure (example 1). Run it before anything else after
every deploy, and do not run the rest if it fails.</p>

<h3>Worked example: risk-based regression for one change</h3>
<p>Suppose a developer changes how the e-Transfer daily total is computed (the code that adds up today's PENDING and DEPOSITED transfers). You have 30 minutes. Impact analysis: what
uses that code, what shares data with it, and which rules could be affected?</p>
<ul>
<li><strong>Directly changed</strong>: daily limit boundary (exact edge, one cent over), pending counted, cancelled not counted, the <code>remaining</code> value in the error.</li>
<li><strong>Same calculation family</strong>: the rolling 30-day limit (computed together with the daily total), the Toronto-day start (evening transfers).</li>
<li><strong>Shares data</strong>: the <code>v_daily_etransfer_totals</code> view, the send flow itself (a 201 still debits once), cancel (refund unaffected).</li>
<li><strong>Not affected</strong> (skip in this window): bill payments, cards, loans, registration.</li>
</ul>
<p>That gives about ten cases in priority order (example 2): far better than running a random third of the 200-test suite. The full regression runs overnight.</p>`,
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
        {
          title: "Smoke checklist with pass criteria",
          lang: "text",
          code: `
#  Check                                  Pass when                                        On failure
1  GET /api/v1/test/health                200, status UP, database UP, build as expected    stop: report environment
2  Sign in as Emma (password + OTP)       accessToken received within 10 s                   stop: auth is a blocker
3  GET /accounts                          200, 4 accounts, ids 1-4                           stop: data or auth problem
4  GET /accounts/1/transactions?size=1    200, one row, page metadata present                continue, raise bug
5  POST /transfers 1 -> 2, $1.00          201 + Location; balances move by 1.00              stop: money movement broken
6  /swagger and /api/v1/openapi.json      both load (200)                                    continue, raise bug
7  UI: /login renders, Emma reaches the   dashboard shows her accounts                       continue for API work,
   dashboard                                                                                stop for UI work`,
        },
        {
          title: "Regression selection for a change to the e-Transfer daily total",
          lang: "text",
          code: `
Order  Case                                                      Why
1      Daily edge: T + amount = 3000.00 -> 201                   directly changed
2      Daily edge + 0.01 -> 422 DAILY_LIMIT_EXCEEDED, remaining  directly changed
3      Earlier PENDING transfer counts                           directly changed
4      Earlier transfer CANCELLED -> allowance freed             directly changed
5      Earlier transfer DEPOSITED counts                         directly changed
6      Rolling edge (S + amount = 10000.00 / + 0.01)             computed with the same query
7      Evening transfer (after UTC midnight) is same Toronto day day-start logic (own sandbox clock)
8      Send still debits once (201, one DEBIT row)               shares the send flow
9      Cancel still refunds in full (REVERSAL)                   shares data
10     v_daily_etransfer_totals agrees with the API              shares data (SQL)
Skipped in the 30-min window: bill payments, cards, loans, registration (not connected)`,
        },
      ],
      exercises: [
        "Write the Ice Bank smoke suite above as a manual checklist and run it on local and QA. Time each run.",
        "Automate at least five smoke checks with <code>@Tag(\"smoke\")</code> and run only them with <code>-Dgroups=smoke</code>.",
        "Your teammate says a bug in idempotency was fixed on QA. Write the sanity (re-test) cases you would run, and the wider regression cases around it (which other endpoints use <code>Idempotency-Key</code>?).",
        "Rank the Ice Bank feature areas by risk for a 30-minute regression window and justify the top three.",
        "A developer changes the rule that checks the security answer when an e-Transfer is accepted. Do the impact analysis (directly changed, same family, shares data, not affected) and write the ordered list of regression cases you would run in a 20-minute window.",
      ],
      quiz: [
        {
          q: "A new QA build is deployed. Sign-in with OTP fails for every persona. What do you do?",
          options: [
            "Run the full regression to collect as many failures as possible",
            "Stop: the smoke test failed; report the build as not testable",
            "Test only the endpoints that need no sign-in",
            "Mark all tests as blocked and go home",
          ],
          answer: 1,
          explain: "Smoke answers \"is it worth testing?\". Hundreds of failures caused by one blocker only bury the real information.",
        },
        {
          q: "A bug in cancel refunds was fixed. You re-run the exact failing case and it passes. What kind of testing was that?",
          options: ["Smoke", "Re-testing (confirmation testing)", "Full regression", "Exploratory"],
          answer: 1,
          explain: "Re-testing confirms the specific fix. Checking what is around it (expiry refunds, REVERSAL rows elsewhere) is regression.",
        },
        {
          q: "You have 30 minutes after a change to the e-Transfer daily total. Which selection is best?",
          options: [
            "The first 30 tests in alphabetical order",
            "Daily-limit edges and statuses first, then the rolling limit and Toronto-day cases, then send/cancel; skip unrelated areas",
            "Only UI tests",
            "Only bill payment tests, since they were not changed",
          ],
          answer: 1,
          explain: "Risk-based regression follows the impact analysis: what changed, what shares logic or data, then the rest overnight.",
        },
        {
          q: "Which describes a sanity check?",
          options: [
            "Wide and shallow, on every build",
            "Narrow and deep around one fix or small change",
            "Everything, before a release",
            "Performance under load",
          ],
          answer: 1,
          explain: "Smoke is wide and shallow, regression wide and deep, sanity narrow and deep.",
        },
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
"done" really means shippable.</p>
<h3>A tester's two weeks</h3>
<div class="table-wrap"><table>
<thead><tr><th>When</th><th>What the tester does</th></tr></thead>
<tbody>
<tr><td>Before the sprint (refinement)</td><td>Asks the questions, proposes acceptance criteria as examples, flags stories that are not testable yet (no test data, unclear rule)</td></tr>
<tr><td>Day 1 (planning)</td><td>Adds test and automation tasks to each story, names environments and data needed, raises risks ("the clock is shared on QA")</td></tr>
<tr><td>Days 2 to 8</td><td>Three amigos per story, tests the API as soon as it exists, automates while the developer builds the UI, reports bugs the same day</td></tr>
<tr><td>Days 8 to 9</td><td>Regression in the background, exploratory sessions on the finished stories, re-tests fixes</td></tr>
<tr><td>Day 10 (review and retro)</td><td>Reports what was tested and the known issues; brings facts about the process (how long stories waited for testing, flaky tests)</td></tr>
</tbody></table></div>

<h3>Acceptance criteria as examples</h3>
<p>Rules written as a table of concrete examples are unambiguous and become a parameterised test almost directly. Example 3 turns the e-Transfer daily-limit rule into a
<em>Scenario Outline</em> with an <em>Examples</em> table: product owner, developer and tester can all read it, and every row is a test.</p>`,
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
        {
          title: "Acceptance criteria as a Scenario Outline",
          lang: "gherkin",
          code: `
Feature: Interac e-Transfer daily limit (Toronto calendar day)

  Scenario Outline: The daily total includes pending and deposited transfers
    Given Emma has sent <earlier> today, which is now <status>
    When she sends <amount> to Olivia
    Then the API answers <result>

    Examples:
      | earlier | status    | amount  | result                   |
      | 0.00    | -         | 3000.00 | 201                      |
      | 1200.00 | PENDING   | 1800.00 | 201                      |
      | 1200.00 | PENDING   | 1800.01 | 422 DAILY_LIMIT_EXCEEDED |
      | 1200.00 | DEPOSITED | 1800.01 | 422 DAILY_LIMIT_EXCEEDED |
      | 1200.00 | CANCELLED | 3000.00 | 201                      |`,
        },
      ],
      exercises: [
        "Run a 15-minute \"three amigos\" with your teammates on one Ice Bank feature (one plays product owner with the business rules, one developer, one tester). Write the agreed acceptance criteria in Given/When/Then.",
        "Write your team's Definition of Ready and Definition of Done for the next three weeks and add them to the framework README.",
        "Hold a stand-up every working day for one week (5 minutes, done / next / blockers). At the end, write a short retro with one thing to keep, one to stop and one to try.",
      ],
      quiz: [
        {
          q: "In backlog refinement, what is the tester's most valuable contribution?",
          options: [
            "Estimating the developer's work",
            "Questions, edge cases and testable acceptance criteria before the story is built",
            "Writing the code for the story",
            "Nothing; testing starts when the code is done",
          ],
          answer: 1,
          explain: "Bugs prevented in refinement cost a conversation. That is shift-left in practice.",
        },
        {
          q: "A story's code is merged, but its acceptance criteria are not verified and no tests were added. Is it Done?",
          options: [
            "Yes, the code is merged",
            "No: it does not meet a Definition of Done that includes verified criteria and automated tests",
            "Yes, if the demo works",
            "Only if the tester is on holiday",
          ],
          answer: 1,
          explain: "The Definition of Done is the team's shared quality bar. Merged is not the same as shippable.",
        },
        {
          q: "Who takes part in a \"three amigos\" conversation?",
          options: [
            "Three testers",
            "A business person (product owner), a developer and a tester",
            "The Scrum master, the manager and the customer",
            "Any three people who are free",
          ],
          answer: 1,
          explain: "Three perspectives on one story: what is needed, how it will be built, how it could fail.",
        },
        {
          q: "Why write acceptance criteria as an Examples table?",
          options: [
            "Jira requires it",
            "Concrete rows remove ambiguity and each row maps directly to a test case",
            "It makes stories longer",
            "It replaces the need for a tester",
          ],
          answer: 1,
          explain: "\"1200.00 pending, then 1800.01: 422\" cannot be misread the way \"pending transfers count toward the limit\" can.",
        },
      ],
    },
  ],
});
