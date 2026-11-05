/* Tutorial 2: HTTP and APIs. Endpoints, headers and error bodies match src/server/api and the live Swagger contract. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "http",
  number: 2,
  title: "HTTP and APIs",
  summary: "How requests and responses really work, read through Ice Bank's REST API, so REST Assured tests make sense line by line.",
  intro: `
<p>REST Assured is just a convenient way to write HTTP requests in Java. If you understand the request (method, URL, headers, body) and the response
(status, headers, body), every <code>given().when().then()</code> line becomes obvious, and so do the bugs. This tutorial uses Ice Bank's API at
<code>http://localhost:3000/api/v1</code> for every example. Keep <a href="http://localhost:3000/swagger" target="_blank" rel="noopener">Swagger</a> open in another tab.</p>
<p>The <code>curl</code> examples work in <strong>Git Bash</strong> (installed with Git for Windows). In PowerShell, type <code>curl.exe</code> instead of <code>curl</code>,
because plain <code>curl</code> there is an alias for a different command, and put JSON bodies in a file.</p>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "url-anatomy",
      title: "Client and server, URL anatomy",
      summary: "Who talks to whom, and what every part of a URL means.",
      links: [{ label: "Open Swagger now", href: "http://localhost:3000/swagger" }],
      body: `
<p>HTTP is a conversation with strict turns. A <strong>client</strong> (the browser, Postman, curl, your REST Assured test) sends a <strong>request</strong>; a
<strong>server</strong> (Ice Bank's Next.js process on port 3000) sends back exactly one <strong>response</strong>. The server never starts the conversation, and it
does not remember you between requests unless you send something that identifies you (a token or a cookie). That is what "HTTP is stateless" means.</p>
<p>When you click <em>Transfer</em> in the Ice Bank UI, the browser is the client and it sends <code>POST /api/v1/transfers</code>. When your test does the same thing, the
server cannot tell the difference. That is why API tests are so valuable: they exercise the same rules as the UI, faster and without flaky clicks.</p>

<h3>The parts of a URL</h3>
<p>Take <code>http://localhost:3000/api/v1/accounts/1/transactions?type=PURCHASE&amp;size=5#top</code>:</p>
<div class="table-wrap"><table>
<thead><tr><th>Part</th><th>Value</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td>Scheme</td><td><code>http</code></td><td>Protocol. QA uses <code>https</code> (encrypted).</td></tr>
<tr><td>Host</td><td><code>localhost</code></td><td>Which machine. <code>localhost</code> is your own PC; QA is a Vercel host name.</td></tr>
<tr><td>Port</td><td><code>3000</code></td><td>Which program on that machine. Defaults are 80 (http) and 443 (https), so QA URLs omit it.</td></tr>
<tr><td>Path</td><td><code>/api/v1/accounts/1/transactions</code></td><td>Which resource. <code>/api/v1</code> is the base path; <code>1</code> is a <em>path parameter</em> (the account id).</td></tr>
<tr><td>Query string</td><td><code>?type=PURCHASE&amp;size=5</code></td><td><em>Query parameters</em>: filters, sorting, paging. <code>key=value</code> pairs joined by <code>&amp;</code>.</td></tr>
<tr><td>Fragment</td><td><code>#top</code></td><td>Only for the browser (scroll position); never sent to the server. This tutorial site uses it for <code>#tutorial/lesson</code> links.</td></tr>
</tbody></table></div>
<p>In REST Assured these parts map directly: <code>baseURI</code> + <code>port</code> + <code>basePath</code>, then <code>pathParam("id", 1)</code> and
<code>queryParam("type", "PURCHASE")</code>.</p>

<h3>Percent-encoding: the + trap</h3>
<p>Some characters have special meaning in a URL (<code>?</code>, <code>&amp;</code>, <code>=</code>, <code>#</code>, space, <code>+</code>). To send them as data
they are percent-encoded: space becomes <code>%20</code>, <code>@</code> becomes <code>%40</code>, <code>+</code> becomes <code>%2B</code>. In a query string a raw
<code>+</code> is often read as a <em>space</em>. On QA your persona emails contain a <code>+</code> (<code>emma.tremblay+s1@icebank.test</code>), so
<code>GET /inbox?email=emma.tremblay+s1@icebank.test</code> may search for "emma.tremblay s1@…" and find nothing. Encode it, or let your tool do it:
REST Assured's <code>queryParam()</code> and Postman's <em>Params</em> tab encode values for you.</p>`,
      examples: [
        {
          title: "The smallest possible request: is Ice Bank up?",
          lang: "bash",
          code: `
curl -i http://localhost:3000/api/v1/test/health`,
          note: "<code>-i</code> prints the status line and headers as well as the body. Expect <code>200</code> and a JSON body with <code>\"status\":\"UP\"</code> and <code>\"build\":\"clean\"</code>.",
        },
        {
          title: "Path parameter + query parameters (needs a token, see lesson 6)",
          lang: "bash",
          code: `
curl -s "http://localhost:3000/api/v1/accounts/1/transactions?type=PURCHASE&size=5&sort=amount,desc" \\
  -H "Authorization: Bearer $TOKEN"`,
          note: "Quote the URL in the shell: an unquoted <code>&amp;</code> would run the command in the background.",
        },
        {
          title: "The same request in REST Assured",
          lang: "java",
          code: `
given()
    .baseUri("http://localhost:3000")
    .basePath("/api/v1")
    .auth().oauth2(token)
    .pathParam("id", 1)
    .queryParam("type", "PURCHASE")
    .queryParam("size", 5)
    .queryParam("sort", "amount,desc")
.when()
    .get("/accounts/{id}/transactions")
.then()
    .statusCode(200);`,
        },
        {
          title: "Encoding a QA email in a query string",
          lang: "text",
          code: `
Raw:     emma.tremblay+s1@icebank.test
Encoded: emma.tremblay%2Bs1%40icebank.test

GET /api/v1/inbox?email=emma.tremblay%2Bs1%40icebank.test&kind=OTP`,
        },
      ],
      exercises: [
        "Run the health check with <code>curl -i</code>. Write down the status line, the <code>Content-Type</code> header, the <code>X-Request-Id</code> header and the <code>build</code> value. Run it twice: which of these change?",
        "Take <code>http://localhost:3000/api/v1/accounts/1/transactions?from=2026-10-01&amp;to=2026-10-31&amp;q=coffee</code> and label each part (scheme, host, port, path, path parameter, query parameters). Do the same for one QA URL from your instructor.",
        "Open Swagger, find <code>GET /accounts/{id}/transactions</code> and list every query parameter it accepts with its type. Which ones are dates and what format do they use?",
        "In a browser address bar, open <code>http://localhost:3000/api/v1/accounts</code> without signing in. Note the status code and the <code>code</code> field. Then sign in to the UI in the same browser and open it again. Explain why the result changed (hint: lesson 6, cookies).",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "methods-idempotency",
      title: "Methods and idempotency",
      summary: "GET, POST, PUT, PATCH, DELETE, what is safe to repeat, and Ice Bank's Idempotency-Key.",
      body: `
<p>The method (also called the verb) says what you want to do with the resource in the path.</p>
<div class="table-wrap"><table>
<thead><tr><th>Method</th><th>Meaning</th><th>Safe?</th><th>Idempotent?</th><th>Ice Bank example</th></tr></thead>
<tbody>
<tr><td><code>GET</code></td><td>Read</td><td>Yes</td><td>Yes</td><td><code>GET /accounts</code>, <code>GET /transfers/{id}</code></td></tr>
<tr><td><code>POST</code></td><td>Create, or trigger an action</td><td>No</td><td><strong>No</strong></td><td><code>POST /transfers</code>, <code>POST /cards/{id}/lock</code></td></tr>
<tr><td><code>PUT</code></td><td>Replace the whole resource</td><td>No</td><td>Yes</td><td><code>PUT /payees/{id}</code>, <code>PUT /etransfers/autodeposit</code></td></tr>
<tr><td><code>PATCH</code></td><td>Change some fields</td><td>No</td><td>Usually</td><td><code>PATCH /me</code>, <code>PATCH /cards/{id}/limits</code></td></tr>
<tr><td><code>DELETE</code></td><td>Remove</td><td>No</td><td>Yes</td><td><code>DELETE /payees/{id}</code>, <code>DELETE /bill-payments/{id}</code></td></tr>
</tbody></table></div>
<ul>
<li><strong>Safe</strong> means the request does not change anything on the server. You can repeat a <code>GET</code> as often as you like.</li>
<li><strong>Idempotent</strong> means sending the same request twice leaves the server in the same state as sending it once. Deleting payee 7 twice: it is
gone either way (the second call may answer 404, but nothing new happened). Two identical <code>POST /transfers</code> would move the money twice.</li>
</ul>

<h3>Why idempotency matters in a bank</h3>
<p>Networks fail. A phone sends a transfer, the response is lost, the app retries. Without protection the customer pays twice. Ice Bank solves this the way real
payment APIs do: every money-moving <code>POST</code> requires an <code>Idempotency-Key</code> header, a unique string you choose per <em>intended</em> operation
(usually a UUID).</p>
<ul>
<li>Same key + same body → the server <strong>replays the first response</strong> (same status, same transfer id) without moving money again.</li>
<li>Same key + different body → <code>409</code> with <code>code: "IDEMPOTENCY_KEY_REUSED"</code>.</li>
<li>No key → <code>400</code> with <code>code: "IDEMPOTENCY_KEY_REQUIRED"</code>.</li>
</ul>
<p>Endpoints that require it: <code>POST /transfers</code>, <code>POST /etransfers</code>, <code>POST /etransfers/{id}/cancel</code>, <code>POST /etransfers/{id}/accept</code>,
<code>POST /bill-payments</code> and <code>POST /deposits/cheque</code>.</p>
<div class="callout"><p><strong>Test idea.</strong> If the server ever ignored the key, a retry would create a duplicate transfer. Your test: send the same request twice with
the same key, assert the second response has the same <code>id</code>, and check in the database that only two transaction rows have that <code>referenceId</code>.</p></div>
<p>Using a method the endpoint does not support (for example <code>DELETE /accounts</code>) returns <code>405 Method Not Allowed</code>.</p>`,
      examples: [
        {
          title: "A transfer with an Idempotency-Key",
          lang: "bash",
          code: `
KEY=$(uuidgen 2>/dev/null || date +%s%N)
curl -i -X POST http://localhost:3000/api/v1/transfers \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $KEY" \\
  -d '{"fromAccountId":1,"toAccountId":2,"amount":"1.00","memo":"Idempotency demo"}'

# Run exactly the same command again with the same $KEY: same response, no second transfer.`,
        },
        {
          title: "Forgetting the key",
          lang: "json",
          code: `
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "type": "https://icebank.test/problems/idempotency-key-required",
  "title": "Bad Request",
  "status": 400,
  "detail": "The Idempotency-Key header is required for this request.",
  "instance": "/api/v1/transfers",
  "code": "IDEMPOTENCY_KEY_REQUIRED",
  "errors": [{ "field": "Idempotency-Key", "message": "is required" }]
}`,
        },
        {
          title: "Idempotency test in REST Assured",
          lang: "java",
          code: `
String key = UUID.randomUUID().toString();
String body = "{\\"fromAccountId\\":1,\\"toAccountId\\":2,\\"amount\\":\\"1.00\\"}";

int firstId = given().spec(emmaSpec).header("Idempotency-Key", key).body(body)
    .when().post("/transfers")
    .then().statusCode(201).extract().path("id");

int replayId = given().spec(emmaSpec).header("Idempotency-Key", key).body(body)
    .when().post("/transfers")
    .then().statusCode(201).extract().path("id");

assertEquals(firstId, replayId);   // replayed, not repeated

given().spec(emmaSpec).header("Idempotency-Key", key)
    .body(body.replace("1.00", "2.00"))
    .when().post("/transfers")
    .then().statusCode(409).body("code", equalTo("IDEMPOTENCY_KEY_REUSED"));`,
        },
      ],
      exercises: [
        "For each endpoint group in Swagger (Accounts, Transfers, Bill payments, Cards), list the methods used and say for each one whether it is safe and whether it is idempotent.",
        "Send <code>POST /transfers</code> for $1.00 without an <code>Idempotency-Key</code>, then with one. Then repeat the second request with the same key. Record the three statuses and compare the two <code>id</code> values.",
        "Reuse the same key with a different amount and record the status and <code>code</code>. Then check in the database how many <code>transactions</code> rows share the first transfer's <code>reference_id</code>.",
        "Lock Emma's debit card twice with <code>POST /cards/1/lock</code>, then unlock it. Is lock idempotent in Ice Bank? Look at the second response and decide whether a 409 there is good API design. Write your opinion in your notes.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "status-codes",
      title: "Status codes",
      summary: "What each code means in Ice Bank, and how to choose the right assertion.",
      body: `
<p>The status code is the server's one-number summary of what happened. Your first assertion in almost every API test is on it, so you must know exactly what the
<em>correct</em> code is for each case. Ice Bank follows a strict, documented convention:</p>
<div class="table-wrap"><table>
<thead><tr><th>Code</th><th>Meaning in Ice Bank</th><th>Example</th></tr></thead>
<tbody>
<tr><td><code>200 OK</code></td><td>Success with a body</td><td><code>GET /accounts</code></td></tr>
<tr><td><code>201 Created</code></td><td>Something was created; a <code>Location</code> header points to it</td><td><code>POST /transfers</code> → <code>Location: /api/v1/transfers/1000123</code></td></tr>
<tr><td><code>202 Accepted</code></td><td>Accepted, but finishes later or elsewhere</td><td><code>POST /auth/password/forgot</code> (always 202, so it does not reveal which emails exist)</td></tr>
<tr><td><code>204 No Content</code></td><td>Success, no body</td><td><code>DELETE /payees/{id}</code>, <code>POST /auth/logout</code></td></tr>
<tr><td><code>400 Bad Request</code></td><td>Malformed or invalid input: the request itself is wrong</td><td><code>amount: "10.005"</code>, size=101, malformed JSON</td></tr>
<tr><td><code>401 Unauthorized</code></td><td>No token, bad or expired token, wrong password, locked sign-in</td><td>Calling <code>GET /accounts</code> without <code>Authorization</code></td></tr>
<tr><td><code>403 Forbidden</code></td><td>You are signed in but your role may not do this</td><td>Emma calling <code>GET /admin/customers</code></td></tr>
<tr><td><code>404 Not Found</code></td><td>Does not exist, <em>or belongs to another customer</em></td><td>Emma calling <code>GET /accounts/5</code> (Liam's)</td></tr>
<tr><td><code>409 Conflict</code></td><td>Duplicate, or the resource is in the wrong state</td><td>Cancelling an e-Transfer that is already deposited</td></tr>
<tr><td><code>415 Unsupported Media Type</code></td><td>Body is not sent as JSON (or multipart where required)</td><td><code>Content-Type: text/plain</code></td></tr>
<tr><td><code>422 Unprocessable Entity</code></td><td>Valid request, but a business rule says no</td><td>Insufficient funds, e-Transfer limit exceeded</td></tr>
<tr><td><code>429 Too Many Requests</code></td><td>Rate limited; <code>Retry-After</code> says how many seconds to wait</td><td>More than 10 logins a minute from one IP</td></tr>
<tr><td><code>500</code></td><td>The server broke. Never correct, always a bug</td><td>Report it with the <code>X-Request-Id</code></td></tr>
</tbody></table></div>

<h3>Three distinctions testers get wrong</h3>
<ul>
<li><strong>400 vs 422.</strong> 400 = "I cannot even read this request properly" (wrong type, missing field, three decimals). 422 = "I understood you perfectly, and the
answer is no" (a $3,000.01 e-Transfer, a transfer bigger than the balance). Ice Bank validates the shape first, so <code>amount: "abc"</code> is 400 even if you
also have no money.</li>
<li><strong>401 vs 403.</strong> 401 = "who are you?" (authentication). 403 = "I know who you are, and you may not" (authorization).</li>
<li><strong>403 vs 404 for other people's data.</strong> Ice Bank returns <strong>404</strong> for another customer's account, exactly like an id that does not exist, so an
attacker cannot even learn which ids are real. If <code>GET /accounts/5</code> as Emma returns <code>200</code>, that is an IDOR (insecure direct object reference)
bug, one of the most common real-world API security bugs.</li>
</ul>
<p>Every error body also carries a machine-readable <code>code</code> (next lessons). Assert both: the status tells you the category, the code tells you the
exact reason.</p>`,
      examples: [
        {
          title: "400 vs 422 on the same endpoint",
          lang: "json",
          code: `
POST /api/v1/transfers   {"fromAccountId":1,"toAccountId":2,"amount":"10.005"}
HTTP/1.1 400 Bad Request
{
  "type": "https://icebank.test/problems/validation-failed",
  "title": "Bad Request", "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/transfers",
  "code": "VALIDATION_FAILED",
  "errors": [{ "field": "amount", "message": "must have at most 2 decimal places" }]
}

POST /api/v1/etransfers  {... "amount":"3000.01" ...}
HTTP/1.1 422 Unprocessable Entity
{
  "type": "https://icebank.test/problems/limit-per-transfer",
  "title": "Unprocessable Entity", "status": 422,
  "detail": "The most you can send in one e-Transfer is $3,000.00.",
  "instance": "/api/v1/etransfers",
  "code": "LIMIT_PER_TRANSFER"
}`,
        },
        {
          title: "Another customer's account is a 404, not a 403",
          lang: "bash",
          code: `
curl -s http://localhost:3000/api/v1/accounts/5 -H "Authorization: Bearer $EMMA_TOKEN"

{"type":"https://icebank.test/problems/not-found","title":"Not Found","status":404,
 "detail":"Account not found.","instance":"/api/v1/accounts/5","code":"NOT_FOUND"}`,
        },
        {
          title: "Status and code together in REST Assured",
          lang: "java",
          code: `
given().spec(emmaSpec)
    .header("Idempotency-Key", UUID.randomUUID().toString())
    .body(Map.of("fromAccountId", 9, "toAccountId", 2, "amount", "1.00"))
.when()
    .post("/transfers")
.then()
    .statusCode(404)                      // account 9 is Noah's, not Emma's
    .contentType("application/problem+json")
    .body("code", equalTo("NOT_FOUND"));`,
        },
      ],
      exercises: [
        "Produce each of these from Ice Bank and record the request you used and the <code>code</code> in the body: 200, 201, 204, 400, 401, 403, 404, 409, 415, 422. (Hint for 409: try deleting a payee that has scheduled payments, or cancelling a cancelled e-Transfer.)",
        "Sign in as Liam (<code>liam.chen@icebank.test</code>). What status and <code>code</code> do you get and why? Then sign in as the teller and find which admin endpoint would fix it. Do not unlock him yet unless you are ready to lock him again by failing 5 logins.",
        "As Emma, call <code>GET</code> on every account id from 1 to 13 and tabulate the statuses. Which ids are hers? What would it mean if one of the others returned 200?",
        "Send <code>POST /transfers</code> from account 1 for more than its available balance, and separately with <code>amount: \"-5\"</code>. Explain why one is 422 and the other is 400.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "headers",
      title: "Headers and content types",
      summary: "The metadata around every request and response, and the ones Ice Bank relies on.",
      body: `
<p>Headers are <code>Name: value</code> lines sent before the body. Names are case-insensitive (<code>content-type</code> = <code>Content-Type</code>). They carry
everything that is not the data itself: who you are, what format the body is in, where the new resource lives, how to trace the request.</p>

<h3>Request headers you will send</h3>
<div class="table-wrap"><table>
<thead><tr><th>Header</th><th>Purpose in Ice Bank</th></tr></thead>
<tbody>
<tr><td><code>Content-Type: application/json</code></td><td>"My body is JSON." Without it, a JSON endpoint answers <code>415 UNSUPPORTED_MEDIA_TYPE</code>. The cheque upload uses <code>multipart/form-data</code>.</td></tr>
<tr><td><code>Accept: application/json</code></td><td>"I want JSON back." Optional here, but polite and common.</td></tr>
<tr><td><code>Authorization: Bearer &lt;accessToken&gt;</code></td><td>Who you are (lesson 6).</td></tr>
<tr><td><code>Idempotency-Key: &lt;uuid&gt;</code></td><td>Required on money-moving POSTs (lesson 2).</td></tr>
<tr><td><code>X-Sandbox-Key: ICEBANK-LOCAL-KEY</code></td><td>Test-support calls (<code>/test/reset</code>, <code>/test/clock</code>) and reading an inbox without a token. On QA use your personal key.</td></tr>
</tbody></table></div>

<h3>Response headers you will assert</h3>
<div class="table-wrap"><table>
<thead><tr><th>Header</th><th>When</th></tr></thead>
<tbody>
<tr><td><code>Content-Type</code></td><td><code>application/json</code> for data, <code>application/problem+json</code> for errors, <code>text/csv; charset=utf-8</code> for CSV export, <code>application/pdf</code> for statements</td></tr>
<tr><td><code>Location</code></td><td>On every <code>201</code>, the URL of the new resource, e.g. <code>/api/v1/payees/1000321</code>. A missing <code>Location</code> is a contract bug.</td></tr>
<tr><td><code>X-Request-Id</code></td><td>On <em>every</em> response. A unique id for that request. Put it in bug reports so a developer can find the exact server log line.</td></tr>
<tr><td><code>Content-Disposition</code></td><td>On downloads: <code>attachment; filename="icebank-7919-transactions.csv"</code></td></tr>
<tr><td><code>Retry-After</code></td><td>On <code>429</code>: seconds to wait before trying again.</td></tr>
<tr><td><code>Cache-Control: no-store</code></td><td>Banking data must not be cached by the browser or a proxy.</td></tr>
</tbody></table></div>

<h3>Content types and bodies</h3>
<p>The <code>Content-Type</code> tells the other side how to read the bytes. Errors in Ice Bank use <code>application/problem+json</code>, the media type defined by
RFC 7807 for "problem details". It is still JSON, so REST Assured parses it the same way; asserting the exact content type is a cheap way to check that an error
followed the contract.</p>
<p>In REST Assured: <code>.contentType(ContentType.JSON)</code> sets the request header, <code>.header("Idempotency-Key", key)</code> adds any header, and on the
response <code>.header("Location", matchesPattern("/api/v1/transfers/\\d+"))</code> or <code>.extract().header("X-Request-Id")</code>.</p>`,
      examples: [
        {
          title: "See every header with curl -v (request lines start with >, response lines with <)",
          lang: "bash",
          code: `
curl -v http://localhost:3000/api/v1/accounts/1 -H "Authorization: Bearer $TOKEN" -o /dev/null`,
        },
        {
          title: "415: the body is fine, the header is wrong",
          lang: "bash",
          code: `
curl -s -X POST http://localhost:3000/api/v1/auth/login \\
  -H "Content-Type: text/plain" \\
  -d '{"email":"emma.tremblay@icebank.test","password":"IceBank#2026"}'

{"type":"https://icebank.test/problems/unsupported-media-type","title":"Unsupported Media Type",
 "status":415,"detail":"Send the request body as application/json.",
 "instance":"/api/v1/auth/login","code":"UNSUPPORTED_MEDIA_TYPE"}`,
        },
        {
          title: "CSV download headers",
          lang: "text",
          code: `
GET /api/v1/accounts/1/transactions.csv?from=2026-10-01&to=2026-10-31

HTTP/1.1 200 OK
content-type: text/csv; charset=utf-8
content-disposition: attachment; filename="icebank-7919-transactions.csv"
cache-control: no-store
x-request-id: ca46c577-27ca-4282-9e5a-b4a07f3f2e78

id,createdAt,postedAt,description,type,direction,amount,balanceAfter,status,referenceId
...`,
        },
        {
          title: "Header assertions in REST Assured",
          lang: "java",
          code: `
Response r = given().spec(emmaSpec)
        .contentType(ContentType.JSON)
        .body(Map.of("billerId", 3, "accountNumber", "1234-5678-9012", "nickname", "Gas"))
    .when()
        .post("/payees");

r.then()
    .statusCode(201)
    .header("Location", matchesPattern("^/api/v1/payees/\\\\d+$"))
    .header("X-Request-Id", not(emptyOrNullString()));

String location = r.header("Location");
given().spec(emmaSpec).when().get(location.replace("/api/v1", "")).then().statusCode(200);`,
        },
      ],
      exercises: [
        "Run <code>curl -v</code> against <code>GET /accounts/1</code> and list every response header. For each, write one sentence on what it is for.",
        "Create a payee for Maple Gas (biller 3, account number format <code>####-####-####</code>) and assert the <code>Location</code> header. Follow the <code>Location</code> with a <code>GET</code> and check the body matches what you sent. Delete it afterwards.",
        "Download <code>/accounts/1/transactions.csv</code> for October 2026 and check: the content type, the file name in <code>Content-Disposition</code>, the column header line, and that the number of data rows equals <code>totalElements</code> from the JSON endpoint with the same filters.",
        "Send a login with <code>Content-Type: text/plain</code>, then with <code>application/json</code> but a body that is not valid JSON (cut it off half-way). Record both statuses and codes.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "json",
      title: "JSON",
      summary: "Read and write JSON bodies, money as strings, and navigate them with JsonPath.",
      body: `
<p>JSON (JavaScript Object Notation) is the body format of almost every modern API. It has only six kinds of value:</p>
<ul>
<li><strong>object</strong> <code>{"key": value, ...}</code>: keys are always double-quoted strings;</li>
<li><strong>array</strong> <code>[value, value]</code>;</li>
<li><strong>string</strong> <code>"text"</code> (double quotes only);</li>
<li><strong>number</strong> <code>42</code>, <code>-3.5</code>;</li>
<li><strong>boolean</strong> <code>true</code>/<code>false</code>;</li>
<li><code>null</code>.</li>
</ul>
<p>No comments, no trailing commas, no single quotes. A body that breaks these rules gets <code>400 MALFORMED_JSON</code> from Ice Bank.</p>

<h3>Ice Bank's JSON conventions</h3>
<ul>
<li><strong>camelCase field names</strong>: <code>availableBalance</code>, <code>fromAccountId</code>. The database uses snake_case (<code>available_balance</code>); mapping one to the other is part of API-to-DB checks.</li>
<li><strong>Money is a string with exactly 2 decimals</strong>: <code>"balance": "5703.95"</code>, <code>"creditLimit": "5000.00"</code>. Never a number, because JSON numbers
are usually parsed as floating point, and <code>0.1 + 0.2</code> is not <code>0.3</code> in a <code>double</code>. In Java, map money to <code>BigDecimal</code> and
compare with <code>compareTo</code> (or assert the string exactly). On input Ice Bank accepts <code>"25.00"</code>, <code>"25"</code> or <code>25</code>, but more than
2 decimals is a 400, never silently rounded.</li>
<li><strong>Dates</strong> are ISO 8601 with offset: <code>"createdAt": "2026-11-02T05:45:00-05:00"</code>; plain dates are <code>"2026-11-02"</code>.</li>
<li><strong><code>null</code> vs missing.</strong> Ice Bank returns optional values as explicit <code>null</code> (<code>"nickname": null</code>). A field that suddenly disappears is a
contract change your schema tests should catch.</li>
</ul>

<h3>JsonPath: pointing at a value</h3>
<p>REST Assured uses Groovy-style JsonPath in <code>body(path, matcher)</code> and <code>extract().path(path)</code>:</p>
<div class="table-wrap"><table>
<thead><tr><th>Path</th><th>On <code>GET /accounts/1/transactions</code> returns</th></tr></thead>
<tbody>
<tr><td><code>totalElements</code></td><td>the total count</td></tr>
<tr><td><code>content</code></td><td>the array of transactions</td></tr>
<tr><td><code>content[0].amount</code></td><td>the first transaction's amount (a String)</td></tr>
<tr><td><code>content.size()</code></td><td>how many on this page</td></tr>
<tr><td><code>content.type</code></td><td>a list of every type on the page</td></tr>
<tr><td><code>content.findAll { it.direction == 'CREDIT' }.amount</code></td><td>amounts of the credits only</td></tr>
<tr><td><code>content.find { it.id == 20006 }.description</code></td><td>one item's field by id</td></tr>
</tbody></table></div>
<p>For anything beyond a few fields, deserialize into a POJO with Jackson (<code>.extract().as(Transaction.class)</code>) and assert in Java.</p>`,
      examples: [
        {
          title: "A real account object from GET /api/v1/accounts",
          lang: "json",
          code: `
{
  "id": 3,
  "accountNumber": "999-30077-1023757",
  "type": "CREDIT",
  "displayName": "Credit card 3757",
  "nickname": null,
  "currency": "CAD",
  "balance": "-195.35",
  "availableBalance": "-195.35",
  "status": "OPEN",
  "creditLimit": "5000.00",
  "availableCredit": "4804.65",
  "minimumPayment": "10.00",
  "interestRate": "20.99",
  "openedAt": "2024-11-06T10:00:00-05:00"
}`,
          note: "Balances change as you test; the shape does not. Minimum payment is the greater of $10 or 3% of the balance owed.",
        },
        {
          title: "JsonPath assertions in REST Assured",
          lang: "java",
          code: `
given().spec(emmaSpec)
    .queryParam("size", 10)
.when()
    .get("/accounts/1/transactions")
.then()
    .statusCode(200)
    .body("size", equalTo(10))
    .body("content.size()", lessThanOrEqualTo(10))
    .body("content.accountId", everyItem(equalTo(1)))
    .body("content.amount", everyItem(matchesPattern("^\\\\d+\\\\.\\\\d{2}$")))
    .body("content.direction", everyItem(isOneOf("DEBIT", "CREDIT")));`,
        },
        {
          title: "Money as BigDecimal in a POJO",
          lang: "java",
          code: `
@JsonIgnoreProperties(ignoreUnknown = false)   // fail if the API adds or renames fields
public record Account(
        long id,
        String accountNumber,
        String type,
        String displayName,
        String nickname,
        String currency,
        BigDecimal balance,
        BigDecimal availableBalance,
        String status,
        BigDecimal creditLimit,
        BigDecimal availableCredit,
        BigDecimal minimumPayment,
        BigDecimal interestRate,
        OffsetDateTime openedAt) {}

Account card = given().spec(emmaSpec).get("/accounts/3").as(Account.class);
assertEquals(0, card.creditLimit().add(card.balance()).compareTo(card.availableCredit()));`,
          note: "Jackson needs the <code>jackson-datatype-jsr310</code> module registered for <code>OffsetDateTime</code>.",
        },
      ],
      exercises: [
        "Paste the body of <code>GET /accounts</code> (as Emma) into a JSON viewer or Postman and list each field with its JSON type. Which fields are strings even though they hold numbers, and why?",
        "Write JsonPath expressions (and try them in a REST Assured test) for: the ids of Emma's accounts; the type of account 2; every account whose <code>status</code> is not <code>OPEN</code>; the sum of all balances (hint: collect and add in Java with <code>BigDecimal</code>).",
        "Break JSON on purpose in a <code>POST /transfers</code> body in five ways (trailing comma, single quotes, unquoted key, a comment, missing closing brace). Record what Ice Bank answers each time.",
        "Send a transfer with <code>amount</code> as the JSON number <code>1.1</code>, then as the string <code>\"1.10\"</code>, then <code>\"1.100\"</code>. Record which are accepted and what amount appears in the response.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "auth-tokens",
      title: "Cookies, JWT and refresh tokens",
      summary: "How Ice Bank knows who you are: OTP sign-in, access tokens, refresh tokens and cookies.",
      body: `
<p>Because HTTP is stateless, every request must prove who sent it. Ice Bank uses the pattern most modern APIs use: sign in once, get a short-lived
<strong>access token</strong>, send it with every request, and swap a longer-lived <strong>refresh token</strong> for a new access token when it expires.</p>

<h3>The Ice Bank sign-in flow (with MFA)</h3>
<ol>
<li><code>POST /api/v1/auth/login</code> with <code>{"email", "password"}</code> → <code>200 {"mfaRequired": true, "mfaToken": "...", "expiresIn": 300, "delivery": "Ice Mail"}</code>.
A 6-digit one-time password (OTP) is sent to Ice Mail. It expires after 5 minutes and allows 3 attempts.</li>
<li>Read the OTP. A human opens Ice Mail; a test calls <code>GET /api/v1/inbox?email=...&amp;kind=OTP</code> with header <code>X-Sandbox-Key</code> and reads
<code>content[0].otpCode</code>.</li>
<li><code>POST /api/v1/auth/mfa/verify</code> with <code>{"mfaToken", "code"}</code> → <code>{"accessToken", "refreshToken", "tokenType": "Bearer", "expiresIn": 900}</code>.</li>
<li>Send <code>Authorization: Bearer &lt;accessToken&gt;</code> on every call. After 15 minutes it stops working (<code>401 INVALID_TOKEN</code>).</li>
<li><code>POST /api/v1/auth/refresh</code> with <code>{"refreshToken"}</code> returns a new pair. Refresh tokens <em>rotate</em>: the old one stops working, and reusing a rotated
token ends the whole session. They last 7 days.</li>
<li><code>POST /api/v1/auth/logout</code> revokes the session: the refresh token and the access token stop working.</li>
</ol>
<p>Wrong password: <code>401 INVALID_CREDENTIALS</code> with <code>attemptsRemaining</code>. The 5th failure in a row locks the sign-in for 15 minutes:
<code>401 ACCOUNT_LOCKED</code>.</p>

<h3>What is a JWT?</h3>
<p>Ice Bank's access token is a <strong>JSON Web Token</strong>: three Base64URL-encoded parts separated by dots, <code>header.payload.signature</code>. The payload is
readable by anyone (it is encoded, not encrypted); the signature proves the server created it and nobody changed it. Ice Bank's payload contains:</p>
<div class="table-wrap"><table>
<thead><tr><th>Claim</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>sub</code></td><td>Subject: the user id (Emma is <code>"1"</code>)</td></tr>
<tr><td><code>cid</code></td><td>Customer id</td></tr>
<tr><td><code>sbx</code></td><td>Sandbox id (1 locally)</td></tr>
<tr><td><code>role</code></td><td><code>CUSTOMER</code>, <code>ADMIN</code> or <code>INSTRUCTOR</code></td></tr>
<tr><td><code>sid</code></td><td>Session id (shared by the access and refresh token of one sign-in)</td></tr>
<tr><td><code>iss</code>, <code>aud</code></td><td>Issuer <code>ice-bank</code>, audience <code>ice-bank-api</code></td></tr>
<tr><td><code>iat</code>, <code>exp</code></td><td>Issued-at and expiry, in seconds since 1970 (exp − iat = 900)</td></tr>
</tbody></table></div>
<p>Security tests: change one character of the payload (for example <code>"role":"ADMIN"</code>) and the signature no longer matches, so you must get 401. Send a token from
before logout: 401. Send an expired one: 401.</p>

<h3>Cookies</h3>
<p>A cookie is a small value the server asks the browser to store (<code>Set-Cookie</code>) and the browser sends back automatically on every request to that site
(<code>Cookie</code>). The Ice Bank web UI does not keep tokens in JavaScript; after sign-in the server sets two cookies, <code>ib_at</code> (access token) and
<code>ib_rt</code> (refresh token), marked <code>HttpOnly</code> (JavaScript cannot read them, which protects against XSS) and <code>SameSite=Lax</code>. The API accepts
either the <code>Authorization</code> header or the <code>ib_at</code> cookie. Your API tests use the header.</p>`,
      examples: [
        {
          title: "Sign in from Git Bash and keep the token in a variable",
          lang: "bash",
          code: `
BASE=http://localhost:3000/api/v1
EMAIL=emma.tremblay@icebank.test

MFA=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \\
  -d "{\\"email\\":\\"$EMAIL\\",\\"password\\":\\"IceBank#2026\\"}" | sed -E 's/.*"mfaToken":"([^"]+)".*/\\1/')

