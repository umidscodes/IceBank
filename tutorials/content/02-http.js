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
REST Assured's <code>queryParam()</code> and Postman's <em>Params</em> tab encode values for you.</p>

<h3>What actually travels over the wire</h3>
<p>Under every tool (browser, Postman, curl, REST Assured) a request is just lines of text. <code>curl -v</code> prints them: lines starting with <code>&gt;</code> are what
your client sent, lines starting with <code>&lt;</code> are what the server answered.</p>
<pre role="img" aria-label="Diagram: the client sends a request line, headers, a blank line and an optional body; the server answers with a status line, headers, a blank line and a body" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 CLIENT ──────────────────────── request ───────────────────────► SERVER (localhost:3000)
   GET /api/v1/accounts/1/transactions?type=PURCHASE&amp;size=2 HTTP/1.1     ← request line
   Host: localhost:3000                                                ← headers
   Authorization: Bearer eyJhbGciOi...
   Accept: application/json
                                                                       ← blank line (no body for GET)

 CLIENT ◄─────────────────────── response ─────────────────────── SERVER
   HTTP/1.1 200 OK                                                     ← status line
   content-type: application/json                                      ← headers
   x-request-id: 039dd123-5576-40cb-a620-a4fc69c1d1c7
                                                                       ← blank line
   {"content":[...],"page":0,"size":2,"totalElements":101,...}         ← body
</pre>

<h3>Worked example: reading a request line by line</h3>
<ol>
<li><code>GET</code>: the method (lesson 2). It reads; it changes nothing.</li>
<li><code>/api/v1/accounts/1/transactions</code>: the path. Notice that the scheme, host and port are <em>not</em> in the request line; the client already used them to open the
connection, and the host travels again in the <code>Host</code> header.</li>
<li><code>?type=PURCHASE&amp;size=2</code>: the query string, sent as part of the path. The <code>#fragment</code>, if you had one, is never sent.</li>
<li><code>HTTP/1.1</code>: the protocol version.</li>
<li>Headers, one per line, then an empty line that means "headers are over". A <code>POST</code> would put its JSON body after that empty line.</li>
</ol>

