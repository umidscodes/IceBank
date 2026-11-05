/* Tutorial 3: Browser DevTools. Locators use the app's real data-testid values. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "devtools",
  number: 3,
  title: "Browser DevTools",
  summary: "Use Chrome DevTools to test locators, watch the API calls behind every screen, and trace a UI bug to its source.",
  intro: `
<p>Every screen in Ice Bank is the browser calling the same REST API you test with REST Assured. DevTools lets you see those calls, the HTML your Selenium locators
target, the cookies that hold your session and the errors nobody shows you on screen. Open it with <kbd>F12</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd>
in Chrome or Edge (they share the same DevTools). Sign in to <a href="http://localhost:3000/login" target="_blank" rel="noopener">http://localhost:3000/login</a> as
<code>emma.tremblay@icebank.test</code> / <code>IceBank#2026</code> before you start.</p>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "elements-locators",
      title: "Elements panel and testing CSS/XPath with $$ and $x",
      summary: "Inspect the live page and prove a locator matches exactly one element before you put it in a test.",
      links: [{ label: "Open Ice Bank login", href: "http://localhost:3000/login" }],
      body: `
<p>The <strong>Elements</strong> panel shows the live DOM: the HTML as it is <em>now</em>, after JavaScript has built and changed the page (which is not the same as
<em>View source</em>). Right-click anything on the page → <strong>Inspect</strong> to jump to its element. Selenium sees exactly this DOM, so this is where locators are born.</p>

<h3>Ice Bank's locator contract</h3>
<p>Every interactive element and every value a test reads has a stable <code>data-testid</code> in kebab-case: <code>login-email-input</code>,
<code>login-password-input</code>, <code>login-submit-button</code>, <code>otp-code-input</code>, <code>transfer-amount-input</code>, <code>transfer-from-select</code>,
<code>transfer-review-button</code>, <code>transfer-confirm-button</code>, <code>transactions-table</code>, <code>dashboard-net-total</code>. Prefer them over classes, text or
position: they are a promise from the developers that they will not change for styling reasons.</p>

<h3>Testing locators in the Console</h3>
<p>DevTools' Console has two helpers that make locator testing instant:</p>
<ul>
<li><code>$$('css selector')</code> returns an array of every element matching a CSS selector.</li>
<li><code>$x('xpath expression')</code> returns an array of every element matching an XPath.</li>
</ul>
<p>A good locator returns <strong>exactly one</strong> element (length 1) for a single-element lookup, or exactly the set you expect for a list (for example one per table row).
Zero means wrong or not rendered yet; two or more means Selenium will silently use the first, which is how tests click the wrong button. You can also press
<kbd>Ctrl</kbd>+<kbd>F</kbd> in the Elements panel and type a CSS selector or XPath: DevTools highlights matches and shows "1 of 1".</p>

<h3>CSS vs XPath, quickly</h3>
<div class="table-wrap"><table>
<thead><tr><th>Goal</th><th>CSS</th><th>XPath</th></tr></thead>
<tbody>
<tr><td>By test id</td><td><code>[data-testid="login-submit-button"]</code></td><td><code>//*[@data-testid='login-submit-button']</code></td></tr>
<tr><td>Starts with</td><td><code>[data-testid^="nav-link-"]</code></td><td><code>//*[starts-with(@data-testid,'nav-link-')]</code></td></tr>
<tr><td>Inside another</td><td><code>[data-testid="transactions-table"] tbody tr</code></td><td><code>//*[@data-testid='transactions-table']//tbody/tr</code></td></tr>
<tr><td>By visible text</td><td>not possible</td><td><code>//button[normalize-space()='Sign in']</code></td></tr>
<tr><td>Go up to a parent</td><td>not possible (except <code>:has()</code>)</td><td><code>//td[contains(.,'Frostbite')]/ancestor::tr</code></td></tr>
<tr><td>Nth match</td><td><code>tbody tr:nth-child(2)</code></td><td><code>(//tbody/tr)[2]</code></td></tr>
</tbody></table></div>
<p>CSS is shorter and faster; XPath can match text and walk upwards. In Ice Bank's <strong>Classic view</strong> (hard mode, toggled in Profile) there are no test ids and
the ids change on every load, so you need relative XPath like "the amount cell in the row whose description contains X".</p>`,
      examples: [
        {
          title: "Console: check the login form locators (on /login)",
          lang: "javascript",
          code: `
$$('[data-testid="login-email-input"]').length      // expect 1
$$('[data-testid="login-password-input"]').length   // expect 1
$$('[data-testid="login-submit-button"]')[0]        // hover the result: the button lights up
$x("//button[@data-testid='login-submit-button']").length
$$('[data-testid^="login-"]').map(e => e.dataset.testid)   // every login test id on the page`,
        },
        {
          title: "Console: rows and cells of the transactions table (on an account page)",
          lang: "javascript",
          code: `
$$('[data-testid="transactions-table"] tbody tr').length
$$('[data-testid="transaction-amount"]').map(e => e.textContent.trim())
$x("//*[@data-testid='transaction-description'][contains(., 'Frostbite')]/ancestor::tr//*[@data-testid='transaction-amount']")
  .map(e => e.textContent.trim())`,
        },
        {
          title: "The same locators in Selenium (Java)",
          lang: "java",
          code: `
By email    = By.cssSelector("[data-testid='login-email-input']");
By password = By.cssSelector("[data-testid='login-password-input']");
By submit   = By.cssSelector("[data-testid='login-submit-button']");
By rows     = By.cssSelector("[data-testid='transactions-table'] tbody tr");
By coffeeAmount = By.xpath(
    "//*[@data-testid='transaction-description'][contains(., 'Frostbite')]"
  + "/ancestor::tr//*[@data-testid='transaction-amount']");

driver.findElement(email).sendKeys("emma.tremblay@icebank.test");`,
        },
      ],
      exercises: [
        "On the login page, find the <code>data-testid</code> of every input, button and link (use the <code>$$('[data-testid]')</code> trick). Write them into a <code>LoginPage</code> page object with <code>By</code> fields.",
        "On Emma's chequing account page, write a CSS selector and an XPath for: the balance, the CSV download button, the third row of the table, and the amount of the newest coffee purchase. Prove each matches exactly what you intended with <code>$$</code> or <code>$x</code>.",
        "Write an XPath that selects the <em>row</em> of a transaction by its description text, and from there the date cell. Explain why this pattern survives sorting and paging better than <code>tr[3]</code>.",
        "Turn on Classic view in Profile (if your build has it) and locate the dashboard's chequing balance without any <code>data-testid</code>. Reload twice and check your locator still works.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "network",
      title: "Network tab: filtering and inspecting requests",
      summary: "Watch every API call a screen makes and read its request, response and timing.",
      body: `
<p>The <strong>Network</strong> panel records every request the page makes while DevTools is open. For a tester it answers the question "what did the UI actually ask the
server, and what did the server actually say?". Open it <em>before</em> you do the action (or reload), otherwise there is nothing recorded.</p>

<h3>Settings to turn on</h3>
<ul>
<li><strong>Preserve log</strong>: keeps requests when the page navigates (sign-in redirects to the dashboard and would otherwise wipe the list).</li>
<li><strong>Disable cache</strong>: so every reload really asks the server.</li>
<li>Filter <strong>Fetch/XHR</strong>: hides images, scripts and styles; what is left is the API traffic.</li>
<li>Type <code>api/v1</code> in the filter box to keep only Ice Bank API calls. Other useful filters: <code>status-code:422</code>, <code>method:POST</code>,
<code>-status-code:200</code> (everything that is not 200), <code>larger-than:100k</code>.</li>
</ul>

<h3>Reading one request</h3>
<p>Click a row. The tabs are:</p>
<ul>
<li><strong>Headers</strong>: the URL, method, status code, then response headers (look for <code>X-Request-Id</code>, <code>Location</code>, <code>Content-Type</code>) and request
headers (<code>Cookie</code>, <code>Content-Type</code>, <code>Idempotency-Key</code>).</li>
<li><strong>Payload</strong>: the query string parameters and the JSON body the UI sent. This is where you check that the UI sent <code>"amount":"25.00"</code> and the account
ids you picked.</li>
<li><strong>Preview / Response</strong>: the body the server returned, pretty-printed or raw.</li>
<li><strong>Timing</strong>: how long the server took ("Waiting for server response").</li>
</ul>
<p>Right-click the column header to add columns such as <em>Method</em> and <em>Response Header → X-Request-Id</em>. The waterfall shows calls that run in parallel and calls
that wait for each other.</p>

<h3>What a tester looks for</h3>
<ul>
<li>A red row (4xx/5xx) the UI did not show to the user.</li>
<li>The same call made twice (double submit, or a retry without the same <code>Idempotency-Key</code>).</li>
<li>Request values that differ from what was typed (rounding, wrong account, missing field).</li>
<li>Responses with more data than the screen needs (another customer's data, full card numbers): a security finding even if the UI hides it.</li>
</ul>`,
      examples: [
        {
          title: "What signing in looks like in the Network tab (Fetch/XHR, filter api/v1)",
          lang: "text",
          code: `
POST  /api/v1/auth/login          200   {"mfaRequired":true,"mfaToken":"...","expiresIn":300,"delivery":"Ice Mail"}
POST  /api/v1/auth/mfa/verify     200   Set-Cookie: ib_at=...; HttpOnly; SameSite=Lax
                                        Set-Cookie: ib_rt=...; HttpOnly; SameSite=Lax
GET   /api/v1/me                  200
GET   /api/v1/accounts            200   [ {id: 1, type: "CHEQUING", ...}, ... ]`,
          note: "The exact list depends on the page; the point is that each screen is a handful of API calls you already know from Swagger.",
        },
        {
          title: "Useful filter strings",
          lang: "text",
          code: `
api/v1
method:POST
status-code:422
-status-code:200
api/v1/accounts -method:GET
larger-than:50k`,
        },
      ],
      exercises: [
        "With Preserve log and Fetch/XHR on, sign in as Emma. List every API call from the login page to the dashboard with method, path and status.",
        "Make a $1.00 transfer from chequing to savings in the UI. Find the <code>POST /api/v1/transfers</code> call and record: the request body, the <code>Idempotency-Key</code>, the status, the <code>Location</code> header and the <code>X-Request-Id</code>.",
        "On the account page, apply a date filter and a text search. Find the request and check that the query parameters match what you typed, including the date format.",
        "Try a transfer bigger than your balance in the UI. Compare the error the screen shows with the <code>detail</code> and <code>code</code> in the response. Are they consistent?",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "copy-curl",
      title: "Copy as cURL",
      summary: "Turn any request the UI made into a command you can replay, edit and convert into a test.",
      body: `
<p>Right-click any request in the Network tab → <strong>Copy → Copy as cURL</strong>. DevTools puts on your clipboard a <code>curl</code> command that repeats that exact request,
with the same method, URL, headers, cookies and body. It is the fastest way to go from "the UI does something odd" to "here is a request that reproduces it".</p>

<h3>Which variant on Windows?</h3>
<ul>
<li><strong>Copy as cURL (bash)</strong>: paste into <strong>Git Bash</strong>. Uses single quotes and <code>\\</code> line continuations. This is the one to use.</li>
<li><strong>Copy as cURL (cmd)</strong>: for the old Command Prompt; uses <code>^</code> escapes.</li>
<li><strong>Copy as PowerShell</strong>: produces an <code>Invoke-WebRequest</code> script instead of curl.</li>
</ul>
<p>In PowerShell, typing <code>curl</code> runs <code>Invoke-WebRequest</code>, not curl, and the bash-style command fails with confusing errors. Use Git Bash, or call
<code>curl.exe</code> explicitly.</p>

<h3>Cleaning up a copied command</h3>
<p>The copied command contains every header the browser sent, most of which do not matter (<code>sec-ch-ua</code>, <code>user-agent</code>, <code>accept-language</code>…). Delete them
until the request is minimal but still works; what remains is the essence of the request, and it translates almost line by line into REST Assured. The cookie header
contains <code>ib_at</code>, your access token: you can replace it with <code>-H "Authorization: Bearer $TOKEN"</code>.</p>
<div class="callout warn"><p><strong>Copied commands contain secrets.</strong> The <code>Cookie</code> header holds live session tokens. Never paste a copied curl into a public
chat, a Jira ticket or a commit without removing <code>ib_at</code>/<code>ib_rt</code> first. Tokens expire (15 minutes for access), but refresh tokens last 7 days.</p></div>

<h3>Replaying with changes</h3>
<p>Once it works, edit the command to explore: change the amount to <code>"10.005"</code>, remove the <code>Idempotency-Key</code>, swap the account id for one you do not own.
Each edit is a quick negative test you can later automate. For money-moving POSTs, remember to change the <code>Idempotency-Key</code> if you want a <em>new</em> operation; keep it
to test the replay.</p>`,
      examples: [
        {
          title: "What a copied transfer looks like (shortened)",
          lang: "bash",
          code: `
curl 'http://localhost:3000/api/v1/transfers' \\
  -H 'accept: application/json' \\
  -H 'content-type: application/json' \\
  -H 'cookie: ib_at=eyJhbGciOiJIUzI1NiIs...; ib_rt=Qm9vX2x...' \\
  -H 'idempotency-key: 8a4f3c1e-2d0b-4b8e-9a51-6c7d2e1f0a93' \\
  -H 'origin: http://localhost:3000' \\
  -H 'referer: http://localhost:3000/transfer' \\
  -H 'sec-ch-ua: "Chromium";v="130"' \\
  -H 'user-agent: Mozilla/5.0 ...' \\
  --data-raw '{"fromAccountId":1,"toAccountId":2,"amount":"1.00","memo":""}'`,
        },
        {
          title: "Minimal version, ready to edit",
          lang: "bash",
          code: `
curl -i 'http://localhost:3000/api/v1/transfers' \\
  -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -H "Idempotency-Key: $(date +%s%N)" \\
  --data-raw '{"fromAccountId":1,"toAccountId":2,"amount":"1.00"}'`,
        },
        {
          title: "And as REST Assured",
          lang: "java",
          code: `
given()
    .baseUri("http://localhost:3000/api/v1")
    .auth().oauth2(token)
    .contentType(ContentType.JSON)
    .header("Idempotency-Key", UUID.randomUUID().toString())
    .body("{\\"fromAccountId\\":1,\\"toAccountId\\":2,\\"amount\\":\\"1.00\\"}")
.when()
    .post("/transfers")
.then()
    .statusCode(201);`,
        },
      ],
      exercises: [
        "Copy the <code>GET /api/v1/accounts</code> request from the dashboard as cURL (bash) and run it in Git Bash. Then remove headers one by one until only what is needed remains. Which header is essential?",
        "Copy a transfer request, replace the cookie with an <code>Authorization: Bearer</code> header, and replay it twice with the same <code>Idempotency-Key</code>. Confirm only one transfer exists (in the UI or the database).",
        "Edit the copied transfer to make three negative tests: 3 decimal places, an account you do not own, and no <code>Idempotency-Key</code>. Record each status and <code>code</code>.",
        "Translate your minimal curl into a REST Assured test in your framework, and commit it.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "console",
      title: "Console errors",
      summary: "Spot the JavaScript errors and failed requests a user never sees, and use the Console as a scratchpad.",
      body: `
<p>The <strong>Console</strong> shows messages from the page's JavaScript: errors (red), warnings (yellow), and logs. Many real bugs announce themselves here long before they
break something visible: an uncaught exception after a click, a failed request, a React warning about a missing key. A good habit is to keep the Console open while you
explore, and to treat every red line as a bug candidate.</p>

<h3>What you will see</h3>
<ul>
<li><strong>Uncaught errors</strong> (<code>TypeError: Cannot read properties of undefined</code>): the code crashed. Click the file link on the right to see where.</li>
<li><strong>Failed network requests</strong> (<code>GET http://localhost:3000/api/v1/... 404 (Not Found)</code>): Chrome logs every 4xx/5xx. Some are expected (a 401 before
sign-in), some are bugs.</li>
<li><strong>Warnings</strong> from the framework (React, Next.js), for example about hydration or keys. Usually developer issues, still worth noting.</li>
<li><strong>Violations</strong> (long tasks, forced reflow): performance hints.</li>
</ul>
<p>Use the level dropdown (Default levels / Verbose / Errors only) and the filter box. Tick <strong>Preserve log</strong> here too, so errors survive a redirect.</p>

<h3>The Console as a scratchpad</h3>
<p>The Console runs JavaScript in the page, with the page's cookies. Because the Ice Bank API also accepts the <code>ib_at</code> cookie, a <code>fetch</code> from the Console
on <code>localhost:3000</code> is signed in as whoever is signed in to the UI. That is handy for quick checks without Postman. <code>console.table()</code> prints arrays of
objects as a table.</p>

<h3>Capturing Console errors in Selenium</h3>
<p>Selenium can read the browser log too, so a UI test can fail when the page throws, even if the assertion on screen passes. With ChromeDriver you enable the
<code>goog:loggingPrefs</code> capability and read <code>driver.manage().logs().get(LogType.BROWSER)</code> after each test.</p>`,
      examples: [
        {
          title: "Console: call the API as the signed-in UI user",
          lang: "javascript",
          code: `
const accounts = await (await fetch("/api/v1/accounts")).json();
console.table(accounts.map(a => ({ id: a.id, type: a.type, balance: a.balance, status: a.status })));

const page = await (await fetch("/api/v1/accounts/1/transactions?size=5")).json();
console.table(page.content, ["id", "createdAt", "type", "amount", "balanceAfter"]);`,
        },
        {
          title: "Console: see an error body the UI turned into a short message",
          lang: "javascript",
          code: `
const r = await fetch("/api/v1/accounts/5");
console.log(r.status, r.headers.get("content-type"), r.headers.get("x-request-id"));
console.log(await r.json());`,
        },
        {
          title: "Fail a Selenium test on browser errors (ChromeDriver)",
          lang: "java",
          code: `
ChromeOptions options = new ChromeOptions();
LoggingPreferences prefs = new LoggingPreferences();
prefs.enable(LogType.BROWSER, Level.ALL);
options.setCapability("goog:loggingPrefs", prefs);
WebDriver driver = new ChromeDriver(options);

// ... after the test steps:
List<LogEntry> severe = driver.manage().logs().get(LogType.BROWSER).getAll().stream()
    .filter(e -> e.getLevel().equals(Level.SEVERE))
    .toList();
assertTrue(severe.isEmpty(), "Browser errors: " + severe);`,
        },
      ],
      exercises: [
        "Keep the Console open with Preserve log and walk through: sign in, dashboard, an account page, a transfer, sign out. Record every red line with the page it appeared on, and decide for each whether it is expected or a bug candidate.",
        "Signed in as Emma, use <code>fetch</code> in the Console to print her accounts with <code>console.table</code>. Then fetch <code>/api/v1/accounts/5</code> and print the status, the <code>X-Request-Id</code> and the body.",
        "Sign out, then run the same <code>fetch('/api/v1/accounts')</code> in the Console. Record the status and explain why it changed.",
        "Add browser-log collection to one of your Selenium tests and make it print any SEVERE entries at the end of the test.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "application",
      title: "Application tab: cookies, storage and decoding a JWT",
      summary: "See what the browser stores for a site, and read what is inside Ice Bank's access token.",
      body: `
<p>The <strong>Application</strong> panel shows what the browser keeps for the current site: cookies, <code>localStorage</code>, <code>sessionStorage</code>, IndexedDB and cache.
Testers use it to understand sessions, to set up state quickly, and to check that nothing sensitive is stored where it should not be.</p>

<h3>Cookies</h3>
<p>Open <em>Storage → Cookies → http://localhost:3000</em>. After sign-in you should see two Ice Bank cookies:</p>
<div class="table-wrap"><table>
<thead><tr><th>Name</th><th>Holds</th><th>Flags</th></tr></thead>
<tbody>
<tr><td><code>ib_at</code></td><td>Access token (JWT), 15 minutes</td><td><code>HttpOnly</code>, <code>SameSite=Lax</code>, path <code>/</code></td></tr>
<tr><td><code>ib_rt</code></td><td>Refresh token, 7 days</td><td><code>HttpOnly</code>, <code>SameSite=Lax</code>, path <code>/</code></td></tr>
</tbody></table></div>
<ul>
<li><strong>HttpOnly</strong>: page JavaScript cannot read the cookie (<code>document.cookie</code> will not show it), so an XSS bug cannot steal the token. DevTools can still show
it to you.</li>
<li><strong>SameSite=Lax</strong>: the browser does not send it on most cross-site requests, which protects against CSRF.</li>
<li><strong>Secure</strong>: only sent over https. Locally it is off (plain http); a production bank must set it.</li>
<li><strong>Expires / Max-Age</strong>: when the browser throws it away. A session cookie (no expiry) goes when the browser closes.</li>
</ul>
<p>You can edit or delete a cookie here: delete <code>ib_at</code> and reload to see what the UI does with an expired session; change one character to simulate a tampered token.</p>

<h3>localStorage and sessionStorage</h3>
<p>Key/value storage per site that JavaScript <em>can</em> read. <code>localStorage</code> survives restarts; <code>sessionStorage</code> lasts for the tab. Banks should not keep
tokens or personal data here. This tutorial site uses it: open the Application tab on <code>http://localhost:4000</code> and you will find the key
<code>icebank-tutorials-v1</code> holding your ticks and notes as JSON.</p>

<h3>Decoding a JWT</h3>
<p>A JWT is <code>header.payload.signature</code>, each part Base64URL-encoded (Base64 with <code>-</code> and <code>_</code> instead of <code>+</code> and <code>/</code>, no padding).
Copy the value of <code>ib_at</code> from the cookie table (or the <code>accessToken</code> from an API response) and decode the middle part in the Console. Do not paste real
tokens into random websites: decoding is one line of JavaScript, and a token is a key to the account until it expires.</p>
<p>Use <em>Clear site data</em> (Application → Storage) to start from a clean browser, which is what Selenium does with a fresh profile.</p>`,
      examples: [
        {
          title: "Console: decode a JWT payload (paste your token between the quotes)",
          lang: "javascript",
          code: `
const token = "PASTE.ACCESS.TOKEN";
const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
const payload = JSON.parse(atob(part.padEnd(part.length + (4 - part.length % 4) % 4, "=")));
console.log(payload);
console.log("issued", new Date(payload.iat * 1000), "expires", new Date(payload.exp * 1000));`,
        },
        {
          title: "Console: HttpOnly in action",
          lang: "javascript",
          code: `
document.cookie            // ib_at and ib_rt are NOT listed: they are HttpOnly
localStorage               // whatever the site stores in localStorage
Object.keys(localStorage)`,
        },
        {
          title: "Decode the payload in Java (for assertions on claims)",
          lang: "java",
          code: `
String payloadJson = new String(
    Base64.getUrlDecoder().decode(accessToken.split("\\\\.")[1]),
    StandardCharsets.UTF_8);
JsonPath claims = new JsonPath(payloadJson);
assertEquals("1", claims.getString("sub"));
assertEquals("CUSTOMER", claims.getString("role"));
assertEquals(900, claims.getLong("exp") - claims.getLong("iat"));`,
        },
      ],
      exercises: [
        "Sign in to the UI and record, for <code>ib_at</code> and <code>ib_rt</code>: expiry, HttpOnly, Secure, SameSite and path. Which of these would you flag in a production security review?",
        "Decode the payload of your <code>ib_at</code> cookie in the Console. Check <code>sub</code>, <code>cid</code>, <code>role</code> and the expiry time, and compare <code>sub</code> with <code>users.id</code> for Emma in the database.",
        "Delete <code>ib_at</code> only (keep <code>ib_rt</code>) and reload the dashboard. Then delete both and reload. Describe what the UI does in each case and which API calls you see in the Network tab.",
        "Open this tutorial site's Application tab, find <code>icebank-tutorials-v1</code>, tick an exercise and watch the value change. Then use <em>Export progress</em> and compare the file with the stored JSON.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "throttling",
      title: "Network throttling",
      summary: "Slow the connection down to see loading states, race conditions and double-submits.",
      body: `
<p>On your PC the app answers in milliseconds, so you never see what a customer on a weak mobile connection sees. DevTools can slow the network down on purpose:
in the Network panel, open the <strong>No throttling</strong> dropdown and pick <em>Fast 4G</em>, <em>Slow 4G</em> (called <em>Slow 3G</em> in older Chrome) or
<em>Offline</em>. You can also add a custom profile (for example 2,000 ms latency) under <em>Add…</em>.</p>

<h3>What to look for when it is slow</h3>
<ul>
<li><strong>Loading states</strong>: is there a spinner or a "Processing" message? Ice Bank's transfers and e-Transfers show a Processing state for 1 to 3 seconds anyway;
with throttling it lasts longer.</li>
<li><strong>Double submits</strong>: click Confirm twice quickly. Is the button disabled after the first click? If the UI sends two requests, do they share an
<code>Idempotency-Key</code> (one transfer) or not (two transfers)? Check the Network tab and the account history.</li>
<li><strong>Out-of-order responses</strong>: type quickly in a search box (biller search, transaction search). With latency, an older response can arrive after a newer
one and overwrite the right results.</li>
<li><strong>Timeouts and errors</strong>: go Offline in the middle of a flow. Does the UI show a clear message, and can the user retry safely?</li>
<li><strong>Disappearing toasts</strong>: Ice Bank's toasts hide after 4 seconds. With throttling the toast may appear late; does your Selenium wait still catch it?</li>
</ul>

<h3>Why this matters for Selenium</h3>
<p>Every flaky UI test is really a timing assumption that broke. Throttling turns hidden timing assumptions into visible failures. If your test passes at full speed but fails
on Slow 4G, it is relying on luck: replace <code>Thread.sleep</code> and implicit waits with explicit waits for the condition you actually need (the confirmation element
is visible, the Processing element is gone).</p>
<p>The <strong>Performance</strong> panel has a matching <em>CPU throttling</em> option (4× or 6× slowdown) for slow laptops. ChromeDriver can throttle the network from a test too,
through the Chrome DevTools Protocol.</p>`,
      examples: [
        {
          title: "Explicit wait for the end of the Processing state (Selenium 4)",
          lang: "java",
          code: `
WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));
driver.findElement(By.cssSelector("[data-testid='transfer-confirm-button']")).click();

wait.until(ExpectedConditions.invisibilityOfElementLocated(
    By.cssSelector("[data-testid='transfer-processing']")));
String amount = wait.until(ExpectedConditions.visibilityOfElementLocated(
    By.cssSelector("[data-testid='transfer-confirmation-amount']"))).getText();`,
        },
        {
          title: "Throttle the network from a ChromeDriver test (CDP)",
          lang: "java",
          code: `
ChromeDriver driver = new ChromeDriver();
DevTools devTools = driver.getDevTools();
devTools.createSession();
devTools.send(Network.enable(Optional.empty(), Optional.empty(), Optional.empty()));
devTools.send(Network.emulateNetworkConditions(
    false,          // offline
    1500,           // latency in ms
    50_000,         // download bytes/s
    20_000,         // upload bytes/s
    Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty()));`,
          note: "The <code>Network</code> class comes from the <code>org.openqa.selenium.devtools.vNNN</code> package matching your Chrome version, and the exact parameter list changes between versions. Let your IDE complete it.",
        },
      ],
      exercises: [
        "Set <em>Slow 4G</em> and make a transfer in the UI. Time the Processing state, and take a screenshot of each state you see from clicking Confirm to the confirmation.",
        "With a custom profile of 3,000 ms latency, double-click the transfer Confirm button. In the Network tab count the <code>POST /transfers</code> requests and compare their <code>Idempotency-Key</code> headers. How many transfers were created?",
        "Go Offline after the review step of a transfer and click Confirm. Describe what the user sees, then go back online and check whether a retry is safe.",
        "Run one of your Selenium tests with CPU throttling or network throttling and fix any wait that breaks.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "trace-ui-bug",
      title: "Tracing a UI bug to its API call",
      summary: "Decide quickly whether a bug lives in the UI, the API or the database, and report it with evidence.",
      body: `
<p>When the screen shows something wrong, the most useful thing a tester can add to the bug report is <em>where</em> it goes wrong. Each layer passes data to the next,
so you follow the data until it stops being correct:</p>
<p><strong>Database row → API response → UI display</strong> (for reads) and <strong>UI input → API request → API response → database row</strong> (for writes).</p>

<h3>The method</h3>
<ol>
<li><strong>Reproduce</strong> with DevTools open, Network on Fetch/XHR, Preserve log on.</li>
<li><strong>Find the call</strong> that delivers the wrong value (search the Network panel with <kbd>Ctrl</kbd>+<kbd>F</kbd> for the value you see on screen).</li>
<li><strong>Compare</strong> the response with the screen:
  <ul><li>The response is right and the screen is wrong → <strong>UI bug</strong> (formatting, calculation, sorting, filtering done in the browser).</li>
  <li>The response is already wrong → API or data. Check the row with SQL.</li></ul></li>
<li><strong>For writes</strong>, check the request payload: the UI may send the wrong value (UI bug) or the API may store it wrongly (API bug).</li>
<li><strong>Check the database</strong>: the row is right but the API returns it wrongly → <strong>API bug</strong>; the row itself is wrong → <strong>API/DB logic bug</strong>.</li>
<li><strong>Collect evidence</strong>: screenshot, the request and response (copy as cURL with tokens removed, or a HAR export), the <code>X-Request-Id</code>, the SQL query and
its result.</li>
</ol>

<h3>Ice Bank examples of each kind</h3>
<div class="table-wrap"><table>
<thead><tr><th>Symptom</th><th>Where to look</th></tr></thead>
<tbody>
<tr><td>Balance on the account page differs from the dashboard</td><td>Both screens call the API: compare <code>GET /accounts</code> with <code>GET /accounts/{id}</code> in the Network tab, then <code>accounts.balance</code> in SQL.</td></tr>
<tr><td>A transaction appears on two pages, or is missing, while paging</td><td>Check the <code>page</code>/<code>size</code>/<code>sort</code> parameters the UI sends and compare the ids returned with a SQL query in the same order.</td></tr>
<tr><td>Search finds nothing for a word you can see on screen</td><td>Look at the <code>q</code> parameter actually sent (encoding, trimming, case) and at the response's <code>totalElements</code>.</td></tr>
<tr><td>An error message on screen does not match what went wrong</td><td>Compare the screen text with the response's <code>status</code>, <code>code</code> and <code>detail</code>.</td></tr>
<tr><td>Minimum payment on the credit card looks wrong</td><td><code>GET /accounts/3</code> returns <code>minimumPayment</code>; recompute it from the rule (greater of $10 or 3% of the balance owed) and compare with the screen.</td></tr>
</tbody></table></div>
<p>Use the same method for every UI bug you hunt on QA.</p>

<h3>HAR files</h3>
<p>Right-click in the Network panel → <strong>Save all as HAR with content</strong> exports the whole session (requests, responses, timings) as one file a developer can load into
their own DevTools. It contains cookies and tokens: sign out first (which revokes them) or edit them out before attaching.</p>`,
      examples: [
        {
          title: "Console: recompute the dashboard total from the API",
          lang: "javascript",
          code: `
const accounts = await (await fetch("/api/v1/accounts")).json();
const cents = accounts.reduce((sum, a) => sum + Math.round(parseFloat(a.balance) * 100), 0);
console.log("Sum of balances from the API:", (cents / 100).toFixed(2));
console.log("Shown on the dashboard:", document.querySelector('[data-testid="dashboard-net-total"]')?.textContent);`,
          note: "Summing in integer cents avoids floating-point surprises. In Java you would use <code>BigDecimal</code>.",
        },
        {
          title: "SQL: the database's view of the same total (Emma)",
          lang: "sql",
          code: `
SELECT sum(balance) AS net_total
FROM accounts
WHERE sandbox_id = 1
  AND customer_id = 1
  AND status <> 'CLOSED';`,
        },
        {
          title: "A bug report skeleton with layer evidence",
          lang: "text",
          code: `
Title:    Credit card page shows available credit rounded to whole dollars
Env:      QA, sandbox 2, Chrome 130, persona emma.tremblay+s2@icebank.test
Steps:    1. Sign in  2. Open the credit card account (id 3)
Expected: Available credit $4,804.65 (= GET /api/v1/accounts/3 availableCredit)
Actual:   Page shows $4,805
Layer:    UI. GET /api/v1/accounts/3 returns "4804.65" (attached);
          SQL credit_limit + balance agrees with the API (query attached).
Evidence: screenshot, response JSON, X-Request-Id 3f0c..., SQL result`,
          note: "Numbers here are illustrative; use the values you actually observe.",
        },
      ],
      exercises: [
        "Recompute Emma's dashboard total three ways: from the screen, from <code>GET /api/v1/accounts</code> in the Console, and with SQL. Write down all three and whether they agree on local.",
        "On an account page, sort by amount and filter by a date range. For each action, find the request and decide whether the sorting/filtering is done by the API or by the browser.",
        "Pick any screen that shows a list (transactions, payees, notifications). Write a short trace: which API call feeds it, which table the data comes from, and one bug that could appear at each layer.",
        "On QA, find one UI bug, trace it to its layer with the method above, and write the report using the skeleton. Attach a HAR file with tokens removed.",
      ],
    },
  ],
});