OTP=$(curl -s "$BASE/inbox?email=$EMAIL&kind=OTP&size=1" -H "X-Sandbox-Key: ICEBANK-LOCAL-KEY" \\
  | sed -E 's/.*"otpCode":"([0-9]{6})".*/\\1/')

TOKEN=$(curl -s -X POST $BASE/auth/mfa/verify -H "Content-Type: application/json" \\
  -d "{\\"mfaToken\\":\\"$MFA\\",\\"code\\":\\"$OTP\\"}" | sed -E 's/.*"accessToken":"([^"]+)".*/\\1/')

curl -s $BASE/me -H "Authorization: Bearer $TOKEN"`,
          note: "<code>sed</code> is a crude JSON parser that is good enough here. If you have <code>jq</code>, use <code>jq -r .mfaToken</code> instead.",
        },
        {
          title: "The same flow in REST Assured (put this in a reusable AuthClient)",
          lang: "java",
          code: `
public static String signIn(String email, String password) {
    String mfaToken = given().spec(base)
            .body(Map.of("email", email, "password", password))
        .when().post("/auth/login")
        .then().statusCode(200).body("mfaRequired", equalTo(true))
        .extract().path("mfaToken");

    String otp = given().spec(base)
            .header("X-Sandbox-Key", Config.sandboxKey())
            .queryParam("email", email)
            .queryParam("kind", "OTP")
            .queryParam("size", 1)
        .when().get("/inbox")
        .then().statusCode(200)
        .extract().path("content[0].otpCode");

    return given().spec(base)
            .body(Map.of("mfaToken", mfaToken, "code", otp))
        .when().post("/auth/mfa/verify")
        .then().statusCode(200).body("tokenType", equalTo("Bearer"))
        .extract().path("accessToken");
}`,
        },
        {
          title: "A decoded Ice Bank access token payload",
          lang: "json",
          code: `
{
  "sbx": 1,
  "role": "CUSTOMER",
  "sid": "952821cd-9378-4972-a16a-b52821a63231",
  "cid": 1,
  "sub": "1",
  "iss": "ice-bank",
  "aud": "ice-bank-api",
  "iat": 1793852050,
  "exp": 1793852950
}`,
        },
        {
          title: "Wrong password response (note attemptsRemaining)",
          lang: "json",
          code: `
