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
the ids change on every load, so you need relative XPath like "the amount cell in the row whose description contains X".</p>

<h3>Worked example: one cell, from Inspect to a proven locator</h3>
<p>Goal: the <em>balance after</em> of Emma's e-Transfer to Marc Dupont, on her chequing account page (<code>/accounts/1</code>).</p>
<ol>
<li><strong>Inspect.</strong> Right-click the balance in that row → <em>Inspect</em>. The Elements panel shows something like
<code>&lt;tr data-testid="transaction-row-19930"&gt;</code> with cells <code>transaction-date</code>, <code>transaction-description</code>, …, <code>transaction-balance</code>.</li>
<li><strong>Notice what is unique.</strong> <code>transaction-balance</code> appears once <em>per row</em> (20 times on the page), so on its own it matches 20 elements. The row's test id
contains the transaction id, so it is unique.</li>
<li><strong>Combine and test.</strong> <code>$$('[data-testid="transaction-row-19930"] [data-testid="transaction-balance"]').length</code> → <code>1</code>, text <code>$8,422.49</code>.</li>
<li><strong>Ask whether it will survive.</strong> It only works while row 19930 is on the current page. If the test does not know the id, anchor on the text instead:
<code>//*[@data-testid='transaction-description'][contains(., 'Marc Dupont')]/ancestor::tr//*[@data-testid='transaction-balance']</code>.</li>
<li><strong>Check the text assumption.</strong> The description cell also holds the reference in a small line underneath (its text is
<code>Interac e-Transfer to Marc DupontETR-S0018996</code>), so an exact match like <code>[normalize-space()='Interac e-Transfer to Marc Dupont']</code> finds
<strong>0</strong> elements. <code>contains()</code> finds the row.</li>
</ol>

<h3>The locator quality ladder</h3>
<div class="table-wrap"><table>
<thead><tr><th>Prefer</th><th>Example</th><th>Why</th></tr></thead>
<tbody>
<tr><td>1. Test id</td><td><code>[data-testid="transfer-amount-input"]</code></td><td>Made for tests; developers promise to keep it.</td></tr>
<tr><td>2. Test id + structure</td><td><code>[data-testid="transactions-table"] tbody tr</code></td><td>Still anchored on a promise, with a short, meaningful path.</td></tr>
<tr><td>3. Accessible name / label / visible text</td><td><code>//button[normalize-space()='Sign in']</code></td><td>What the user sees; breaks when copy or language changes.</td></tr>
<tr><td>4. Relative XPath from a stable anchor</td><td><code>//td[contains(.,'Marc')]/ancestor::tr//td[6]</code></td><td>Needed in Classic view; fragile if columns move.</td></tr>
<tr><td>Avoid</td><td><code>/html/body/div[2]/main/div/div[3]/table/tbody/tr[3]/td[6]</code>, <code>.text-right.tabular-nums</code></td><td>Absolute paths and styling classes change for reasons that have nothing to do with behaviour.</td></tr>
</tbody></table></div>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Using <em>Copy → Copy full XPath</em>. It records the exact path from <code>&lt;html&gt;</code>, which breaks with the next layout change.</li>
<li>Building locators on CSS classes like <code>text-right</code> or <code>bg-success-bg</code>: they describe looks, not meaning, and are shared by many elements.</li>
<li>Exact text matches on cells that contain more than you can see at a glance (the reference line in the description cell).</li>
<li>Matching elements that are in the DOM but hidden. The top menu's <code>nav-link-*</code> links exist before you hover; <code>$$</code> finds them, but Selenium cannot click them until the menu is open.</li>
<li>Testing a locator inside an <code>iframe</code> from the main page. The loan calculator on <code>/loans</code> lives in <code>loan-calculator-iframe</code>; pick that frame in the Console's
context dropdown (top-left, "top") first, and in Selenium <code>switchTo().frame(...)</code>.</li>
<li>Checking a locator before the page has finished loading its data, getting 0, and "fixing" a locator that was right.</li>
</ul></div>`,
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
        {
          title: "Console: test-id census of the current page (which ids repeat?)",
          lang: "javascript",
          code: `
const counts = {};
document.querySelectorAll("[data-testid]").forEach(e => {
  counts[e.dataset.testid] = (counts[e.dataset.testid] || 0) + 1;
});
console.table(Object.entries(counts).map(([testid, n]) => ({ testid, n })));`,
          note: "On an account page every <code>transaction-*</code> cell id appears once per row, while <code>transaction-row-…</code> ids are unique because they contain the transaction id.",
        },
        {
          title: "Console: is it there, and is it visible?",
          lang: "javascript",
          code: `