<h3>Path parameter or query parameter?</h3>
<div class="table-wrap"><table>
<thead><tr><th></th><th>Path parameter</th><th>Query parameter</th></tr></thead>
<tbody>
<tr><td>Answers</td><td><em>Which</em> resource?</td><td><em>How</em> do you want it? (filter, sort, page)</td></tr>
<tr><td>Ice Bank example</td><td><code>/accounts/<strong>1</strong>/transactions</code></td><td><code>?type=PURCHASE&amp;size=5&amp;sort=amount,desc</code></td></tr>
<tr><td>Optional?</td><td>No: without it the URL means something else</td><td>Usually; defaults apply (<code>size</code> 20, newest first)</td></tr>
<tr><td>Wrong value gives</td><td><code>404</code> (no such account, or not yours) or <code>400</code> (<code>/accounts/abc</code>)</td><td><code>400 VALIDATION_FAILED</code> with the field name</td></tr>
<tr><td>REST Assured</td><td><code>pathParam("id", 1)</code></td><td><code>queryParam("size", 5)</code></td></tr>
</tbody></table></div>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Forgetting to quote a URL with <code>&amp;</code> in Git Bash: the shell cuts the command at the <code>&amp;</code> and runs the first half in the background.</li>
<li>Sending a raw <code>+</code> or <code>@</code> in a query value. Let the tool encode it (<code>queryParam()</code>, Postman's Params tab, <code>curl --data-urlencode</code>).</li>
<li>Building URLs by string concatenation in Java (<code>"/accounts/" + id + "?q=" + text</code>): nothing gets encoded. Use path and query parameters.</li>
<li>Expecting the server to see the <code>#fragment</code>. It never leaves the browser.</li>
<li>Mixing up <code>http</code> and <code>https</code>, or adding <code>:3000</code> to a QA URL. QA uses https on the default port 443.</li>
</ul></div>`,
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
        {
          title: "See the raw request and response lines with curl -v",
          lang: "bash",
          code: `
curl -v http://localhost:3000/api/v1/test/health

# > GET /api/v1/test/health HTTP/1.1      <- what curl sent
# > Host: localhost:3000
# > User-Agent: curl/8.x
# > Accept: */*
# >
# < HTTP/1.1 200 OK                        <- what the server answered
# < content-type: application/json
# < x-request-id: ...
# <
# {"status":"UP","database":"UP","build":"clean",...}`,
        },
        {
          title: "Let curl encode query values for you (--get with --data-urlencode)",
          lang: "bash",
          code: `
curl -sv --get "http://localhost:3000/api/v1/inbox" \\
  --data-urlencode "email=emma.tremblay@icebank.test" \\
  --data-urlencode "kind=OTP" \\
  --data-urlencode "size=1" \\
  -H "X-Sandbox-Key: ICEBANK-LOCAL-KEY" 2>&1 | grep "^> GET"

# > GET /api/v1/inbox?email=emma.tremblay%40icebank.test&kind=OTP&size=1 HTTP/1.1`,
          note: "<code>--get</code> turns the <code>--data-urlencode</code> values into the query string instead of a body. Each value is percent-encoded, so a QA email with <code>+</code> arrives intact.",
        },
        {
          title: "Encoding in plain Java (when you are not using REST Assured)",
          lang: "java",
          code: `
String email = "emma.tremblay+s1@icebank.test";
String encoded = URLEncoder.encode(email, StandardCharsets.UTF_8);
System.out.println(encoded);   // emma.tremblay%2Bs1%40icebank.test

URI uri = URI.create("http://localhost:3000/api/v1/inbox?email=" + encoded + "&kind=OTP&size=1");`,
        },
      ],
      exercises: [
        "Run the health check with <code>curl -i</code>. Write down the status line, the <code>Content-Type</code> header, the <code>X-Request-Id</code> header and the <code>build</code> value. Run it twice: which of these change?",
        "Take <code>http://localhost:3000/api/v1/accounts/1/transactions?from=2026-10-01&amp;to=2026-10-31&amp;q=coffee</code> and label each part (scheme, host, port, path, path parameter, query parameters). Do the same for one QA URL from your instructor.",
        "Open Swagger, find <code>GET /accounts/{id}/transactions</code> and list every query parameter it accepts with its type. Which ones are dates and what format do they use?",
        "In a browser address bar, open <code>http://localhost:3000/api/v1/accounts</code> without signing in. Note the status code and the <code>code</code> field. Then sign in to the UI in the same browser and open it again. Explain why the result changed (hint: lesson 6, cookies).",
        "Read Emma's newest OTP message with the <code>curl --get --data-urlencode</code> example and copy the exact request line curl printed (<code>&gt; GET ...</code>). Then change the email to the QA form <code>emma.tremblay+s1@icebank.test</code> and record how the request line changes. Finally send the QA form with the <code>+</code> typed raw in the URL instead, and explain the difference in what the server receives.",
      ],
      quiz: [
        {
          q: `In <code>GET /api/v1/accounts/3/transactions?type=PURCHASE&amp;size=5</code>, what is <code>3</code>?`,
          options: [`A path parameter: it says which account's transactions you want`, `A query parameter`, `The page number`, `The API version`],
          answer: 0,
          explain: `It is part of the path, so it identifies the resource. Everything after <code>?</code> (<code>type</code>, <code>size</code>) is a query parameter that shapes the answer.`,
        },
        {
          q: `You open <code>http://localhost:3000/api/v1/accounts#top</code>. What does the server receive?`,
          options: [`<code>GET /api/v1/accounts#top</code>`, `Nothing, a fragment cancels the request`, `<code>GET /api/v1/accounts?top</code>`, `<code>GET /api/v1/accounts</code>: the fragment stays in the browser`],
          answer: 3,
          explain: `The fragment is only for the browser (for example scrolling to an element). It is never part of the HTTP request line.`,
        },
        {
          q: `On QA, <code>GET /inbox?email=emma.tremblay+s1@icebank.test</code> finds no messages, but the email is right. The most likely reason?`,
          options: [`QA has no Ice Mail`, `The raw <code>+</code> in the query string is read as a space, so the server searched for a different email`, `Emails must be upper case`, `The sandbox key is missing from the URL`],
          answer: 1,
          explain: `In query strings <code>+</code> traditionally means a space. Send it encoded as <code>%2B</code>; REST Assured's <code>queryParam()</code> and <code>curl --data-urlencode</code> do that for you.`,
        },
        {
          q: `What does "HTTP is stateless" mean for your tests?`,
          options: [`The server forgets data after each request`, `Every request must carry what identifies the caller (a token or cookie); the server does not remember you between requests`, `You cannot use POST`, `Responses are never cached`],
          answer: 1,
          explain: `The data in the database stays, of course. What the server does not keep is "who is talking to me": each request proves it again, which is why every authenticated call sends <code>Authorization: Bearer ...</code>.`,
        },
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
<p>Using a method the endpoint does not support (for example <code>DELETE /accounts</code>) returns <code>405 Method Not Allowed</code>.</p>

<h3>Worked example: a retry that must not pay twice</h3>
<pre role="img" aria-label="Timeline: the client sends a transfer with key K, the response is lost, the client retries with the same key K and gets the stored response with Idempotent-Replayed true; no second transfer happens" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 Client                                         Ice Bank
   │ POST /transfers  Idempotency-Key: K  $1.00   │
   │ ───────────────────────────────────────────► │  moves $1.00, stores (K, request, 201 response)
   │        ✕  response lost (Wi-Fi drops)         │
   │                                               │
   │ POST /transfers  Idempotency-Key: K  $1.00   │  (retry: same key, same body)
   │ ───────────────────────────────────────────► │  finds K: does NOT move money again
   │ ◄─────────────────────────────────────────── │  201, same transfer id, Idempotent-Replayed: true
</pre>
<p>What the server does with the key, case by case (keys are remembered per signed-in user):</p>
<div class="table-wrap"><table>
<thead><tr><th>You send</th><th>Ice Bank answers</th></tr></thead>
<tbody>
<tr><td>A key it has never seen from you</td><td>Processes the request normally and stores the response under that key.</td></tr>
<tr><td>The same key, the same method, path and JSON body</td><td>Replays the stored response (same status, same body) with the header <code>Idempotent-Replayed: true</code>. Field order in the JSON does not matter. This also replays a stored <em>4xx</em> error.</td></tr>
<tr><td>The same key with a different body</td><td><code>409 IDEMPOTENCY_KEY_REUSED</code></td></tr>
<tr><td>The same key while the first request is still being processed</td><td><code>409 IDEMPOTENCY_IN_PROGRESS</code></td></tr>
<tr><td>No key on a money-moving POST</td><td><code>400 IDEMPOTENCY_KEY_REQUIRED</code></td></tr>
</tbody></table></div>
<p>The rule for clients: <strong>one key per intended operation</strong>. Generate it when the user decides to transfer, keep it for every retry of that transfer, and generate a new one
for the next transfer.</p>

<h3>Asking the server which methods it supports</h3>
<p><code>OPTIONS</code> is a method whose answer is the list of methods a path accepts, in the <code>Allow</code> header. For example
<code>OPTIONS /api/v1/payees/1</code> answers <code>allow: DELETE, GET, HEAD, OPTIONS, PUT</code>. <code>HEAD</code> is a <code>GET</code> without the body: same status and headers,
handy for "does this exist?" checks.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Generating a fresh key inside the retry loop. Every retry then looks like a new transfer: exactly the double payment the key exists to prevent.</li>
<li>Reusing one hard-coded key for all tests. The second test gets the first test's response (or a 409), and the failure looks random.</li>
<li>Believing "idempotent" means "returns the same status". A second <code>DELETE</code> may return 404; what matters is that the server's <em>state</em> is the same.</li>
<li>Checking idempotency only by status code. Prove it in the database: still exactly two transaction rows for that reference.</li>
<li>Thinking <code>PUT</code> creates things in Ice Bank. Here <code>PUT</code> replaces an existing resource (a payee, the autodeposit setting); creation is <code>POST</code>.</li>
</ul></div>`,
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
        {
          title: "Ask a path which methods it accepts (OPTIONS)",
          lang: "bash",
          code: `
curl -s -i -X OPTIONS http://localhost:3000/api/v1/payees/1 -H "Authorization: Bearer $TOKEN" | grep -i "^allow"
# allow: DELETE, GET, HEAD, OPTIONS, PUT

curl -s -i -X OPTIONS http://localhost:3000/api/v1/transfers/1 -H "Authorization: Bearer $TOKEN" | grep -i "^allow"
# allow: GET, HEAD, OPTIONS`,
        },
        {
          title: "Assert a replay, not a repeat (REST Assured)",
          lang: "java",
          code: `
String key = UUID.randomUUID().toString();
Map<String, Object> body = Map.of("fromAccountId", 1, "toAccountId", 2, "amount", "1.00");

Response first = given().spec(emmaSpec).header("Idempotency-Key", key).body(body)
    .when().post("/transfers");
Response retry = given().spec(emmaSpec).header("Idempotency-Key", key).body(body)
    .when().post("/transfers");

assertEquals(201, retry.statusCode());
assertEquals("true", retry.header("Idempotent-Replayed"));      // the server says: replayed
assertNull(first.header("Idempotent-Replayed"));                // the original was not
assertEquals(first.jsonPath().getLong("id"), retry.jsonPath().getLong("id"));`,
        },
        {
          title: "A retry helper that keeps the key (the right way to retry)",
          lang: "java",
          code: `
Response postWithRetry(RequestSpecification spec, String path, Object body, int attempts) {
    String key = UUID.randomUUID().toString();     // ONE key for this operation
    RuntimeException last = null;
    for (int i = 0; i < attempts; i++) {
        try {
            return given().spec(spec).header("Idempotency-Key", key).body(body)
                .when().post(path);                  // same key on every attempt
        } catch (RuntimeException networkError) {
            last = networkError;                     // e.g. a timeout: try again, same key
        }
    }
    throw last;
}`,
        },
      ],
      exercises: [
        "For each endpoint group in Swagger (Accounts, Transfers, Bill payments, Cards), list the methods used and say for each one whether it is safe and whether it is idempotent.",
        "Send <code>POST /transfers</code> for $1.00 without an <code>Idempotency-Key</code>, then with one. Then repeat the second request with the same key. Record the three statuses and compare the two <code>id</code> values.",
        "Reuse the same key with a different amount and record the status and <code>code</code>. Then check in the database how many <code>transactions</code> rows share the first transfer's <code>reference_id</code>.",
        "Lock Emma's debit card twice with <code>POST /cards/1/lock</code>, then unlock it. Is lock idempotent in Ice Bank? Look at the second response and decide whether a 409 there is good API design. Write your opinion in your notes.",
        "Send <code>OPTIONS</code> to <code>/accounts</code>, <code>/transfers</code>, <code>/transfers/{id}</code>, <code>/payees/{id}</code>, <code>/cards/{id}/lock</code> and <code>/me</code> and record each <code>Allow</code> header. For every method listed, find the matching operation in Swagger. Is there a method in <code>Allow</code> that Swagger does not document, or the other way round?",
      ],
      quiz: [
        {
          q: `Which statement about <code>GET</code> and <code>DELETE</code> is true?`,
          options: [`Both are safe`, `Both are idempotent, but only GET is safe`, `Only DELETE is idempotent`, `Neither is idempotent`],
          answer: 1,
          explain: `Safe means "changes nothing", which only GET (and HEAD, OPTIONS) guarantee. Idempotent means "doing it twice leaves the same state as once": deleting payee 7 twice still leaves it deleted.`,
        },
        {
          q: `A transfer request times out, so your code retries it. What should the retry send?`,
          options: [`A new Idempotency-Key, so the server does not reject it`, `The same key with the amount doubled`, `No Idempotency-Key`, `The same Idempotency-Key and the same body`],
          answer: 3,
          explain: `If the first attempt did reach the server, the same key makes the retry a replay instead of a second transfer. A new key would move the money twice.`,
        },
        {
          q: `The first transfer with key K was rejected with <code>422 INSUFFICIENT_FUNDS</code>. You top up the account and send the same request with the same key K. What happens?`,
          options: [`The stored 422 is replayed: K already has an answer`, `The transfer now succeeds`, `409 IDEMPOTENCY_KEY_REUSED`, `400 IDEMPOTENCY_KEY_REQUIRED`],
          answer: 0,
          explain: `Ice Bank stores the response for a key, including 4xx errors, and replays it for the same request. A new attempt after something changed is a new intended operation, so it needs a new key.`,
        },
        {
          q: `You resend a transfer with the same key but write the JSON fields in a different order. What does Ice Bank do?`,
          options: [`409, because the body text differs`, `Creates a second transfer`, `Replays the first response: the body is compared as JSON, not as raw text`, `400 MALFORMED_JSON`],
          answer: 2,
          explain: `The request is fingerprinted from a normalised form of the JSON, so <code>{"a":1,"b":2}</code> and <code>{"b":2,"a":1}</code> are the same request. Changing a <em>value</em> gives 409 <code>IDEMPOTENCY_KEY_REUSED</code>.`,
        },
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
exact reason.</p>

<h3>The order Ice Bank checks things in</h3>
<p>A request can be wrong in several ways at once. The server checks in a fixed order and answers with the <em>first</em> problem it finds, so knowing the order tells you which
status to expect:</p>
<pre role="img" aria-label="Diagram: authentication 401, role 403, sandbox key 401, rate limit 429, query parameters 400, content type 415, JSON 400, body fields 400, idempotency key 400 or 409, then the endpoint: 404, 409, 422, success" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 1. Who are you?            no / bad token ............................ 401 UNAUTHORIZED, INVALID_TOKEN
 2. May your role do this?  customer on an admin endpoint ............. 403 FORBIDDEN
 3. Sandbox key (test APIs) missing or wrong .......................... 401 SANDBOX_KEY_REQUIRED, INVALID_SANDBOX_KEY
 4. Too many requests?      ........................................... 429 RATE_LIMITED  (+ Retry-After)
 5. Query parameters        size=101, sort=foo ........................ 400 VALIDATION_FAILED
 6. Body                    not JSON content type ..................... 415 UNSUPPORTED_MEDIA_TYPE
                            not valid JSON / empty .................... 400 MALFORMED_JSON, BODY_REQUIRED
                            fields wrong ("10.005", missing field) .... 400 VALIDATION_FAILED
 7. Idempotency-Key         missing / reused / in progress ............ 400 / 409
 8. The endpoint itself     not found or not yours .................... 404 NOT_FOUND
                            wrong state ............................... 409 (e.g. already cancelled)
                            business rule says no ..................... 422 (INSUFFICIENT_FUNDS, ...)
 9. Success                 ........................................... 200 / 201 + Location / 204
</pre>

<h3>Worked example: one request, three problems</h3>
<p>You send <code>POST /api/v1/transfers</code> with <strong>no token</strong>, a body that is <strong>cut off half-way</strong>, and <strong>no Idempotency-Key</strong>. Walk the list:
step 1 already fails, so the answer is <code>401 UNAUTHORIZED</code>; the server never looks at the body. Add a valid token and the same request reaches step 6:
<code>400 MALFORMED_JSON</code>. Fix the JSON and you reach step 7: <code>400 IDEMPOTENCY_KEY_REQUIRED</code>. Fix that and the endpoint finally runs its business rules.</p>
<p>That is why a negative test should break <em>one</em> thing at a time: with several problems, you only ever see the first one.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Asserting only "is a 4xx". A 400 instead of a 422 (or a 403 instead of a 404) is a real contract difference. Assert the exact status and the <code>code</code>.</li>
<li>Reporting "404 for another customer's account" as a bug. In Ice Bank that is the correct, documented behaviour.</li>
<li>Breaking several things in one negative test, then asserting the code of the one you were thinking about.</li>
<li>Treating a 500 as "the API handled the error". A 500 is never the right answer.</li>
<li>Ignoring a 200 whose body says something went wrong. The status must tell the truth on its own.</li>
</ul></div>`,
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
        {
          title: "One loop, many statuses (curl -w prints only the code)",
          lang: "bash",
          code: `
for path in accounts/1 accounts/5 accounts/abc admin/customers; do
  curl -s -o /dev/null -w "%{http_code}  GET /$path\\n" \\
    "http://localhost:3000/api/v1/$path" -H "Authorization: Bearer $TOKEN"
done

# 200  GET /accounts/1          (Emma's own account)
# 404  GET /accounts/5          (Liam's: hidden as "not found")
# 400  GET /accounts/abc        (not a valid id)
# 403  GET /admin/customers     (signed in, wrong role)`,
          note: "<code>-o /dev/null</code> throws the body away and <code>-w</code> prints what you ask for. Run it with Emma's token.",
        },
        {
          title: "Two kinds of 401: no token vs a bad token",
          lang: "json",
          code: `
GET /api/v1/accounts                         (no Authorization header)
{"type":"https://icebank.test/problems/unauthorized","title":"Unauthorized","status":401,
 "detail":"Authentication is required.","instance":"/api/v1/accounts","code":"UNAUTHORIZED"}

GET /api/v1/accounts   Authorization: Bearer abc.def.ghi
{"type":"https://icebank.test/problems/invalid-token","title":"Unauthorized","status":401,
 "detail":"The access token is invalid or has expired.","instance":"/api/v1/accounts","code":"INVALID_TOKEN"}`,
        },
        {
          title: "Many cases, one test method (JUnit 5 parameterized test)",
          lang: "java",
          code: `
@ParameterizedTest(name = "GET /accounts/{0} -> {1} {2}")
@CsvSource({
    "1,      200, ",
    "999999, 404, NOT_FOUND",
})
void getAccountStatus(String id, int status, String code) {
    ValidatableResponse r = given().spec(emmaSpec)
        .when().get("/accounts/" + id)
        .then().statusCode(status);
    if (code != null) r.body("code", equalTo(code));
}`,
          note: "An empty CSV cell arrives as <code>null</code>. Add your own rows; each row shows up as its own test in the report.",
        },
      ],
      exercises: [
        "Produce each of these from Ice Bank and record the request you used and the <code>code</code> in the body: 200, 201, 204, 400, 401, 403, 404, 409, 415, 422. (Hint for 409: try deleting a payee that has scheduled payments, or cancelling a cancelled e-Transfer.)",
        "Sign in as Liam (<code>liam.chen@icebank.test</code>). What status and <code>code</code> do you get and why? Then sign in as the teller and find which admin endpoint would fix it. Do not unlock him yet unless you are ready to lock him again by failing 5 logins.",
        "As Emma, call <code>GET</code> on every account id from 1 to 13 and tabulate the statuses. Which ids are hers? What would it mean if one of the others returned 200?",
        "Send <code>POST /transfers</code> from account 1 for more than its available balance, and separately with <code>amount: \"-5\"</code>. Explain why one is 422 and the other is 400.",
        "Extend the parameterized test so it covers Emma calling <code>GET /accounts/{id}</code> with ids <code>1</code>, <code>5</code>, <code>999999</code> and <code>abc</code>, asserting status, <code>code</code> and, for the 400, the field name in <code>errors</code>. Then add one row that sends no token at all (you will need a second spec). Run it and paste the test report into your notes.",
      ],
      quiz: [
        {
          q: `<code>POST /transfers</code> with <code>"amount": "abc"</code> from an account with $0. Which status is correct?`,
          options: [`422, because there is no money`, `404`, `400, because the request is invalid before any business rule is checked`, `409`],
          answer: 2,
          explain: `Shape is validated before business rules. "abc" is not an amount, so the request cannot even be understood: 400 VALIDATION_FAILED. Funds are never looked at.`,
        },
        {
          q: `Emma calls <code>GET /accounts/5</code> (Liam's account). What is the correct answer, and why?`,
          options: [`403, because she is not allowed`, `401, because her token is for another account`, `404, so that she cannot even learn that account 5 exists`, `200, accounts are public`],
          answer: 2,
          explain: `Ice Bank answers another customer's resource exactly like a missing one. A 200 would be an IDOR bug; a 403 would leak that the id is real.`,
        },
        {
          q: `A request has no token and a malformed JSON body. What does Ice Bank answer?`,
          options: [`401 UNAUTHORIZED`, `400 MALFORMED_JSON`, `415 UNSUPPORTED_MEDIA_TYPE`, `Both errors in one response`],
          answer: 0,
          explain: `Authentication is checked first and the first failing check wins. Break one thing at a time in negative tests.`,
        },
        {
          q: `Which pair is the right mental model?`,
          options: [`401 = "you may not", 403 = "who are you?"`, `401 = server error, 403 = client error`, `401 and 403 mean the same`, `401 = "who are you?" (authentication), 403 = "I know who you are, and you may not" (authorization)`],
          answer: 3,
          explain: `401 is about proving identity (missing, bad or expired token). 403 is about permissions once identity is known, such as a customer calling an admin endpoint.`,
        },
        {
          q: `An endpoint answers <code>200 OK</code> with the body <code>{"error": "insufficient funds"}</code>. Is that acceptable in Ice Bank?`,
          options: [`Yes, the body explains it`, `No: the status must say what happened; this should be a 422 problem+json with a code`, `Yes, if the Content-Type is JSON`, `Only for GET requests`],
          answer: 1,
          explain: `Clients, monitoring and your tests rely on the status code. A refusal reported as 200 is a contract bug even if the message is right.`,
        },
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
response <code>.header("Location", matchesPattern("/api/v1/transfers/\\d+"))</code> or <code>.extract().header("X-Request-Id")</code>.</p>

<h3>Worked example: the headers of one request, line by line</h3>
<p><code>curl -v http://localhost:3000/api/v1/accounts/5 -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" -H "X-Request-Id: qa-emma-404-check"</code>
(as Emma) prints the request it sent and the start of the answer:</p>
<div class="table-wrap"><table>
<thead><tr><th>Line</th><th>Who added it</th><th>Why it is there</th></tr></thead>
<tbody>
<tr><td><code>&gt; GET /api/v1/accounts/5 HTTP/1.1</code></td><td>curl, from the URL</td><td>Method, path, protocol.</td></tr>
<tr><td><code>&gt; Host: localhost:3000</code></td><td>curl, automatically</td><td>Which site on that server you mean. Required in HTTP/1.1.</td></tr>
<tr><td><code>&gt; User-Agent: curl/8.5.0</code></td><td>curl, automatically</td><td>Which client this is. Browsers send a long one; the API does not use it.</td></tr>
<tr><td><code>&gt; Authorization: Bearer eyJ...</code></td><td>you (<code>-H</code>)</td><td>Who you are: Emma.</td></tr>
<tr><td><code>&gt; Accept: application/json</code></td><td>you</td><td>What you want back.</td></tr>
<tr><td><code>&gt; X-Request-Id: qa-emma-404-check</code></td><td>you</td><td>A name for this request that you can search for later.</td></tr>
<tr><td><code>&lt; HTTP/1.1 404 Not Found</code></td><td>Ice Bank</td><td>Account 5 is Liam's, so for Emma it does not exist.</td></tr>
<tr><td><code>&lt; content-type: application/problem+json</code></td><td>Ice Bank</td><td>The body is an RFC 7807 error, not ordinary data.</td></tr>
<tr><td><code>&lt; x-request-id: qa-emma-404-check</code></td><td>Ice Bank</td><td>Your id, echoed back: the server log line for this 404 carries the same id.</td></tr>
</tbody></table></div>
<p>There is no <code>Content-Type</code> in the request because a <code>GET</code> has no body. Add <code>-d '{...}'</code> and curl switches to <code>POST</code> and sends
<code>Content-Type: application/x-www-form-urlencoded</code> unless you set <code>-H "Content-Type: application/json"</code> yourself, a classic cause of 415.</p>

<h3>Your own X-Request-Id</h3>
<p>Send <code>X-Request-Id: qa-emma-404-check</code> and the response carries the same value, so you can find your request in the server log by a name you chose. The value must be
1 to 100 characters of letters, digits, <code>_</code>, <code>.</code> or <code>-</code>; anything else (a space, for example) is ignored and the server generates its own UUID.</p>

<h3>Content-Type vs Accept</h3>
<p><code>Content-Type</code> describes the body <em>you are sending</em>; <code>Accept</code> says what you would like <em>back</em>. Ice Bank only speaks JSON: it ignores
<code>Accept: application/xml</code> and still answers JSON. A missing or wrong <code>Content-Type</code> on a request with a body, on the other hand, is refused with 415.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Leaving out <code>Bearer </code>: <code>Authorization: eyJ...</code> gives 401 <em>Authorization header must use the Bearer scheme</em>.</li>
<li>Writing it twice (<code>Bearer Bearer eyJ...</code>, common when a tool adds the prefix for you): 401 <code>INVALID_TOKEN</code>.</li>
<li>Setting <code>Accept</code> when you meant <code>Content-Type</code> on a POST: the body is then refused with 415.</li>
<li>Asserting headers that change on every call (<code>Date</code>, <code>X-Request-Id</code>). Assert that they <em>exist</em> or match a pattern.</li>
<li>Throwing away the <code>X-Request-Id</code> of a failing call. Log it in your test output so it is there when you write the bug report.</li>
</ul></div>`,
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
        {
          title: "Send your own X-Request-Id and see it echoed (also on errors)",
          lang: "bash",
          code: `
curl -s -i http://localhost:3000/api/v1/accounts/5 \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "X-Request-Id: qa-emma-404-check" | grep -i "^x-request-id"
# x-request-id: qa-emma-404-check`,
        },
        {
          title: "Print only the headers you care about",
          lang: "bash",
          code: `
curl -s -D - -o /dev/null http://localhost:3000/api/v1/accounts/1 -H "Authorization: Bearer $TOKEN" \\
  | grep -iE "^(HTTP|content-type|cache-control|x-request-id):?"`,
        },
        {
          title: "Always log the X-Request-Id when a REST Assured check fails",
          lang: "java",
          code: `
Response r = given().spec(emmaSpec).when().get("/accounts/1");
String requestId = r.header("X-Request-Id");

assertAll("GET /accounts/1 (X-Request-Id " + requestId + ")",
    () -> assertEquals(200, r.statusCode()),
    () -> assertEquals("no-store", r.header("Cache-Control")),
    () -> assertTrue(r.contentType().startsWith("application/json")));`,
          note: "REST Assured looks headers up case-insensitively, so <code>\"x-request-id\"</code> and <code>\"X-Request-Id\"</code> both work.",
        },
      ],
      exercises: [
        "Run <code>curl -v</code> against <code>GET /accounts/1</code> and list every response header. For each, write one sentence on what it is for.",
        "Create a payee for Maple Gas (biller 3, account number format <code>####-####-####</code>) and assert the <code>Location</code> header. Follow the <code>Location</code> with a <code>GET</code> and check the body matches what you sent. Delete it afterwards.",
        "Download <code>/accounts/1/transactions.csv</code> for October 2026 and check: the content type, the file name in <code>Content-Disposition</code>, the column header line, and that the number of data rows equals <code>totalElements</code> from the JSON endpoint with the same filters.",
        "Send a login with <code>Content-Type: text/plain</code>, then with <code>application/json</code> but a body that is not valid JSON (cut it off half-way). Record both statuses and codes.",
        "Send three requests with your own <code>X-Request-Id</code>: a successful <code>GET /accounts/1</code>, a 404 (<code>GET /accounts/5</code>) and one where the id contains a space (<code>X-Request-Id: my test</code>). Record the <code>x-request-id</code> each response returns and explain the third one. Then check that a 401 (no token) also carries an <code>x-request-id</code>.",
      ],
      quiz: [
        {
          q: `You POST JSON with <code>Accept: application/json</code> but no <code>Content-Type</code>. Ice Bank answers 415. Why?`,
          options: [`Accept must be application/xml`, `POST requests may not have headers`, `415 means the token expired`, `Content-Type describes the body you send; without it the server will not treat the body as JSON`],
          answer: 3,
          explain: `Accept is about the response; Content-Type is about your request body. A body without a JSON content type is refused with 415 UNSUPPORTED_MEDIA_TYPE.`,
        },
        {
          q: `Which response header should you copy into every bug report?`,
          options: [`<code>Date</code>`, `<code>X-Request-Id</code>`, `<code>Vary</code>`, `<code>Keep-Alive</code>`],
          answer: 1,
          explain: `It uniquely identifies that request in the server log, so a developer can find exactly what happened, even among thousands of other calls.`,
        },
        {
          q: `Are <code>content-type</code> and <code>Content-Type</code> the same header?`,
          options: [`No, header names are case-sensitive`, `Yes, header names are case-insensitive`, `Only in HTTP/2`, `Only for requests`],
          answer: 1,
          explain: `HTTP header names are case-insensitive. Ice Bank sends them in lower case; tools such as REST Assured look them up case-insensitively.`,
        },
        {
          q: `Why does <code>GET /accounts/1</code> answer with <code>Cache-Control: no-store</code>?`,
          options: [`To make the response faster`, `It is required by JSON`, `Because the body is empty`, `So that browsers and proxies never keep a copy of banking data`],
          answer: 3,
          explain: `Balances and transactions are private and change constantly. <code>no-store</code> forbids caches from saving them, a good header to assert in security-minded tests.`,
        },
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
<p>For anything beyond a few fields, deserialize into a POJO with Jackson (<code>.extract().as(Transaction.class)</code>) and assert in Java.</p>

<h3>Worked example: walking a real response with JsonPath</h3>
<p><code>GET /api/v1/accounts/1/transactions?size=3</code> returns a page object. Picture it as a tree:</p>
<pre role="img" aria-label="Tree of a page response: content array of transaction objects, then page, size, totalElements and totalPages" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 (root object)
 ├── content            array
 │   ├── [0]            object
 │   │   ├── id            20006                       number
 │   │   ├── direction     "DEBIT"                     string
 │   │   ├── amount        "2337.00"                   string (money)
 │   │   ├── balanceAfter  "5703.95"                   string (money)
 │   │   ├── type          "PREAUTHORIZED_DEBIT"
 │   │   └── createdAt     "2026-11-02T05:45:00-05:00" string (ISO 8601)
 │   ├── [1]  { id 19996, type "LOAN_PAYMENT", createdAt "2026-11-01T06:15:00-05:00", ... }
 │   └── [2]  { id 19930, type "ETRANSFER",   createdAt "2026-10-30T10:15:00-04:00", ... }
 ├── page               0
 ├── size               3
 ├── totalElements      334
 └── totalPages         112
</pre>
<ol>
<li><code>totalElements</code> → <code>334</code>: a top-level field, so just its name.</li>
<li><code>content[0].amount</code> → <code>"2337.00"</code>: into the array, first element (index 0), then a field. A <em>String</em>, so assert it with <code>equalTo("2337.00")</code>, not <code>2337.0</code>.</li>
<li><code>content.type</code> → <code>["PREAUTHORIZED_DEBIT", "LOAN_PAYMENT", "ETRANSFER"]</code>: a field name applied to an array collects it from every element.</li>
<li><code>content.find { it.type == 'ETRANSFER' }.id</code> → <code>19930</code>: Groovy's <code>find</code> returns the first match, <code>findAll</code> every match.</li>
</ol>
<p>Look at the two <code>createdAt</code> offsets: <code>-04:00</code> on 30 October, <code>-05:00</code> from 1 November. Toronto left summer time on 1 November 2026, and the API
writes each instant with the offset that was valid on that day. Compare dates as <code>OffsetDateTime</code> (or <code>Instant</code>), never as strings, and never hard-code
<code>-05:00</code> in an assertion.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Mapping money to <code>double</code>. Use <code>BigDecimal</code> built from the string.</li>
<li>Comparing <code>BigDecimal</code> with <code>equals</code>: <code>new BigDecimal("1.0").equals(new BigDecimal("1.00"))</code> is <code>false</code> (different scale). Use <code>compareTo(...) == 0</code>, or compare the API's strings exactly.</li>
<li>Treating "field is <code>null</code>" and "field is missing" as the same. In REST Assured both read as <code>null</code>; check with <code>hasKey("nickname")</code> when the difference matters.</li>
<li>Counting JsonPath indexes from 1. <code>content[0]</code> is the first element.</li>
<li>Writing a JSON body by hand in Java strings and forgetting an escaped quote. Build it from a <code>Map</code> or a POJO.</li>
</ul></div>`,
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
        {
          title: "Pick fields out of a response without jq (Node one-liner)",
          lang: "bash",
          code: `
curl -s http://localhost:3000/api/v1/accounts -H "Authorization: Bearer $TOKEN" \\
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.table(JSON.parse(s).map(a=>({id:a.id,type:a.type,balance:a.balance}))))'`,
          note: "Node comes with the Ice Bank setup, so this works on every student machine. Notice that <code>balance</code> prints in quotes: it is a string.",
        },
        {
          title: "BigDecimal: equals vs compareTo",
          lang: "java",
          code: `
BigDecimal a = new BigDecimal("1.0");
BigDecimal b = new BigDecimal("1.00");

a.equals(b);             // false: same value, different scale (1 vs 2 decimals)
a.compareTo(b) == 0;     // true:  numerically equal

BigDecimal fromApi = new BigDecimal(response.jsonPath().getString("balance"));
assertEquals(0, fromApi.compareTo(new BigDecimal("5703.95")));`,
        },
        {
          title: "Dates with offsets: compare instants, not strings",
          lang: "java",
          code: `
OffsetDateTime oct30 = OffsetDateTime.parse("2026-10-30T10:15:00-04:00");
OffsetDateTime nov02 = OffsetDateTime.parse("2026-11-02T05:45:00-05:00");

assertTrue(nov02.isAfter(oct30));
assertEquals(ZoneOffset.ofHours(-5), nov02.getOffset());       // fine for this one value...
// ...but for "is it in October in Toronto?", convert to the zone instead of checking offsets:
LocalDate torontoDay = oct30.atZoneSameInstant(ZoneId.of("America/Toronto")).toLocalDate();`,
        },
      ],
      exercises: [
        "Paste the body of <code>GET /accounts</code> (as Emma) into a JSON viewer or Postman and list each field with its JSON type. Which fields are strings even though they hold numbers, and why?",
        "Write JsonPath expressions (and try them in a REST Assured test) for: the ids of Emma's accounts; the type of account 2; every account whose <code>status</code> is not <code>OPEN</code>; the sum of all balances (hint: collect and add in Java with <code>BigDecimal</code>).",
        "Break JSON on purpose in a <code>POST /transfers</code> body in five ways (trailing comma, single quotes, unquoted key, a comment, missing closing brace). Record what Ice Bank answers each time.",
        "Send a transfer with <code>amount</code> as the JSON number <code>1.1</code>, then as the string <code>\"1.10\"</code>, then <code>\"1.100\"</code>. Record which are accepted and what amount appears in the response.",
        "Call <code>GET /accounts/1/transactions?size=20</code> as Emma and use JsonPath to extract the list of <code>createdAt</code> values. Which offsets appear, from which date does each start, and why? Write one assertion that every <code>createdAt</code> parses as an <code>OffsetDateTime</code>, and one that checks the newest row is not older than the second one.",
      ],
      quiz: [
        {
          q: `In <code>"balance": "5703.95"</code>, what JSON type is the value?`,
          options: [`number`, `money`, `decimal`, `string`],
          answer: 3,
          explain: `It is in double quotes, so it is a string. Ice Bank sends money as strings with exactly two decimals so that no client turns it into an imprecise floating-point number.`,
        },
        {
          q: `<code>new BigDecimal("25.0").equals(new BigDecimal("25.00"))</code> returns?`,
          options: [`false`, `true`, `It throws an exception`, `It depends on the locale`],
          answer: 0,
          explain: `<code>equals</code> also compares the scale (number of decimals). Use <code>compareTo</code> for numeric equality, or compare the API's exact strings when the format itself is part of the contract.`,
        },
        {
          q: `What does the JsonPath <code>content.amount</code> return for a page of 5 transactions?`,
          options: [`The first amount`, `The sum of the amounts`, `A list of the 5 amounts, as strings`, `An error: you need an index`],
          answer: 2,
          explain: `Applying a field name to an array collects that field from every element. Here you get a List of 5 Strings.`,
        },
        {
          q: `Two transactions show <code>-04:00</code> and <code>-05:00</code> offsets. What does that tell you?`,
          options: [`The API has a bug: offsets must all be equal`, `One was created on QA`, `They happened on different sides of the daylight-saving change, and each is written with the offset valid in Toronto at that moment`, `One is pending`],
          answer: 2,
          explain: `Toronto is UTC−4 in summer and UTC−5 in winter (from 1 November in 2026). The instant is exact either way; compare parsed values, not offset strings.`,
        },
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
either the <code>Authorization</code> header or the <code>ib_at</code> cookie. Your API tests use the header.</p>

<h3>The sign-in conversation, as a sequence</h3>
<pre role="img" aria-label="Sequence: the client posts the password and gets an mfaToken; Ice Bank sends the OTP to Ice Mail; the client reads it and posts the mfaToken with the code; Ice Bank returns an access token and a refresh token" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 Test / client                     Ice Bank API                         Ice Mail
   │ POST /auth/login {email,password}  │                                   │
   │ ─────────────────────────────────► │ ── 6-digit OTP (valid 5 min) ───► │
   │ ◄── 200 {mfaToken, expiresIn:300}  │                                   │
   │ GET /inbox?email=..&amp;kind=OTP&amp;size=1  (X-Sandbox-Key)                   │
   │ ──────────────────────────────────────────────────────────────────►  │
   │ ◄──────────────────────────────────────────── {content[0].otpCode}   │
   │ POST /auth/mfa/verify {mfaToken, code}                                │
   │ ─────────────────────────────────► │                                   │
   │ ◄── 200 {accessToken (15 min), refreshToken (7 days)}                  │
   │ GET /accounts   Authorization: Bearer &lt;accessToken&gt;                   │
</pre>

<h3>Worked example: decoding a real access token</h3>
<p>An access token looks like <code>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzYngiOjEs...In0.UqrPqf44-IxjG...</code>. Split it at the dots and Base64URL-decode the first two parts:</p>
<ol>
<li><strong>Header</strong> <code>{"alg":"HS256","typ":"JWT"}</code>: signed with HMAC-SHA256, a secret only the server knows. You can read the token, but you cannot produce a valid signature.</li>
<li><strong>Payload</strong> <code>{"sbx":1,"role":"CUSTOMER","sid":"10c290cd-...","cid":1,"sub":"1","iss":"ice-bank","aud":"ice-bank-api","iat":1793894500,"exp":1793895400}</code>:
Emma (user <code>1</code>, customer <code>1</code>) in sandbox 1, valid for <code>exp − iat = 900</code> seconds.</li>
<li><strong>Signature</strong>: the third part. Change a single character in the header or payload and it no longer matches, so the server answers 401.</li>
</ol>
<p><code>iat</code> and <code>exp</code> are real-world Unix seconds (1793894500 is 5 November 2026, 16:01:40 UTC), checked against the real clock, not the sandbox clock.
Moving the sandbox clock forward does not expire your token; 15 real minutes do.</p>

<div class="table-wrap"><table>
<thead><tr><th></th><th>Access token</th><th>Refresh token</th></tr></thead>
<tbody>
<tr><td>Looks like</td><td>A JWT (three dot-separated parts)</td><td>An opaque random string</td></tr>
<tr><td>Lifetime</td><td>15 minutes (<code>expiresIn: 900</code>)</td><td>7 days</td></tr>
<tr><td>Sent</td><td>On every API call, in <code>Authorization: Bearer</code></td><td>Only to <code>POST /auth/refresh</code></td></tr>
<tr><td>After use</td><td>Reusable until it expires or you log out</td><td>Rotates: each refresh returns a new one and retires the old one</td></tr>
<tr><td>If stolen</td><td>Useful to an attacker for minutes</td><td>Useful for days, which is why reuse of a retired one ends the session</td></tr>
</tbody></table></div>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Signing in before <em>every</em> test. Login, MFA verify and refresh share a limit of 10 per minute per IP, so a suite of 30 tests hits <code>429 RATE_LIMITED</code>. Sign in once per persona and reuse the token until it is close to expiry.</li>
<li>Thinking a JWT is encrypted. Anyone can read the payload; never put secrets in it, and never paste real tokens into public websites.</li>
<li>Keeping using an old refresh token after a refresh. It is retired; using it again ends the whole session.</li>
<li>Waiting too long between login and verify: the <code>mfaToken</code> and the OTP are valid for 5 minutes (<code>expiresIn: 300</code>).</li>
<li>Committing a token or an environment file that contains one. Tokens are passwords with an expiry date.</li>
</ul></div>`,
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
        {
          title: "Decode the JWT header and payload in Git Bash",
          lang: "bash",
          code: `
decode() {   # Base64URL -> Base64, add padding, decode
  local p=$(echo "$1" | tr '_-' '/+')
  while [ $(( \${#p} % 4 )) -ne 0 ]; do p="$p="; done
  echo "$p" | base64 -d; echo
}
decode "$(echo "$TOKEN" | cut -d. -f1)"   # {"alg":"HS256","typ":"JWT"}
decode "$(echo "$TOKEN" | cut -d. -f2)"   # {"sbx":1,"role":"CUSTOMER",...,"iat":...,"exp":...}`,
        },
        {
          title: "Sign in once per persona and reuse the token (Java)",
          lang: "java",
          code: `
public final class TokenCache {
    private record Entry(String token, Instant expiresAt) {}
    private static final Map<String, Entry> CACHE = new ConcurrentHashMap<>();

    public static String tokenFor(String email) {
        Entry e = CACHE.get(email);
        if (e == null || Instant.now().isAfter(e.expiresAt().minusSeconds(60))) {
            String token = AuthClient.signIn(email, Config.password());   // lesson example above
            e = new Entry(token, Instant.now().plusSeconds(900));
            CACHE.put(email, e);
        }
        return e.token();
    }
}`,
          note: "Renewing a minute early avoids a token expiring in the middle of a test. One sign-in per persona per 14 minutes stays far below the 10-per-minute login limit.",
        },
      ],
      exercises: [
        "Sign in as Emma with curl (or Postman) step by step, printing each response. Write down how many seconds the OTP and the access token are valid, taken from the responses.",
        "Decode your access token's payload (DevTools console or any offline Base64URL decoder, see Tutorial 3) and check <code>exp − iat</code>. Change one character in the middle of the token and call <code>GET /me</code>. Record the status and <code>code</code>.",
        "Call <code>POST /auth/refresh</code> with your refresh token, then call it again with the <em>same old</em> refresh token. Then try the newest refresh token. Explain what happened to the session and why that design is safer.",
        "Call <code>POST /auth/logout</code>, then reuse the access token on <code>GET /accounts</code>. Record the result. Write down what the correct behaviour is and why.",
        "With Noah's account, enter a wrong OTP three times on <code>/auth/mfa/verify</code>. Record the <code>code</code> on each attempt, and what happens if you then send the correct code.",
      ],
      quiz: [
        {
          q: `You decode an Ice Bank access token and can read <code>"role":"CUSTOMER"</code>. What does that mean?`,
          options: [`The token is broken: a JWT should be encrypted`, `Anyone who can read it can also change the role`, `That is normal: the payload is only encoded; the signature is what stops anyone changing it`, `The token has expired`],
          answer: 2,
          explain: `Base64URL is an encoding, not encryption. If you edit the payload to "ADMIN", the HS256 signature no longer matches and the server answers 401.`,
        },
        {
          q: `You refresh, get a new pair, then accidentally call <code>POST /auth/refresh</code> again with the <em>old</em> refresh token. What happens?`,
          options: [`The reuse is treated as theft: the whole session is ended`, `You get another new pair`, `Nothing, the old token still works for 7 days`, `You get a 429`],
          answer: 0,
          explain: `Refresh tokens rotate. A retired one should never be seen again; if it is, someone may have stolen it, so Ice Bank revokes the session.`,
        },
        {
          q: `Your 30-test suite signs in before each test and starts failing after about 10 tests with 429. Best fix?`,
          options: [`Add <code>Thread.sleep(60000)</code> between tests`, `Use a different email for each test`, `Turn off MFA`, `Sign in once per persona and reuse the access token until it nears expiry`],
          answer: 3,
          explain: `Login-type endpoints are limited to 10 per minute per IP. Caching the token per persona is faster and stays within the limit. (<code>PERF_MODE=true</code> turns limits off, but only for load tests.)`,
        },
        {
          q: `Why does the web UI keep the token in an <code>HttpOnly</code> cookie instead of in JavaScript?`,
          options: [`HttpOnly cookies are faster`, `Page JavaScript cannot read an HttpOnly cookie, so an XSS bug cannot steal the token`, `So the token never expires`, `Because the API only accepts cookies`],
          answer: 1,
          explain: `The browser still sends the cookie automatically, but scripts (including injected ones) cannot read it. The API also accepts the Authorization header, which is what your tests use.`,
        },
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
Dates are Toronto dates and inclusive at both ends. <code>totalElements</code> reflects the filter, so it is your count to compare with SQL.</p>

<h3>Worked example: paging through 334 transactions</h3>
<p>After a reset, Emma's chequing account has <code>totalElements = 334</code>. Ask for <code>size=50</code>:</p>
<pre role="img" aria-label="334 items in pages of 50: pages 0 to 5 hold 50 items each, page 6 holds 34, page 7 is empty" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 page:   0      1      2      3      4      5      6      7
 items: [50]   [50]   [50]   [50]   [50]   [50]   [34]   [ ]  ← past the end: 200, empty content
 rows:  1-50  51-100 ...                          301-334
</pre>
<ol>
<li><code>totalPages = ceil(334 / 50) = ceil(6.68) = 7</code>, so the pages are numbered 0 to 6.</li>
<li>The last page holds <code>334 − 50 × 6 = 34</code> items.</li>
<li><code>page=7</code> is past the end: <code>200</code> with <code>"content": []</code> and the same <code>totalElements</code>, not an error.</li>
<li>Page <em>n</em> of size <em>s</em> is SQL's <code>LIMIT s OFFSET n × s</code>, in the same order. <code>?page=1&amp;size=5</code> is
<code>ORDER BY created_at DESC, id DESC LIMIT 5 OFFSET 5</code> (second example below).</li>
</ol>

<h3>When the data moves while you page</h3>
<p>Pages are computed fresh for every request. If a new transaction arrives between your request for page 0 and page 1, every row shifts down one place: the last row of page 0
appears again at the top of page 1 (a duplicate), and when a row disappears from a filter you can skip one instead. Real clients live with this; a test that walks pages must
make sure nothing else changes the data while it walks, or compare sets of ids instead of positions.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Starting at <code>page=1</code> because "page one" sounds like the first page. Ice Bank pages start at 0.</li>
<li>Computing <code>totalPages</code> with integer division (<code>334 / 50 = 6</code> in Java). Use ceiling division.</li>
<li>Sorting by a non-unique field (<code>sort=amount,desc</code>) and expecting a stable order between pages; ties can swap. Compare with SQL using the same tie-breaker.</li>
<li>Walking pages while another test (or the app's own scheduled work) adds rows, then reporting the duplicate as a bug without checking.</li>
<li>Asserting <code>content.size() == size</code> on every page, including the last.</li>
</ul></div>`,
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
        {
          title: "Print only the paging fields of a response",
          lang: "bash",
          code: `
curl -s "http://localhost:3000/api/v1/accounts/1/transactions?size=50" -H "Authorization: Bearer $TOKEN" \\
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s);console.log({page:b.page,size:b.size,totalElements:b.totalElements,totalPages:b.totalPages,onThisPage:b.content.length})})'

# { page: 0, size: 50, totalElements: 334, totalPages: 7, onThisPage: 50 }   (after a reset)`,
        },
        {
          title: "The same page in SQL: ?page=1&size=5 = LIMIT 5 OFFSET 5",
          lang: "sql",
          code: `
SELECT id, created_at, amount
FROM transactions
WHERE sandbox_id = 1
  AND account_id = 1
ORDER BY created_at DESC, id DESC
LIMIT 5 OFFSET 5;`,
          note: "Compare the five ids with <code>content[*].id</code> of <code>GET /accounts/1/transactions?page=1&amp;size=5</code>. Same order, same ids.",
        },
      ],
      exercises: [
        "Without looking at Swagger, guess the method and URL for: list my payees; delete payee 7; read my notifications; mark notification 12 as read; unlock user 2 as an admin. Then check your guesses in Swagger.",
        "For account 1, request <code>size=7</code> and work out how many items the last page must have. Request that last page and the page after it. Write down what you expected and what you got.",
        "Send <code>size=0</code>, <code>size=101</code>, <code>page=-1</code>, <code>page=abc</code> and <code>sort=balance,desc</code>. Tabulate the status and the <code>errors[].message</code> for each.",
        "Implement the page-walking test above. Add a JDBC <code>count(*)</code> for account 1 and assert it equals <code>totalElements</code>.",
        "Fetch <code>GET /accounts/1/transactions?page=1&amp;size=5</code> and run the SQL <code>LIMIT 5 OFFSET 5</code> example; confirm both list the same ids in the same order. Then fetch <code>page=0&amp;size=5</code>, make a $1.00 transfer from account 1 to account 2, and fetch <code>page=1&amp;size=5</code> again. What changed, and what would a page-walking test that ran during that transfer have reported?",
      ],
      quiz: [
        {
          q: `<code>totalElements</code> is 334 and you request <code>size=50</code>. How many pages are there, and how many items are on the last one?`,
          options: [`6 pages, the last has 50`, `7 pages (0 to 6), the last has 34`, `7 pages, the last has 50`, `8 pages, the last is empty`],
          answer: 1,
          explain: `ceil(334 / 50) = 7 pages, numbered 0 to 6. The first six hold 300 items, so page 6 holds 34.`,
        },
        {
          q: `What does Ice Bank answer for a page beyond the last one, such as <code>page=7&amp;size=50</code> above?`,
          options: [`404 Not Found`, `200 with an empty <code>content</code> array`, `400 VALIDATION_FAILED`, `The last page again`],
          answer: 1,
          explain: `Asking past the end is a valid request with no results. The paging fields still report <code>totalElements</code> and <code>totalPages</code>.`,
        },
        {
          q: `Which SQL returns the same rows as <code>?page=2&amp;size=20</code> on transactions?`,
          options: [`<code>LIMIT 20 OFFSET 2</code>`, `<code>LIMIT 20 OFFSET 20</code>`, `<code>LIMIT 40 OFFSET 20</code>`, `<code>LIMIT 20 OFFSET 40</code> with <code>ORDER BY created_at DESC, id DESC</code>`],
          answer: 3,
          explain: `Pages start at 0, so page 2 skips pages 0 and 1: 2 × 20 = 40 rows. The ORDER BY must match the API's default order, including the tie-breaker.`,
        },
        {
          q: `A page-walking test found the same id on page 0 and page 1. What should you check before filing a bug?`,
          options: [`Whether rows were added while the test was paging (which shifts every row down) and whether the sort has a unique tie-breaker`, `Nothing, it is always a bug`, `Whether the size was even`, `Whether the token expired`],
          answer: 0,
          explain: `Offset paging recomputes each page. A new row between two requests pushes the previous page's last item onto the next page. If nothing changed and the order is total, a duplicate really is a bug.`,
        },
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
an offset, a money value returned as a number, a missing <code>Location</code>, a new unexpected field.</p>

<h3>Worked example: reading one operation, POST /transfers</h3>
<p>Open <em>Transfers → POST /api/v1/transfers</em> and read it top to bottom; this is the contract your tests check against:</p>
<div class="table-wrap"><table>
<thead><tr><th>Section</th><th>What it says</th><th>Test idea it gives you</th></tr></thead>
<tbody>
<tr><td>Parameters</td><td><code>Idempotency-Key</code>, in: header, <strong>required</strong>, string, <code>maxLength: 100</code></td><td>No key → 400; a 101-character key → 400; same key twice → replay</td></tr>
<tr><td>Request body schema</td><td><code>fromAccountId</code>, <code>toAccountId</code> (integers &gt; 0) and <code>amount</code> (string, "$0.01 to $999,999.99, at most 2 decimals") are required; <code>memo</code> is optional, max 100 characters</td><td>Each required field missing; <code>amount</code> at 0.00, 0.01, 999999.99, 1000000.00 and with 3 decimals; a 101-character memo</td></tr>
<tr><td>Example value</td><td><code>{"fromAccountId":1,"toAccountId":2,"amount":"250.00","memo":"Rent savings"}</code></td><td>A valid starting body for your positive test</td></tr>
<tr><td>Responses</td><td><code>201</code>, <code>400</code>, <code>401</code>, <code>404</code>, <code>409</code>, <code>422</code>, <code>429</code></td><td>One test per documented error; an undocumented status in practice is a contract finding</td></tr>
</tbody></table></div>

<h3>The shape of the OpenAPI document</h3>
<pre role="img" aria-label="Tree of the OpenAPI JSON: info, servers, paths with methods and their parameters, requestBody and responses, and components with schemas and securitySchemes" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 openapi.json
 ├── info, servers
 ├── paths
 │   └── "/api/v1/transfers"
 │       ├── get   { summary, parameters, responses }
 │       └── post  { summary, description, parameters[ Idempotency-Key ],
 │                   requestBody.content["application/json"].schema,
 │                   responses{ "201", "400", "401", "404", "409", "422", "429" } }
 └── components
     ├── schemas          (reusable objects)
     └── securitySchemes  bearerAuth, sandboxKey
</pre>
<p>Ice Bank's document has 64 paths, each key starting with <code>/api/v1</code>. Because it is plain JSON, a few lines of code can answer questions such as "which endpoints
require an Idempotency-Key?" (second example below).</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Typing <code>Bearer eyJ...</code> into Authorize. Swagger adds the word itself; paste only the token.</li>
<li>Forgetting that <em>Try it out</em> is real. Executing <code>POST /transfers</code> moves money in your sandbox, and <code>POST /test/reset</code> wipes everyone's local data back to the seed.</li>
<li>Treating the example as the rules. Examples show one valid value; the <em>Schema</em> tab has the actual constraints (required, patterns, lengths).</li>
<li>Re-using a token in Authorize after it expired (15 minutes): every call then shows 401 and looks like a bug.</li>
<li>Deciding which side is "right" when the contract and the behaviour disagree. Report the mismatch; the team decides which to fix.</li>
</ul></div>`,
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
        {
          title: "Print one operation from the contract (Node)",
          lang: "javascript",
          code: `
// Save as show-operation.mjs and run: node show-operation.mjs
const doc = await (await fetch("http://localhost:3000/api/v1/openapi.json")).json();
const op = doc.paths["/api/v1/transfers"].post;

console.log(op.summary);
for (const p of op.parameters ?? []) console.log("param:", p.in, p.name, p.required ? "(required)" : "");
const schema = op.requestBody.content["application/json"].schema;
console.log("body required:", schema.required);
console.log("responses:", Object.keys(op.responses).join(", "));`,
        },
        {
          title: "Which endpoints require an Idempotency-Key?",
          lang: "javascript",
          code: `
// Save as idempotent-endpoints.mjs and run: node idempotent-endpoints.mjs
const doc = await (await fetch("http://localhost:3000/api/v1/openapi.json")).json();
for (const [path, ops] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    const needsKey = (op.parameters ?? []).some(p => p.name?.toLowerCase() === "idempotency-key" && p.required);
    if (needsKey) console.log(method.toUpperCase(), path);
  }
}`,
        },
      ],
      exercises: [
        "Sign in through Swagger alone (no Postman, no curl) and call <code>GET /accounts</code>. Copy the curl command Swagger shows you and run it in Git Bash.",
        "For <code>POST /etransfers</code>, write a table of every error the contract documents (status + <code>code</code> + example detail). For each one, write one test case idea that would trigger it with Emma's data.",
        "Find three endpoints whose <code>201</code> response documents a <code>Location</code> header. Call one and check the header really is there.",
        "Run the Node script to list every endpoint. Count the endpoints per tag, and compare with the endpoint catalogue your instructor gave you. Note anything missing or extra.",
        "Run the \"Which endpoints require an Idempotency-Key?\" script. Compare its output with the list in lesson 2 of this tutorial and with the README. Then pick one of the endpoints and check in Swagger that its parameter description explains the replay and 409 behaviour.",
      ],
      quiz: [
        {
          q: `Where in Swagger do you find the exact error codes an endpoint can return, such as <code>DAILY_LIMIT_EXCEEDED</code>?`,
          options: [`In the operation's description and its Responses section`, `Only in the server log`, `In the Authorize dialog`, `In the browser's address bar`],
          answer: 0,
          explain: `Ice Bank writes the business rules and their codes into each operation's description, and each documented status has an example problem body. That is your test oracle.`,
        },
        {
          q: `What do you paste into Authorize → <em>bearerAuth</em>?`,
          options: [`<code>Bearer eyJhbGci...</code>`, `Your password`, `Only the access token itself, <code>eyJhbGci...</code>`, `The refresh token`],
          answer: 2,
          explain: `Swagger builds the header <code>Authorization: Bearer &lt;value&gt;</code> for you. Pasting "Bearer " too produces <code>Bearer Bearer ...</code> and a 401.`,
        },
        {
          q: `The Example Value for a field is <code>"250.00"</code>. Where do you find whether <code>"0.001"</code> is allowed?`,
          options: [`Nowhere, examples are the rules`, `In the response headers`, `In the Schema (type, pattern, description, required), not in the example`, `Only by asking a developer`],
          answer: 2,
          explain: `An example is one valid value. The schema and its description carry the constraints: here "$0.01 to $999,999.99, at most 2 decimals".`,
        },
        {
          q: `The contract documents <code>201</code> with a <code>Location</code> header, but the API returns <code>200</code> without one. What do you do?`,
          options: [`Report it as a contract mismatch with both the documented and the actual behaviour`, `Update your test to expect 200`, `Ignore it, the status is still 2xx`, `Change the OpenAPI file yourself`],
          answer: 0,
          explain: `Either the code or the document is wrong, and clients depend on both. Your job is to make the mismatch visible with evidence, not to quietly adapt the test.`,
        },
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
<p>Keep secrets out of exported collections: put them in the environment, mark them secret, and never commit an environment file with your QA key (Tutorial 6).</p>