HTTP/1.1 401 Unauthorized
{
  "type": "https://icebank.test/problems/invalid-credentials",
  "title": "Unauthorized", "status": 401,
  "detail": "Invalid email or password.",
  "instance": "/api/v1/auth/login",
  "code": "INVALID_CREDENTIALS",
  "attemptsRemaining": 4
}`,
        },
      ],
      exercises: [
        "Sign in as Emma with curl (or Postman) step by step, printing each response. Write down how many seconds the OTP and the access token are valid, taken from the responses.",
        "Decode your access token's payload (DevTools console or any offline Base64URL decoder, see Tutorial 3) and check <code>exp − iat</code>. Change one character in the middle of the token and call <code>GET /me</code>. Record the status and <code>code</code>.",
        "Call <code>POST /auth/refresh</code> with your refresh token, then call it again with the <em>same old</em> refresh token. Then try the newest refresh token. Explain what happened to the session and why that design is safer.",
        "Call <code>POST /auth/logout</code>, then reuse the access token on <code>GET /accounts</code>. Record the result. Write down what the correct behaviour is and why.",
        "With Noah's account, enter a wrong OTP three times on <code>/auth/mfa/verify</code>. Record the <code>code</code> on each attempt, and what happens if you then send the correct code.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "rest-pagination",
      title: "REST conventions and pagination",
      summary: "Resource-style URLs, consistent responses, and how to test paged lists.",
      body: `