$$('[data-testid^="nav-link-"]').map(e => [e.dataset.testid, e.checkVisibility()])
// [["nav-link-dashboard", false], ["nav-link-statements", false], ...]  until you hover a menu`,
          note: "<code>checkVisibility()</code> is a browser method: <code>false</code> means the element exists but a user could not see or click it.",
        },
        {
          title: "Console: one cell by row id, and the same cell by row text",
          lang: "javascript",
          code: `
$$('[data-testid="transaction-row-19930"] [data-testid="transaction-balance"]')
  .map(e => e.textContent)                                   // ["$8,422.49"]

$x("//*[@data-testid='transaction-description'][contains(., 'Marc Dupont')]/ancestor::tr//*[@data-testid='transaction-balance']")
  .map(e => e.textContent)                                   // ["$8,422.49"]`,
          note: "Values are from a fresh reset on Emma's chequing page; yours may differ after you have made transfers.",
        },
      ],
      exercises: [
        "On the login page, find the <code>data-testid</code> of every input, button and link (use the <code>$$('[data-testid]')</code> trick). Write them into a <code>LoginPage</code> page object with <code>By</code> fields.",
        "On Emma's chequing account page, write a CSS selector and an XPath for: the balance, the CSV download button, the third row of the table, and the amount of the newest coffee purchase. Prove each matches exactly what you intended with <code>$$</code> or <code>$x</code>.",
        "Write an XPath that selects the <em>row</em> of a transaction by its description text, and from there the date cell. Explain why this pattern survives sorting and paging better than <code>tr[3]</code>.",
        "Turn on Classic view in Profile (if your build has it) and locate the dashboard's chequing balance without any <code>data-testid</code>. Reload twice and check your locator still works.",
        "Run the test-id census on the dashboard and on Emma's chequing account page. List the test ids that appear more than once on each page and explain why, and list the ids that contain a runtime value (such as an account or transaction id). For one of those, write a Java method <code>By transactionRow(long id)</code> and say when a test would know the id.",
      ],
      quiz: [
        {
          q: `<code>$$('[data-testid="transaction-amount"]').length</code> returns 20 on an account page. What happens if you use that selector with <code>driver.findElement</code>?`,
          options: [`Selenium throws because the match is not unique`, `Selenium returns all 20`, `Selenium picks one at random`, `Selenium silently uses the first match, the newest row`],
          answer: 3,
          explain: `<code>findElement</code> returns the first element in document order and never complains about duplicates. That is how tests end up reading or clicking the wrong thing; make single-element locators unique.`,
        },
        {
          q: `Which locator is the most robust for the transfer amount field?`,
          options: [`<code>/html/body/div[2]/main/form/div[3]/input</code>`, `<code>[data-testid="transfer-amount-input"]</code>`, `<code>input.w-full.rounded</code>`, `<code>(//input)[3]</code>`],
          answer: 1,
          explain: `The test id exists only for tests and is part of Ice Bank's locator contract. The others depend on layout, styling or position.`,
        },
        {
          q: `<code>//*[@data-testid='transaction-description'][normalize-space()='Interac e-Transfer to Marc Dupont']</code> finds 0 elements, but you can see that text. Why?`,
          options: [`XPath cannot match text`, `The cell contains more text than that (the reference line underneath), so an exact match fails; use <code>contains()</code>`, `The page has not loaded`, `normalize-space only works on buttons`],
          answer: 1,
          explain: `<code>normalize-space()</code> compares the whole text of the element, including child elements. Here it also includes the reference id, so only <code>contains(., 'Marc Dupont')</code> matches.`,
        },
        {
          q: `On <code>/loans</code>, <code>$$('[data-testid="calc-amount-input"]')</code> in the Console returns an empty array, but the field is on screen. What is the likely reason?`,
          options: [`The test id is misspelled in the app`, `The field is disabled`, `$$ only works with ids`, `The calculator is inside an iframe, and the Console is running in the top page`],
          answer: 3,
          explain: `Each iframe is a separate document. Switch the Console's context dropdown to the iframe (or <code>switchTo().frame()</code> in Selenium) before searching inside it.`,
        },
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
</ul>

<h3>Worked example: what loading one account page really costs</h3>
<p>Open Emma's chequing page with Network on <em>Fetch/XHR</em> and the filter <code>api/v1</code>, then reload. You will see these calls (every one of them is an endpoint you
know from Swagger):</p>
<div class="table-wrap"><table>
<thead><tr><th>Call</th><th>What it feeds on screen</th></tr></thead>
<tbody>
<tr><td><code>GET /api/v1/me</code></td><td>The name in the user menu; also proves the session is still valid</td></tr>
<tr><td><code>GET /api/v1/notifications?size=1</code></td><td>The unread badge on the bell (<code>unreadCount</code>)</td></tr>
<tr><td><code>GET /api/v1/accounts/1</code></td><td>The balance card: title, balance, available, rate</td></tr>
<tr><td><code>GET /api/v1/accounts/1/transactions?page=0&amp;size=20&amp;sort=createdAt,desc</code></td><td>The table and the pagination summary</td></tr>
</tbody></table></div>
<p>Click the transactions call and walk the tabs: <strong>Headers</strong> (status 200, <code>x-request-id</code>, <code>cache-control: no-store</code>; in the request headers the
<code>Cookie</code> with <code>ib_at</code>), <strong>Payload</strong> (the three query parameters, already split out for you), <strong>Response</strong> (the raw JSON, with
<code>"amount":"2337.00"</code> as a string) and <strong>Timing</strong>. Change the page size in the UI and a new call appears with <code>size=50</code>: that is how you learn which
UI control maps to which parameter.</p>

<div class="callout"><p><strong>Why does every call appear twice?</strong> Locally the app runs with <code>npm run dev</code>, and React's development mode deliberately runs each
data-loading effect twice to expose bugs. So each <code>GET</code> shows up two times. That is expected in development and does not happen with <code>npm start</code> or on QA.
Two identical <em>POSTs</em> from one click are a different story: that is worth investigating.</p></div>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Opening DevTools <em>after</em> doing the action. Only requests made while it is open are recorded; reload or repeat the action.</li>
<li>Forgetting <em>Preserve log</em>, then losing the sign-in calls when the page redirects to the dashboard.</li>
<li>Leaving a filter (<code>method:POST</code>, a search word) in place from last time and concluding "the page makes no calls".</li>
<li>Reading <em>Preview</em> (a pretty tree) when the question is about the exact format. <em>Response</em> shows the real text, quotes and all.</li>
<li>Looking for <code>X-Request-Id</code> under <em>Request Headers</em>. Unless you send one yourself, it is in the <em>Response Headers</em>.</li>
<li>Reporting the duplicate GETs of development mode as a bug.</li>
</ul></div>`,
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
        {
          title: "Console: list the API calls this page has made, with durations",
          lang: "javascript",
          code: `
console.table(
  performance.getEntriesByType("resource")
    .filter(e => e.name.includes("/api/v1/"))
    .map(e => ({ url: e.name.replace(location.origin, ""), ms: Math.round(e.duration) }))
);`,
          note: "The browser's Resource Timing list survives even when the Network panel was closed, as long as you did not reload. It has no status codes; the Network panel does.",
        },
        {
          title: "Summarise a saved HAR file (Node)",
          lang: "javascript",
          code: `
// Save as har-summary.mjs and run: node har-summary.mjs icebank.har
import { readFileSync } from "node:fs";
const har = JSON.parse(readFileSync(process.argv[2], "utf8"));
const rows = har.log.entries
  .filter(e => e.request.url.includes("/api/v1/"))
  .map(e => ({
    method: e.request.method,
    path: new URL(e.request.url).pathname + new URL(e.request.url).search,
    status: e.response.status,
    ms: Math.round(e.time),
    requestId: (e.response.headers.find(h => h.name.toLowerCase() === "x-request-id") || {}).value,
  }));