<h3>Worked example: how Postman resolves a variable</h3>
<p>The same name can be defined in several places. When Postman sees <code>{{baseUrl}}</code> it uses the value from the <em>narrowest</em> scope that has one:</p>
<div class="table-wrap"><table>
<thead><tr><th>Scope (wins from top to bottom)</th><th>Set with</th><th>Typical use in the Ice Bank collection</th></tr></thead>
<tbody>
<tr><td>Local</td><td><code>pm.variables.set()</code> in a script</td><td>A value only for the current request run</td></tr>
<tr><td>Data</td><td>A CSV/JSON data file in the Collection Runner</td><td>One row per persona for a data-driven run</td></tr>
<tr><td>Environment</td><td>The environment editor, <code>pm.environment.set()</code></td><td><code>baseUrl</code>, <code>email</code>, <code>sandboxKey</code>, <code>accessToken</code></td></tr>
<tr><td>Collection</td><td>The collection's Variables tab</td><td>Constants that never change between local and QA</td></tr>
<tr><td>Global</td><td><code>pm.globals.set()</code></td><td>Avoid: shared by every collection in your workspace</td></tr>
</tbody></table></div>
<p>So if <code>baseUrl</code> exists in both the collection and the selected environment, the environment's value is used. A variable shown in <span style="color:#B42318">red</span> in the
URL bar is not defined in any active scope, usually because no environment is selected.</p>
<p>Every variable also has an <strong>initial value</strong> (saved and shared when you export or sync) and a <strong>current value</strong> (only on your machine). Put secrets such
as your QA sandbox key only in the <em>current</em> value.</p>