<p>REST is a style, not a standard: a set of conventions that make an API predictable. Once you know Ice Bank's conventions you can guess an endpoint before
you look it up, and you can spot an endpoint that breaks them, which is often a bug.</p>

<h3>Resources and URLs</h3>
<ul>
<li>URLs name <strong>things</strong> (nouns, plural): <code>/accounts</code>, <code>/payees</code>, <code>/etransfers</code>. The method says what to do with them.</li>
<li>A specific item is <code>/collection/{id}</code>: <code>/accounts/1</code>. Things that belong to it nest under it: <code>/accounts/1/transactions</code>,
<code>/accounts/1/statements/2026-10.pdf</code>.</li>
<li>Actions that are not plain create/read/update/delete become sub-resources with <code>POST</code>: <code>/cards/1/lock</code>, <code>/etransfers/{id}/cancel</code>,
<code>/admin/accounts/{id}/freeze</code>.</li>
<li>Your own profile is <code>/me</code>: the server knows who you are from the token, so no id is needed (and you cannot ask for someone else's).</li>
</ul>

<h3>Consistent responses</h3>
<p>Creating returns <code>201</code> + <code>Location</code> + the created object. Lists of a customer's things return either a plain array (small, bounded lists such as
<code>GET /accounts</code>, <code>GET /cards</code>) or a <strong>page</strong> (unbounded lists such as transactions, transfers, e-Transfers, notifications).</p>