console.table(rows);`,
          note: "Export the HAR with right-click → <em>Save all as HAR</em>. A HAR contains cookies and tokens: sign out before you share one.",
        },
      ],
      exercises: [
        "With Preserve log and Fetch/XHR on, sign in as Emma. List every API call from the login page to the dashboard with method, path and status.",
        "Make a $1.00 transfer from chequing to savings in the UI. Find the <code>POST /api/v1/transfers</code> call and record: the request body, the <code>Idempotency-Key</code>, the status, the <code>Location</code> header and the <code>X-Request-Id</code>.",
        "On the account page, apply a date filter and a text search. Find the request and check that the query parameters match what you typed, including the date format.",
        "Try a transfer bigger than your balance in the UI. Compare the error the screen shows with the <code>detail</code> and <code>code</code> in the response. Are they consistent?",
        "On Emma's chequing page, reload with the Network panel closed, then open the Console and run the Resource Timing snippet. List each API call with its duration, point out the duplicates and explain them, and name the slowest call. Then change the page size in the UI and run the snippet again: which new call appeared, and which query parameter changed?",
      ],
      quiz: [
        {
          q: `You sign in and land on the dashboard, but the Network panel shows no <code>/auth/login</code> call. What was probably missing?`,
          options: [`Disable cache`, `A slower network`, `The Fetch/XHR filter`, `Preserve log: the redirect to the dashboard cleared the list`],
          answer: 3,
          explain: `Without Preserve log, each navigation clears the panel. Turn it on before signing in to keep the whole flow.`,
        },
        {
          q: `Where do you check which JSON body the UI sent with a transfer?`,
          options: [`Payload`, `Response`, `Timing`, `Initiator`],
          answer: 0,
          explain: `Payload shows the request's query parameters and body. Response shows what the server answered.`,
        },
        {
          q: `Locally, every <code>GET</code> on the account page appears twice. What is the most likely explanation?`,
          options: [`A double-submit bug`, `The browser retries every request`, `React's development mode runs data-loading effects twice; it does not happen with <code>npm start</code> or on QA`, `The API returns 304 first`],
          answer: 2,
          explain: `The local dev server runs React in development mode, which double-invokes effects on purpose. Compare with a production build before reporting duplicates, and treat duplicate POSTs separately.`,
        },
        {
          q: `Which filter shows everything that did <em>not</em> return 200?`,
          options: [`<code>status-code:!200</code>`, `<code>not 200</code>`, `<code>-status-code:200</code>`, `<code>status-code:4xx</code>`],
          answer: 2,
          explain: `A leading minus negates a filter in the Network panel. It is a quick way to spot redirects, 4xx and 5xx at once.`,
        },
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
to test the replay.</p>

<h3>Worked example: trimming a copied request, header by header</h3>
<p>Take the copied transfer from the first example and decide for each header whether the server needs it:</p>
<div class="table-wrap"><table>
<thead><tr><th>Header</th><th>Keep?</th><th>Why</th></tr></thead>
<tbody>
<tr><td><code>content-type: application/json</code></td><td>Keep</td><td>Without it the JSON body is refused with 415.</td></tr>
<tr><td><code>cookie: ib_at=…; ib_rt=…</code></td><td>Replace</td><td>Only <code>ib_at</code> matters. Swap it for <code>Authorization: Bearer $TOKEN</code>, which is what your tests will send.</td></tr>
<tr><td><code>idempotency-key: 8a4f…</code></td><td>Keep, then decide</td><td>Required on money POSTs. Same value = replay of the UI's transfer; new value = a new transfer.</td></tr>
<tr><td><code>accept: application/json</code></td><td>Optional</td><td>Ice Bank answers JSON anyway.</td></tr>
<tr><td><code>origin</code>, <code>referer</code></td><td>Drop</td><td>Browser context; the API does not use them.</td></tr>
<tr><td><code>sec-ch-ua*</code>, <code>sec-fetch-*</code>, <code>user-agent</code>, <code>accept-language</code></td><td>Drop</td><td>Browser fingerprints and preferences.</td></tr>
</tbody></table></div>
<p>The rule of thumb: remove one header, replay, and keep going while the status stays the same. What is left is the request's real contract, and it maps line by line
to REST Assured: <code>.contentType(...)</code>, <code>.auth().oauth2(token)</code>, <code>.header("Idempotency-Key", ...)</code>, <code>.body(...)</code>.</p>

<pre role="img" aria-label="Workflow: UI action, Network panel, Copy as cURL, trim, parametrise, REST Assured test" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 UI action ─► Network row ─► Copy as cURL (bash) ─► trim headers ─► replace cookie with $TOKEN
          ─► vary one thing per run (amount, account, key) ─► REST Assured test in the framework
</pre>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Pasting a bash-style copy into PowerShell or cmd, and fighting quoting errors. Use Git Bash, or the matching <em>Copy as</em> variant.</li>
<li>Replaying a money POST with the UI's own <code>Idempotency-Key</code> and expecting a second transfer. You get the first response replayed.</li>
<li>Replaying a copy from an hour ago: the access token in the cookie expired after 15 minutes, so every call answers 401 <code>INVALID_TOKEN</code>.</li>
<li>Putting a body with <code>!</code> inside <em>double</em> quotes in bash: history expansion may mangle it. DevTools uses single quotes for a reason.</li>
<li>Forgetting <code>-i</code> (or <code>-w "%{http_code}"</code>) and judging success from the body alone.</li>
<li>Sharing the copied command with the cookie still in it.</li>
</ul></div>`,
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
        {
          title: "Copy as fetch: replay it in the Console, then change it",
          lang: "javascript",
          code: `
// Right-click the transactions call → Copy → Copy as fetch, paste, then edit size=20 to size=3:
const r = await fetch("http://localhost:3000/api/v1/accounts/1/transactions?page=0&size=3&sort=createdAt,desc", {
  headers: { accept: "application/json" },
  method: "GET",
  credentials: "include",          // send the page's cookies (ib_at) like the UI does
});
console.log(r.status, (await r.json()).content.map(t => t.id));`,
          note: "Handy for read-only experiments: no token handling, because the browser adds the session cookie.",
        },
        {
          title: "Replay and print only status and time",
          lang: "bash",
          code: `