<pre role="img" aria-label="Chain: login saves mfaToken, inbox saves otp, verify saves accessToken, every later request uses accessToken" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 POST /auth/login ─saves─► {{mfaToken}}
 GET  /inbox      ─saves─► {{otp}}
 POST /auth/mfa/verify (uses mfaToken + otp) ─saves─► {{accessToken}}, {{refreshToken}}
 every other request: Authorization = Bearer {{accessToken}}  (inherited from the collection)
</pre>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>No environment selected (top right): every <code>{{variable}}</code> is unresolved and requests go to a literal <code>{{baseUrl}}</code>.</li>
<li>Putting the QA key or a token in an <em>initial</em> value, then exporting or syncing the environment.</li>
<li>Sending requests out of order: <code>verify</code> before <code>inbox</code> uses an old <code>{{otp}}</code> and fails.</li>
<li>Setting <em>Bearer Token</em> on each request instead of <em>Inherit auth from parent</em>: the token then has to be updated in 50 places.</li>
<li>Running the whole collection without noticing that it starts with a reset. That is fine locally, and a reason never to point it at a shared server.</li>
</ul></div>`,
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
        {
          title: "Tests that check the error contract (any 4xx request)",
          lang: "javascript",
          code: `
// e.g. GET {{baseUrl}}/accounts/5 as Emma
pm.test("404 for another customer's account", () => pm.response.to.have.status(404));
pm.test("problem+json content type", () =>
  pm.expect(pm.response.headers.get("Content-Type")).to.include("application/problem+json"));