<h3>Ice Bank's pagination contract</h3>
<p>Request: <code>?page=0&amp;size=20&amp;sort=createdAt,desc</code>. Pages start at <strong>0</strong>. <code>size</code> is 1 to 100, default 20. <code>sort</code> is
<code>field,direction</code>; for transactions the allowed fields are <code>createdAt</code>, <code>amount</code>, <code>description</code> and <code>type</code>.
Default order is newest first.</p>
<p>Response:</p>
<p><code>{"content": [...], "page": 0, "size": 20, "totalElements": 334, "totalPages": 17}</code></p>
<div class="callout"><p><strong>Pagination test ideas.</strong> <code>totalPages</code> = ceil(<code>totalElements</code> / <code>size</code>). The last page has
<code>totalElements − size × (totalPages − 1)</code> items. A page past the end is an empty <code>content</code>, not an error. Walking every page returns every item exactly once,
with no duplicates and no gaps (compare with a SQL <code>count(*)</code>). <code>size=0</code>, <code>size=101</code>, <code>page=-1</code> and <code>sort=foo,desc</code>
are 400s with a field error.</p></div>

<h3>Filtering</h3>
<p>Filters are query parameters too: <code>GET /accounts/1/transactions?from=2026-10-01&amp;to=2026-10-31&amp;type=PURCHASE&amp;minAmount=10.00&amp;maxAmount=50.00&amp;q=coffee</code>.
Dates are Toronto dates and inclusive at both ends. <code>totalElements</code> reflects the filter, so it is your count to compare with SQL.</p>`,
      examples: [
        {
          title: "Page 1 (the second page) of 5, sorted by amount",
          lang: "bash",
          code: `