curl -s -o /dev/null -w "%{http_code} in %{time_total}s\\n" \\
  "http://localhost:3000/api/v1/accounts/1/transactions?size=20" \\
  -H "Authorization: Bearer $TOKEN"
# 200 in 0.045s`,
        },
      ],
      exercises: [
        "Copy the <code>GET /api/v1/accounts</code> request from the dashboard as cURL (bash) and run it in Git Bash. Then remove headers one by one until only what is needed remains. Which header is essential?",
        "Copy a transfer request, replace the cookie with an <code>Authorization: Bearer</code> header, and replay it twice with the same <code>Idempotency-Key</code>. Confirm only one transfer exists (in the UI or the database).",
        "Edit the copied transfer to make three negative tests: 3 decimal places, an account you do not own, and no <code>Idempotency-Key</code>. Record each status and <code>code</code>.",
        "Translate your minimal curl into a REST Assured test in your framework, and commit it.",
        "On Emma's account page, use <em>Copy as fetch</em> on the transactions call and run it in the Console with <code>size=3</code>. Record the three ids. Then change <code>sort=createdAt,desc</code> to <code>sort=amount,desc</code> and to <code>sort=balance,desc</code>, and record what you get each time (status, and ids or the error field and message).",
      ],
      quiz: [
        {
          q: `You trim a copied <code>GET /api/v1/accounts</code> down to the URL alone and get 401. Which header did you remove that the server needs?`,
          options: [`<code>user-agent</code>`, `<code>accept-language</code>`, `The <code>cookie</code> with <code>ib_at</code> (or an <code>Authorization: Bearer</code> header instead)`, `<code>referer</code>`],
          answer: 2,
          explain: `Identity is the only thing a GET needs here. The browser sent it as the <code>ib_at</code> cookie; your tests send the same token as a Bearer header.`,
        },
        {
          q: `You replay a copied transfer twice without changing the <code>Idempotency-Key</code>. How many new transfers are created?`,
          options: [`None: both replays return the UI's original response`, `Two`, `One`, `It fails with 400`],
          answer: 0,
          explain: `The UI already used that key, so the server has a stored response for it. Same key + same body replays; change the key to create a new transfer.`,
        },
        {
          q: `A colleague asks you to post the copied curl in the team chat. What do you do first?`,
          options: [`Nothing, it is just a command`, `Shorten it with a URL shortener`, `Change the URL to QA`, `Remove the cookie (ib_at, ib_rt) or sign out so the tokens are revoked`],
          answer: 3,
          explain: `The cookie is a live session. The refresh token lasts 7 days, so anyone with the command could act as you.`,
        },
        {
          q: `Why paste "Copy as cURL (bash)" into Git Bash rather than PowerShell?`,
          options: [`PowerShell is slower`, `In PowerShell <code>curl</code> is an alias for Invoke-WebRequest, and bash quoting and line continuations do not work there`, `Git Bash adds the token automatically`, `PowerShell cannot send JSON`],
          answer: 1,
          explain: `The bash variant uses single quotes and backslash line endings. Use Git Bash, call <code>curl.exe</code> explicitly, or pick the PowerShell variant of Copy as.`,
        },
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
<code>goog:loggingPrefs</code> capability and read <code>driver.manage().logs().get(LogType.BROWSER)</code> after each test.</p>

<h3>Worked example: reading a Console line</h3>
<p>Signed in as Emma, run <code>await fetch("/api/v1/accounts/999999")</code> in the Console. Chrome prints a red line similar to:</p>
<p><code>GET http://localhost:3000/api/v1/accounts/999999 404 (Not Found)</code> <span class="hint">… VM123:1</span></p>
<ol>
<li><strong>Method and URL</strong>: which call failed.</li>
<li><strong>Status</strong>: 404. There is no account 999999, so this is the <em>correct</em> answer: the red line is expected, not a bug.</li>
<li><strong>The link on the right</strong> (<code>VM123:1</code> for code you typed, a file and line for page code): click it to see which code made the call.</li>
<li>Expand the line (or open the request in the Network panel) to see the response body and its <code>code</code>.</li>
</ol>
<p>Red only means "4xx or 5xx". Your job is to decide whether that status was the right answer, exactly as in Tutorial 2.</p>

<h3>What you will see in Ice Bank, and what it means</h3>
<div class="table-wrap"><table>
<thead><tr><th>Message</th><th>Level</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><em>Download the React DevTools for a better development experience</em></td><td>Info</td><td>The app runs in development mode. Ignore.</td></tr>
<tr><td><code>[HMR] connected</code>, <code>[Fast Refresh] rebuilding</code> / <code>done</code></td><td>Log</td><td>The dev server's live reload. Ignore.</td></tr>
<tr><td><code>GET …/api/v1/… 4xx</code> after an action you did on purpose (a refused transfer)</td><td>Error</td><td>Expected if the status is the documented one; compare with the screen message.</td></tr>
<tr><td><code>Uncaught TypeError: …</code> or <code>Unhandled Runtime Error</code></td><td>Error</td><td>The page's code crashed. Always a bug candidate: note the page, the action and the stack.</td></tr>
<tr><td>Any <code>5xx</code></td><td>Error</td><td>Always a bug. Copy the <code>X-Request-Id</code> from the Network panel.</td></tr>
</tbody></table></div>

<h3>Console helpers worth knowing</h3>
<ul>
<li><code>$0</code>: the element currently selected in the Elements panel (<code>$0.dataset.testid</code>, <code>$0.textContent</code>).</li>
<li><code>copy(value)</code>: puts any value on the clipboard (objects become JSON). Great for pasting a response into a bug report.</li>
<li><code>await</code> works at the top level of the Console, so <code>await (await fetch(url)).json()</code> just works.</li>
<li><code>console.table(array, ["col1", "col2"])</code>: a readable table of selected columns.</li>
</ul>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Clicking "Clear console" and then forgetting to reproduce: the evidence is gone.</li>
<li>Leaving the level on <em>Errors only</em> or a text filter in place, and missing warnings.</li>
<li>Reporting the development-mode info and HMR logs as bugs.</li>
<li>Running a snippet in the wrong context (an iframe, or another tab's DevTools).</li>
<li>Assuming no red line means no problem: a wrong value on screen with a clean Console is still a bug (lesson 7 traces it).</li>
</ul></div>`,
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
        {
          title: "Log every fetch the page makes from now on (until the next full reload)",
          lang: "javascript",
          code: `
const realFetch = window.fetch;
window.fetch = async (...args) => {
  const res = await realFetch(...args);
  const req = args[0] instanceof Request ? args[0] : null;
  const url = req ? req.url : String(args[0]);
  const method = (args[1] && args[1].method) || (req && req.method) || "GET";
  if (url.includes("/api/v1/")) console.log("[fetch]", method, url, res.status);
  return res;
};`,
          note: "Navigate with the app's own links and menus afterwards (they do not reload the page), and every API call is logged with its status. A full reload removes the logger.",
        },
        {
          title: "copy() and $0: from the page to your bug report",
          lang: "javascript",
          code: `
// 1. Select an element in the Elements panel, then:
$0.dataset.testid           // e.g. "account-detail-available-credit"
$0.textContent              // e.g. "$4,804.65"

// 2. Put an API response on the clipboard as formatted JSON:
copy(await (await fetch("/api/v1/accounts/3")).json())`,
        },
      ],
      exercises: [
        "Keep the Console open with Preserve log and walk through: sign in, dashboard, an account page, a transfer, sign out. Record every red line with the page it appeared on, and decide for each whether it is expected or a bug candidate.",
        "Signed in as Emma, use <code>fetch</code> in the Console to print her accounts with <code>console.table</code>. Then fetch <code>/api/v1/accounts/5</code> and print the status, the <code>X-Request-Id</code> and the body.",
        "Sign out, then run the same <code>fetch('/api/v1/accounts')</code> in the Console. Record the status and explain why it changed.",
        "Add browser-log collection to one of your Selenium tests and make it print any SEVERE entries at the end of the test.",
        "Paste the fetch logger into the Console on the dashboard, then use only the app's menus and links to open the chequing account page, the Transfer page and the notifications page. Copy the <code>[fetch]</code> lines into your notes and, for each page, name the API calls that feed it. What happens to the logger if you press F5, and why?",
      ],
      quiz: [
        {
          q: `Signed in as Emma, the Console shows <code>GET …/api/v1/accounts/5 404 (Not Found)</code> after you fetched it yourself. Is it a bug?`,
          options: [`Yes, every red line is a bug`, `No: account 5 is Liam's, and 404 is Ice Bank's correct answer for another customer's resource`, `Yes, it should be 403`, `It cannot be decided`],
          answer: 1,
          explain: `Red means 4xx/5xx, not "wrong". Decide against the contract: other customers' resources are 404 by design.`,
        },
        {
          q: `Locally the Console shows <em>Download the React DevTools…</em> and <code>[HMR] connected</code>. What should you do?`,
          options: [`Report both as bugs`, `Ignore them: they come from the development server and React's development build`, `Install React DevTools to make the test pass`, `Restart the app`],
          answer: 1,
          explain: `They are informational messages of <code>npm run dev</code>. Note real errors (uncaught exceptions, unexpected 4xx, any 5xx) instead.`,
        },
        {
          q: `Why does <code>fetch("/api/v1/accounts")</code> typed in the Console come back with Emma's accounts, without any token?`,
          options: [`The Console has admin rights`, `DevTools caches the token`, `The API does not check tokens for GET`, `The request runs in the page with the page's cookies, so the browser sends the HttpOnly <code>ib_at</code> cookie automatically`],
          answer: 3,
          explain: `JavaScript cannot read an HttpOnly cookie, but the browser still attaches it to same-site requests. The API accepts either the cookie or a Bearer header.`,
        },
        {
          q: `What does <code>$0</code> refer to in the Console?`,
          options: [`The element currently selected in the Elements panel`, `The first element on the page`, `The last command's result`, `The first iframe`],
          answer: 0,
          explain: `<code>$0</code> is the selected element (<code>$1</code> the one before). Combined with <code>$0.dataset.testid</code> it is a quick way to read an element's test id.`,
        },
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
<p>Use <em>Clear site data</em> (Application → Storage) to start from a clean browser, which is what Selenium does with a fresh profile.</p>

<h3>Where can a site keep data?</h3>
<div class="table-wrap"><table>
<thead><tr><th></th><th>Cookie</th><th>localStorage</th><th>sessionStorage</th></tr></thead>
<tbody>
<tr><td>Sent to the server automatically</td><td>Yes, on every matching request</td><td>No</td><td>No</td></tr>
<tr><td>Readable by page JavaScript</td><td>Only without <code>HttpOnly</code></td><td>Yes</td><td>Yes</td></tr>
<tr><td>Lifetime</td><td><code>Expires</code>/<code>Max-Age</code>, or until the browser closes</td><td>Until deleted</td><td>Until the tab closes</td></tr>
<tr><td>Ice Bank uses it for</td><td>The session: <code>ib_at</code>, <code>ib_rt</code></td><td>Optional idle-timeout overrides for practice (below)</td><td>Nothing</td></tr>
</tbody></table></div>
<p>Storage belongs to an <em>origin</em> (scheme + host + port). <code>http://localhost:3000</code> (Ice Bank) and <code>http://localhost:4000</code> (this tutorial site) are different origins,
so each has its own localStorage, which is why your ticks here never mix with the bank's data.</p>

<h3>Worked example: decoding a JWT part by hand</h3>
<p>The decode snippet in the examples is one dense line. Here is what it does, on the <em>header</em> part of any Ice Bank access token
(<code>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9</code>, the text before the first dot):</p>
<div class="table-wrap"><table>
<thead><tr><th>Step</th><th>Code</th><th>Result</th></tr></thead>
<tbody>
<tr><td>1. Take the part you want (0 = header, 1 = payload, 2 = signature)</td><td><code>token.split(".")[0]</code></td><td><code>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9</code></td></tr>
<tr><td>2. Base64URL → Base64: <code>-</code> becomes <code>+</code>, <code>_</code> becomes <code>/</code></td><td><code>.replace(/-/g, "+").replace(/_/g, "/")</code></td><td>(unchanged here: this part has neither)</td></tr>
<tr><td>3. Add <code>=</code> padding up to a multiple of 4 characters</td><td><code>.padEnd(...)</code></td><td>36 characters, already a multiple of 4</td></tr>
<tr><td>4. Decode Base64 to text</td><td><code>atob(...)</code></td><td><code>{"alg":"HS256","typ":"JWT"}</code></td></tr>
<tr><td>5. Parse the text as JSON</td><td><code>JSON.parse(...)</code></td><td>An object you can read: <code>alg</code> = HS256</td></tr>
</tbody></table></div>
<p>The payload goes through exactly the same steps and usually <em>does</em> need steps 2 and 3. The signature part decodes to binary noise: it is not meant to be read, only checked
by the server with its secret key.</p>

<h3>Practise the session-timeout modal without waiting 9 minutes</h3>
<p>Ice Bank reads two optional localStorage keys on its own origin: <code>icebank-idle-warning-seconds</code> and <code>icebank-idle-logout-seconds</code>. Set them in the Console on
<code>localhost:3000</code> and reload; the <code>session-timeout-modal</code> then appears after the warning time, and if you do nothing you are signed out at the logout time and land
on <code>/login?timeout=1</code>. Remove the keys afterwards so normal timing returns.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Concluding "there are no cookies" because <code>document.cookie</code> is empty. HttpOnly cookies are hidden from scripts, not from DevTools.</li>
<li>Decoding with plain <code>atob()</code> on the raw part: Base64URL uses <code>-</code> and <code>_</code> and drops the <code>=</code> padding, so convert first.</li>
<li>Editing the payload of <code>ib_at</code> and expecting to become an admin. The signature no longer matches; the honest result is 401 and being signed out.</li>
<li>Setting the idle-timeout keys in the tutorial site's tab (<code>localhost:4000</code>). They only work on the bank's origin, <code>localhost:3000</code>.</li>
<li>Using <em>Clear site data</em> on the wrong origin and wiping this site's progress. Export your progress first.</li>
</ul></div>`,
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
        {
          title: "Console on localhost:3000: shorten the idle timeout for practice, then undo it",
          lang: "javascript",
          code: `
localStorage.setItem("icebank-idle-warning-seconds", "20");   // modal after 20 s of no activity
localStorage.setItem("icebank-idle-logout-seconds", "40");    // signed out after 40 s
location.reload();

// ...when you are done:
localStorage.removeItem("icebank-idle-warning-seconds");
localStorage.removeItem("icebank-idle-logout-seconds");`,
        },
        {
          title: "Console: everything this origin keeps in script-readable storage",
          lang: "javascript",
          code: `
console.table(Object.entries(localStorage).map(([key, value]) => ({ store: "local", key, value })));
console.table(Object.entries(sessionStorage).map(([key, value]) => ({ store: "session", key, value })));
document.cookie   // non-HttpOnly cookies only (empty for Ice Bank)`,
        },
        {
          title: "Check the session cookie's flags from a Selenium test (Java)",
          lang: "java",
          code: `
Cookie at = driver.manage().getCookieNamed("ib_at");
assertNotNull(at, "signed in, so the access-token cookie must exist");
assertTrue(at.isHttpOnly(), "ib_at must not be readable by page JavaScript");
assertEquals("Lax", at.getSameSite());
assertEquals("/", at.getPath());
// assertTrue(at.isSecure());   // expect this on an https environment, not on http://localhost`,
        },
      ],
      exercises: [
        "Sign in to the UI and record, for <code>ib_at</code> and <code>ib_rt</code>: expiry, HttpOnly, Secure, SameSite and path. Which of these would you flag in a production security review?",
        "Decode the payload of your <code>ib_at</code> cookie in the Console. Check <code>sub</code>, <code>cid</code>, <code>role</code> and the expiry time, and compare <code>sub</code> with <code>users.id</code> for Emma in the database.",
        "Delete <code>ib_at</code> only (keep <code>ib_rt</code>) and reload the dashboard. Then delete both and reload. Describe what the UI does in each case and which API calls you see in the Network tab.",
        "Open this tutorial site's Application tab, find <code>icebank-tutorials-v1</code>, tick an exercise and watch the value change. Then use <em>Export progress</em> and compare the file with the stored JSON.",
        "On <code>localhost:3000</code>, set the idle-timeout keys to 20 and 40 seconds and reload the dashboard. Without touching anything, record when the modal appears, its test ids (modal, countdown, both buttons) and its text. Click <em>Stay signed in</em> and see what happens; then let it time out and record the URL, the notice on the login page and what is left in the cookie table. Remove the keys at the end.",
      ],
      quiz: [
        {
          q: `<code>document.cookie</code> returns an empty string while you are signed in to Ice Bank. Why?`,
          options: [`Both session cookies are HttpOnly, so page JavaScript cannot see them`, `You are not really signed in`, `Cookies are stored in localStorage`, `Chrome blocks cookies on localhost`],
          answer: 0,
          explain: `HttpOnly hides a cookie from scripts while the browser still sends it with requests. The Application panel shows it, because DevTools is not page JavaScript.`,
        },
        {
          q: `Which storage is sent to the server automatically with each request?`,
          options: [`localStorage`, `sessionStorage`, `Cookies`, `IndexedDB`],
          answer: 2,
          explain: `Only cookies travel with requests. Web storage stays in the browser unless the page's code reads it and sends it on purpose.`,
        },
        {
          q: `You set <code>icebank-idle-warning-seconds</code> in the Console of the tutorial site (<code>localhost:4000</code>), but the bank's modal still takes 9 minutes. Why?`,
          options: [`The key name is case-insensitive`, `You must restart the app`, `localStorage is per origin; the bank on localhost:3000 cannot see keys stored for localhost:4000`, `The key only works on QA`],
          answer: 2,
          explain: `Different port, different origin, different storage. Set the key in a tab that has <code>http://localhost:3000</code> open.`,
        },
        {
          q: `In the cookie table, <code>ib_at</code> has <em>Secure</em> unticked. In which situation is that a finding?`,
          options: [`On an https deployment such as a production bank, because the token could then also be sent over plain http`, `Never, Secure is optional`, `Only locally`, `Only for ib_rt`],
          answer: 0,
          explain: `On <code>http://localhost</code> a Secure cookie would not be sent at all, so it is off locally. On a real https site, session cookies should be Secure.`,
        },
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
through the Chrome DevTools Protocol.</p>

<h3>Worked example: one transfer with 2,000 ms of added latency</h3>
<p>Add a custom profile with 2,000 ms latency, open <code>/transfer</code>, fill in $1.00 from chequing to savings, click <em>Review</em>, then <em>Confirm</em>, and watch:</p>
<pre role="img" aria-label="Timeline: click Confirm, the Processing element appears, the POST is sent and waits at least two seconds, the response arrives, Processing disappears and the confirmation appears" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 t=0 s     click transfer-confirm-button
           transfer-processing appears                      ← is the button disabled now?
           POST /api/v1/transfers  (Network: "Pending")
 t≈2 s+    request reaches the server (latency) … server works … response travels back
           transfer-processing disappears
           transfer-confirmation + transfer-confirmation-amount appear, toast-success shows for 4 s
</pre>
<p>Everything a Selenium test needs to wait for is in that timeline: the Processing element appearing and disappearing, and the confirmation becoming visible. None of it
happens at a fixed time, which is why <code>Thread.sleep(2000)</code> passes on your laptop and fails on a slow CI machine.</p>

<h3>What throttling does and does not do</h3>
<div class="table-wrap"><table>
<thead><tr><th>Affects</th><th>Does not affect</th></tr></thead>
<tbody>
<tr><td>Requests from the tab whose DevTools has throttling on</td><td>Other tabs, Postman, curl, your Selenium browser</td></tr>
<tr><td>The time until the response arrives (latency, bandwidth)</td><td>How long the server itself takes to process</td></tr>
<tr><td>Page assets too (scripts, styles, images), so pages load slower</td><td>The sandbox clock or any business rule</td></tr>
</tbody></table></div>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Forgetting throttling is on and spending ten minutes on "the app is slow today". Look at the warning icon on the Network tab.</li>
<li>Expecting your Selenium run to be throttled because DevTools in your own browser is. Throttle the test browser itself (CDP example).</li>
<li>"Fixing" a timing failure with a longer <code>Thread.sleep</code>. Wait for the condition instead.</li>
<li>Mixing implicit and explicit waits in the same driver: the waits add up in surprising ways. Keep implicit wait at 0 and use explicit waits.</li>
<li>Waiting for the toast with a 10-second timeout and then asserting it later: it disappears after 4 seconds. Read its text as soon as it is visible.</li>
</ul></div>`,
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
        {
          title: "Wait for a toast that may appear late and is gone after 4 seconds (Selenium 4)",
          lang: "java",
          code: `
WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(15));
By successToast = By.cssSelector("[data-testid='toast-success']");

