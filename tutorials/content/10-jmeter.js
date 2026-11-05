/* Tutorial 10: Load testing with JMeter (bonus). JMeter 5.6, core elements only, local Ice Bank with PERF_MODE=true. Never QA. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "jmeter",
  number: 10,
  title: "Load testing with JMeter",
  summary: "Bonus: build a JMeter plan for Ice Bank's OTP login, a 50,000-row search and idempotent transfers, run it headless against your local app and write a load report.",
  intro: `
<p>A bonus module: build a JMeter load test for Ice Bank yourself, element by element, and turn its results into a short load report. The API is a
realistic load-testing target: a two-step login with a one-time code you must read from Ice Mail, a paging search over 50,000 rows, and money transfers
that must stay correct under concurrency (an <code>Idempotency-Key</code> on every one).</p>
<div class="callout rule"><p><strong>Local only. Never point JMeter at QA.</strong> The hosted QA site runs on free hosting tiers shared by everyone; a load
test would hit platform limits and spoil every student's sandbox. Load tests run against your own <code>npm start</code> with
<code>PERF_MODE=true</code>.</p></div>
<p>You need Java 17+ (you already have it for the starter project), Apache JMeter 5.6.x and Ice Bank running locally. By the end you will have one
<code>.jmx</code> plan with three scenarios (login, transaction search, transfers), a CSV of test users, assertions that check correctness and not only
speed, a headless run and an HTML report you can explain.</p>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "setup-concepts",
      title: "Install JMeter, prepare Ice Bank, learn the vocabulary",
      summary: "Get JMeter 5.6 running, start Ice Bank in a mode fit for load, and learn the handful of element types every plan is made of.",
      body: `
<h3>Install</h3>
<ol>
<li>Check Java: <code>java -version</code> (17 or newer).</li>
<li>Download the Apache JMeter 5.6.3 <strong>binary</strong> archive from jmeter.apache.org (zip on Windows, tgz elsewhere) and unpack it, for example to
<code>C:\\tools\\apache-jmeter-5.6.3</code>. No installer, no plugins needed for this module.</li>
<li>Run <code>bin/jmeter</code> (macOS, Linux) or <code>bin\\jmeter.bat</code> (Windows) to open the GUI, or add <code>bin</code> to your <code>PATH</code>.
<code>jmeter --version</code> prints the version banner.</li>
</ol>

<h3>Prepare Ice Bank for load</h3>
<p>Three things differ from your everyday <code>npm run dev</code>:</p>
<ul>
<li><strong>Rate limits off.</strong> Normally sign-in endpoints allow 10 calls per minute per IP and other endpoints 120 per minute per user. A load test
would measure mostly <code>429 Too Many Requests</code>. Start the app with <code>PERF_MODE=true</code>, which turns the limits off.</li>
<li><strong>Production build.</strong> <code>npm run dev</code> compiles pages on first use and is much slower. Use <code>npm run build</code> once, then
<code>npm start</code>.</li>
<li><strong>The Perf User.</strong> <code>npm run seed:perf</code> adds customer 900, <code>perf.user@icebank.test</code>, with account 900 holding 50,000
transactions: something worth searching. It only adds data, and a reset keeps it.</li>
</ul>
<p>Then reset to clean data (<code>POST /api/v1/test/reset</code> with your sandbox key) so every run starts from the same state. On your own machine
the sandbox is yours; that is the only place where a reset before and after a load test is the right thing to do.</p>

<h3>The vocabulary</h3>
<div class="table-wrap"><table>
<thead><tr><th>Element</th><th>What it is</th><th>In this module</th></tr></thead>
<tbody>
<tr><td>Test Plan</td><td>The root. Holds variables and the order of thread groups.</td><td>"Run Thread Groups consecutively" on, so scenarios do not mix</td></tr>
<tr><td>Thread Group</td><td>A group of virtual users (threads) that run the same steps.</td><td>One per scenario</td></tr>
<tr><td>Sampler</td><td>Something that sends a request and records the result. Here always <strong>HTTP Request</strong>.</td><td>Login, inbox, verify, search, transfer</td></tr>
<tr><td>Config element</td><td>Settings used by samplers in its scope.</td><td>HTTP Request Defaults, Header Manager, CSV Data Set, User Defined Variables</td></tr>
<tr><td>Post-processor</td><td>Runs after a sampler, usually to extract values.</td><td>JSON Extractor (mfaToken, otpCode, accessToken)</td></tr>
<tr><td>Assertion</td><td>Decides whether a sample passed.</td><td>Response code, JSON value, duration, header</td></tr>
<tr><td>Timer</td><td>A pause before a sampler: think time.</td><td>Uniform Random Timer</td></tr>
<tr><td>Logic controller</td><td>Groups samplers and decides how often they run.</td><td>Simple, Once Only, Critical Section</td></tr>
<tr><td>Listener</td><td>Shows or writes results.</td><td>View Results Tree (debug only), Summary Report, the .jtl file</td></tr>
</tbody></table></div>
<p><strong>Scope is the tree.</strong> A config element, assertion, timer or post-processor applies to every sampler <em>below</em> it in the tree at the same
level or deeper. Put a Header Manager under one sampler and only that sampler sends the header; put it under a controller and every sampler in the
controller sends it. Most JMeter bugs are scope bugs.</p>
<p><strong>GUI to build, command line to run.</strong> The GUI is for building and debugging with one thread. Real runs are always non-GUI
(<code>jmeter -n</code>, lesson 7): the GUI itself uses CPU and memory that the measurement needs.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Load testing <code>npm run dev</code>: the first minute measures the compiler.</li>
<li>Forgetting <code>PERF_MODE=true</code>: every second sign-in is a 429 and the report is meaningless.</li>
<li>"Just a few users" against QA. No: local only, always.</li>
<li>Running the real test in the GUI with View Results Tree on: JMeter becomes the bottleneck.</li>
<li>Not resetting before a run: totals and balances differ from the expected values and assertions fail for reasons that are not about load.</li>
</ul></div>`,
      examples: [
        {
          title: "Prepare and start Ice Bank for load (from the Ice Bank repo)",
          lang: "bash",
          code: `
npm run seed:perf                    # once: the Perf User, account 900, 50,000 transactions
npm run build                        # production build
PERF_MODE=true npm start             # macOS / Linux / Git Bash
# set PERF_MODE=true&& npm start     # Windows cmd (no space before &&)
# $env:PERF_MODE="true"; npm start   # Windows PowerShell

curl -X POST http://localhost:3000/api/v1/test/reset -H "X-Sandbox-Key: ICEBANK-LOCAL-KEY"
curl http://localhost:3000/api/v1/test/health        # {"status":"UP","database":"UP","build":"clean",...}`,
        },
        {
          title: "Check the Perf User's data before you rely on it (DBeaver, qa_reader)",
          lang: "sql",
          code: `
SELECT u.id, u.email, u.status, a.id AS account_id, count(t.id) AS transactions
FROM users u
JOIN customers c ON c.sandbox_id = u.sandbox_id AND c.user_id = u.id
JOIN accounts a  ON a.sandbox_id = c.sandbox_id AND a.customer_id = c.id
LEFT JOIN transactions t ON t.sandbox_id = a.sandbox_id AND t.account_id = a.id
WHERE u.sandbox_id = 1 AND u.email = 'perf.user@icebank.test'
GROUP BY u.id, u.email, u.status, a.id;`,
          note: "Expect one row: user 900, ACTIVE, account 900, 50000 transactions. If the table names differ in your version, start from <code>SELECT count(*) FROM transactions WHERE sandbox_id = 1 AND account_id = 900</code>.",
        },
      ],
      exercises: [
        "Install JMeter 5.6.x, run <code>jmeter --version</code> and open the GUI. Note your Java version and the path you installed to (you will need both in the load report).",
        "Seed the Perf User, start Ice Bank with <code>PERF_MODE=true npm start</code>, reset and check health. Confirm in SQL that account 900 has 50,000 transactions.",
        "Map each of these to a JMeter element type: \"send POST /auth/login\", \"take mfaToken from the JSON\", \"every request is JSON\", \"fail if slower than 1 s\", \"wait 0.2 to 0.6 s between searches\", \"sign in only once per thread\".",
        "Write three sentences for your team on why the load test never runs against QA, even with one thread.",
      ],
      quiz: [
        {
          q: "Why start Ice Bank with <code>PERF_MODE=true</code> for a load test?",
          options: [
            "It turns off the rate limits, which would otherwise answer most sign-ins with 429",
            "It makes the database faster",
            "It enables JMeter support",
            "It disables bcrypt",
          ],
          answer: 0,
          explain: "10 sign-ins per minute per IP is a security control; for load measurements it must be off, locally.",
        },
        {
          q: "A Header Manager is placed directly under one HTTP Request. Which requests send its headers?",
          options: [
            "All requests in the plan",
            "All requests in the thread group",
            "Only that HTTP Request",
            "None until it is enabled on the Test Plan",
          ],
          answer: 2,
          explain: "Scope follows the tree: an element applies to the samplers in its own subtree.",
        },
        {
          q: "What is the GUI for?",
          options: [
            "Real load runs",
            "Generating the HTML report",
            "Nothing; use only the CLI",
            "Building and debugging the plan with one thread",
          ],
          answer: 3,
          explain: "Run real tests headless (-n).",
        },
        {
          q: "Where may a load test against Ice Bank run?",
          options: [
            "QA, if you use your own sandbox",
            "Your own local Ice Bank only",
            "QA at night",
            "Anywhere with fewer than 5 threads",
          ],
          answer: 1,
          explain: "Never QA.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "first-plan",
      title: "Your first plan: thread groups, defaults and headers",
      summary: "Build the skeleton every scenario shares: variables with defaults you can override, HTTP Request Defaults, JSON headers and a thread group.",
      body: `
<h3>Build it in the GUI</h3>
<ol>
<li><strong>Test Plan</strong>: name it "Ice Bank load test", tick <strong>Run Thread Groups consecutively</strong> (each scenario's numbers stay separate).</li>
<li>Right-click the plan → Add → Config Element → <strong>User Defined Variables</strong>. Add one row per setting, each with a property default:
<code>HOST = \${__P(host,localhost)}</code>, <code>PORT = \${__P(port,3000)}</code>, <code>PROTOCOL = \${__P(protocol,http)}</code>,
<code>SANDBOX_KEY = \${__P(sandbox.key,ICEBANK-LOCAL-KEY)}</code>, <code>PASSWORD = \${__P(password,IceBank#2026)}</code>.
<code>\${__P(name,default)}</code> reads a JMeter property, so later <code>-Jport=3001</code> on the command line changes it without editing the plan.</li>
<li>Add → Config Element → <strong>HTTP Request Defaults</strong>: Protocol <code>\${PROTOCOL}</code>, Server <code>\${HOST}</code>, Port
<code>\${PORT}</code>, Content encoding UTF-8; under Advanced, connect timeout 5000 ms and response timeout 30000 ms. Every HTTP Request now only needs a
method and a path.</li>
<li>Add → Config Element → <strong>HTTP Header Manager</strong> "JSON headers": <code>Content-Type: application/json</code> and
<code>Accept: application/json</code>.</li>
<li>Add → Threads → <strong>Thread Group</strong> "0. Smoke": 1 thread, ramp-up 1, loop count 1. Inside it, Add → Sampler → <strong>HTTP Request</strong>
"GET /test/health": method GET, path <code>/api/v1/test/health</code>.</li>
<li>Add → Listener → <strong>View Results Tree</strong> (for now), save the plan as <code>icebank-load.jmx</code>, and press the green Start button. The
sample is green; the Response data tab shows <code>"status":"UP"</code>.</li>
</ol>

<h3>Thread group settings</h3>
<div class="table-wrap"><table>
<thead><tr><th>Setting</th><th>Meaning</th><th>Ice Bank advice</th></tr></thead>
<tbody>
<tr><td>Number of threads</td><td>Virtual users running at the same time</td><td>Make it a property: <code>\${__P(login.threads,5)}</code></td></tr>
<tr><td>Ramp-up period</td><td>Seconds to start all threads (10 threads, 20 s = one new thread every 2 s)</td><td>Never 0 for real runs: a stampede measures the start, not the steady state</td></tr>
<tr><td>Loop count / Duration</td><td>Each thread repeats its steps N times, or until the duration ends (Specify thread lifetime)</td><td>Loops for login and transfers, duration for search</td></tr>
<tr><td>Action after a sampler error</td><td>Continue, Start Next Thread Loop, Stop Thread, Stop Test</td><td>Start Next Thread Loop for login (no point continuing without a token)</td></tr>
<tr><td>Same user on each iteration</td><td>Keep cookies and variables between loops</td><td>On (the default)</td></tr>
</tbody></table></div>
<p>A thread count of <code>0</code> skips the group: with properties, <code>-Jlogin.threads=0</code> turns a scenario off from the command line.</p>

<h3>No cookie manager, on purpose</h3>
<p>Ice Bank also sets <code>ib_at</code>/<code>ib_rt</code> cookies for the web UI. Without an HTTP Cookie Manager JMeter ignores them, so every
signed-in request must carry <code>Authorization: Bearer …</code> like any API client. That is the path you want to measure, and it avoids a cookie silently
authenticating a request your plan meant to send without a token.</p>

<h3>Worked example: what the skeleton looks like</h3>
<p>The first example below is the tree you have after this lesson, plus where the next lessons will add their parts. Read it as "everything in the plan is
JSON, has a host and timeouts, and can be pointed elsewhere with -J".</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>A full URL (<code>http://localhost:3000/api/...</code>) in every sampler: one port change means editing 20 samplers.</li>
<li>Hard-coded thread counts: every experiment needs a plan edit and a new file version.</li>
<li><code>\${__P(port)}</code> without a default: empty when you forget <code>-J</code>, and the error is far from the cause.</li>
<li>Ramp-up 0 with many threads: all sign in in the same millisecond and the first seconds dominate the averages.</li>
<li>Leaving View Results Tree enabled for real runs.</li>
</ul></div>`,
      examples: [
        {
          title: "The plan's skeleton (and where later lessons add things)",
          lang: "text",
          code: `
Ice Bank load test                    Test Plan, Run Thread Groups consecutively = on
├─ User Defined Variables            HOST, PORT, PROTOCOL, SANDBOX_KEY, PASSWORD (each \${__P(name,default)})
├─ HTTP Request Defaults             \${PROTOCOL}://\${HOST}:\${PORT}, UTF-8, timeouts 5 s / 30 s
├─ HTTP Header Manager "JSON headers" Content-Type and Accept: application/json
├─ 0. Smoke                          Thread Group 1 x 1
│  └─ GET /api/v1/test/health
├─ 1. Login (CSV users)              lesson 3 and 4
├─ 2. Transaction search             lesson 6
├─ 3. Transfers                      lesson 6
└─ View Results Tree                 debugging only: disable before real runs`,
        },
        {
          title: "Override properties on the command line",
          lang: "bash",
          code: `
# another port, 10 login threads, no transfer scenario
jmeter -n -t icebank-load.jmx -l results.jtl -Jport=3001 -Jlogin.threads=10 -Jtransfer.threads=0

# Windows: jmeter.bat, and ^ instead of \\ for line breaks`,
        },
      ],
      exercises: [
        "Build the skeleton above with the smoke thread group and run it in the GUI with View Results Tree. Find the response body and the response headers of the health check, including <code>X-Request-Id</code>.",
        "Make every number a property with a default (threads, ramp-up, loops for a future \"1. Login\" group). Show that <code>-Jlogin.threads=0</code> skips the group in a non-GUI run.",
        "A thread group has 10 threads, a ramp-up of 20 s and 5 loops, with 4 samplers. How many samples does one run produce, and roughly when does the last thread start? Check your numbers with a run against the health endpoint.",
        "Explain in your own words why this plan has no HTTP Cookie Manager, and what could go wrong in a later lesson if you added one.",
      ],
      quiz: [
        {
          q: "What does <code>${__P(port,3000)}</code> do?",
          options: [
            "Sets a JMeter property to 3000",
            "Opens port 3000",
            "Reads the property <code>port</code>, or 3000 if it is not set (e.g. with -Jport=3001)",
            "Reads an environment variable",
          ],
          answer: 2,
          explain: "Properties come from -J on the command line or user.properties.",
        },
        {
          q: "10 threads, ramp-up 20 s. When does thread 10 start?",
          options: [
            "After about 18 s",
            "Immediately",
            "After 200 s",
            "After 20 s exactly, all at once",
          ],
          answer: 0,
          explain: "One every 2 s: thread 1 at 0 s, thread 10 at about 18 s.",
        },
        {
          q: "Why tick \"Run Thread Groups consecutively\"?",
          options: [
            "It is required for headless runs",
            "To make threads share variables",
            "To enable the HTML report",
            "So each scenario runs alone and its numbers are not mixed with another's",
          ],
          answer: 3,
          explain: "Mixed scenarios make the report hard to interpret, and the same user could be signed in by two scenarios at once.",
        },
        {
          q: "Which element saves you from typing host and port in every sampler?",
          options: [
            "User Defined Variables",
            "HTTP Request Defaults",
            "HTTP Header Manager",
            "CSV Data Set Config",
          ],
          answer: 1,
          explain: "Samplers then need only method and path.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "otp-login",
      title: "The two-step OTP login with JSON Extractors",
      summary: "Chain login, Ice Mail and verify in JMeter: extract values from JSON, scope the sandbox key and the bearer token, and keep one user's sign-ins apart.",
      body: `
<p>A virtual user signs in exactly like the starter's <code>AuthClient</code>:</p>
<div class="table-wrap"><table>
<thead><tr><th>Step</th><th>HTTP Request</th><th>Extract (JSON Extractor)</th></tr></thead>
<tbody>
<tr><td>Login 1</td><td><code>POST /api/v1/auth/login</code>, Body Data <code>{"email":"\${email}","password":"\${password}"}</code></td><td><code>mfaToken</code> = <code>$.mfaToken</code>, default <code>NO_MFA_TOKEN</code></td></tr>
<tr><td>Login 2</td><td><code>GET /api/v1/inbox?email=\${__urlencode(\${email})}&amp;kind=OTP&amp;size=1</code> with header <code>X-Sandbox-Key: \${SANDBOX_KEY}</code></td><td><code>otpCode</code> = <code>$.content[0].otpCode</code>, default <code>OTP_NOT_FOUND</code></td></tr>
<tr><td>Login 3</td><td><code>POST /api/v1/auth/mfa/verify</code>, Body Data <code>{"mfaToken":"\${mfaToken}","code":"\${otpCode}"}</code></td><td><code>accessToken</code> = <code>$.accessToken</code>, default <code>NO_TOKEN</code></td></tr>
<tr><td>then</td><td>every signed-in request sends <code>Authorization: Bearer \${accessToken}</code></td><td></td></tr>
</tbody></table></div>

<h3>Building it</h3>
<ul>
<li>A JSON Extractor is Add → Post Processors → <strong>JSON Extractor</strong> under the sampler: names of created variables, JSON path expressions,
match no. <code>1</code>, and a <strong>default value</strong>. Pick defaults that are obviously wrong (<code>OTP_NOT_FOUND</code>): when a step fails, the next
request carries the default and the failure points straight at the step that did not extract.</li>
<li>Put the <code>X-Sandbox-Key</code> Header Manager <strong>under Login 2 only</strong>. The key is a secret on QA and has no business on other requests.</li>
<li>Put the <code>Authorization</code> Header Manager inside a <strong>Simple Controller</strong> "Signed-in requests" that holds only the requests that need it.
If it sat at plan level, Login 2 would send <code>Authorization: Bearer \${accessToken}</code> before any token exists (JMeter sends the literal text) and the
inbox answers <code>401 INVALID_TOKEN</code> even though the sandbox key is valid.</li>
<li><code>\${__urlencode(...)}</code> keeps the <code>@</code> and any <code>+s3</code> suffix safe in the query string.</li>
<li>Check each step: Response Assertion "200", and a JSON Assertion where the body proves the step worked: <code>$.mfaRequired</code> is
<code>true</code>; <code>$.content[0].otpCode</code> matches <code>^\\d{6}$</code> (tick "Match as regular expression"); <code>$.tokenType</code> is
<code>Bearer</code>.</li>
</ul>

<h3>The same user on several threads</h3>
<p>The inbox returns the <strong>newest</strong> code for an email. If two threads sign in the same user at the same moment, thread A can read thread B's code,
and A's verify fails with <code>401 OTP_INVALID</code>. It does not happen every time (each login takes about 0.1 s of password hashing, which spreads
them out), which makes it a nasty intermittent failure. Two fixes, used together in this module:</p>
<ul>
<li>Different users per thread (a CSV of users, next lesson) when the scenario is about login.</li>
<li>For scenarios where all threads are the same user (the Perf User search, transfers): wrap the three login steps in a <strong>Critical Section
Controller</strong> (one thread at a time holds the lock) inside a <strong>Once Only Controller</strong> (each thread signs in once, not every iteration).</li>
</ul>
<p>Access tokens live 15 minutes (<code>expiresIn</code> 900). Keep runs shorter, or add a refresh step (<code>POST /auth/refresh</code> with the
<code>refreshToken</code>, also extracted from the verify response).</p>

<h3>Worked example: read the chain in View Results Tree</h3>
<p>Run one thread with View Results Tree enabled. Login 1's response shows <code>"mfaRequired":true,"mfaToken":"…"</code>; Login 2's request URL shows the
encoded email and its headers show the sandbox key; its response has <code>"otpCode":"123456"</code>; Login 3's request body shows both values substituted.
Add a <strong>Debug Sampler</strong> (Add → Sampler → Debug Sampler) after Login 3 to see every JMeter variable the thread holds.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>No header manager with the key on Login 2: <code>401 UNAUTHORIZED</code> "Sign in, or send X-Sandbox-Key with ?email= to read a test inbox." Then
Login 3 sends <code>OTP_NOT_FOUND</code> and gets <code>400 VALIDATION_FAILED</code> (<code>code</code>: "must be 6 digits"), if the thread continues.</li>
<li>A wrong key: <code>401 INVALID_SANDBOX_KEY</code>.</li>
<li>The bearer header at plan level: Login 2 fails with <code>401 INVALID_TOKEN</code>.</li>
<li>Disabling a controller to "take the steps out of it": a disabled controller disables its children too. Move the children out instead.</li>
<li>Extractors without a default: the next request contains the literal <code>\${otpCode}</code>, which is harder to recognise.</li>
</ul></div>`,
      examples: [
        {
          title: "The login part of a thread group",
          lang: "text",
          code: `
1. Login (CSV users)                               Thread Group, on error: Start Next Thread Loop
├─ Login 1 - POST /auth/login                     Body Data {"email":"\${email}","password":"\${password}"}
│  ├─ Response Assertion   Response Code equals 200
│  ├─ JSON Assertion       $.mfaRequired  =  true
│  └─ JSON Extractor       mfaToken  <-  $.mfaToken            default NO_MFA_TOKEN
├─ Login 2 - GET /inbox (OTP)                     /api/v1/inbox?email=\${__urlencode(\${email})}&kind=OTP&size=1
│  ├─ HTTP Header Manager  X-Sandbox-Key: \${SANDBOX_KEY}       (only here)
│  ├─ Response Assertion   200
│  ├─ JSON Assertion       $.content[0].otpCode  matches  ^\\d{6}$   (regex)
│  └─ JSON Extractor       otpCode  <-  $.content[0].otpCode   default OTP_NOT_FOUND
├─ Login 3 - POST /auth/mfa/verify                Body Data {"mfaToken":"\${mfaToken}","code":"\${otpCode}"}
│  ├─ Response Assertion   200
│  ├─ JSON Assertion       $.tokenType  =  Bearer
│  └─ JSON Extractor       accessToken  <-  $.accessToken      default NO_TOKEN
└─ Simple Controller "Signed-in requests"
   ├─ HTTP Header Manager  Authorization: Bearer \${accessToken}   (only for what is inside)
   ├─ GET /api/v1/accounts           + Response Assertion 200
   └─ POST /api/v1/auth/logout       Body Data {}   + Response Assertion 204`,
        },
        {
          title: "One user, many threads: sign in once, one thread at a time",
          lang: "text",
          code: `
2. Transaction search (Perf User)                 Thread Group, on error: Continue
├─ Once Only Controller "Sign in once per thread"
│  └─ Critical Section Controller "One sign-in at a time"    lock name: signin_lock
│     ├─ Perf login 1 - POST /auth/login          {"email":"\${PERF_EMAIL}","password":"\${PASSWORD}"}
│     ├─ Perf login 2 - GET /inbox (OTP)          (+ X-Sandbox-Key header manager, extractor otpCode)
│     └─ Perf login 3 - POST /auth/mfa/verify     (+ extractor accessToken)
└─ Simple Controller "Searches"                    lesson 6`,
        },
        {
          title: "The responses behind each extractor (from a real run)",
          lang: "json",
          code: `
// Login 1  POST /api/v1/auth/login  -> 200
{"mfaRequired":true,"mfaToken":"...","expiresIn":300,"delivery":"Ice Mail"}

// Login 2  GET /api/v1/inbox?email=...&kind=OTP&size=1  (X-Sandbox-Key) -> 200
{"content":[{"id":...,"kind":"OTP","subject":"...","otpCode":"482913","link":null,...}],"page":0,"size":1,"totalElements":...,"totalPages":...}

// Login 3  POST /api/v1/auth/mfa/verify  -> 200
{"accessToken":"eyJ...","refreshToken":"...","tokenType":"Bearer","expiresIn":900}`,
        },
      ],
      exercises: [
        "Build the three login steps plus <code>GET /accounts</code> and <code>POST /auth/logout</code> for one user you registered yourself (or Emma on your own machine). Run one thread with View Results Tree and point to each extractor's input and output.",
        "Break it on purpose: disable the <code>X-Sandbox-Key</code> header manager. Record the response code and body of Login 2, and what happens to Login 3 with \"Start Next Thread Loop\" and then with \"Continue\". Explain the chain.",
        "Move the <code>Authorization</code> Header Manager from the Simple Controller to the Test Plan. Run one thread and explain the failure you get on Login 2. Move it back.",
        "Run the Perf User login with 4 threads and ramp-up 0, first with the Critical Section Controller and then with its three children moved out of it. Compare the results over a few runs and explain why the version without it <em>can</em> fail even if it did not in your runs.",
      ],
      quiz: [
        {
          q: "Why give a JSON Extractor a default like <code>OTP_NOT_FOUND</code>?",
          options: [
            "JMeter requires it",
            "When extraction fails, the next request carries an obvious value that points at the failing step",
            "It makes the OTP valid",
            "To avoid encoding problems",
          ],
          answer: 1,
          explain: "Wrong-looking defaults make chains easy to debug.",
        },
        {
          q: "The bearer Header Manager is at plan level. Login 2 now returns 401 INVALID_TOKEN although the sandbox key is right. Why?",
          options: [
            "The key expired",
            "The inbox needs a cookie",
            "JSON headers are wrong",
            "Login 2 sends \"Bearer ${accessToken}\" before any token exists, and the API rejects an invalid bearer",
          ],
          answer: 3,
          explain: "Scope the Authorization header to the signed-in requests.",
        },
        {
          q: "Two threads sign in the same user at the same moment. What can happen?",
          options: [
            "One thread reads the other's newest code and its verify fails with OTP_INVALID",
            "Nothing, OTPs are per thread",
            "The user is locked",
            "Both get the same token",
          ],
          answer: 0,
          explain: "Use different users, or a Critical Section around the login.",
        },
        {
          q: "Which controller makes each thread sign in only once, however many loops it runs?",
          options: [
            "Simple Controller",
            "Loop Controller",
            "Once Only Controller",
            "Transaction Controller",
          ],
          answer: 2,
          explain: "Combine it with a Critical Section Controller for the same-user case.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "csv-personas",
      title: "Test users from a CSV Data Set",
      summary: "Feed each login a different user from a CSV file, choose the sharing and recycling modes, and keep the file safe for the app.",
      body: `
<p>A login scenario should sign in many <em>different</em> users, so that the test measures authentication rather than one user's sessions, and so the
same-user OTP race of lesson 3 cannot happen. JMeter's <strong>CSV Data Set Config</strong> reads one row per iteration into variables.</p>

<h3>The file</h3>
<p>One header line and one line per user: <code>email,password,persona,accountId</code>, where <code>accountId</code> is the user's chequing account (you
will assert on it). Put it next to the plan and refer to it relatively, so the plan works on every laptop. Build it from the database instead of typing it:
every <strong>ACTIVE</strong> customer of your sandbox, with their first chequing account. Leave out <strong>Liam</strong> (locked: every login would be
<code>401 ACCOUNT_LOCKED</code>) and the Perf User (he has his own scenario). Never put a wrong password in the file: five failures lock a user for 15
minutes.</p>

<h3>The settings that matter</h3>
<div class="table-wrap"><table>
<thead><tr><th>Setting</th><th>Value</th><th>Why</th></tr></thead>
<tbody>
<tr><td>Filename</td><td><code>\${__P(personas.file,personas.csv)}</code></td><td>Relative to the plan; replaceable with -J</td></tr>
<tr><td>Variable names</td><td><code>email,password,persona,accountId</code></td><td>Or leave empty and use the header line</td></tr>
<tr><td>Ignore first line</td><td>True</td><td>It is the header</td></tr>
<tr><td>Recycle on EOF</td><td>True</td><td>Start again at the top when the rows run out</td></tr>
<tr><td>Stop thread on EOF</td><td>False</td><td>Only true for "each row exactly once"</td></tr>
<tr><td>Sharing mode</td><td>All threads</td><td>Every iteration of every thread takes the <em>next</em> row: no two threads hold the same row at the same time while rows &gt; threads</td></tr>
</tbody></table></div>
<p>With "Current thread" every thread reads the file from the top: all threads would sign in Emma first. With "Current thread group" sharing is per group.</p>

<h3>Assert that each user sees their own data</h3>
<p>Correctness under concurrency is part of a load test. After the login, <code>GET /accounts</code> should contain the CSV's chequing account, as
CHEQUING. A JSON Assertion with a filter does it: path <code>$[?(@.id == \${accountId})].type</code>, expected value <code>CHEQUING</code>. A server that
mixed up sessions under load would fail this assertion even with a 200.</p>

<h3>Worked example</h3>
<p>The query below produces the file for your local sandbox (export the result from DBeaver as CSV with a header). The rows look like the snippet; then
the CSV element and the assertion are wired as in the tree.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Absolute paths (<code>C:\\Users\\me\\Desktop\\personas.csv</code>): the plan only runs on one machine.</li>
<li>Spaces after the commas, or Excel adding quotes and a BOM: the email becomes <code>" emma.tremblay@icebank.test"</code> and login fails. Open the file in a text editor.</li>
<li>More threads than rows with "All threads" and recycling: two threads can hold the same user at once again.</li>
<li>Locked or wrong-password rows: they lock real users of your sandbox and fill the report with 401s.</li>
<li>Putting QA emails (<code>+s3</code>) and the QA sandbox key in the file "for later". The plan is local only.</li>
</ul></div>`,
      examples: [
        {
          title: "Build personas.csv from your local database (qa_reader)",
          lang: "sql",
          code: `
SELECT u.email,
       'IceBank#2026'                                   AS password,
       replace(c.first_name || '_' || c.last_name, ' ', '_') AS persona,
       min(a.id)                                        AS "accountId"
FROM users u
JOIN customers c ON c.sandbox_id = u.sandbox_id AND c.user_id = u.id
JOIN accounts a  ON a.sandbox_id = c.sandbox_id AND a.customer_id = c.id AND a.type = 'CHEQUING'
WHERE u.sandbox_id = 1
  AND u.status = 'ACTIVE'
  AND u.role = 'CUSTOMER'
  AND c.id < 900                     -- not the Perf User
  AND c.id < 1000000                 -- seeded customers only, not ones your tests registered
GROUP BY u.email, c.id, c.first_name, c.last_name
ORDER BY c.id;`,
          note: "Liam is left out by <code>status = 'ACTIVE'</code> (he is LOCKED). Check the column names against your schema in DBeaver if the query complains.",
        },
        {
          title: "personas.csv (first rows)",
          lang: "csv",
          code: `
email,password,persona,accountId
emma.tremblay@icebank.test,IceBank#2026,Emma_Tremblay,1
olivia.singh@icebank.test,IceBank#2026,Olivia_Singh,7
noah.martin@icebank.test,IceBank#2026,Noah_Martin,9
ava.roy@icebank.test,IceBank#2026,Ava_Roy,10
lucas.gagnon@icebank.test,IceBank#2026,Lucas_Gagnon,12
sophie.bouchard@icebank.test,IceBank#2026,Sophie_Bouchard,14`,
        },
        {
          title: "CSV element and the per-user assertion",
          lang: "text",
          code: `
1. Login (CSV users)                     Thread Group  \${__P(login.threads,5)} threads, ramp-up \${__P(login.rampup,10)}, loops \${__P(login.loops,10)}
├─ CSV Data Set Config "personas.csv"    file \${__P(personas.file,personas.csv)}, UTF-8, ignore first line,
│                                        recycle on EOF = true, stop thread on EOF = false, sharing = All threads
├─ Login 1, Login 2, Login 3             (lesson 3, with \${email} and \${password} from the CSV)
└─ Simple Controller "Signed-in requests"
   ├─ Authorization: Bearer \${accessToken}
   ├─ GET /api/v1/accounts
   │  ├─ Response Assertion 200
   │  └─ JSON Assertion   $[?(@.id == \${accountId})].type   =   CHEQUING
   └─ POST /api/v1/auth/logout   + 204`,
        },
      ],
      exercises: [
        "Export <code>personas.csv</code> with the lesson's query on a freshly reset sandbox and check it in a text editor: how many rows, are Liam and the Perf User missing, any quotes or BOM? Then change the query so it only keeps customers whose chequing account is OPEN. Who drops out, and does it matter for the login scenario? Would it matter for a transfer scenario?",
        "Run the login scenario with 3 threads and 2 loops, once with sharing mode \"All threads\" and once with \"Current thread\". From View Results Tree (or the .jtl), list which user each sample signed in as and explain the difference.",
        "Add the JSON Assertion <code>$[?(@.id == ${accountId})].type = CHEQUING</code> to <code>GET /accounts</code>. Then change one row's <code>accountId</code> to another customer's account and show that the assertion fails while the response is still 200. Put the row back.",
        "Your file has 49 rows and you want 60 threads. What can go wrong, and what are two ways to avoid it?",
      ],
      quiz: [
        {
          q: "Which sharing mode gives every iteration of every thread the next row of the file?",
          options: [
            "All threads",
            "Current thread",
            "Current thread group",
            "Edit",
          ],
          answer: 0,
          explain: "With All threads, the file is one shared queue.",
        },
        {
          q: "Why is Liam not in the CSV?",
          options: [
            "He has no chequing account",
            "He is an admin",
            "He is locked, so every login would be 401 ACCOUNT_LOCKED",
            "His password is different",
          ],
          answer: 2,
          explain: "And never add wrong passwords: 5 failures lock a user.",
        },
        {
          q: "Why assert that the CSV's account is in <code>GET /accounts</code>?",
          options: [
            "To slow the test down realistically",
            "JMeter requires an assertion per sampler",
            "To measure the database",
            "It proves each virtual user sees their own data, which can break under concurrency even with 200 responses",
          ],
          answer: 3,
          explain: "A load test checks correctness as well as speed.",
        },
        {
          q: "How should the plan refer to the CSV file?",
          options: [
            "By an absolute path",
            "Relative to the plan, through a property with a default",
            "Through an environment variable only",
            "It must be inside JMeter's bin folder",
          ],
          answer: 1,
          explain: "Portable, and replaceable with -Jpersonas.file=...",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "assertions-listeners",
      title: "Assertions and listeners",
      summary: "Make every sample prove it was correct, set a response-time objective, and record results without slowing the test down.",
      body: `
<p>A load test without assertions measures how fast the server can say "error". Every sampler in this plan has at least a status check, and the
important ones check the body.</p>

<h3>The assertions you need</h3>
<div class="table-wrap"><table>
<thead><tr><th>Assertion</th><th>Settings</th><th>Use for</th></tr></thead>
<tbody>
<tr><td>Response Assertion</td><td>Field to test: Response Code; Pattern Matching Rules: Equals; pattern <code>200</code> (or 201, 204)</td><td>Every sampler</td></tr>
<tr><td>Response Assertion on the body</td><td>Field: Text Response; Substring; <code>Frostbite Coffee</code></td><td>A text search really filtered</td></tr>
<tr><td>Response Assertion on headers</td><td>Field: Response Headers; Contains (regex); <code>(?i)Idempotent-Replayed:\\s*true</code></td><td>The replayed transfer (lesson 6)</td></tr>
<tr><td>JSON Assertion</td><td>Assert JSON Path exists; Additionally assert value; Expected value; optionally "Match as regular expression"</td><td><code>$.totalElements</code> = 50000, <code>$.status</code> = COMPLETED, <code>$.id</code> = <code>\${transferId}</code></td></tr>
<tr><td>Duration Assertion</td><td>Duration in milliseconds: <code>\${SEARCH_SLA_MS}</code></td><td>A response-time objective: slower samples count as errors</td></tr>
</tbody></table></div>
<p>Put an assertion that applies to a whole group (status 200, the duration) once under the controller, and the specific ones under each sampler. When an
assertion fails, the sample is marked failed and its message goes into the results, for example
<code>Value in json path '$.totalElements' expected to be '49999', but found '50000'</code>. Read those messages first, before any timing.</p>

<h3>Listeners: few, and mostly files</h3>
<ul>
<li><strong>View Results Tree</strong>: every request and response. Priceless for debugging one thread, far too heavy for a load run. Keep it disabled.</li>
<li><strong>Summary Report</strong> and <strong>Aggregate Report</strong>: tables of count, average, percentiles, errors and throughput per sampler. Useful in the GUI.</li>
<li>In headless runs the important output is the <strong>.jtl results file</strong> (<code>-l results.jtl</code>, one CSV line per sample) and the
<strong>HTML dashboard</strong> generated from it (lesson 7). Listeners in the plan are not needed for either.</li>
</ul>
<p>The CSV .jtl keeps the failure <em>message</em> but never response bodies. For a debug run where you need to see which <code>code</code> the API
returned, add <code>-Jjmeter.save.saveservice.output_format=xml -Jjmeter.save.saveservice.response_data.on_error=true</code>: the results file is then XML
and failed samples carry their bodies. Keep the default CSV for real runs: the HTML dashboard is built from it.</p>

<h3>Worked example: proving an assertion bites</h3>
<p>An assertion that can never fail is decoration. After adding one, change the expected value once (50000 to 49999), run a single thread, and check that
exactly that sampler fails with a message that names the value. Then change it back. Do the same for the duration assertion with a tiny SLA (5 ms).</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Only status assertions: a search that returns 200 with an empty page "passes".</li>
<li>Asserting exact values that change between runs (a balance, an id) instead of stable ones (a total after reset, a status, a regex).</li>
<li>A Duration Assertion on the login: bcrypt is slow by design, so the SLA belongs on searches.</li>
<li>View Results Tree enabled in a 10-minute run: memory fills, JMeter slows down, the numbers are wrong.</li>
<li>Response Assertion "Contains" with a regex-special character (<code>$</code>, <code>.</code>) when you meant plain text: use Substring.</li>
</ul></div>`,
      examples: [
        {
          title: "Assertions in the search scenario",
          lang: "text",
          code: `
Simple Controller "Searches"
├─ HTTP Header Manager     Authorization: Bearer \${accessToken}
├─ Response Assertion      Response Code equals 200                 (applies to every search)
├─ Duration Assertion      \${SEARCH_SLA_MS} ms                      (applies to every search)
├─ Uniform Random Timer    0.2 to 0.6 s think time                  (lesson 6)
├─ Search A - all, random page of 50
│  └─ JSON Assertion       $.totalElements = 50000
└─ Search C - text "coffee"
   ├─ JSON Assertion       $.totalElements = 2439
   └─ Response Assertion   Text Response, Substring: Frostbite Coffee`,
        },
        {
          title: "A failed assertion in the .jtl (CSV columns trimmed)",
          lang: "text",
          code: `
timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,...,URL
1793897050015,63,"Search A - all, random page of 50",200,OK,2. Transaction search (Perf User) 2-1,text,false,"Value in json path '$.totalElements' expected to be '49999', but found '50000'",...,http://localhost:3000/api/v1/accounts/900/transactions?page=154&size=50`,
        },
      ],
      exercises: [
        "Add a status assertion to every sampler of your plan and a JSON assertion to every sampler whose body proves success (login, inbox, verify, accounts, searches). List them in a table: sampler, assertion, expected value.",
        "Add a Duration Assertion with <code>${__P(search.sla.ms,1000)}</code> to the searches. Run once with the default and once with <code>-Jsearch.sla.ms=5</code>. What changes in the summary line and in the .jtl?",
        "Make one assertion fail on purpose (an expected total of 49999), run one thread, and copy the failure message from the .jtl. Then restore it.",
        "Run the same 1-minute test twice, once with View Results Tree enabled and once without (both headless). Compare JMeter's memory use or the summary lines and explain the difference.",
      ],
      quiz: [
        {
          q: "A search returns 200 but <code>totalElements</code> is wrong. Which assertion catches it?",
          options: [
            "Response Assertion on the code",
            "Duration Assertion",
            "JSON Assertion on <code>$.totalElements</code>",
            "None; that is not a load issue",
          ],
          answer: 2,
          explain: "Correctness under load is part of the result.",
        },
        {
          q: "Where should a Duration Assertion for \"searches under 1 s\" go?",
          options: [
            "Under the controller that holds only the searches",
            "On the Test Plan",
            "Under the login samplers",
            "In a listener",
          ],
          answer: 0,
          explain: "Scope it to what the objective is about.",
        },
        {
          q: "Why is View Results Tree disabled in real runs?",
          options: [
            "It hides errors",
            "It does not work headless",
            "It deletes the .jtl",
            "It stores every request and response, costing memory and CPU that distort the measurement",
          ],
          answer: 3,
          explain: "Use the .jtl and the HTML report instead.",
        },
        {
          q: "Which assertion checks that a retry was replayed?",
          options: [
            "JSON Assertion on <code>$.status</code>",
            "Response Assertion on Response Headers containing <code>Idempotent-Replayed: true</code>",
            "Duration Assertion",
            "Size Assertion",
          ],
          answer: 1,
          explain: "Plus a JSON Assertion that the id is the first transfer's id.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "scenarios",
      title: "Scenarios: login, search on the Perf User, transfers",
      summary: "Model three realistic workloads, with random pages and think time for the search and an idempotency check for every transfer.",
      body: `
<h3>Scenario 1: login</h3>
<p>Lessons 3 and 4: CSV users, login → inbox → verify → <code>GET /accounts</code> → logout, for example 5 threads × 10 loops. It measures the most
expensive call in Ice Bank: password checking uses bcrypt, which is slow on purpose. Expect login to be the slowest sampler, and do not put a tight SLA on it.</p>

<h3>Scenario 2: transaction search on the Perf User</h3>
<p>All threads are <code>perf.user@icebank.test</code> (Once Only + Critical Section login), searching account 900's 50,000 transactions for a fixed
<strong>duration</strong> (for example 10 threads for 120 s). Three searches, each with a different cost:</p>
<div class="table-wrap"><table>
<thead><tr><th>Sampler</th><th>Query on <code>/api/v1/accounts/900/transactions</code></th><th>What it exercises</th></tr></thead>
<tbody>
<tr><td>A: all, random page</td><td><code>?page=\${__Random(0,999)}&amp;size=50</code></td><td>Counting 50,000 rows, deep <code>OFFSET</code> paging</td></tr>
<tr><td>B: a filtered, sorted range</td><td><code>?from=2026-01-01&amp;to=2026-03-31&amp;type=PURCHASE&amp;direction=DEBIT&amp;minAmount=10.00&amp;maxAmount=100.00&amp;sort=amount,desc&amp;page=…&amp;size=50</code></td><td>Filters plus a sort on amount</td></tr>
<tr><td>C: text search</td><td><code>?q=coffee&amp;page=…&amp;size=20</code></td><td>A text match on descriptions</td></tr>
</tbody></table></div>
<p><code>\${__Random(0,999)}</code> gives a different page each time, so the test does not measure one cached page. The upper bound must be a page that
exists: <code>totalPages − 1</code>. Before you write the assertions, <strong>find the expected <code>totalElements</code> yourself</strong> with SQL or one
API call after a reset (search A is 50000 with 1,000 pages of 50). Those totals stay true as long as nothing new is posted to account 900.</p>
<p>Add a <strong>Uniform Random Timer</strong> (for example 200 ms constant + 400 ms random) to the searches: real users read the page before they ask for the
next one. Without think time, 10 threads are 10 scripts hammering in a loop, which is a stress test, not a load test.</p>

<h3>Scenario 3: transfers with an <code>Idempotency-Key</code></h3>
<p>Money-moving POSTs need an <code>Idempotency-Key</code> header. Same key + same body replays the first response (header
<code>Idempotent-Replayed: true</code>, same transfer id) instead of moving money twice; that is what makes client retries safe, and it must hold under load.
Each iteration:</p>
<ol>
<li><strong>Transfer 1</strong>: chequing → savings, 1.00, header <code>Idempotency-Key: \${idemKey}</code>. Assert 201, <code>$.status</code> COMPLETED, and
extract <code>transferId</code> = <code>$.id</code>.</li>
<li><strong>Transfer 2</strong>: the <em>same</em> request with the <em>same</em> key. Assert 201, the header <code>Idempotent-Replayed: true</code>, and
<code>$.id</code> = <code>\${transferId}</code>.</li>
<li><strong>Transfer 3</strong>: savings → chequing, 1.00, with <code>Idempotency-Key: \${__UUID()}</code> (a fresh key). Balances end where they started.</li>
</ol>
<p>The subtle part is the key. <code>\${__UUID()}</code> is evaluated <strong>every time it is used</strong>, so writing it into both header managers would give
Transfer 1 and 2 different keys and the replay check would fail. Generate it <strong>once per iteration</strong> into a variable: Add → Pre Processors →
<strong>User Parameters</strong> at the thread-group level, name <code>idemKey</code>, value <code>\${__UUID()}</code>, "Update once per iteration" ticked. Both
transfers then send <code>\${idemKey}</code>.</p>
<p>Use one customer with two own accounts (on your machine Emma's 1 → 2 after a reset, or a customer you registered and gave money). After the run, check in
SQL that the number of new transfers is exactly 2 × iterations, that no transfer has a duplicate, and that both balances are back to their start values.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li><code>\${__UUID()}</code> directly in Transfer 1's and Transfer 2's headers: two different keys, two transfers, a failed replay assertion.</li>
<li>The same key for every iteration (a constant): from the second iteration on, every transfer is a replay and nothing is moved.</li>
<li>A random page above the last page: an empty <code>content</code> and assertions that fail for the wrong reason.</li>
<li>Expected totals copied from someone else's machine. Measure them on your reset sandbox.</li>
<li>Transfers between two different customers' accounts, or out of a loan: 4xx by design, not a load finding.</li>
<li>Forgetting the post-run SQL checks: a duplicate transfer under load is the most important thing this scenario can find.</li>
</ul></div>`,
      examples: [
        {
          title: "The transfer scenario",
          lang: "text",
          code: `
3. Transfers                                  Thread Group \${__P(transfer.threads,3)} x \${__P(transfer.loops,20)}, on error: Continue
├─ User Parameters "idemKey per iteration"    idemKey = \${__UUID()}   [x] Update once per iteration
├─ Once Only Controller > Critical Section Controller > login 1, 2, 3   (as \${TRANSFER_EMAIL})
└─ Simple Controller "Transfers"
   ├─ Authorization: Bearer \${accessToken}
   ├─ Transfer 1 - out     POST /api/v1/transfers
   │    body {"fromAccountId":\${TRANSFER_FROM},"toAccountId":\${TRANSFER_TO},"amount":"1.00","memo":"JMeter load test"}
   │    header Idempotency-Key: \${idemKey}
   │    assert 201, $.status = COMPLETED;  extract transferId <- $.id
   ├─ Transfer 2 - same key again   (identical body and header)
   │    assert 201, Response Headers contain (?i)Idempotent-Replayed:\\s*true,  $.id = \${transferId}
   └─ Transfer 3 - back    body with from/to swapped, header Idempotency-Key: \${__UUID()}
        assert 201`,
        },
        {
          title: "Expected totals: measure them yourself after a reset",
          lang: "sql",
          code: `
-- Search A: everything on account 900
SELECT count(*) FROM transactions WHERE sandbox_id = 1 AND account_id = 900;

-- Search C: the text search the API runs on descriptions (compare with GET ...?q=coffee&size=1 -> totalElements)
SELECT count(*) FROM transactions
WHERE sandbox_id = 1 AND account_id = 900 AND description ILIKE '%coffee%';`,
          note: "Write search B's query yourself (Tutorial 1: Toronto dates, inclusive range, type, direction, amounts) and compare it with one API call before you trust it.",
        },
        {
          title: "After the transfer run: correctness checks (qa_reader)",
          lang: "sql",
          code: `
-- two real transfers per iteration, none more: 3 threads x 20 loops = 120
SELECT count(*) FROM transfers WHERE sandbox_id = 1 AND memo LIKE 'JMeter load test%';

-- balances back to the start (read them before the run)
SELECT id, balance FROM accounts WHERE sandbox_id = 1 AND id IN (1, 2);

-- no two transfers with the same reference
SELECT reference_id, count(*) FROM transfers WHERE sandbox_id = 1 GROUP BY reference_id HAVING count(*) > 1;`,
          note: "Use the account ids of the customer your plan moves money for. Adjust the memo filter to the memo your plan sends.",
        },
      ],
      exercises: [
        "Add search B with a random page in range and a JSON assertion on its <code>totalElements</code>. Find the expected total first, with SQL and with one API call, and explain any difference before you write the assertion.",
        "Add search C (text \"coffee\") with a JSON assertion on the total and a body assertion that the text Frostbite Coffee appears. Add the Uniform Random Timer to the searches and run 2 threads for 60 s.",
        "Build the transfer scenario with User Parameters for the key. Run it with 1 thread × 3 loops, then do the SQL checks: how many new transfers, any duplicates, balances back? Then put <code>${__UUID()}</code> directly into Transfer 2's header and show which assertion fails.",
        "Add a fourth search of your own (for example <code>type=PAYROLL&amp;from=2026-10-01&amp;to=2026-10-31</code>) with an assertion on its total, measured by you first.",
      ],
      quiz: [
        {
          q: "Transfer 1 and Transfer 2 both use <code>${__UUID()}</code> in their headers. What happens?",
          options: [
            "The replay works",
            "Each gets a different key, so two transfers are created and the replay assertion fails",
            "JMeter reuses the UUID within an iteration",
            "The API rejects both",
          ],
          answer: 1,
          explain: "__UUID() is evaluated each time; store it once per iteration with User Parameters.",
        },
        {
          q: "Why add think time to the search scenario?",
          options: [
            "To make the report prettier",
            "JMeter requires a timer",
            "To avoid the rate limit",
            "Real users pause between requests; without it the test is a stress test of a few looping scripts",
          ],
          answer: 3,
          explain: "Model the workload you want to measure.",
        },
        {
          q: "Search A uses <code>page=${__Random(0,999)}&amp;size=50</code>. Why 999?",
          options: [
            "50,000 rows / 50 per page = 1,000 pages, numbered 0 to 999",
            "A JMeter limit",
            "To test errors",
            "Random numbers must be below 1000",
          ],
          answer: 0,
          explain: "Stay inside the pages that exist.",
        },
        {
          q: "What is the most important correctness check after the transfer run?",
          options: [
            "Average response time",
            "That the HTML report exists",
            "No duplicate transfers and balances back to their start values",
            "That the CPU stayed below 80%",
          ],
          answer: 2,
          explain: "Idempotency must hold under load: that is what this scenario is for.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "headless-report",
      title: "Run headless and read the HTML report",
      summary: "Run the plan from the command line, generate the dashboard, read percentiles, errors and throughput, and write the load report.",
      body: `
<h3>The command</h3>
<p>From the folder with the plan and the CSV:</p>
<p><code>jmeter -n -t icebank-load.jmx -l results.jtl -e -o report</code></p>
<div class="table-wrap"><table>
<thead><tr><th>Flag</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>-n</code></td><td>Non-GUI mode. Always, for real runs.</td></tr>
<tr><td><code>-t file.jmx</code></td><td>The plan.</td></tr>
<tr><td><code>-l results.jtl</code></td><td>Raw results, one CSV line per sample. Keep it: it is the evidence.</td></tr>
<tr><td><code>-e -o report</code></td><td>Generate the HTML dashboard at the end into <code>report/</code>, which must not exist or must be empty.</td></tr>
<tr><td><code>-Jname=value</code></td><td>Set a property your plan reads with <code>\${__P(name,default)}</code>.</td></tr>
<tr><td><code>-g results.jtl -o report2</code></td><td>Build a dashboard again from an existing results file, without re-running.</td></tr>
</tbody></table></div>
<p>While it runs, JMeter prints a <code>summary</code> line every 30 seconds and a final one: samples, rate, average, min, max and errors. A non-zero
<code>Err</code> is the first thing to look at.</p>

<h3>Reading the dashboard (<code>report/index.html</code>)</h3>
<div class="table-wrap"><table>
<thead><tr><th>Where</th><th>Look at</th><th>Healthy on a laptop (a rough guide)</th></tr></thead>
<tbody>
<tr><td>Dashboard: APDEX and Requests Summary</td><td>Pass/fail ratio</td><td>100% pass. Anything else: read the errors before any timing.</td></tr>
<tr><td>Statistics table</td><td>Samples, <strong>Error %</strong>, average, <strong>90th/95th/99th percentile</strong>, throughput per sampler</td><td>0% errors; searches well under the SLA; login slower (bcrypt)</td></tr>
<tr><td>Errors / Top 5 errors by sampler</td><td>Response codes and assertion messages</td><td>Empty</td></tr>
<tr><td>Charts: Response Times Over Time</td><td>Does latency climb during the run?</td><td>Flat after ramp-up</td></tr>
<tr><td>Charts: Transactions per Second</td><td>Does throughput stop growing while threads increase?</td><td>That knee is saturation</td></tr>
<tr><td>Charts: Active Threads Over Time</td><td>Ramp-up and scenarios one after another</td><td>Separate blocks per scenario</td></tr>
</tbody></table></div>
<p><strong>Percentiles, not averages.</strong> An average of 80 ms can hide 5% of requests taking 2 s. The 95th percentile says "19 of 20 requests were at most
this fast". Report p50, p95 and p99, the error rate and the throughput per scenario.</p>

<h3>Scaling: find the knee</h3>
<p>Run the search scenario alone at 5, 10 and 20 threads for the same duration (<code>-Jlogin.threads=0 -Jtransfer.threads=0 -Jsearch.threads=N</code>,
a different <code>-l</code> and <code>-o</code> each time). Put throughput and p95 side by side. While throughput grows with threads, the server keeps up;
when throughput flattens and p95 climbs, it is saturated (usually the database or the single Node process). Deep pages (high <code>page</code> numbers) are
slower than page 0: a good point for the discussion.</p>

<h3>The load report (one page)</h3>
<ol>
<li><strong>Setup</strong>: machine, Ice Bank version and build (<code>npm start</code>, <code>PERF_MODE=true</code>), seed state, JMeter and Java versions, threads, ramp-up, duration.</li>
<li><strong>Results per scenario</strong>: samples, throughput, p50/p95/p99, error rate, the slowest sampler.</li>
<li><strong>Scaling</strong>: the 5/10/20 table and where it saturates.</li>
<li><strong>Correctness</strong>: assertions passed; SQL checks after the run (no duplicate transfers, balances back).</li>
<li><strong>Recommendation</strong>: one or two sentences, for example "deep paging is the slowest search; keyset pagination would help".</li>
</ol>
<p>Reset after the run: every successful sign-in wrote rows (an OTP, an Ice Mail message, a refresh token, a notification, an audit row).</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Reusing the <code>-o</code> folder: "Error generating the report: … not empty". Delete it or pick a new name.</li>
<li>Reporting averages only, or timings from a run with errors.</li>
<li>Comparing runs made with different data (one after a reset, one after an hour of experiments).</li>
<li>Running JMeter and Ice Bank on a laptop that is also busy with an IDE build: note it, or close it.</li>
<li>Running against QA "just to compare". Never.</li>
</ul></div>`,
      examples: [
        {
          title: "Runs for the report",
          lang: "bash",
          code: `
# everything, with the defaults in the plan
jmeter -n -t icebank-load.jmx -l results.jtl -e -o report

# search only, at three load levels (same duration)
for n in 5 10 20; do
  jmeter -n -t icebank-load.jmx -l search-$n.jtl -e -o report-search-$n \\
    -Jlogin.threads=0 -Jtransfer.threads=0 -Jsearch.threads=$n -Jsearch.duration=120
done

# a debug run that keeps the bodies of failed samples (XML results; not for the dashboard)
jmeter -n -t icebank-load.jmx -l debug.xml -Jlogin.threads=1 -Jlogin.loops=1   -Jjmeter.save.saveservice.output_format=xml -Jjmeter.save.saveservice.response_data.on_error=true

# rebuild a dashboard from an old results file
jmeter -g results.jtl -o report-again`,
        },
        {
          title: "What the console says (a small local run)",
          lang: "text",
          code: `
Created the tree successfully using icebank-load.jmx
Starting standalone test @ ...
summary =     56 in 00:00:07 =    8.3/s Avg:    44 Min:    11 Max:   144 Err:     0 (0.00%)
Tidying up ...
... end of run`,
        },
        {
          title: "A results table for the report",
          lang: "text",
          code: `
Scenario     Threads  Samples  Throughput/s  p50 ms  p95 ms  p99 ms  Errors
Login        5 x 10   250      ...           ...     ...     ...     0.00%
Search       10, 120s ...      ...           ...     ...     ...     0.00%
Transfers    3 x 20   180      ...           ...     ...     ...     0.00%

Search scaling (120 s each)
Threads  Throughput/s  p95 ms
5        ...           ...
10       ...           ...
20       ...           ...`,
        },
      ],
      exercises: [
        "Run your whole plan headless with <code>-l results.jtl -e -o report</code> and open <code>report/index.html</code>. Write down the error rate and the p95 of each sampler. If there are errors, fix the cause first and run again.",
        "Run the search scenario alone at 5, 10 and 20 threads with the same duration. Fill the scaling table and say where (if anywhere) throughput stops growing and p95 starts climbing.",
        "Regenerate a dashboard from one of your .jtl files with <code>-g</code>. Then try <code>-o</code> on a folder that already has files and copy the exact error message.",
        "Write the one-page load report (setup, results per scenario, scaling, correctness with the SQL checks, recommendation) and attach the HTML report. This is the bonus deliverable.",
      ],
      quiz: [
        {
          q: "Which number best describes \"how slow it feels for most users\" in a load report?",
          options: [
            "The 95th percentile",
            "The average",
            "The minimum",
            "The number of samples",
          ],
          answer: 0,
          explain: "Report p50, p95, p99 and the error rate; an average hides the slow tail.",
        },
        {
          q: "Throughput rises from 5 to 10 threads and stays the same at 20, while p95 doubles. What does that suggest?",
          options: [
            "JMeter is broken",
            "More threads always help",
            "The server is saturated between 10 and 20 threads",
            "The CSV ran out of rows",
          ],
          answer: 2,
          explain: "That knee is the capacity of this setup.",
        },
        {
          q: "<code>jmeter -n -t plan.jmx -l r.jtl -e -o report</code> fails with \"not empty\". Why?",
          options: [
            "The plan is invalid",
            "The .jtl is locked",
            "Java is too old",
            "The report folder already contains files",
          ],
          answer: 3,
          explain: "Use a new folder or delete the old one.",
        },
        {
          q: "How do you get a dashboard for an old results file without running the test again?",
          options: [
            "Open the .jtl in the GUI",
            "<code>jmeter -g results.jtl -o report-again</code>",
            "<code>jmeter -n -e</code>",
            "It is not possible",
          ],
          answer: 1,
          explain: "-g generates the report from the file.",
        },
      ],
    },
  ],
});