curl -s "http://localhost:3000/api/v1/accounts/1/transactions?page=1&size=5&sort=amount,desc" \\
  -H "Authorization: Bearer $TOKEN"`,
        },
        {
          title: "Invalid paging gives a field-level 400",
          lang: "json",
          code: `
GET /api/v1/accounts/1/transactions?size=101
{
  "type": "https://icebank.test/problems/validation-failed",
  "title": "Bad Request", "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/accounts/1/transactions",
  "code": "VALIDATION_FAILED",
  "errors": [{ "field": "size", "message": "must be between 1 and 100" }]
}`,
        },
        {
          title: "Walk every page and check there are no duplicates",
          lang: "java",
          code: `
int size = 50, page = 0, totalPages;
long totalElements;
Set<Long> seen = new HashSet<>();
do {
    JsonPath body = given().spec(emmaSpec)
            .queryParam("page", page).queryParam("size", size)
        .when().get("/accounts/1/transactions")
        .then().statusCode(200).extract().jsonPath();
    totalPages = body.getInt("totalPages");
    totalElements = body.getLong("totalElements");
    for (Long id : body.getList("content.id", Long.class)) {
        assertTrue(seen.add(id), "duplicate id " + id + " on page " + page);
    }
    page++;
} while (page < totalPages);