WebElement toast = wait.until(ExpectedConditions.visibilityOfElementLocated(successToast));
String message = toast.getText();               // read it now, before it hides
wait.until(ExpectedConditions.invisibilityOfElementLocated(successToast));   // and prove it hides

assertTrue(message.length() > 0);`,
        },
      ],
      exercises: [
        "Set <em>Slow 4G</em> and make a transfer in the UI. Time the Processing state, and take a screenshot of each state you see from clicking Confirm to the confirmation.",
        "With a custom profile of 3,000 ms latency, double-click the transfer Confirm button. In the Network tab count the <code>POST /transfers</code> requests and compare their <code>Idempotency-Key</code> headers. How many transfers were created?",
        "Go Offline after the review step of a transfer and click Confirm. Describe what the user sees, then go back online and check whether a retry is safe.",
        "Run one of your Selenium tests with CPU throttling or network throttling and fix any wait that breaks.",
      ],
      quiz: [
        {
          q: `Your transfer test passes locally and fails on CI at <code>Thread.sleep(2000)</code> followed by reading the confirmation. Best fix?`,
          options: [`Wait explicitly for the confirmation element to be visible (and Processing to be gone)`, `Increase the sleep to 5000`, `Retry the test three times`, `Disable the Processing state`],
          answer: 0,
          explain: `A sleep guesses how long the operation takes. An explicit wait polls for the actual condition, so it is both faster when things are quick and reliable when they are slow.`,
        },
        {
          q: `After clicking Confirm on a transfer, which wait best expresses "the transfer has finished" in a Selenium test?`,
          options: [`<code>Thread.sleep(3000)</code>`, `Wait until <code>toast-error</code> is invisible`, `Wait until the page title changes`, `Wait until <code>transfer-confirmation</code> is visible (after <code>transfer-processing</code> has gone)`],
          answer: 3,
          explain: `The confirmation element is the UI's own statement that the transfer completed. A sleep guesses, the title does not change, and "no error toast" is also true while the request is still running.`,
        },
        {
          q: `You set <em>Slow 4G</em> in your own Chrome's DevTools and then run your Selenium suite. Is the suite throttled?`,
          options: [`Yes, throttling is system-wide`, `No: it only affects the tab whose DevTools has it on; throttle the test browser through CDP`, `Only for API calls`, `Only if Chrome is the default browser`],
          answer: 1,
          explain: `DevTools throttling is per tab. Selenium starts its own browser with its own profile, so you throttle it from the test.`,
        },
        {
          q: `Does network throttling make the Ice Bank server process a transfer more slowly?`,
          options: [`Yes`, `No: it delays the request and response in the browser; the server's own processing time is unchanged`, `Only for POST`, `Only in Offline mode`],
          answer: 1,
          explain: `Throttling simulates a slow connection between the browser and the network. The server sees a normal request, just later.`,
        },
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
their own DevTools. It contains cookies and tokens: sign out first (which revokes them) or edit them out before attaching.</p>