const p = pm.response.json();
pm.test("RFC 7807 fields present", () => {
  pm.expect(p).to.include.keys("type", "title", "status", "detail", "instance", "code");
  pm.expect(p.status).to.eql(pm.response.code);
});
pm.test("machine-readable code", () => pm.expect(p.code).to.eql("NOT_FOUND"));`,
        },
        {
          title: "Remember when the token expires (add to the verify request's script)",
          lang: "javascript",
          code: `
const t = pm.response.json();
pm.environment.set("accessToken", t.accessToken);
pm.environment.set("tokenExpiresAt", Date.now() + t.expiresIn * 1000);

// In a collection-level pre-request script you can then warn early:
// if (Date.now() > Number(pm.environment.get("tokenExpiresAt")) - 60000) {
//   console.warn("Access token expires within a minute: run 1. Sign in again");
// }`,
        },
        {
          title: "Run the collection from the command line with Newman",
          lang: "bash",
          code: `
npx newman run postman/IceBank.postman_collection.json \\
  -e postman/IceBank-local.postman_environment.json \\
  --working-dir postman`,
          note: "From the Ice Bank project folder. The provided collection starts with a reset of your <em>local</em> data, so it can run again and again; your own collection does not have to.",
        },
      ],
      exercises: [
        "Create the <em>Ice Bank local</em> environment and a collection with the three sign-in requests and their scripts. Run them in order and confirm <code>accessToken</code> is filled in.",
        "Add folders Accounts and Transfers with at least six requests (list accounts, one account, transactions with filters, create transfer, get transfer by <code>{{transferId}}</code>, a 422 case). Give every request at least two <code>pm.test</code> checks.",
        "Run the whole collection with the Collection Runner. Export the run results and save a screenshot. Every test should be green on local.",
        "Duplicate the environment as <em>Ice Bank QA</em> with your QA values and run the collection against QA. Note every request that behaves differently; these are bug candidates.",
        "Export the collection (v2.1 JSON) and commit it to your framework repo under <code>postman/</code>. Check the exported file does not contain your QA sandbox key or any token.",
      ],
      quiz: [
        {
          q: `<code>baseUrl</code> is defined in the collection variables <em>and</em> in the selected environment with different values. Which one does a request use?`,
          options: [`The environment's, because environment scope is narrower than collection scope`, `The collection's`, `Whichever was created first`, `Postman shows an error`],
          answer: 0,
          explain: `Postman resolves from the narrowest scope outwards: local, data, environment, collection, global. That is what lets one collection run against local and QA by switching environments.`,
        },
        {
          q: `Where should your personal QA sandbox key live in Postman?`,
          options: [`In the request URL`, `In a global variable`, `In the collection's initial value so the team has it`, `In the environment's <em>current</em> value, marked secret`],
          answer: 3,
          explain: `Current values stay on your machine; initial values are exported and synced. Secrets belong only in current values.`,
        },
        {
          q: `Why set Authorization once on the collection with <code>{{accessToken}}</code>?`,
          options: [`Postman requires it`, `Every request inherits it, so a new token is picked up everywhere at once`, `It makes requests faster`, `It hides the token from the Console`],
          answer: 1,
          explain: `With "Inherit auth from parent", the sign-in chain updates one variable and all 50 requests use it. Per-request tokens go stale one by one.`,
        },
        {
          q: `What is "chaining" in Postman?`,
          options: [`Running two collections at once`, `A script saving part of one response into a variable that a later request uses`, `Linking two environments`, `Retrying failed requests`],
          answer: 1,
          explain: `The sign-in flow is the classic chain: login → mfaToken, inbox → otp, verify → accessToken. REST Assured does the same with <code>extract().path(...)</code> and Java variables.`,
        },
      ],
    },
  ],
});