assertEquals(totalElements, seen.size());
assertEquals((int) Math.ceil(totalElements / (double) size), totalPages);`,
        },
      ],
      exercises: [
        "Without looking at Swagger, guess the method and URL for: list my payees; delete payee 7; read my notifications; mark notification 12 as read; unlock user 2 as an admin. Then check your guesses in Swagger.",
        "For account 1, request <code>size=7</code> and work out how many items the last page must have. Request that last page and the page after it. Write down what you expected and what you got.",
        "Send <code>size=0</code>, <code>size=101</code>, <code>page=-1</code>, <code>page=abc</code> and <code>sort=balance,desc</code>. Tabulate the status and the <code>errors[].message</code> for each.",
        "Implement the page-walking test above. Add a JDBC <code>count(*)</code> for account 1 and assert it equals <code>totalElements</code>.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "swagger",
      title: "Reading Ice Bank's Swagger contract",
      summary: "Use the OpenAPI document as the source of truth for requests, responses and errors.",
      links: [
        { label: "Open Swagger now", href: "http://localhost:3000/swagger" },
        { label: "Raw OpenAPI JSON", href: "http://localhost:3000/api/v1/openapi.json" },
      ],
      body: `
<p>Swagger UI is an interactive page generated from an <strong>OpenAPI</strong> document: a machine-readable description of every endpoint. Ice Bank's document is at
<code>/api/v1/openapi.json</code> and the page is at <a href="http://localhost:3000/swagger" target="_blank" rel="noopener">http://localhost:3000/swagger</a>.
It is the <em>contract</em>: if the API behaves differently from it, one of them is wrong, and either way that is a bug to report.</p>

<h3>What to read on each endpoint</h3>
<ul>
<li><strong>Tag</strong> (group): Auth, Accounts, Transfers, Interac e-Transfer, Bill payments, Deposits, Cards, Loans, Disputes, Notifications, Ice Mail, Admin, Test support.</li>
<li><strong>Summary and description</strong>: Ice Bank writes the business rules here, with the exact error codes. For example <code>POST /etransfers</code> lists
<code>LIMIT_PER_TRANSFER</code>, <code>DAILY_LIMIT_EXCEEDED</code>, <code>ROLLING_LIMIT_EXCEEDED</code>, <code>INSUFFICIENT_FUNDS</code>, <code>ACCOUNT_FROZEN</code>,
<code>INVALID_SOURCE</code> and <code>SELF_TRANSFER</code>. This is your test oracle.</li>
<li><strong>Lock icon</strong>: needs authentication (bearer token, or the sandbox key for Test support).</li>
<li><strong>Parameters</strong>: path, query and header parameters with types and examples. <code>Idempotency-Key</code> shows up here on money-moving POSTs.</li>
<li><strong>Request body</strong>: the schema (field names, types, required, patterns) and an example. Switch between <em>Example Value</em> and <em>Schema</em>.</li>
<li><strong>Responses</strong>: one block per status code, each with a schema and an example, including the RFC 7807 error examples with their <code>code</code>.</li>
<li><strong>Schemas</strong> at the bottom: reusable objects such as <code>Problem</code>, <code>Transfer</code>, <code>ETransfer</code>.</li>
</ul>

<h3>Trying requests</h3>
<p>Click <strong>Authorize</strong>, paste an access token into <em>bearerAuth</em> (just the token, no "Bearer "), and paste <code>ICEBANK-LOCAL-KEY</code> into <em>sandboxKey</em>.
Then <strong>Try it out → Execute</strong> on any endpoint. Swagger shows the equivalent curl command, the request URL, and the full response with headers, which makes
it a quick way to explore before you write a test. Get the token from <code>POST /auth/login</code>, <code>GET /inbox</code> and <code>POST /auth/mfa/verify</code>, all
inside Swagger.</p>

<h3>Using the contract in tests</h3>
<p>Because the document is JSON, your framework can use it directly: generate JSON Schemas for responses and validate with REST Assured's
<code>matchesJsonSchemaInClasspath("schemas/account.json")</code>. Schema validation catches the contract bugs that field-by-field assertions miss: a timestamp without
an offset, a money value returned as a number, a missing <code>Location</code>, a new unexpected field.</p>`,
      examples: [
        {
          title: "Sign in inside Swagger (three calls)",
          lang: "text",
          code: `
1. Auth → POST /api/v1/auth/login → Try it out
   {"email": "emma.tremblay@icebank.test", "password": "IceBank#2026"}     → copy mfaToken

2. Authorize → sandboxKey: ICEBANK-LOCAL-KEY
   Ice Mail → GET /api/v1/inbox → email = emma.tremblay@icebank.test, kind = OTP → copy content[0].otpCode

3. Auth → POST /api/v1/auth/mfa/verify
   {"mfaToken": "<from step 1>", "code": "<from step 2>"}                   → copy accessToken

4. Authorize → bearerAuth: <accessToken>   (now every lock icon is closed)`,
        },
        {
          title: "List every path and method from the OpenAPI document (Node, no libraries)",
          lang: "javascript",
          code: `
// Save as list-endpoints.mjs and run: node list-endpoints.mjs
const doc = await (await fetch("http://localhost:3000/api/v1/openapi.json")).json();
for (const [path, ops] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    console.log(method.toUpperCase().padEnd(7), path.padEnd(48), op.summary);
  }
}`,
        },
        {
          title: "JSON Schema validation in REST Assured",
          lang: "java",
          code: `