<h3>Worked example: tracing a value that is correct</h3>
<p>Practise the method on something that works, so you know what "all layers agree" looks like. Value: the <em>available credit</em> on Emma's credit card page (<code>/accounts/3</code>).</p>
<div class="table-wrap"><table>
<thead><tr><th>Layer</th><th>How you read it</th><th>Value (after a reset)</th></tr></thead>
<tbody>
<tr><td>Screen</td><td><code>[data-testid="account-detail-available-credit"]</code></td><td><code>$4,804.65</code></td></tr>
<tr><td>API response</td><td>Network → <code>GET /api/v1/accounts/3</code> → Response → <code>availableCredit</code></td><td><code>"4804.65"</code></td></tr>
<tr><td>Database</td><td><code>credit_limit + balance</code> for account 3 (first example)</td><td><code>5000.00 + (−195.35) = 4804.65</code></td></tr>
<tr><td>Business rule</td><td>README: limit $5,000; available credit = limit minus what is owed</td><td><code>4804.65</code></td></tr>
</tbody></table></div>
<p>All four agree, so there is no bug. Had the screen said something else while the API said <code>"4804.65"</code>, the bug would be in the UI; had the API disagreed with SQL,
in the API; had SQL disagreed with the rule, in the data or the logic that wrote it. The <em>minimum payment</em> on the same page works the same way:
greater of $10.00 or 3% of 195.35 (= 5.86), so <code>$10.00</code>.</p>

<pre role="img" aria-label="Decision tree: compare screen with API response; if they differ, UI bug; if same, compare API with database; if they differ, API bug; if same, compare database with the business rule; if they differ, data or logic bug; otherwise no bug" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 Screen value == API response value?
   ├─ no  → UI bug (formatting, rounding, wrong field, sorting/filtering in the browser)
   └─ yes → API value == database value?
              ├─ no  → API bug (mapping, calculation, serialisation)
              └─ yes → database value == business rule (README / Swagger)?
                         ├─ no  → data or logic bug (whatever wrote the row)
                         └─ yes → no bug; re-check your expectation
</pre>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Writing "the balance is wrong" without saying at which layer it first becomes wrong.</li>
<li>Comparing a screen value with an API response from a different moment (before and after your own transfer). Capture both in the same reload.</li>
<li>Forgetting formatting rules: <code>$4,804.65</code> on screen and <code>"4804.65"</code> in JSON are the same value; <code>-$12.00</code> in a table is a DEBIT of <code>"12.00"</code>.</li>
<li>Comparing dates across layers without the time zone (the database prints UTC unless you convert; the screen shows Toronto time).</li>
<li>Attaching a HAR or a copied curl with live tokens.</li>
<li>Putting two different bugs in one report because they appeared on the same page. One layer, one bug, one report.</li>
</ul></div>`,
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
        {
          title: "SQL: the database side of a credit-card trace (Emma's and Olivia's cards)",
          lang: "sql",
          code: `