// pom.xml: io.rest-assured:json-schema-validator (same version as rest-assured)
import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;

given().spec(emmaSpec)
.when()
    .get("/accounts/1")
.then()
    .statusCode(200)
    .body(matchesJsonSchemaInClasspath("schemas/account.json"));`,
        },
      ],
      exercises: [
        "Sign in through Swagger alone (no Postman, no curl) and call <code>GET /accounts</code>. Copy the curl command Swagger shows you and run it in Git Bash.",
        "For <code>POST /etransfers</code>, write a table of every error the contract documents (status + <code>code</code> + example detail). For each one, write one test case idea that would trigger it with Emma's data.",
        "Find three endpoints whose <code>201</code> response documents a <code>Location</code> header. Call one and check the header really is there.",
        "Run the Node script to list every endpoint. Count the endpoints per tag, and compare with the endpoint catalogue your instructor gave you. Note anything missing or extra.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "postman",
      title: "Postman collections, environments and chaining",
      summary: "Build a reusable Ice Bank collection that signs in by itself and passes values between requests.",
      body: `
<p>Postman is a desktop app for sending HTTP requests without code. It is the fastest way to explore an API and the usual way teams share request examples. In week 1
you will translate a Postman collection into REST Assured, so build a good one now.</p>

<h3>Collections</h3>
<p>A <strong>collection</strong> is a folder of saved requests, organised in sub-folders (Auth, Accounts, Transfers…). Settings on the collection are inherited by every
request in it: set <em>Authorization → Bearer Token → <code>{{accessToken}}</code></em> once on the collection, and every request uses it.</p>

<h3>Environments and variables</h3>
<p>An <strong>environment</strong> is a named set of variables. Create two, <em>Ice Bank local</em> and <em>Ice Bank QA</em>, with the same variable names and different values:</p>
<div class="table-wrap"><table>
<thead><tr><th>Variable</th><th>Local</th><th>QA</th></tr></thead>
<tbody>
<tr><td><code>baseUrl</code></td><td><code>http://localhost:3000/api/v1</code></td><td><code>https://&lt;qa-host&gt;/api/v1</code></td></tr>
<tr><td><code>email</code></td><td><code>emma.tremblay@icebank.test</code></td><td><code>emma.tremblay+s1@icebank.test</code> (your suffix)</td></tr>
<tr><td><code>password</code></td><td><code>IceBank#2026</code></td><td><code>IceBank#2026</code></td></tr>
<tr><td><code>sandboxKey</code></td><td><code>ICEBANK-LOCAL-KEY</code></td><td>your personal key (mark as <em>secret</em>)</td></tr>
<tr><td><code>accessToken</code>, <code>mfaToken</code>, <code>otp</code></td><td colspan="2">empty; filled in by scripts</td></tr>
</tbody></table></div>
<p>Use them as <code>{{baseUrl}}/accounts</code>. Switching the environment in the top-right corner points every request at the other server, exactly like
<code>-Denv=qa</code> will in your framework (Tutorial 6).</p>

<h3>Scripts and chaining</h3>
<p>Each request can run JavaScript <em>before</em> it is sent (Pre-request) and <em>after</em> the response arrives (Tests / Post-response). <strong>Chaining</strong>
means a script saves part of one response into a variable that the next request uses. The Ice Bank sign-in is a perfect chain: login → read OTP → verify → save token.
Tests written with <code>pm.test</code> and <code>pm.expect</code> show as pass/fail, and the <strong>Collection Runner</strong> runs the whole folder in order: a mini
test suite.</p>
<p>Keep secrets out of exported collections: put them in the environment, mark them secret, and never commit an environment file with your QA key (Tutorial 6).</p>`,
      examples: [
        {
          title: "1. POST {{baseUrl}}/auth/login → Tests / Post-response script",
          lang: "javascript",
          code: `
// Body (raw, JSON): {"email": "{{email}}", "password": "{{password}}"}
pm.test("password accepted", () => pm.response.to.have.status(200));
const body = pm.response.json();
pm.expect(body.mfaRequired).to.eql(true);
pm.environment.set("mfaToken", body.mfaToken);`,
        },
        {
          title: "2. GET {{baseUrl}}/inbox?email={{email}}&kind=OTP&size=1 (header X-Sandbox-Key: {{sandboxKey}})",
          lang: "javascript",
          code: `
pm.test("OTP found", () => pm.response.to.have.status(200));
const msg = pm.response.json().content[0];
pm.expect(msg.otpCode).to.match(/^\\d{6}$/);
pm.environment.set("otp", msg.otpCode);`,
          note: "Set this request's Authorization to <em>No Auth</em>; it uses the sandbox key instead of a token.",
        },
        {
          title: "3. POST {{baseUrl}}/auth/mfa/verify → save the token",
          lang: "javascript",
          code: `
// Body: {"mfaToken": "{{mfaToken}}", "code": "{{otp}}"}
pm.test("signed in", () => pm.response.to.have.status(200));
const t = pm.response.json();
pm.environment.set("accessToken", t.accessToken);
pm.environment.set("refreshToken", t.refreshToken);`,
        },
        {
          title: "Collection-level pre-request script: a fresh Idempotency-Key for every money POST",
          lang: "javascript",
          code: `
const moneyPaths = ["/transfers", "/etransfers", "/bill-payments", "/deposits/cheque"];
const path = pm.request.url.getPath();
if (pm.request.method === "POST" && moneyPaths.some(p => path.endsWith(p) || path.includes("/etransfers/"))) {
  pm.request.headers.upsert({ key: "Idempotency-Key", value: pm.variables.replaceIn("{{$guid}}") });
}`,
        },
        {
          title: "4. POST {{baseUrl}}/transfers → tests and chaining the new id",
          lang: "javascript",
          code: `
// Body: {"fromAccountId": 1, "toAccountId": 2, "amount": "1.00", "memo": "Postman"}
pm.test("201 Created", () => pm.response.to.have.status(201));
pm.test("Location header", () => pm.expect(pm.response.headers.get("Location")).to.match(/^\\/api\\/v1\\/transfers\\/\\d+$/));
pm.test("money is a 2-decimal string", () => pm.expect(pm.response.json().amount).to.eql("1.00"));
pm.environment.set("transferId", pm.response.json().id);
// Next request: GET {{baseUrl}}/transfers/{{transferId}}`,
        },
      ],
      exercises: [
        "Create the <em>Ice Bank local</em> environment and a collection with the three sign-in requests and their scripts. Run them in order and confirm <code>accessToken</code> is filled in.",
        "Add folders Accounts and Transfers with at least six requests (list accounts, one account, transactions with filters, create transfer, get transfer by <code>{{transferId}}</code>, a 422 case). Give every request at least two <code>pm.test</code> checks.",
        "Run the whole collection with the Collection Runner. Export the run results and save a screenshot. Every test should be green on local.",
        "Duplicate the environment as <em>Ice Bank QA</em> with your QA values and run the collection against QA. Note every request that behaves differently; these are bug candidates.",
        "Export the collection (v2.1 JSON) and commit it to your framework repo under <code>postman/</code>. Check the exported file does not contain your QA sandbox key or any token.",
      ],
    },
  ],
});