SELECT id, balance, credit_limit,
       credit_limit + balance                     AS available_credit,
       greatest(10.00, round(-balance * 0.03, 2)) AS minimum_payment
FROM accounts
WHERE sandbox_id = 1
  AND id IN (3, 8);`,
          note: "The minimum-payment column is <em>your</em> implementation of the README rule (greater of $10 or 3% of the amount owing), an independent oracle to compare with the API.",
        },
        {
          title: "Console on an account page: screen vs API in one go",
          lang: "javascript",
          code: `
const id = location.pathname.split("/").pop();               // "3" on /accounts/3
const api = await (await fetch("/api/v1/accounts/" + id)).json();
const screen = tid => document.querySelector('[data-testid="' + tid + '"]')?.textContent.trim();
console.table([
  { field: "balance",         screen: screen("account-detail-balance"),          api: api.balance },
  { field: "availableCredit", screen: screen("account-detail-available-credit"), api: api.availableCredit },
  { field: "minimumPayment",  screen: screen("account-detail-minimum-payment"),  api: api.minimumPayment },
]);`,
          note: "On a chequing or savings page the credit rows are empty (<code>undefined</code> / <code>null</code>): those fields only exist for cards.",
        },
      ],
      exercises: [
        "Recompute Emma's dashboard total three ways: from the screen, from <code>GET /api/v1/accounts</code> in the Console, and with SQL. Write down all three and whether they agree on local.",
        "On an account page, sort by amount and filter by a date range. For each action, find the request and decide whether the sorting/filtering is done by the API or by the browser.",
        "Pick any screen that shows a list (transactions, payees, notifications). Write a short trace: which API call feeds it, which table the data comes from, and one bug that could appear at each layer.",
        "On QA, find one UI bug, trace it to its layer with the method above, and write the report using the skeleton. Attach a HAR file with tokens removed.",
        "Sign in as Olivia and trace the <em>available credit</em> and the <em>minimum payment</em> on her credit card page through all four layers (screen, API, SQL, README rule), using the two examples above. Fill in a table like the one in the worked example. Do the layers agree? Which value is closest to a boundary, and what would be your first two test cases for it?",
      ],
      quiz: [
        {
          q: `The screen shows a wrong available credit, but <code>GET /accounts/3</code> returns the right <code>availableCredit</code>. Where is the bug?`,
          options: [`In the database`, `In the UI: the correct value reached the browser and was shown wrongly`, `In the API`, `Nowhere`],
          answer: 1,
          explain: `Follow the data: correct in the response, wrong on screen, so the last layer that touched it (the page code) is at fault.`,
        },
        {
          q: `The API returns a balance that differs from <code>accounts.balance</code> in SQL for the same account at the same moment. Which layer do you report?`,
          options: [`UI`, `Network`, `Database`, `API: the row is right, the response is wrong`],
          answer: 3,
          explain: `If the stored value is right and the API's answer is not, the problem is in how the API reads, calculates or serialises it.`,
        },
        {
          q: `Emma owes 195.35 on her card. What minimum payment does the README rule give?`,
          options: [`10.00`, `5.86`, `19.54`, `195.35`],
          answer: 0,
          explain: `3% of 195.35 is 5.86, which is less than $10, so the minimum is the greater of the two: 10.00.`,
        },
        {
          q: `What is the most important thing to do before attaching a HAR file to a bug report?`,
          options: [`Compress it`, `Rename it to .json`, `Sign out (revoking the tokens) or remove cookies and tokens from it`, `Delete the timing data`],
          answer: 2,
          explain: `A HAR "with content" includes cookies, Authorization headers and response bodies. Revoke or remove the tokens so the file cannot be used to act as you.`,
        },
      ],
    },
  ],
});
