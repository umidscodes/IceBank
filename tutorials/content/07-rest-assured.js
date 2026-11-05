/* Tutorial 7: REST Assured with Ice Bank. Builds on starter/ (Config, Specs, AuthClient, clients, model records).
 * Every Java example was compiled and run against a local clean build (REST Assured 5.5.7, JUnit 5.14, Java 17).
 * Code blocks use String.raw so regex backslashes show exactly as they are typed in Java. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "rest-assured",
  number: 7,
  title: "REST Assured with Ice Bank",
  summary: "Two weeks of API testing in Java: from the first given/when/then to chained money flows, contracts, files, authorization and a run on QA, all on top of the starter project.",
  intro: `
<p>This tutorial is weeks 1 and 2 of the exercise map: <strong>REST Assured foundations</strong> (lessons 1 to 6) and <strong>REST Assured advanced</strong> (lessons 7 to 13).
Every lesson grows the Maven project in <code>starter/</code>: you add test classes under <code>src/test/java/com/icebank/tests/api</code>, and new clients and helpers next to
<code>AccountsClient</code> and <code>TransfersClient</code>. Read <code>starter/README.md</code> once before lesson 1; keep
<a href="http://localhost:3000/swagger" target="_blank" rel="noopener">Swagger</a> open all the time. Week 1 is done when you have 20 or more green tests of your own against
local; week 2 when your suite covers POJOs, schemas, boundaries, authorization, idempotency, pagination, files and the clock, and runs on QA.</p>
<div class="callout rule"><p><strong>Data rules for every exercise.</strong> Your local Ice Bank may be shared (a teammate, a Postman run, a second terminal), so:</p>
<ul>
<li><strong>Emma is read-only.</strong> Read her accounts, transactions and statements as much as you like; never move her money or change her settings.</li>
<li><strong>Writes use a throwaway customer</strong> you register yourself (lesson 5 shows how), or tiny, reversible transfers on Sophie Bouchard (customer 7), like the starter's
<code>TransfersApiTest</code> does.</li>
<li><strong>No reset and no clock moves</strong> in the normal run. Tests that call <code>POST /test/reset</code> or <code>POST /test/clock</code> carry <code>@Tag("destructive")</code> and run
only against a sandbox that is yours alone (lesson 13).</li>
</ul></div>
<p>Examples use REST Assured 5.5, JUnit 5, AssertJ, Jackson and Allure, exactly as pinned in the starter's <code>pom.xml</code>. The first examples (lessons 1 to 3) show complete
classes with their imports; later examples show only what is new, so let your IDE add the imports (the static ones come from <code>RestAssured</code>,
<code>org.hamcrest.Matchers</code> and AssertJ's <code>Assertions</code>).</p>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "setup",
      title: "REST Assured setup and a tour of the starter",
      summary: "What is already in the starter project, how one request travels through it, and your first test class.",
      links: [{ label: "Open Swagger", href: "http://localhost:3000/swagger" }, { label: "Health check", href: "http://localhost:3000/api/v1/test/health" }],
      body: `
<p>REST Assured is a Java library that turns an HTTP call into one readable sentence: <em>given</em> this request, <em>when</em> I send it, <em>then</em> the response looks like
this. It is only a client: it sends exactly the requests you could send with curl or Postman (Tutorial 2), and it gives you assertions on the answer. The starter project already
contains everything around it, so a new test is a few lines.</p>

<h3>What the starter gives you</h3>
<div class="table-wrap"><table>
<thead><tr><th>Class</th><th>Job</th><th>You use it as</th></tr></thead>
<tbody>
<tr><td><code>config/Config</code></td><td>Loads <code>config/{env}.properties</code> (<code>-Denv=local</code> by default), with overrides from <code>-Dkey=</code> and <code>ICEBANK_*</code> variables. Fails fast on <code>CHANGE_ME</code>.</td><td><code>Config.baseUrl()</code>, <code>Config.sandboxKey()</code></td></tr>
<tr><td><code>api/Specs</code></td><td>Shared <code>RequestSpecification</code>s: base URI, <code>/api/v1</code>, JSON, the Jackson mapper, filters, secret masking.</td><td><code>given().spec(Specs.base())</code>, <code>Specs.as(email)</code>, <code>Specs.sandbox()</code></td></tr>
<tr><td><code>api/RequestIdFilter</code>, <code>ApiLogFilter</code></td><td>Add an <code>X-Request-Id</code> to every call; log one line per call (bodies of errors at DEBUG in <code>target/logs/tests.log</code>).</td><td>automatic</td></tr>
<tr><td><code>api/AuthClient</code>, <code>InboxClient</code></td><td>The two-step sign-in with the OTP read from Ice Mail, and a token cache.</td><td>lesson 5</td></tr>
<tr><td><code>api/AccountsClient</code>, <code>TransfersClient</code>, <code>TestSupportClient</code></td><td>One method per endpoint; raw methods return <code>Response</code>, typed helpers return records.</td><td><code>accounts.get(email, id)</code></td></tr>
<tr><td><code>model/*</code></td><td>Records for <code>Account</code>, <code>Transaction</code>, <code>Page&lt;T&gt;</code>, <code>Transfer</code>, <code>TransferRequest</code>, <code>Problem</code>, <code>Tokens</code>.</td><td>lesson 6</td></tr>
<tr><td><code>support/Personas</code>, <code>TestData</code></td><td>Persona emails with the environment's suffix, fixed ids, money helpers.</td><td><code>Personas.EMMA</code>, <code>TestData.money("1.00")</code></td></tr>
</tbody></table></div>

<h3>How one request travels</h3>
<pre role="img" aria-label="Diagram: a test calls given().spec(Specs.as(EMMA)); the spec adds base URI, JSON headers and a bearer token; three filters run; the request reaches Ice Bank; the response comes back through the filters to the then() assertions" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 test:  given().spec(Specs.as(Personas.EMMA)).when().get("/accounts").then().statusCode(200)
          │
 Specs.as(email) = Specs.base()  +  Authorization: Bearer &lt;AuthClient.accessToken(email)&gt;
 Specs.base()    = http://localhost:3000  +  /api/v1  +  JSON in/out  +  Jackson mapper  +  masking
          │
 filters: RequestIdFilter (adds X-Request-Id) → ApiLogFilter (one log line) → AllureRestAssured (report)
          │
          ▼
 Ice Bank  GET /api/v1/accounts  →  200 [ {...}, {...} ]  →  back through the filters  →  then() assertions
</pre>

<h3>Worked example: your first test class</h3>
<p>Create <code>src/test/java/com/icebank/tests/api/MyFirstApiTest.java</code> (first example below). The first test spells everything out; the second uses the spec.</p>
<ol>
<li><code>given()</code> starts a <code>RequestSpecification</code>. <code>baseUri</code> and <code>basePath</code> say where; <code>log().uri()</code> prints the full URL before sending.</li>
<li><code>.when().get("/test/health")</code> sends the request. <code>when()</code> does nothing by itself: it is there so the sentence reads well.</li>
<li><code>.then()</code> switches to the response. <code>statusCode(200)</code> and <code>body("status", equalTo("UP"))</code> are assertions: if one fails, the test fails with a message
naming the path, the expected and the actual value, and (because <code>Specs.config()</code> enables it) the whole request and response are printed.</li>
<li>Run it: <code>mvn test -Dtest=MyFirstApiTest</code>. Then look at <code>target/logs/tests.log</code> for the log lines and their <code>X-Request-Id</code>.</li>
</ol>
<p>The long form is for understanding only. In real tests, never write a URL: start from <code>Specs.base()</code>, <code>Specs.as(email)</code> or a client method, so switching to QA
is one flag (lesson 13).</p>

<h3>Running tests</h3>
<ul>
<li><code>mvn test</code> runs everything except <code>@Tag("destructive")</code>. <code>-Dgroups=api</code> picks a tag; <code>-Dtest=Class</code> or <code>-Dtest="Class#method*"</code> picks tests.</li>
<li>In PowerShell quote every flag: <code>mvn test "-Dtest=MyFirstApiTest"</code>.</li>
<li>Methods and classes run in a <strong>random order</strong> (<code>junit-platform.properties</code>), so a test that secretly depends on another one fails early.</li>
</ul>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Importing <code>given</code> from the wrong place. It is <code>import static io.restassured.RestAssured.given;</code> and the matchers come from <code>org.hamcrest.Matchers</code>.</li>
<li>Writing <code>http://localhost:3000</code> in a test. It works today and breaks the QA run. Use <code>Specs</code>.</li>
<li>Forgetting that paths in this project are relative to <code>/api/v1</code>: <code>get("/api/v1/accounts")</code> through <code>Specs.base()</code> calls <code>/api/v1/api/v1/accounts</code> (404).</li>
<li>Running the destructive tests "just to see": <code>-Dgroups=destructive -DexcludedGroups=</code> resets the whole sandbox for everyone using it.</li>
<li>Ice Bank not running: <code>Connection refused</code> means start it with <code>npm run dev</code>, not that your test is wrong.</li>
</ul></div>`,
      examples: [
        {
          title: "tests/api/MyFirstApiTest.java",
          lang: "java",
          code: String.raw`
package com.icebank.tests.api;

import com.icebank.api.Specs;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

@Tag("api")
@DisplayName("My first API tests")
class MyFirstApiTest {

    @Test
    @DisplayName("Health check, written the long way (no spec)")
    void healthTheLongWay() {
        given()
                .baseUri("http://localhost:3000")
                .basePath("/api/v1")
                .log().uri()
        .when()
                .get("/test/health")
        .then()
                .log().status()
                .statusCode(200)
                .body("status", equalTo("UP"))
                .body("build", equalTo("clean"));
    }

    @Test
    @DisplayName("Health check through the shared spec")
    void healthThroughTheSpec() {
        given().spec(Specs.base())
        .when().get("/test/health")
        .then().statusCode(200).body("database", equalTo("UP"));
    }
}`,
          note: "The first test prints <code>Request URI: http://localhost:3000/api/v1/test/health</code> and <code>HTTP/1.1 200 OK</code>. The second one logs only the <code>ApiLogFilter</code> line.",
        },
        {
          title: "The dependencies that matter (from starter/pom.xml)",
          lang: "xml",
          code: String.raw`
<dependency>
    <groupId>io.rest-assured</groupId>
    <artifactId>rest-assured</artifactId>
    <version>5.5.7</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>io.rest-assured</groupId>
    <artifactId>json-schema-validator</artifactId>   <!-- lesson 6 -->
    <version>5.5.7</version>
    <scope>test</scope>
</dependency>
<!-- also: junit-jupiter, jackson-databind + jackson-datatype-jsr310, assertj-core,
     allure-jupiter + allure-rest-assured, slf4j + logback -->`,
        },
        {
          title: "Commands you will use every day",
          lang: "bash",
          code: String.raw`
mvn test -Dtest=MyFirstApiTest                 # one class
mvn test -Dtest="MyFirstApiTest#health*"       # matching methods
mvn test -Dgroups=api                          # every @Tag("api") test, destructive ones excluded
mvn test -Dtest=AccountsApiTest -Denv=local    # explicit environment (the default)
grep "X-Request-Id" target/logs/tests.log      # one line per call, with its request id`,
        },
      ],
      exercises: [
        "Run <code>mvn test -Dgroups=api</code> on the untouched starter. Write down how many tests ran, which classes they came from, and why <code>TestSupportDestructiveTest</code> is not among them. Name the line in <code>pom.xml</code> responsible.",
        "Without running anything, find in the starter the exact place where each of these is set: the base URL, the <code>/api/v1</code> base path, the JSON content type, the <code>Authorization</code> header, the <code>X-Sandbox-Key</code> header, and the code that waits when Ice Bank answers 429. Give class and method names.",
        "Create <code>MyFirstApiTest</code> from the example and run it. Then make <em>both</em> tests fail on purpose (expect <code>\"DOWN\"</code>), run again and compare the two failures in the console. Copy one failure message. One failure prints much more than the other: what, and which line of <code>Specs</code> explains the difference?",
        "Run <code>HealthApiTest</code> three times and compare the order of its methods in the console. Explain why it changes, and find out how you would make JUnit repeat one particular order while you debug.",
      ],
      quiz: [
        {
          q: "Which import gives you <code>given()</code>?",
          options: ["<code>import static org.hamcrest.Matchers.given;</code>", "<code>import io.restassured.given;</code>", "<code>import static io.restassured.RestAssured.given;</code>", "<code>import static org.junit.jupiter.api.Assertions.given;</code>"],
          answer: 2,
          explain: "<code>given()</code> is a static method of <code>RestAssured</code>. Hamcrest provides the matchers such as <code>equalTo</code>.",
        },
        {
          q: "Through <code>Specs.base()</code>, what URL does <code>.get(\"/accounts\")</code> call locally?",
          options: ["<code>http://localhost:3000/api/v1/accounts</code>", "<code>http://localhost:3000/accounts</code>", "<code>http://localhost/api/v1/accounts</code>", "It depends on the test method name"],
          answer: 0,
          explain: "<code>Specs.base()</code> sets the base URI from <code>Config.baseUrl()</code> and the base path <code>/api/v1</code>; the path you pass is appended.",
        },
        {
          q: "Why does the default <code>mvn test</code> skip <code>TestSupportDestructiveTest</code>?",
          options: ["It has no <code>@Test</code> methods", "Maven skips classes whose name contains Destructive", "It only runs on QA", "It is tagged <code>destructive</code> and the pom sets <code>excludedGroups</code> to <code>destructive</code>"],
          answer: 3,
          explain: "The <code>excludedGroups</code> property in the pom excludes that tag. Clearing it (<code>-DexcludedGroups=</code>) runs them, which resets the sandbox.",
        },
        {
          q: "What does <code>.when()</code> do on its own?",
          options: ["Sends the request", "Nothing: it is syntactic sugar so the test reads as a sentence", "Waits for the server", "Validates the request body"],
          answer: 1,
          explain: "The request is sent by <code>get()</code>, <code>post()</code> and friends. <code>when()</code> and <code>and()</code> only improve readability.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "first-requests",
      title: "given / when / then and your first GETs",
      summary: "Path and query parameters, signed-in requests, logging, and extracting values for later.",
      body: `
<p>Most of week 1 is reading Ice Bank: who am I, which accounts do I have, what happened on them. Every read follows the same shape, and the parts map one-to-one onto the
HTTP request from Tutorial 2.</p>
<div class="table-wrap"><table>
<thead><tr><th>REST Assured</th><th>HTTP</th><th>Ice Bank example</th></tr></thead>
<tbody>
<tr><td><code>given().spec(Specs.as(Personas.EMMA))</code></td><td>headers: <code>Authorization: Bearer …</code>, <code>Accept: application/json</code></td><td>signed in as Emma</td></tr>
<tr><td><code>.pathParam("id", 2)</code></td><td>the <code>{id}</code> in the path</td><td><code>/accounts/2</code></td></tr>
<tr><td><code>.queryParam("type", "PURCHASE")</code></td><td><code>?type=PURCHASE</code> (encoded for you)</td><td>transaction search</td></tr>
<tr><td><code>.when().get("/accounts/{id}")</code></td><td>method and path</td><td><code>GET /api/v1/accounts/2</code></td></tr>
<tr><td><code>.then().statusCode(200).body(...)</code></td><td>status line and body</td><td>assertions</td></tr>
<tr><td><code>.extract().path("...")</code></td><td>read a value out of the body</td><td>an id for the next call</td></tr>
</tbody></table></div>

<h3>Signed-in requests</h3>
<p><code>Specs.as(Personas.EMMA)</code> asks <code>AuthClient</code> for a cached access token and adds the bearer header. The first call of the run signs Emma in (password, OTP from Ice
Mail, verify); later calls reuse the token. You do not see any of this in the test, which is the point: the test is about accounts, not about signing in.</p>

<h3>Worked example: Emma's purchases</h3>
<p>Look at <code>purchasesWithQueryParams</code> in the example class.</p>
<ol>
<li><code>pathParam("id", Personas.EMMA_CHEQUING)</code> fills <code>{id}</code> in <code>/accounts/{id}/transactions</code>. Using a named template instead of
<code>"/accounts/" + id</code> keeps the path readable in Allure and lets REST Assured encode values.</li>
<li><code>queryParam("type", "PURCHASE")</code> and <code>queryParam("size", 5)</code> become <code>?type=PURCHASE&amp;size=5</code>.</li>
<li><code>body("size", equalTo(5))</code> checks the page envelope; <code>body("content", hasSize(lessThanOrEqualTo(5)))</code> checks that at most 5 items came back;
<code>content[0].type</code> reads the first item. The path language is GPath, covered in lesson 3.</li>
</ol>
<p>Notice what is <em>not</em> asserted: balances and exact totals. Other people move money in the same sandbox, so assert what the seed fixes (ids, account numbers, types) and what
the rules guarantee (filters, sizes), not numbers that change.</p>

<h3>Extracting values</h3>
<p>Sometimes you need a value in Java, to assert with AssertJ or to use in the next request: <code>response.path("[0].accountNumber")</code>,
<code>response.jsonPath().getList("$")</code>, or <code>.then().extract().path("totalElements")</code>. Extract <em>after</em> checking the status, otherwise a 401 problem body
gives you a confusing <code>null</code> instead of a clear failure.</p>

<h3>Logging while you learn</h3>
<p><code>.log().all()</code> before <code>when()</code> prints the request; <code>.log().body()</code> or <code>.log().all()</code> after <code>then()</code> prints the response. Use them
while writing a test and delete them afterwards: the starter already prints everything when an assertion fails. Secrets are masked by <code>Specs.config()</code>.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Building paths by concatenation (<code>"/accounts/" + id + "?type=" + t</code>): nothing is encoded, and Allure shows a different path for every id.</li>
<li>Asserting on a balance you read from the README. The README shows the state after a reset; your sandbox has moved on.</li>
<li><code>body("id", equalTo(2L))</code>: JSON numbers that fit in an int come back as <code>Integer</code>, so a <code>Long</code> never equals them. Use <code>equalTo(2)</code>, or extract with
<code>jsonPath().getLong("id")</code>.</li>
<li>Leaving <code>.log().all()</code> in committed tests: the console becomes unreadable for the whole team.</li>
<li>Extracting before checking the status: <code>.extract().path("id")</code> on a 404 returns <code>null</code> and the real problem is hidden.</li>
</ul></div>`,
      examples: [
        {
          title: "tests/api/FirstRequestsApiTest.java",
          lang: "java",
          code: String.raw`
package com.icebank.tests.api;

import com.icebank.api.Specs;
import com.icebank.support.Personas;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

@Tag("api")
@DisplayName("First GETs as Emma")
class FirstRequestsApiTest {

    @Test
    @DisplayName("GET /me says who the token belongs to")
    void meIsEmma() {
        given().spec(Specs.as(Personas.EMMA))
        .when().get("/me")
        .then()
                .statusCode(200)
                .body("firstName", equalTo("Emma"))
                .body("address.city", equalTo("Toronto"));
    }

    @Test
    @DisplayName("GET /accounts/{id} with a path parameter")
    void oneAccountByPathParam() {
        given().spec(Specs.as(Personas.EMMA))
                .pathParam("id", Personas.EMMA_SAVINGS)
        .when().get("/accounts/{id}")
        .then()
                .statusCode(200)
                .body("id", equalTo(2))
                .body("type", equalTo("SAVINGS"))
                .body("accountNumber", equalTo("999-20012-1015838"));
    }

    @Test
    @DisplayName("Query parameters filter and page the transaction search")
    void purchasesWithQueryParams() {
        given().spec(Specs.as(Personas.EMMA))
                .pathParam("id", Personas.EMMA_CHEQUING)
                .queryParam("type", "PURCHASE")
                .queryParam("size", 5)
        .when().get("/accounts/{id}/transactions")
        .then()
                .statusCode(200)
                .body("size", equalTo(5))
                .body("content", hasSize(lessThanOrEqualTo(5)))
                .body("content[0].type", equalTo("PURCHASE"));
    }

    @Test
    @DisplayName("Extract values from a response to use them in Java")
    void extractValues() {
        Response response = given().spec(Specs.as(Personas.EMMA))
                .when().get("/accounts");

        int status = response.statusCode();
        String firstNumber = response.path("[0].accountNumber");
        int count = response.jsonPath().getList("$").size();

        assertThat(status).isEqualTo(200);
        assertThat(firstNumber).isEqualTo("999-10045-1007919");
        assertThat(count).isEqualTo(4);
    }
}`,
        },
        {
          title: "The same calls through the starter's client",
          lang: "java",
          code: String.raw`
AccountsClient accounts = new AccountsClient();

accounts.get(Personas.EMMA, Personas.EMMA_SAVINGS)
        .then().statusCode(200).body("type", equalTo("SAVINGS"));

accounts.transactions(Personas.EMMA, Personas.EMMA_CHEQUING, Map.of("type", "PURCHASE", "size", 5))
        .then().statusCode(200).body("content[0].type", equalTo("PURCHASE"));`,
          note: "Same requests, one line each. Write the long form while learning, then move repeated calls into a client method (lesson 4).",
        },
        {
          title: "What .log().all() prints for a signed-in request (shortened)",
          lang: "text",
          code: String.raw`
Request method:   GET
Request URI:      http://localhost:3000/api/v1/accounts/1
Headers:          Authorization=[ BLACKLISTED ]
                  Accept=application/json
                  X-Request-Id=...
Body:             <none>`,
          note: "<code>Specs.config()</code> blacklists <code>Authorization</code>, <code>X-Sandbox-Key</code> and cookies, so tokens never reach the console or a screenshot of it.",
        },
      ],
      exercises: [
        "Write <code>MeApiTest</code> with two tests: <code>GET /me</code> as Emma asserting her first name, last name, customer id and province, and the same for Sophie (customer 7). Use only fields you can confirm in Swagger.",
        "As Emma, search her <strong>savings</strong> account for <code>type=INTEREST</code> with <code>size=3</code>. Assert the page size and the type and direction of the first item, and extract <code>totalElements</code> into an <code>int</code>. Print it and write down what the number means.",
        "Read Emma's credit card account with a path parameter. Extract <code>accountNumber</code> and <code>displayName</code> and assert, in Java, the relationship between them. Do not hard-code either value in the assertion.",
        "Add <code>.log().all()</code> on both sides of one request to Emma's chequing account. Find the <code>Authorization</code> header in the output and explain what you see and why the project does it.",
        "Send <code>GET /accounts/abc</code>, <code>GET /accounts/0</code> and <code>GET /accounts/-1</code> as Emma. Record status, <code>code</code> and any field error for each. Which one surprised you, and does it match what Swagger promises?",
      ],
      quiz: [
        {
          q: "<code>body(\"id\", equalTo(2L))</code> fails although the JSON says <code>\"id\": 2</code>. Why?",
          options: ["REST Assured reads small JSON numbers as <code>Integer</code>, and <code>Integer 2</code> does not equal <code>Long 2</code>", "The id is a string", "Path parameters are not echoed", "The account is not Emma's"],
          answer: 0,
          explain: "Use <code>equalTo(2)</code> in Hamcrest, or extract with <code>jsonPath().getLong(\"id\")</code> when you need a long.",
        },
        {
          q: "Which request does <code>.pathParam(\"id\", 1).queryParam(\"size\", 5).get(\"/accounts/{id}/transactions\")</code> send?",
          options: ["<code>GET /api/v1/accounts/{id}/transactions?id=1&amp;size=5</code>", "<code>GET /api/v1/accounts/1/transactions/5</code>", "<code>GET /api/v1/accounts/1/transactions?size=5</code>", "<code>POST /api/v1/accounts/1/transactions</code> with a body"],
          answer: 2,
          explain: "The path parameter fills the template; query parameters are appended after <code>?</code>.",
        },
        {
          q: "Why do Ice Bank tests avoid asserting Emma's exact balance?",
          options: ["Balances are secret", "Other tests and people move money in the same sandbox, so the value is not fixed", "Balances are strings", "The API rounds balances"],
          answer: 1,
          explain: "Assert what the seed fixes (ids, numbers, types) or what you changed yourself. Lessons 8 and 9 show how to test money with your own customer.",
        },
        {
          q: "Where should <code>.extract()</code> go?",
          options: ["Before <code>given()</code>", "Instead of <code>when()</code>", "Only in <code>@BeforeEach</code>", "After the status assertion, at the end of <code>then()</code>"],
          answer: 3,
          explain: "<code>.then().statusCode(200).extract().path(...)</code> fails clearly when the status is wrong, instead of returning <code>null</code> from an error body.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "assertions",
      title: "Status, header and body assertions: Hamcrest and JsonPath",
      summary: "Say exactly what a correct response looks like: matchers, GPath paths, find and findAll, and typed values in Java.",
      body: `
<p>A test is only as good as its assertions. A response has three parts you can check, and REST Assured has a method for each: <code>statusCode(...)</code>,
<code>header(...)</code> / <code>contentType(...)</code>, and <code>body(path, matcher)</code>. Each <code>body</code> call takes a <strong>GPath</strong> expression (which value) and a
<strong>Hamcrest matcher</strong> (what it must be).</p>

<h3>GPath in five lines</h3>
<p>Given a page of transactions <code>{"content":[{...},{...}],"page":0,"totalElements":334}</code>:</p>
<div class="table-wrap"><table>
<thead><tr><th>Path</th><th>Gives</th></tr></thead>
<tbody>
<tr><td><code>totalElements</code>, <code>content[0].amount</code>, <code>content[-1].id</code></td><td>one value (first item, last item)</td></tr>
<tr><td><code>content.type</code></td><td>a list: the <code>type</code> of every item</td></tr>
<tr><td><code>content.find { it.type == 'PAYROLL' }</code></td><td>the <strong>first</strong> item matching the closure (or null)</td></tr>
<tr><td><code>content.findAll { it.direction == 'CREDIT' }.amount</code></td><td>the amounts of <strong>every</strong> matching item</td></tr>
<tr><td><code>content.findAll { it.amount.toBigDecimal() &gt; 1000 }.size()</code></td><td>Groovy methods work inside paths: convert money strings before comparing</td></tr>
</tbody></table></div>
<p>For a JSON array at the top level (like <code>GET /accounts</code>) the root path is <code>$</code> (or empty), and <code>type</code> means "the type of every account".</p>

<h3>The matchers you will use 90% of the time</h3>
<ul>
<li>Values: <code>equalTo</code>, <code>not</code>, <code>nullValue</code> / <code>notNullValue</code>, <code>startsWith</code>, <code>containsString</code>, <code>matchesPattern</code>, <code>oneOf</code>.</li>
<li>Numbers: <code>greaterThan</code>, <code>lessThanOrEqualTo</code>. Money is a string in Ice Bank, so compare money in Java with <code>BigDecimal</code> (lesson 6) or convert inside the path.</li>
<li>Collections: <code>hasSize</code>, <code>empty</code>, <code>hasItem</code> / <code>hasItems</code> (contains at least), <code>contains</code> (exactly, in order), <code>containsInAnyOrder</code>,
<code>everyItem(...)</code>.</li>
<li>Maps: <code>hasKey</code>, <code>hasEntry</code>. Combinations: <code>allOf</code>, <code>anyOf</code>.</li>
</ul>

<h3>Worked example: is the PAYROLL filter really a filter?</h3>
<p><code>filteredSearchMatchesFilter</code> sends <code>type=PAYROLL&amp;size=50</code> and then asserts with <code>everyItem</code> that <em>every</em> returned item is a PAYROLL, a
CREDIT, has a 2-decimal amount and a description starting with "Payroll deposit". Asserting only <code>content[0].type</code> would pass even if the filter were ignored and the
newest transaction happened to be a payroll deposit. A filter test must look at all items, and should also check that there <em>are</em> items (an empty list satisfies
<code>everyItem</code> trivially).</p>

<h3>JsonPath in Java</h3>
<p>When Hamcrest gets awkward, extract and use AssertJ: <code>JsonPath json = response.then().extract().jsonPath();</code> then
<code>json.getList("content.amount", BigDecimal.class)</code>, <code>json.getLong("content[0].id")</code>, <code>json.getString("content.find { ... }.description")</code>.
The same GPath expressions work in both places.</p>

<h3>Headers</h3>
<p>Ice Bank promises <code>X-Request-Id</code> on every response (echoing yours if you sent one), <code>Cache-Control: no-store</code>, <code>application/json</code> for success and
<code>application/problem+json</code> for errors, and <code>Location</code> on 201. Those are part of the contract: assert them where they matter.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li><code>everyItem(...)</code> on an empty list passes. Pair it with <code>not(empty())</code> or a size check.</li>
<li>Comparing money strings as numbers: <code>"100.00" &gt; "99.99"</code> is false as text. Convert with <code>toBigDecimal()</code> in the path or use Java.</li>
<li><code>hasItems</code> versus <code>contains</code>: <code>contains(1, 2, 3, 4)</code> means exactly these, in this order; <code>hasItems(1, 2)</code> means at least these.</li>
<li>Quoting in closures: the path is a Java string, so use single quotes inside it: <code>"content.find { it.type == 'ATM' }"</code>.</li>
<li>One giant assertion per test is fine; one giant test per endpoint is not. A failure should tell you which rule broke.</li>
</ul></div>`,
      examples: [
        {
          title: "tests/api/TransactionSearchApiTest.java (imports and two tests)",
          lang: "java",
          code: String.raw`
package com.icebank.tests.api;

import com.icebank.api.AccountsClient;
import com.icebank.support.Personas;
import io.restassured.path.json.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;

@Tag("api")
@DisplayName("Transaction search: status, header and body assertions")
class TransactionSearchApiTest {

    private final AccountsClient accounts = new AccountsClient();

    @Test
    @DisplayName("Status, headers and the page envelope")
    void statusHeadersAndEnvelope() {
        accounts.transactions(Personas.EMMA, Personas.EMMA_CHEQUING, Map.of("size", 10))
                .then()
                .statusCode(200)
                .contentType("application/json")
                .header("X-Request-Id", notNullValue())
                .header("Cache-Control", "no-store")
                .body("$", hasKey("totalElements"))
                .body("page", equalTo(0))
                .body("size", equalTo(10))
                .body("content", hasSize(10))
                .body("totalElements", greaterThan(10));
    }

    @Test
    @DisplayName("Every item of a filtered search matches the filter (everyItem on a GPath list)")
    void filteredSearchMatchesFilter() {
        accounts.transactions(Personas.EMMA, Personas.EMMA_CHEQUING, Map.of("type", "PAYROLL", "size", 50))
                .then()
                .statusCode(200)
                .body("content.type", everyItem(equalTo("PAYROLL")))
                .body("content.direction", everyItem(equalTo("CREDIT")))
                .body("content.amount", everyItem(matchesPattern("\\d+\\.\\d{2}")))
                .body("content.description", everyItem(startsWith("Payroll deposit")));
    }
}`,
          note: "The verified file imports each matcher separately; <code>Matchers.*</code> is shown here to keep the example short.",
        },
        {
          title: "find, findAll and closures inside the path",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("GPath find and findAll filter inside the response")
void findAndFindAll() {
    accounts.transactions(Personas.EMMA, Personas.EMMA_CHEQUING, Map.of("size", 100))
            .then()
            .statusCode(200)
            // find: the first item that matches the closure
            .body("content.find { it.type == 'PAYROLL' }.direction", equalTo("CREDIT"))
            // findAll: every match; then take one field of each
            .body("content.findAll { it.type == 'PURCHASE' }.direction", everyItem(equalTo("DEBIT")))
            .body("content.findAll { it.direction == 'CREDIT' }.type", hasItem("PAYROLL"))
            // closures can compare numbers too: convert the money string first
            .body("content.findAll { it.amount.toBigDecimal() > 1000 }.size()", greaterThan(0))
            .body("content.status", everyItem(is(oneOf("POSTED", "PENDING", "REVERSED"))));
}

@Test
@DisplayName("Text search q= is case-insensitive")
void textSearch() {
    accounts.transactions(Personas.EMMA, Personas.EMMA_CHEQUING, Map.of("q", "glacier HARDWARE", "size", 20))
            .then()
            .statusCode(200)
            .body("content", not(hasSize(0)))
            .body("content.description", everyItem(allOf(containsStringIgnoringCase("glacier hardware"),
                                                          endsWith("Glacier Hardware"))));
}`,
        },
        {
          title: "JsonPath in Java: typed lists and BigDecimal",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("JsonPath in Java: typed lists and BigDecimal sums")
void jsonPathInJava() {
    JsonPath json = accounts.transactions(Personas.EMMA, Personas.EMMA_CHEQUING, Map.of("type", "PAYROLL", "size", 100))
            .then().statusCode(200)
            .extract().jsonPath();

    List<BigDecimal> amounts = json.getList("content.amount", BigDecimal.class);
    BigDecimal total = amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    long firstId = json.getLong("content[0].id");
    String newestDescription = json.getString("content.find { it.type == 'PAYROLL' }.description");

    assertThat(amounts).isNotEmpty().allSatisfy(a -> assertThat(a.scale()).isEqualTo(2));
    assertThat(total).isGreaterThan(BigDecimal.ZERO);
    assertThat(firstId).isPositive();
    assertThat(newestDescription).startsWith("Payroll deposit");
}`,
        },
      ],
      exercises: [
        "Search 100 of Emma's chequing transactions and, with <code>findAll</code>, assert that every <code>ATM</code> transaction is a debit. In the same request, assert that at least one <code>LOAN_PAYMENT</code> exists and that its description mentions the loan.",
        "Sum all of Emma's <code>PAYROLL</code> credits on chequing twice: once in Java with <code>BigDecimal</code>, once with a single GPath expression evaluated by REST Assured. Assert that both totals are equal and write the total and the count in your notes.",
        "Send your own <code>X-Request-Id</code> (a unique string) on <code>GET /accounts</code> and assert it is echoed. In a second request without your own id, assert that the id in the response has the shape of a UUID, and find out who generated it (look at the starter's filters). Also assert the content type and the cache header.",
        "On <code>GET /accounts</code> as Emma, write one chained assertion that checks: the list of types includes chequing and savings; the credit card's <code>creditLimit</code> (found with <code>find</code>) is 5000.00; there is exactly one loan; and the ids are exactly 1, 2, 3, 4 in that order.",
        "Search Emma's chequing with <code>from=2026-10-01&amp;to=2026-10-31</code> and assert with one matcher that every <code>createdAt</code> is in October 2026. Is a string check safe here? Write two sentences on when it would not be (hint: time zones).",
      ],
      quiz: [
        {
          q: "<code>.body(\"content.type\", everyItem(equalTo(\"PAYROLL\")))</code> passes. What can you NOT conclude?",
          options: ["That no item has another type", "That the response was JSON", "That there was at least one item", "That the path exists"],
          answer: 2,
          explain: "<code>everyItem</code> is true for an empty list. Add <code>not(empty())</code> or a size check when the filter must return something.",
        },
        {
          q: "Which path gives the description of the first PAYROLL transaction in the page?",
          options: ["<code>content.findAll { it.type == 'PAYROLL' }.description</code>", "<code>content[PAYROLL].description</code>", "<code>content.description[0]</code>", "<code>content.find { it.type == 'PAYROLL' }.description</code>"],
          answer: 3,
          explain: "<code>find</code> returns the first match; <code>findAll</code> returns a list of every match.",
        },
        {
          q: "Which matcher means \"exactly these items, in this order\"?",
          options: ["<code>contains</code>", "<code>hasItems</code>", "<code>containsInAnyOrder</code>", "<code>everyItem</code>"],
          answer: 0,
          explain: "<code>contains(1, 2, 3, 4)</code> fails if anything is missing, extra or out of order. <code>hasItems</code> only checks that the given items are present.",
        },
        {
          q: "Why convert with <code>toBigDecimal()</code> inside <code>findAll { it.amount.toBigDecimal() &gt; 1000 }</code>?",
          options: ["Because Groovy has no numbers", "Because Ice Bank sends money as strings, and comparing a string with a number does not do what you want", "To round the amount", "It is optional; strings compare numerically"],
          answer: 1,
          explain: "Money is a 2-decimal string in Ice Bank. Convert before any numeric comparison.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "specifications",
      title: "Request and response specifications",
      summary: "Write setup and common expectations once: RequestSpecBuilder, ResponseSpecBuilder, layering and filters.",
      body: `
<p>After lesson 3 your tests repeat themselves: the same auth, the same path parameter, the same five checks on every error. A <strong>specification</strong> is a reusable piece of
<code>given()</code> or <code>then()</code>. The starter's <code>Specs</code> class is the request side; in this lesson you add a <code>ResponseSpecs</code> class for the response side.</p>

<h3>Request specifications</h3>
<p><code>new RequestSpecBuilder()</code> collects anything you could write in <code>given()</code>: base URI and path, headers, auth, content type, path and query parameters,
filters, config. <code>addRequestSpecification(other)</code> layers one spec on another, which is how <code>Specs.as(email)</code> is <code>Specs.base()</code> plus a bearer header.
Values set later in <code>given()</code> are added to (or override) what the spec set.</p>

<h3>Response specifications</h3>
<p><code>new ResponseSpecBuilder()</code> collects expectations: <code>expectStatusCode</code>, <code>expectContentType</code>, <code>expectHeader</code>, <code>expectBody</code>,
<code>expectResponseTime</code>. Use it with <code>.then().spec(ResponseSpecs.problem(404, "NOT_FOUND"))</code> and keep adding test-specific checks after it.</p>
<p>The <code>problem(status, code)</code> spec is the most useful one you will write: every Ice Bank error is an RFC 7807 problem (lesson 7), and this one line checks the status,
the <code>application/problem+json</code> type, the <code>status</code> and <code>code</code> fields, and that <code>title</code>, <code>detail</code> and <code>instance</code> are there.</p>

<h3>Worked example: a spec built on a spec</h3>
<p><code>layeredRequestSpecification</code> below builds "Emma's chequing account, 5 per page" from <code>Specs.as(Personas.EMMA)</code>, adds a path parameter and a default query
parameter, and then the test adds one more query parameter of its own. On the response side, <code>okJson()</code> checks status, content type, request id and response time
in one line, and the test adds the assertion that is specific to it.</p>

<h3>Filters</h3>
<p>A filter sees every request and response that passes through a spec: the starter's <code>RequestIdFilter</code> adds a header, <code>ApiLogFilter</code> logs, and
<code>AllureRestAssured</code> attaches both to the report. Write your own by implementing <code>io.restassured.filter.Filter</code> and calling <code>ctx.next(request, response)</code>.
Good uses: timing, counting calls, adding a correlation header. Bad uses: assertions (they belong in the test) and changing bodies.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Storing <code>Specs.as(email)</code> in a <code>static final</code> field. The spec captures the token when it is built; tokens expire after 15 minutes, so a long run starts failing
with 401. Build signed-in specs per test (they are cheap: the token is cached).</li>
<li>Passing a path parameter the path does not use: REST Assured throws <code>IllegalArgumentException: Invalid number of path parameters. Expected 1, was 2.</code> Keep
path parameters next to the path that needs them.</li>
<li><code>expectHeader("X-Request-Id", notNullValue())</code> does not compile: the builder wants a <code>Matcher&lt;String&gt;</code>. Use <code>not(emptyOrNullString())</code>.</li>
<li>Putting business assertions (a balance, a status) into a shared spec. Specs hold what is true for <em>every</em> response of a kind; anything else hides intent.</li>
<li>Response-time expectations so tight they fail on a slow laptop. Use them as a smoke alarm (seconds), not as a performance test (Tutorial 10).</li>
</ul></div>`,
      examples: [
        {
          title: "api/ResponseSpecs.java (new file)",
          lang: "java",
          code: String.raw`
package com.icebank.api;

import io.restassured.builder.ResponseSpecBuilder;
import io.restassured.http.ContentType;
import io.restassured.specification.ResponseSpecification;

import static org.hamcrest.Matchers.emptyOrNullString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.lessThan;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.startsWith;

/** Reusable expectations: what every good response, and every Ice Bank problem, must look like. */
public final class ResponseSpecs {

    private ResponseSpecs() {
    }

    /** 200, JSON, an X-Request-Id, and reasonably fast. */
    public static ResponseSpecification okJson() {
        return new ResponseSpecBuilder()
                .expectStatusCode(200)
                .expectContentType(ContentType.JSON)
                .expectHeader("X-Request-Id", not(emptyOrNullString()))
                .expectResponseTime(lessThan(5000L))
                .build();
    }

    /** An RFC 7807 problem with this status and code, whose instance is an API path. */
    public static ResponseSpecification problem(int status, String code) {
        return new ResponseSpecBuilder()
                .expectStatusCode(status)
                .expectContentType("application/problem+json")
                .expectBody("status", equalTo(status))
                .expectBody("code", equalTo(code))
                .expectBody("title", notNullValue())
                .expectBody("detail", notNullValue())
                .expectBody("instance", startsWith("/api/v1/"))
                .build();
    }

    /** 400 VALIDATION_FAILED. Add your own field checks after it. */
    public static ResponseSpecification validationFailed() {
        return new ResponseSpecBuilder()
                .addResponseSpecification(problem(400, "VALIDATION_FAILED"))
                .expectBody("errors", notNullValue())
                .build();
    }
}`,
        },
        {
          title: "tests/api/SpecsApiTest.java: using them",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("okJson() checks status, content type, request id and time in one line")
void okJsonSpec() {
    given().spec(Specs.as(Personas.EMMA))
    .when().get("/accounts")
    .then().spec(ResponseSpecs.okJson())
            .body("currency", everyItem(equalTo("CAD")));
}

@Test
@DisplayName("problem() checks the whole RFC 7807 envelope")
void problemSpec() {
    given().spec(Specs.base())
    .when().get("/accounts")
    .then().spec(ResponseSpecs.problem(401, "UNAUTHORIZED"));
}

@Test
@DisplayName("A spec built on another spec: Emma's chequing account, paged by 5")
void layeredRequestSpec() {
    RequestSpecification emmaChequing = new RequestSpecBuilder()
            .addRequestSpecification(Specs.as(Personas.EMMA))
            .addPathParam("id", Personas.EMMA_CHEQUING)
            .addQueryParam("size", 5)
            .build();

    given().spec(emmaChequing).queryParam("type", "PURCHASE")
    .when().get("/accounts/{id}/transactions")
    .then().spec(ResponseSpecs.okJson())
            .body("size", equalTo(5))
            .body("content.type", everyItem(equalTo("PURCHASE")));
}

@Test
@DisplayName("validationFailed() plus the field that was wrong")
void validationSpec() {
    given().spec(Specs.as(Personas.EMMA))
            .pathParam("id", Personas.EMMA_CHEQUING)
            .queryParam("size", 101)
    .when().get("/accounts/{id}/transactions")
    .then().spec(ResponseSpecs.validationFailed())
            .body("errors[0].field", equalTo("size"))
            .body("errors[0].message", equalTo("must be between 1 and 100"));
}`,
        },
        {
          title: "The skeleton of a custom filter",
          lang: "java",
          code: String.raw`
public class MyFilter implements Filter {
    @Override
    public Response filter(FilterableRequestSpecification request,
                           FilterableResponseSpecification responseSpec,
                           FilterContext ctx) {
        // before: look at (or add to) the request
        Response response = ctx.next(request, responseSpec);   // send it
        // after: look at the response, e.g. response.time(), response.statusCode()
        return response;
    }
}

// use it in one spec only:
RequestSpecification spec = new RequestSpecBuilder()
        .addRequestSpecification(Specs.as(Personas.SOPHIE))
        .addFilter(new MyFilter())
        .build();`,
          note: "Compare with <code>api/RequestIdFilter</code> and <code>api/ApiLogFilter</code> in the starter: both follow exactly this shape.",
        },
      ],
      exercises: [
        "Add <code>ResponseSpecs.created(String locationPattern)</code> that expects 201, JSON and a <code>Location</code> header matching the pattern. Use it in a test that moves 0.01 between Sophie's chequing and savings and back (two calls, both checked with the new spec).",
        "Write a method that returns a request spec for \"Sophie's chequing transactions, 10 per page\" (look up the account id, do not hard-code it). Use it in two tests: one plain, one that adds a <code>direction</code> filter and checks every item.",
        "Write a filter that counts how many requests passed through it and logs a WARN line for any response slower than one second. Attach it to one spec only and prove with an assertion that two calls were counted.",
        "Refactor two starter tests that check error responses by hand (in <code>AuthApiTest</code> and <code>HealthApiTest</code>) to use <code>ResponseSpecs.problem(...)</code>. Run the whole starter suite afterwards to show nothing broke.",
      ],
      quiz: [
        {
          q: "Why is <code>private static final RequestSpecification EMMA = Specs.as(Personas.EMMA);</code> a bad idea?",
          options: ["Static fields are not allowed in tests", "It signs Emma in on every request", "The spec captures the access token when it is built, and the token expires after 15 minutes", "Specs cannot be reused"],
          answer: 2,
          explain: "Build signed-in specs when you need them. The token cache makes that cheap.",
        },
        {
          q: "What does <code>addRequestSpecification(Specs.base())</code> do inside a <code>RequestSpecBuilder</code>?",
          options: ["Copies everything from <code>Specs.base()</code> into the new spec, so you can add more on top", "Replaces the builder", "Sends a request", "Merges the response expectations"],
          answer: 0,
          explain: "That is how <code>Specs.as</code> and <code>Specs.sandbox</code> are built from <code>Specs.base()</code>.",
        },
        {
          q: "Which belongs in a shared response specification?",
          options: ["The balance after a transfer", "The id of the account just created", "The number of Emma's transactions", "The content type and status of every RFC 7807 problem"],
          answer: 3,
          explain: "Shared specs hold what is true for every response of a kind. Test-specific facts stay in the test.",
        },
        {
          q: "<code>.pathParam(\"card\", 9).pathParam(\"acct\", 14).post(\"/cards/{card}/lock\")</code> throws. Why?",
          options: ["Cards cannot be locked by API", "REST Assured refuses a path parameter that the path does not use", "Path parameters must be strings", "<code>post</code> needs a body"],
          answer: 1,
          explain: "\"Invalid number of path parameters. Expected 1, was 2.\" Only pass the parameters the template contains.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "authentication",
      title: "Authentication: the OTP flow, token reuse and refresh",
      summary: "How AuthClient signs in through Ice Mail, why it caches tokens, how refresh rotation works, and how to make your own throwaway customers.",
      body: `
<p>Ice Bank sign-in has two steps, and the second needs a 6-digit code "emailed" to Ice Mail. A test cannot read an inbox like a person, so Ice Bank offers an inbox API for
automation: with the <code>X-Sandbox-Key</code> header you can read any inbox in your sandbox. <code>AuthClient.signIn(email)</code> does the whole dance:</p>
<pre role="img" aria-label="Sequence: POST /auth/login returns mfaToken; GET /inbox with sandbox key returns otpCode; POST /auth/mfa/verify returns accessToken and refreshToken" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 1  POST /auth/login        {"email","password"}           → 200 {"mfaRequired":true,"mfaToken":"...","expiresIn":300,"delivery":"Ice Mail"}
 2  GET  /inbox?email=..&amp;kind=OTP&amp;size=1   X-Sandbox-Key  → 200 {"content":[{"otpCode":"482913",...}],...}
 3  POST /auth/mfa/verify   {"mfaToken","code"}            → 200 {"accessToken","refreshToken","tokenType":"Bearer","expiresIn":900}
 4  every later call:       Authorization: Bearer &lt;accessToken&gt;
</pre>

<h3>Why the token cache matters</h3>
<p>The sign-in endpoints (login, verify, refresh, register, forgot password) allow <strong>10 calls per minute per machine</strong>, shared by everything you run: your tests,
Postman, a teammate on the same network address. One sign-in is two of those calls. <code>AuthClient.accessToken(email)</code> signs in once per email per run and reuses the
token until a minute before it expires; <code>Specs.as(email)</code> uses it. If you still hit 429, <code>retryIfRateLimited</code> waits for the <code>Retry-After</code> the server
sends (at most twice). Use <code>AuthClient.signIn</code> directly only in tests <em>about</em> sign-in.</p>

<h3>Refresh tokens rotate</h3>
<p>The access token lives 15 minutes; the refresh token 7 days. <code>POST /auth/refresh</code> returns a <em>new pair</em> and the old refresh token stops working. If anyone
presents an old refresh token again, Ice Bank assumes it was stolen and ends the whole session, so even the newest access token stops working. <code>POST /auth/logout</code> (204)
ends the session too.</p>

<h3>Throwaway customers</h3>
<p>Login negatives (wrong code, three attempts, logout) change state: failed-login counters, sessions. Never do that to Emma. Register your own customer instead:
<code>POST /auth/register</code> with a unique email such as <code>rest.tut.&lt;random&gt;@icebank.test</code>, the persona password, SIN <code>193 746 286</code> and postal code
<code>M5J 2T3</code>. Send it with the sandbox key (<code>Specs.sandbox()</code>): on QA that puts the customer in <em>your</em> sandbox. Because the password is the persona
password, <code>AuthClient</code> and <code>Specs.as(email)</code> work for the new customer exactly like for a persona. Registration also counts toward the 10-per-minute limit, so
register once per class (<code>@BeforeAll</code>), not once per test, unless the test needs a fresh one.</p>

<h3>Worked example: three steps by hand</h3>
<p><code>threeStepsByHand</code> below registers nothing itself (the class does it once in <code>@BeforeAll</code>), then calls <code>AuthClient.login</code>, reads the code with
<code>InboxClient.latestOtp</code>, verifies with <code>AuthClient.verifyMfa</code> and deserialises the answer into the <code>Tokens</code> record. Each raw call is wrapped in
<code>retryIfRateLimited</code>, because a 429 would otherwise fail the assertion on the status. Finally it proves the token works by calling <code>/me</code>.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Signing in inside <code>@BeforeEach</code>: 20 tests means 40 sign-in calls and a 429 storm. Use the cache.</li>
<li>Wrong-password tests on Emma: five failures lock her for 15 minutes, for everyone in the sandbox. The starter uses Sophie and signs in correctly afterwards.</li>
<li>Reading "the newest OTP" while something else signs the same user in: the code may be theirs. Use a user only your test signs in, or retry once as <code>AuthClient</code> does.</li>
<li>Pasting a token from DevTools into a test. It dies in 15 minutes and it is a secret.</li>
<li>Forgetting <code>AuthClient.clearCache()</code> after a test that ends a session on purpose: later tests get the dead cached token and fail with 401.</li>
</ul></div>`,
      examples: [
        {
          title: "api/RegistrationClient.java and support/Customers.java (new files)",
          lang: "java",
          code: String.raw`
/** POST /auth/register. Sent with the sandbox key, so on QA the customer lands in YOUR sandbox. */
public final class RegistrationClient {

    private RegistrationClient() {
    }

    /** A body that passes every rule. Change one field to make a negative test. */
    public static Map<String, Object> validBody(String email) {
        Map<String, Object> body = new HashMap<>();
        body.put("firstName", "Rest");
        body.put("lastName", "Tutorial");
        body.put("dateOfBirth", "1995-06-15");
        body.put("email", email);
        body.put("phone", "(416) 555-0199");
        body.put("addressLine1", "200 Bay Street");
        body.put("city", "Toronto");
        body.put("province", "ON");
        body.put("postalCode", "M5J 2T3");
        body.put("sin", "193 746 286");
        body.put("password", Config.personaPassword());
        return body;
    }

    public static Response register(Map<String, ?> body) {
        return given().spec(Specs.sandbox()).body(body).when().post("/auth/register");
    }
}

/** Throwaway customers: nobody else uses them, so a test may change anything they own. */
public final class Customers {

    public record NewCustomer(String email, long userId, long customerId, long chequingId) {
    }

    private Customers() {
    }

    /** rest.tut.<8 hex>@icebank.test (with the QA suffix on QA). */
    public static String uniqueEmail() {
        return Personas.email("rest.tut." + UUID.randomUUID().toString().substring(0, 8));
    }

    @Step("Register a throwaway customer")
    public static NewCustomer register() {
        String email = uniqueEmail();
        Response r = AuthClient.retryIfRateLimited(() -> RegistrationClient.register(RegistrationClient.validBody(email)));
        r.then().statusCode(201);
        return new NewCustomer(email,
                r.jsonPath().getLong("userId"),
                r.jsonPath().getLong("customerId"),
                r.jsonPath().getLong("accounts[0].id"));
    }
}`,
          note: "Put <code>RegistrationClient</code> in <code>com.icebank.api</code> and <code>Customers</code> in <code>com.icebank.support</code>. A new customer has one chequing account with $0.00 and a debit card. Later lessons give them money with a cheque deposit.",
        },
        {
          title: "tests/api/AuthFlowApiTest.java: the flow by hand, and a wrong code",
          lang: "java",
          code: String.raw`
@Tag("api")
@DisplayName("Sign-in, token reuse, refresh and logout")
class AuthFlowApiTest {

    private static NewCustomer maya;   // a throwaway customer: we may break her sessions freely

    @BeforeAll
    static void registerCustomer() {
        maya = Customers.register();
    }

    @Test
    @DisplayName("The three sign-in steps by hand: password, OTP from Ice Mail, verify")
    void threeStepsByHand() {
        String mfaToken = AuthClient.retryIfRateLimited(() -> AuthClient.login(maya.email(), Personas.password()))
                .then().statusCode(200)
                .body("mfaRequired", equalTo(true))
                .body("delivery", equalTo("Ice Mail"))
                .extract().path("mfaToken");

        String code = InboxClient.latestOtp(maya.email());
        assertThat(code).matches("\\d{6}");

        Tokens tokens = AuthClient.retryIfRateLimited(() -> AuthClient.verifyMfa(mfaToken, code))
                .then().statusCode(200)
                .extract().as(Tokens.class);

        given().spec(Specs.withToken(tokens.accessToken()))
        .when().get("/me")
        .then().statusCode(200).body("email", equalTo(maya.email()));
    }

    @Test
    @DisplayName("A wrong code is 401 OTP_INVALID with 2 attempts remaining")
    void wrongOtpIsRejected() {
        String mfaToken = AuthClient.retryIfRateLimited(() -> AuthClient.login(maya.email(), Personas.password()))
                .then().statusCode(200).extract().path("mfaToken");
        String real = InboxClient.latestOtp(maya.email());
        String wrong = real.equals("000000") ? "111111" : "000000";

        AuthClient.retryIfRateLimited(() -> AuthClient.verifyMfa(mfaToken, wrong))
                .then()
                .statusCode(401)
                .body("code", equalTo("OTP_INVALID"))
                .body("attemptsRemaining", equalTo(2));
    }

    @Test
    @DisplayName("The token cache signs in once and hands out the same token")
    void tokenIsReused() {
        String first = AuthClient.accessToken(maya.email());
        String second = AuthClient.accessToken(maya.email());
        assertThat(second).isEqualTo(first);
    }
}`,
        },
        {
          title: "Refresh rotation and logout",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("Refresh rotates the tokens; reusing the old refresh token ends the whole session")
void refreshRotates() {
    Tokens original = AuthClient.signIn(maya.email());

    Tokens rotated = AuthClient.retryIfRateLimited(() -> AuthClient.refresh(original.refreshToken()))
            .then().statusCode(200).extract().as(Tokens.class);
    assertThat(rotated.refreshToken()).isNotEqualTo(original.refreshToken());
    given().spec(Specs.withToken(rotated.accessToken())).when().get("/me").then().statusCode(200);

    // The old refresh token was used once already: replaying it looks like theft.
    AuthClient.retryIfRateLimited(() -> AuthClient.refresh(original.refreshToken()))
            .then().statusCode(401).body("code", equalTo("INVALID_REFRESH_TOKEN"));
    // ...so the server revoked the session, and even the new access token is dead now.
    given().spec(Specs.withToken(rotated.accessToken())).when().get("/me")
            .then().statusCode(401).body("code", equalTo("INVALID_TOKEN"));
    AuthClient.clearCache(); // the cached token for maya belonged to that session
}

@Test
@DisplayName("After logout the access token no longer works")
void logoutKillsToken() {
    Tokens tokens = AuthClient.signIn(maya.email());

    AuthClient.logout(tokens.accessToken()).then().statusCode(204);

    given().spec(Specs.withToken(tokens.accessToken())).when().get("/accounts")
            .then().statusCode(401).body("code", equalTo("INVALID_TOKEN"));
    AuthClient.clearCache();
}`,
        },
      ],
      exercises: [
        "Register a throwaway customer <em>without</em> the <code>Customers</code> helper: build the body with <code>RegistrationClient.validBody</code>, send it, and assert the status, the <code>Location</code> header, the email echoed back, and the one account the customer got (type and balance). Then sign the customer in with <code>AuthClient</code> and prove <code>/me</code> returns their email.",
        "For the customer from exercise 1, read Ice Mail through <code>InboxClient</code> and assert the message that registration sent (which <code>kind</code> is it?). Assert its subject and sender, and note anything in the body a UI test could also check.",
        "Make three wrong OTP attempts against one <code>mfaToken</code> for a throwaway customer and assert <code>code</code> and <code>attemptsRemaining</code> after each. Then send the <em>correct</em> code with the same <code>mfaToken</code> and record what happens. Explain why this is the right behaviour.",
        "Try three ways of misusing a refresh token for a throwaway customer: as a bearer access token, an empty JSON body on <code>/auth/refresh</code>, and a made-up value. Record status and <code>code</code> (and field errors) for each.",
        "Run <code>mvn test -Dgroups=api</code> and count the lines <code>Signed in as</code> in <code>target/logs/tests.log</code>. Compare with the number of tests that used a signed-in spec, and explain the difference in two sentences.",
      ],
      quiz: [
        {
          q: "Why does <code>AuthClient</code> cache one token per email?",
          options: ["Sign-in endpoints allow 10 calls per minute per machine, and one sign-in costs two calls", "Tokens are expensive to store", "The OTP can only be read once a day", "Ice Bank allows one session per user"],
          answer: 0,
          explain: "Without the cache a normal suite would trip the rate limit within seconds.",
        },
        {
          q: "You refresh once (getting pair B) and then send the original refresh token A again. What happens?",
          options: ["You get pair C", "A is ignored, B keeps working", "401 INVALID_REFRESH_TOKEN, and the whole session ends, so B's access token stops working too", "429"],
          answer: 2,
          explain: "Reusing a rotated refresh token is treated as theft: Ice Bank revokes the session.",
        },
        {
          q: "Why register with <code>Specs.sandbox()</code> (the sandbox key) rather than <code>Specs.base()</code>?",
          options: ["Registration needs admin rights", "On QA, the key decides which sandbox the new customer is created in", "Without it the password is rejected", "It skips validation"],
          answer: 1,
          explain: "Locally there is only sandbox 1, so both work. On QA, without the key the customer would not land in your sandbox.",
        },
        {
          q: "Which user should a wrong-password test use?",
          options: ["Emma, because she is the happy path", "Liam, because he is locked already", "The teller", "A throwaway customer (or Sophie, signing in correctly afterwards)"],
          answer: 3,
          explain: "Failed logins count toward a lockout. Do that to a user nobody else depends on.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "pojos-schemas",
      title: "POJOs with Jackson, BigDecimal money and JSON schemas",
      summary: "Turn JSON into records and back, compare money correctly, and pin the contract down with a schema.",
      body: `
<p>GPath is great for one value. For whole objects, deserialise into Java types and assert with AssertJ. The starter has records for the main shapes in <code>model/</code>, and
<code>support/Json.MAPPER</code> is the one Jackson <code>ObjectMapper</code> used everywhere (REST Assured uses it too, through <code>Specs.config()</code>).</p>

<h3>What the mapper does</h3>
<ul>
<li><strong>Money</strong>: <code>"5703.95"</code> becomes <code>BigDecimal 5703.95</code> with scale 2. Never <code>double</code>: <code>0.1 + 0.2</code> is not <code>0.3</code> in binary floating point.</li>
<li><strong>Dates</strong>: <code>"2026-11-04T21:15:00-05:00"</code> becomes <code>OffsetDateTime</code>, keeping the offset (<code>JavaTimeModule</code>, no adjustment to your PC's time zone).</li>
<li><strong>Unknown fields are ignored</strong>, so a new API field does not break 200 tests. Catching unexpected fields is the schema's job (below).</li>
</ul>

<h3>Reading</h3>
<ul>
<li>One object: <code>response.as(Account.class)</code> or <code>accounts.account(email, id)</code>.</li>
<li>A top-level array: <code>Arrays.asList(response.as(Account[].class))</code>.</li>
<li>A generic type: <code>response.as(new TypeRef&lt;Page&lt;Transaction&gt;&gt;() { })</code>. The anonymous subclass keeps the generic type at runtime; <code>Page.class</code> alone would give
you maps instead of transactions.</li>
</ul>

<h3>Comparing money</h3>
<p><code>new BigDecimal("2.25").equals(new BigDecimal("2.250"))</code> is <strong>false</strong>: <code>equals</code> compares the scale too. Compare with
<code>compareTo(...) == 0</code>, or AssertJ's <code>isEqualByComparingTo("2.25")</code>. When you compute an expected value, round explicitly
(<code>setScale(2, RoundingMode.HALF_UP)</code>, the rule Ice Bank documents).</p>

<h3>Writing</h3>
<p><code>.body(object)</code> serialises with the same mapper. <code>TransferRequest</code> keeps <code>amount</code> as a <code>String</code> on purpose, so a negative test can send
<code>"10.005"</code> exactly; <code>@JsonInclude(NON_NULL)</code> leaves out a null memo. A <code>BigDecimal</code> in a <code>Map</code> body goes out as a JSON <em>number</em>, a
<code>String</code> as a JSON string; Ice Bank accepts both and always answers with a 2-decimal string.</p>

<h3>Worked example: the running balance</h3>
<p><code>runningBalanceIsConsistent</code> reads 20 posted transactions as <code>Page&lt;Transaction&gt;</code>. They come newest first, so for each pair the newer
<code>balanceAfter</code> must equal the older <code>balanceAfter</code> plus the newer amount (credit) or minus it (debit). This is a real business check that GPath could not express
cleanly, and it needs no fixed numbers, so it works on any sandbox at any time.</p>

<h3>JSON schema: the contract</h3>
<p>A POJO test checks values; a <strong>schema</strong> checks shape: which fields exist, their types and formats, which values are allowed, and (with
<code>"additionalProperties": false</code>) that nothing unexpected appears. REST Assured's <code>json-schema-validator</code> module (draft-04) checks a response against a file in
<code>src/test/resources</code>: <code>body(matchesJsonSchemaInClasspath("schemas/transaction-page.json"))</code>. The starter has <code>schemas/account.json</code>; derive new ones
from <a href="http://localhost:3000/api/v1/openapi.json" target="_blank" rel="noopener">openapi.json</a> (the <code>components.schemas</code> section).</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li><code>double</code> or <code>float</code> for money anywhere: in a record, in an expected value, in a body.</li>
<li><code>assertThat(balance).isEqualTo(new BigDecimal("100"))</code>: fails for <code>100.00</code>. Use <code>isEqualByComparingTo</code>.</li>
<li><code>response.as(Page.class)</code>: compiles, but the items are <code>LinkedHashMap</code>s. Use <code>TypeRef</code>.</li>
<li>A schema that cannot fail. Always prove it once: validate something of the wrong shape and assert it is <em>rejected</em>.</li>
<li><code>map.put("memo", null)</code> sends <code>"memo": null</code>, which is not the same as leaving the field out. Ice Bank answers "Invalid input: expected string, received null".</li>
</ul></div>`,
      examples: [
        {
          title: "tests/api/PojoApiTest.java: records and BigDecimal",
          lang: "java",
          code: String.raw`
@Tag("api")
@DisplayName("POJOs, Jackson and BigDecimal money")
class PojoApiTest {

    private final AccountsClient accounts = new AccountsClient();
    private final TransfersClient transfers = new TransfersClient();

    @Test
    @DisplayName("Account deserialises with BigDecimal money; compare with compareTo, not equals")
    void savingsAccountAsRecord() {
        Account savings = accounts.account(Personas.EMMA, Personas.EMMA_SAVINGS);

        assertThat(savings.type()).isEqualTo(Account.AccountType.SAVINGS);
        assertThat(savings.interestRate()).isEqualByComparingTo("2.25");
        assertThat(savings.balance().scale()).isEqualTo(2);
        assertThat(savings.creditLimit()).isNull();
        assertThat(savings.openedAt().getYear()).isLessThan(2026);

        // The trap: equals() compares the scale too.
        assertThat(new BigDecimal("2.25").equals(new BigDecimal("2.250"))).isFalse();
        assertThat(new BigDecimal("2.25").compareTo(new BigDecimal("2.250"))).isZero();
    }

    @Test
    @DisplayName("Page<Transaction> via TypeRef: each balanceAfter follows from the next older one")
    void runningBalanceIsConsistent() {
        Page<Transaction> page = accounts.transactionPage(Personas.EMMA, Personas.EMMA_CHEQUING,
                Map.of("size", 20, "status", "POSTED"));
        List<Transaction> rows = page.content();
        assertThat(rows).hasSize(20);

        for (int i = 0; i < rows.size() - 1; i++) {
            Transaction newer = rows.get(i);
            Transaction older = rows.get(i + 1);
            BigDecimal signed = "CREDIT".equals(newer.direction()) ? newer.amount() : newer.amount().negate();
            assertThat(newer.balanceAfter())
                    .as("balanceAfter of transaction %d", newer.id())
                    .isEqualByComparingTo(older.balanceAfter().add(signed));
        }
    }

    @Test
    @DisplayName("Reading a page without the client helper: extract().as(new TypeRef<...>() {})")
    void typeRefByHand() {
        Page<Transaction> page = accounts.transactions(Personas.EMMA, Personas.EMMA_CHEQUING, Map.of("size", 3))
                .then().statusCode(200)
                .extract().as(new TypeRef<Page<Transaction>>() { });
        assertThat(page.content()).hasSize(3)
                .allSatisfy(t -> assertThat(t.accountId()).isEqualTo(Personas.EMMA_CHEQUING));
        assertThat(page.totalPages()).isEqualTo((int) Math.ceil(page.totalElements() / 3.0));
    }
}`,
        },
        {
          title: "Serialising: a record, and a Map with a BigDecimal (Sophie, reversed)",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("TransferRequest serialises to the JSON the API expects (null memo left out)")
void transferRequestJson() throws JsonProcessingException {
    String json = Json.MAPPER.writeValueAsString(new TransferRequest(14, 15, "0.01", null));
    assertThat(json).isEqualTo("{\"fromAccountId\":14,\"toAccountId\":15,\"amount\":\"0.01\"}");
}

@Test
@DisplayName("A BigDecimal in a Map body goes as a JSON number; the API answers with a 2-decimal string")
void numberAmountComesBackAsString() {
    long chequing = accounts.firstOfType(Personas.SOPHIE, Account.AccountType.CHEQUING).id();
    long savings = accounts.firstOfType(Personas.SOPHIE, Account.AccountType.SAVINGS).id();

    // A TransferRequest carries the amount as a String, so use a Map to send a JSON number:
    Transfer sent = given().spec(Specs.as(Personas.SOPHIE))
            .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
            .body(Map.of("fromAccountId", chequing, "toAccountId", savings, "amount", new BigDecimal("0.50")))
            .when().post("/transfers")
            .then().statusCode(201)
            .extract().as(Transfer.class);
    try {
        assertThat(sent.amount()).isEqualByComparingTo("0.50");
        assertThat(sent.amount().toPlainString()).isEqualTo("0.50");
    } finally {
        transfers.transfer(Personas.SOPHIE, savings, chequing, TestData.money("0.50"));
    }
}`,
        },
        {
          title: "src/test/resources/schemas/transaction-page.json (new file)",
          lang: "json",
          code: String.raw`
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Page of transactions",
  "type": "object",
  "additionalProperties": false,
  "required": ["content", "page", "size", "totalElements", "totalPages"],
  "definitions": {
    "money": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
    "dateTime": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?([+-]\\d{2}:\\d{2}|Z)$" },
    "transaction": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "accountId", "direction", "amount", "balanceAfter", "status", "type",
                   "description", "referenceId", "createdAt", "postedAt"],
      "properties": {
        "id": { "type": "integer", "minimum": 1 },
        "accountId": { "type": "integer", "minimum": 1 },
        "direction": { "enum": ["DEBIT", "CREDIT"] },
        "amount": { "$ref": "#/definitions/money" },
        "balanceAfter": { "type": ["string", "null"], "pattern": "^-?\\d+\\.\\d{2}$" },
        "status": { "enum": ["PENDING", "POSTED", "REVERSED"] },
        "type": { "type": "string", "minLength": 1 },
        "description": { "type": "string" },
        "referenceId": { "type": "string", "minLength": 1 },
        "createdAt": { "$ref": "#/definitions/dateTime" },
        "postedAt": { "oneOf": [ { "$ref": "#/definitions/dateTime" }, { "type": "null" } ] }
      }
    }
  },
  "properties": {
    "content": { "type": "array", "items": { "$ref": "#/definitions/transaction" } },
    "page": { "type": "integer", "minimum": 0 },
    "size": { "type": "integer", "minimum": 1, "maximum": 100 },
    "totalElements": { "type": "integer", "minimum": 0 },
    "totalPages": { "type": "integer", "minimum": 0 }
  }
}`,
        },
        {
          title: "tests/api/ContractApiTest.java: schemas, and proving they can fail",
          lang: "java",
          code: String.raw`
import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchema;
import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;

@Test
@DisplayName("A page of transactions matches schemas/transaction-page.json")
void transactionPageMatchesSchema() {
    accounts.transactions(Personas.EMMA, Personas.EMMA_CHEQUING, Map.of("size", 100))
            .then().statusCode(200)
            .body(matchesJsonSchemaInClasspath("schemas/transaction-page.json"));
}

@Test
@DisplayName("Prove the schema can fail: an account is not a page")
void schemaRejectsWrongShape() {
    accounts.get(Personas.EMMA, Personas.EMMA_CHEQUING)
            .then().statusCode(200)
            .body(not(matchesJsonSchemaInClasspath("schemas/transaction-page.json")));
}

@Test
@DisplayName("A tiny inline schema is fine for a one-off check")
void inlineSchema() {
    String schema = """
            {"type":"array","minItems":4,"maxItems":4,
             "items":{"type":"object","required":["id","balance"],
                      "properties":{"balance":{"type":"string","pattern":"^-?\\\\d+\\\\.\\\\d{2}$"}}}}""";
    accounts.list(Personas.EMMA).then().statusCode(200).body(matchesJsonSchema(schema));
}`,
          note: "Inside a Java string, a regex backslash is written twice, and inside JSON it is doubled again: <code>\\\\\\\\d</code> in a Java text block becomes <code>\\\\d</code> in JSON, which the validator reads as <code>\\d</code>.",
        },
      ],
      exercises: [
        "Write a <code>Payee</code> record (fields from the <em>Payee</em> schema in Swagger) and deserialise Emma's <code>GET /payees</code> into a <code>List&lt;Payee&gt;</code>. Assert, with AssertJ's <code>extracting</code> and <code>tuple</code>, two payees you can confirm in the UI (biller name, nickname, account number).",
        "Ice Bank's rule for a credit card's minimum payment is in the README. Write a Java method that computes the expected minimum from a balance with <code>BigDecimal</code>, and assert it against <code>minimumPayment</code> for Emma's card and for Olivia's card (read-only). Which rounding mode did you use, and why?",
        "Create <code>schemas/transfer.json</code> from the <em>Transfer</em> component in <code>openapi.json</code> (with <code>additionalProperties: false</code>). Validate Sophie's most recent transfer against it. Then break your schema on purpose in one way (for example an enum value) and confirm the test fails with a readable message; restore it.",
        "Deserialise <code>GET /accounts/1</code> into a two-field record <code>TinyAccount(long id, String type)</code> with <code>Json.MAPPER</code>, then with a plain <code>new ObjectMapper()</code> that has <code>FAIL_ON_UNKNOWN_PROPERTIES</code> enabled. Record the exception and explain in two sentences why the project chose the first behaviour and where it catches unknown fields instead.",
      ],
      quiz: [
        {
          q: "<code>assertThat(new BigDecimal(\"100.00\")).isEqualTo(new BigDecimal(\"100\"))</code>",
          options: ["Passes", "Does not compile", "Fails, because equals compares the scale (2 vs 0)", "Throws ArithmeticException"],
          answer: 2,
          explain: "Use <code>isEqualByComparingTo</code> (or <code>compareTo == 0</code>) for money.",
        },
        {
          q: "Why <code>new TypeRef&lt;Page&lt;Transaction&gt;&gt;() { }</code> instead of <code>Page.class</code>?",
          options: ["It is faster", "<code>Page.class</code> does not compile", "TypeRef validates the schema", "Java erases generics; the anonymous subclass keeps <code>Page&lt;Transaction&gt;</code> available at runtime, so the items become <code>Transaction</code> records"],
          answer: 3,
          explain: "With <code>Page.class</code> the content items would be maps.",
        },
        {
          q: "<code>Json.MAPPER</code> ignores unknown fields. What catches an unexpected new field in a response?",
          options: ["A JSON schema with <code>additionalProperties: false</code>", "Nothing; that is impossible", "<code>statusCode(200)</code>", "The record constructor"],
          answer: 0,
          explain: "POJO tests stay robust; schema tests guard the contract.",
        },
        {
          q: "What does <code>body(not(matchesJsonSchemaInClasspath(...)))</code> on a deliberately wrong shape prove?",
          options: ["That the API is broken", "That your schema is strict enough to reject something; a schema that accepts everything is useless", "That the file is missing", "Nothing useful"],
          answer: 1,
          explain: "Prove every new schema can fail at least once.",
        },
        {
          q: "Which body sends <code>\"amount\": \"0.50\"</code> (a JSON string)?",
          options: ["<code>Map.of(\"amount\", new BigDecimal(\"0.50\"))</code>", "<code>Map.of(\"amount\", 0.5)</code>", "<code>new TransferRequest(14, 15, \"0.50\", null)</code>", "<code>Map.of(\"amount\", 50)</code>"],
          answer: 2,
          explain: "Strings serialise as strings. A BigDecimal or double becomes a JSON number.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "negative-tests",
      title: "Negative tests and RFC 7807 problems",
      summary: "Every error has a shape and a code. Test the 400s, 401s, 403s, 404s, 409s and 422s on purpose.",
      body: `
<p>Most bugs hide in the unhappy paths: the field nobody validated, the rule checked in the UI but not the API, the error that leaks a stack trace. Ice Bank answers every error
with an <strong>RFC 7807 problem</strong> (<code>Content-Type: application/problem+json</code>), so negative tests can be precise.</p>
<pre style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">{
  "type": "https://icebank.test/problems/validation-failed",   ← a URI per code
  "title": "Bad Request",                                     ← the status text
  "status": 400,                                              ← same as the HTTP status
  "detail": "One or more fields are invalid.",                ← for humans; may contain numbers
  "instance": "/api/v1/auth/register",                        ← the path that failed
  "code": "VALIDATION_FAILED",                                ← for machines: ASSERT ON THIS
  "errors": [ { "field": "postalCode", "message": "must be a Canadian postal code in the format A1A 1A1" } ]
}</pre>
<p>Some problems add fields: <code>attemptsRemaining</code> (wrong password or code), <code>remaining</code> (limits), <code>lockedUntil</code>. The starter's <code>Problem</code>
record maps the common ones; <code>ResponseSpecs.problem(status, code)</code> from lesson 4 checks the envelope.</p>

<h3>Which status for what</h3>
<div class="table-wrap"><table>
<thead><tr><th>Status</th><th>Means</th><th>Ice Bank codes you can trigger locally</th></tr></thead>
<tbody>
<tr><td>400</td><td>The request itself is wrong</td><td><code>VALIDATION_FAILED</code> (with <code>errors[]</code>), <code>MALFORMED_JSON</code>, <code>BODY_REQUIRED</code>, <code>IDEMPOTENCY_KEY_REQUIRED</code></td></tr>
<tr><td>401</td><td>Who are you?</td><td><code>UNAUTHORIZED</code> (no token), <code>INVALID_TOKEN</code>, <code>INVALID_CREDENTIALS</code>, <code>OTP_INVALID</code>, <code>SANDBOX_KEY_REQUIRED</code></td></tr>
<tr><td>403</td><td>I know who you are; your role may not do this</td><td><code>FORBIDDEN</code> (customer on <code>/admin/*</code>, teller on customer endpoints)</td></tr>
<tr><td>404</td><td>Not found, <em>including someone else's resource</em></td><td><code>NOT_FOUND</code></td></tr>
<tr><td>409</td><td>Conflicts with existing state</td><td><code>EMAIL_TAKEN</code>, <code>PAYEE_EXISTS</code>, <code>IDEMPOTENCY_KEY_REUSED</code>, <code>INVALID_STATE</code>, <code>PAYEE_HAS_SCHEDULED_PAYMENTS</code></td></tr>
<tr><td>415</td><td>Wrong content type</td><td><code>UNSUPPORTED_MEDIA_TYPE</code></td></tr>
<tr><td>422</td><td>Valid input that breaks a business rule</td><td><code>INSUFFICIENT_FUNDS</code>, <code>SAME_ACCOUNT</code>, <code>UNDERAGE</code>, <code>SAVINGS_LIMIT</code>, <code>LIMIT_PER_TRANSFER</code>, ...</td></tr>
</tbody></table></div>

<h3>The order of checks</h3>
<p>A request can be wrong in several ways at once; the server reports the <em>first</em> check that fails. In Ice Bank the order is: authentication and role (401, 403), sandbox
key, rate limit (429), content type and JSON parsing (415, 400 <code>MALFORMED_JSON</code>), field validation (400 <code>VALIDATION_FAILED</code>), the <code>Idempotency-Key</code>
header, and only then the handler (404, 409, 422). So to test one rule, make <strong>everything else valid</strong>. A test that expects 422 but sends a broken body gets a 400 and
proves nothing about the rule.</p>

<h3>Worked example: three field errors at once</h3>
<p><code>registrationFieldErrors</code> starts from <code>RegistrationClient.validBody</code> (valid in every field) and breaks exactly three: phone, postal code and SIN. The test
asserts the envelope with <code>validationFailed()</code>, that there are exactly three errors, which fields they name, and one message precisely with
<code>errors.find { it.field == 'postalCode' }</code>. Then it deserialises into <code>Problem</code> and checks two more messages with AssertJ tuples. It does not depend on the
order of <code>errors[]</code>, which the API does not promise.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Asserting only the status. 400 has many causes; assert <code>code</code> and the field.</li>
<li>Asserting <code>detail</code> word for word everywhere. It is for humans and may change; assert it only where the wording is part of the requirement, and use
<code>startsWith</code> when it contains numbers (<code>"Available balance is 4817.15."</code>).</li>
<li>Assuming <code>errors[0]</code> is a particular field when several are wrong. Use <code>find</code> or <code>hasItems</code>.</li>
<li>Negative tests that change shared state: wrong passwords on Emma, duplicate registrations with a persona's email.</li>
<li>Expecting 403 for another customer's account. Ice Bank deliberately answers 404 (lesson 12).</li>
</ul></div>`,
      examples: [
        {
          title: "tests/api/ProblemsApiTest.java: 400 with field errors, 400 and 415 for bad bodies",
          lang: "java",
          code: String.raw`
@Tag("api")
@DisplayName("Negative tests and RFC 7807 problems")
class ProblemsApiTest {

    private final AccountsClient accounts = new AccountsClient();
    private final TransfersClient transfers = new TransfersClient();

    @Test
    @DisplayName("400: every invalid field is listed in errors[]")
    void registrationFieldErrors() {
        Map<String, Object> body = RegistrationClient.validBody(Customers.uniqueEmail());
        body.put("phone", "416-555-0199");
        body.put("postalCode", "12345");
        body.put("sin", "123 456 789");

        Response response = AuthClient.retryIfRateLimited(() -> RegistrationClient.register(body));

        response.then().spec(ResponseSpecs.validationFailed())
                .body("errors", hasSize(3))
                .body("errors.field", hasItems("phone", "postalCode", "sin"))
                .body("errors.find { it.field == 'postalCode' }.message",
                        equalTo("must be a Canadian postal code in the format A1A 1A1"));

        Problem problem = response.as(Problem.class);
        assertThat(problem.errors())
                .extracting(Problem.FieldError::field, Problem.FieldError::message)
                .contains(tuple("phone", "must use the format (###) ###-####"),
                          tuple("sin", "must be a valid 9-digit SIN"));
    }

    @Test
    @DisplayName("400 MALFORMED_JSON and 415 UNSUPPORTED_MEDIA_TYPE come before any business rule")
    void malformedBodies() {
        given().spec(Specs.as(Personas.SOPHIE))
                .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                .body("{\"fromAccountId\": 14, ")
        .when().post("/transfers")
        .then().spec(ResponseSpecs.problem(400, "MALFORMED_JSON"));

        given().spec(Specs.as(Personas.SOPHIE))
                .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                .contentType("text/plain")
                .body("send 1.00 please")
        .when().post("/transfers")
        .then().spec(ResponseSpecs.problem(415, "UNSUPPORTED_MEDIA_TYPE"));
    }
}`,
        },
        {
          title: "401, 403, 404 and 400 for a bad id",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("401: no token, and a token that is not valid")
void unauthorised() {
    given().spec(Specs.base()).when().get("/accounts")
            .then().spec(ResponseSpecs.problem(401, "UNAUTHORIZED"));
    given().spec(Specs.withToken("not-a-real-token")).when().get("/accounts")
            .then().spec(ResponseSpecs.problem(401, "INVALID_TOKEN"))
            .body("detail", equalTo("The access token is invalid or has expired."));
}

@Test
@DisplayName("403: a customer token on a teller endpoint")
void forbidden() {
    given().spec(Specs.as(Personas.SOPHIE)).when().get("/admin/customers")
            .then().spec(ResponseSpecs.problem(403, "FORBIDDEN"))
            .body("detail", equalTo("This endpoint requires the ADMIN role."));
}

@Test
@DisplayName("404 for an id that does not exist, 400 for an id that is not a number")
void notFoundVersusBadId() {
    accounts.get(Personas.SOPHIE, 999_999).then().spec(ResponseSpecs.problem(404, "NOT_FOUND"))
            .body("detail", equalTo("Account not found."));
    given().spec(Specs.as(Personas.SOPHIE)).when().get("/accounts/abc")
            .then().spec(ResponseSpecs.validationFailed())
            .body("errors[0].field", equalTo("id"))
            .body("errors[0].message", equalTo("must be a positive whole number"));
}`,
        },
        {
          title: "409 and 422: state and business rules",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("409: the same email cannot register twice")
void emailTaken() {
    Customers.NewCustomer first = Customers.register();
    AuthClient.retryIfRateLimited(() -> RegistrationClient.register(RegistrationClient.validBody(first.email())))
            .then().spec(ResponseSpecs.problem(409, "EMAIL_TAKEN"));
}

@Test
@DisplayName("422: valid input that breaks a business rule")
void businessRules() {
    long chequing = accounts.firstOfType(Personas.SOPHIE, Account.AccountType.CHEQUING).id();
    long savings = accounts.firstOfType(Personas.SOPHIE, Account.AccountType.SAVINGS).id();

    transfers.create(Personas.SOPHIE, chequing, chequing, "1.00")
            .then().spec(ResponseSpecs.problem(422, "SAME_ACCOUNT"));
    transfers.create(Personas.SOPHIE, chequing, savings, "999999.99")
            .then().spec(ResponseSpecs.problem(422, "INSUFFICIENT_FUNDS"))
            .body("detail", startsWith("Available balance is "));

    Map<String, Object> young = RegistrationClient.validBody(Customers.uniqueEmail());
    young.put("dateOfBirth", "2015-01-01");
    AuthClient.retryIfRateLimited(() -> RegistrationClient.register(young))
            .then().spec(ResponseSpecs.problem(422, "UNDERAGE"));
}

@Test
@DisplayName("400 IDEMPOTENCY_KEY_REQUIRED: the header is part of the contract")
void idempotencyKeyRequired() {
    transfers.create(Personas.SOPHIE, new TransferRequest(14, 15, "0.01", null), null)
            .then().spec(ResponseSpecs.problem(400, "IDEMPOTENCY_KEY_REQUIRED"))
            .body("errors[0].field", equalTo("Idempotency-Key"));
}`,
          note: "None of these move money: each request is rejected before anything is written. The two registrations that succeed create throwaway customers.",
        },
      ],
      exercises: [
        "Send <code>POST /auth/register</code> with an empty JSON object. Assert the envelope and that every required field is named in <code>errors[]</code> (find the list in Swagger first). How many errors are there, and is any message less helpful than the others?",
        "Register with a valid body except for the password <code>password</code>. Record every field error you get back and compare with the password rule in the README. Write the assertion so it does not depend on the order of the messages.",
        "With a throwaway customer, test the payee rules: an account number in the wrong format for IceTel Mobile (look at the biller's pattern), a biller id that does not exist, and the same biller and account number added twice. Assert status, <code>code</code> and the field for each.",
        "With a throwaway customer (who starts with $0.00), trigger: <code>INSUFFICIENT_FUNDS</code> on a transfer to a savings account you open for them (assert the exact <code>detail</code> this time, and explain why it is safe here), the savings-account limit, and opening an account type that cannot be opened online.",
        "With a throwaway customer, add a payee, schedule a future bill payment to it, and try to delete the payee. Then cancel the payment, cancel it again, and delete the payee. Assert every status and code, and finish by proving the payee is gone.",
      ],
      quiz: [
        {
          q: "Which field should a negative test assert first (after the status)?",
          options: ["<code>code</code>", "<code>detail</code>", "<code>title</code>", "<code>type</code>"],
          answer: 0,
          explain: "<code>code</code> is the machine-readable reason. <code>detail</code> is for humans and may contain changing numbers.",
        },
        {
          q: "You send a transfer with <code>\"amount\": \"1.005\"</code> <em>and</em> no <code>Idempotency-Key</code>. What comes back?",
          options: ["400 IDEMPOTENCY_KEY_REQUIRED", "422 INSUFFICIENT_FUNDS", "201 with the amount rounded", "400 VALIDATION_FAILED on <code>amount</code>, because field validation runs before the idempotency check"],
          answer: 3,
          explain: "The first failing check wins. Make everything else valid when you test one rule.",
        },
        {
          q: "Emma asks for Liam's account. Which status does Ice Bank return, by design?",
          options: ["401", "404", "403", "422"],
          answer: 1,
          explain: "Another customer's resource is 404, exactly like one that does not exist, so ids cannot be probed.",
        },
        {
          q: "What separates 400 from 422 in Ice Bank?",
          options: ["400: the input is malformed or invalid; 422: the input is valid but a business rule says no", "Nothing, they are interchangeable", "400 is for GET, 422 for POST", "422 means the server crashed"],
          answer: 0,
          explain: "<code>\"1.005\"</code> is a 400 (invalid amount); <code>\"999999.99\"</code> from a $4,800 account is a 422 (valid amount, not enough money).",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "boundaries",
      title: "Boundary and equivalence tests with parameterised JUnit 5",
      summary: "Find the edges of each rule, pick one value per partition, and let @ParameterizedTest run the table.",
      body: `
<p>You cannot test every amount. You can split the input into <strong>equivalence partitions</strong> (values the system should treat the same) and test the <strong>boundaries</strong>
between them, where off-by-one bugs live. For the transfer amount Ice Bank's rule is "$0.01 to $999,999.99, at most 2 decimals, not more than the available balance":</p>
<div class="table-wrap"><table>
<thead><tr><th>Partition</th><th>Boundary and neighbours to test</th><th>Expected</th></tr></thead>
<tbody>
<tr><td>Not a number</td><td><code>abc</code>, <code>12,50</code></td><td>400 on <code>amount</code></td></tr>
<tr><td>Zero or negative</td><td><code>0.00</code>, <code>-5.00</code></td><td>400</td></tr>
<tr><td>Too many decimals</td><td><code>1.005</code>, <code>0.001</code></td><td>400 "must have at most 2 decimal places" (never rounded)</td></tr>
<tr><td>Valid amount, enough money</td><td><code>0.01</code> (minimum), exactly the available balance</td><td>201</td></tr>
<tr><td>Valid amount, not enough money</td><td>available + 0.01, <code>999999.99</code> (maximum)</td><td>422 <code>INSUFFICIENT_FUNDS</code></td></tr>
<tr><td>Too large</td><td><code>1000000.00</code></td><td>400</td></tr>
</tbody></table></div>
<p>e-Transfers add more: $3,000.00 per transfer, $3,000.00 per Toronto day, $10,000.00 per rolling 30 days (pending and deposited count; cancelled and expired do not), and a
security answer of 3 to 25 characters that must not appear in the message.</p>

<h3>JUnit 5 parameterised tests</h3>
<ul>
<li><code>@ParameterizedTest(name = "...")</code> replaces <code>@Test</code>; <code>{0}</code>, <code>{1}</code> in the name show the arguments in the report.</li>
<li><code>@ValueSource(strings = {...})</code>: one argument.</li>
<li><code>@CsvSource({"3000.01, 422, LIMIT_PER_TRANSFER", ...})</code> or a <code>textBlock</code> with a custom <code>delimiter</code> when values contain commas. Quote a value with
single quotes (<code>'balance,desc'</code>); an empty value is <code>null</code>.</li>
<li><code>@MethodSource("name")</code>: a static method returning <code>Stream&lt;Arguments&gt;</code>, for objects, nulls and computed values.</li>
</ul>

<h3>Money you control</h3>
<p>Valid boundaries need a known balance. Do not use Emma. Register a throwaway customer and deposit a <strong>$100.00 cheque</strong> (lesson 11 explains the upload): the first $100
of a cheque is available immediately, so the customer has exactly $100.00 to spend. Open a savings account for them (<code>POST /accounts {"type":"SAVINGS"}</code>) and you can
test "exactly the available balance" and "one cent more" for real, then move the money back.</p>

<h3>Worked example: e-Transfer amount partitions</h3>
<p><code>amountPartitions</code> (below) runs four rows against a customer with $100.00. Read the second row carefully: <code>3000.00</code> is <em>on</em> the per-transfer limit, so it
passes that check and fails on the next one, funds. Getting <code>INSUFFICIENT_FUNDS</code> instead of <code>LIMIT_PER_TRANSFER</code> is the evidence that the boundary is inclusive.
This trick, "the next rule fires", lets you test a boundary without the money to complete the transfer.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Testing only the middle of each partition (<code>50.00</code>, <code>-50.00</code>). Bugs are at <code>0.00</code>/<code>0.01</code> and at the limit/limit + 0.01.</li>
<li>Commas inside <code>@CsvSource</code> values: <code>"sort, balance,desc"</code> is three columns. Quote or change the delimiter.</li>
<li>Daily and rolling limits depend on what was sent before. Run those tests on a fresh customer, or on a sandbox you reset (destructive, lesson 13).</li>
<li>Valid-boundary tests that move money and do not move it back (or cancel the e-Transfer). The next run starts from a different balance.</li>
<li>Sending <code>null</code> through a <code>Map</code> when you mean "missing": <code>put("securityAnswer", null)</code> is a JSON null; use <code>remove</code>.</li>
</ul></div>`,
      examples: [
        {
          title: "tests/api/TransferBoundariesApiTest.java: invalid amounts (Sophie, nothing moves)",
          lang: "java",
          code: String.raw`
@ParameterizedTest(name = "amount \"{0}\" is rejected: {1}")
@CsvSource(delimiter = '|', textBlock = """
        0.00        | must be at least 0.01
        -5.00       | must be greater than 0
        1.005       | must have at most 2 decimal places
        0.001       | must have at most 2 decimal places
        1000000.00  | must be at most 999999.99
        12,50       | must be a decimal amount such as "25.00"
        abc         | must be a decimal amount such as "25.00"
        """)
@DisplayName("Invalid amounts are 400 on the amount field (no money moves)")
void invalidAmounts(String amount, String message) {
    transfers.create(Personas.SOPHIE, 14, 15, amount)
            .then().spec(ResponseSpecs.validationFailed())
            .body("errors[0].field", equalTo("amount"))
            .body("errors[0].message", equalTo(message));
}`,
          note: "Accounts 14 and 15 are Sophie's chequing and savings after a reset. A test that might run after other changes should look them up, as the next example does.",
        },
        {
          title: "Valid boundaries with a $100 throwaway customer",
          lang: "java",
          code: String.raw`
private static NewCustomer nina;
private static long ninaSavings;

@BeforeAll
static void customerWithExactlyOneHundredDollars() {
    nina = Customers.register();
    new DepositsClient().uploadCheque(nina.email(), nina.chequingId(), "100.00").then().statusCode(201);
    ninaSavings = given().spec(Specs.as(nina.email())).body(Map.of("type", "SAVINGS"))
            .when().post("/accounts")
            .then().statusCode(201).extract().jsonPath().getLong("id");
}

@Test
@DisplayName("Exactly the available balance is allowed; one cent more is 422 INSUFFICIENT_FUNDS")
void exactlyTheAvailableBalance() {
    Account before = accounts.account(nina.email(), nina.chequingId());
    assertThat(before.availableBalance()).isEqualByComparingTo("100.00");

    transfers.create(nina.email(), nina.chequingId(), ninaSavings, "100.01")
            .then().spec(ResponseSpecs.problem(422, "INSUFFICIENT_FUNDS"));
    transfers.create(nina.email(), nina.chequingId(), ninaSavings, "100.00")
            .then().statusCode(201).body("amount", equalTo("100.00"));

    assertThat(accounts.account(nina.email(), nina.chequingId()).availableBalance()).isEqualByComparingTo("0.00");
    transfers.create(nina.email(), ninaSavings, nina.chequingId(), "100.00").then().statusCode(201);   // put it back
}

@ParameterizedTest(name = "{0} is accepted")
@ValueSource(strings = {"0.01", "0.10", "7", "7.5"})
@DisplayName("Smallest amounts and short forms are accepted and normalised to 2 decimals")
void validSmallAmounts(String amount) {
    String expected = new BigDecimal(amount).setScale(2).toPlainString();
    transfers.create(nina.email(), nina.chequingId(), ninaSavings, amount)
            .then().statusCode(201).body("amount", equalTo(expected));
    transfers.create(nina.email(), ninaSavings, nina.chequingId(), expected).then().statusCode(201);
}`,
          note: "<code>DepositsClient</code> is written in lesson 11. Until then, copy it from there: it only uploads the two sample cheque images.",
        },
        {
          title: "tests/api/ETransferLimitsApiTest.java: partitions and @MethodSource",
          lang: "java",
          code: String.raw`
private static final ETransfersClient etransfers = new ETransfersClient();
private static NewCustomer olga;   // $100.00 available

@BeforeAll
static void customerWithOneHundredDollars() {
    olga = Customers.register();
    new DepositsClient().uploadCheque(olga.email(), olga.chequingId(), "100.00").then().statusCode(201);
}

static Map<String, Object> body(String amount) {
    Map<String, Object> b = new HashMap<>();
    b.put("fromAccountId", olga.chequingId());
    b.put("recipientName", "Tutorial Friend");
    b.put("recipientEmail", "tutorial.friend@example.com");
    b.put("amount", amount);
    b.put("securityQuestion", "Favourite lake?");
    b.put("securityAnswer", "Superior");
    return b;
}

@ParameterizedTest(name = "{0} -> {1} {2}")
@CsvSource({
        "3000.01, 422, LIMIT_PER_TRANSFER",    // just over the per-transfer limit
        "3000.00, 422, INSUFFICIENT_FUNDS",    // on the limit: passes the limit check, then fails on funds
        "100.01,  422, INSUFFICIENT_FUNDS",    // one cent over the balance
        "0.00,    400, VALIDATION_FAILED",     // below the minimum
})
@DisplayName("Amount partitions around the $3,000 limit and the $100 balance")
void amountPartitions(String amount, int status, String code) {
    etransfers.send(olga.email(), body(amount)).then().spec(ResponseSpecs.problem(status, code));
}

@ParameterizedTest(name = "{0}")
@CsvSource({"0.01", "100.00"})
@DisplayName("Valid amounts are sent (PENDING) and then cancelled, so the money comes back")
void validAmounts(String amount) {
    Response sent = etransfers.send(olga.email(), body(amount));
    sent.then().statusCode(201).body("status", equalTo("PENDING")).body("amount", equalTo(amount));
    etransfers.cancel(olga.email(), sent.jsonPath().getLong("id"))
            .then().statusCode(200).body("status", equalTo("CANCELLED"));
}

static Stream<Arguments> badAnswers() {
    return Stream.of(
            Arguments.of("ab", null, "securityAnswer", "must be 3 to 25 characters"),
            Arguments.of("a".repeat(26), null, "securityAnswer", "must be 3 to 25 characters"),
            Arguments.of("Superior", "Meet me at lake superior", "securityAnswer", "must not appear in the message"),
            Arguments.of(null, null, "securityAnswer", "is required when the recipient does not have autodeposit"));
}

@ParameterizedTest(name = "answer={0}, message={1} -> {2}: {3}")
@MethodSource("badAnswers")
@DisplayName("Security answer rules are 400 field errors")
void securityAnswerRules(String answer, String message, String field, String expected) {
    Map<String, Object> b = body("5.00");
    if (answer == null) {
        b.remove("securityAnswer");      // leave the field out; put(..., null) would send "securityAnswer": null
    } else {
        b.put("securityAnswer", answer);
    }
    if (message != null) {
        b.put("message", message);
    }
    etransfers.send(olga.email(), b)
            .then().spec(ResponseSpecs.validationFailed())
            .body("errors.find { it.field == '" + field + "' }.message", equalTo(expected))
            .body("errors.field", hasItem(field));
}`,
        },
        {
          title: "api/ETransfersClient.java (new file, used above)",
          lang: "java",
          code: String.raw`
/** Interac e-Transfer: /etransfers. Send, accept and cancel need an Idempotency-Key. */
public class ETransfersClient {

    @Step("Send an e-Transfer as {email}")
    public Response send(String email, Map<String, ?> body, String idempotencyKey) {
        return given().spec(Specs.as(email))
                .header(TransfersClient.IDEMPOTENCY_KEY, idempotencyKey)
                .body(body)
                .when().post("/etransfers");
    }

    public Response send(String email, Map<String, ?> body) {
        return send(email, body, TransfersClient.newIdempotencyKey());
    }

    public Response get(String email, long id) {
        return given().spec(Specs.as(email)).pathParam("id", id).when().get("/etransfers/{id}");
    }

    @Step("Accept e-Transfer {id} into account {accountId} as {email}")
    public Response accept(String email, long id, long accountId, String answer) {
        return given().spec(Specs.as(email))
                .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                .pathParam("id", id)
                .body(Map.of("accountId", accountId, "securityAnswer", answer))
                .when().post("/etransfers/{id}/accept");
    }

    @Step("Cancel e-Transfer {id} as {email}")
    public Response cancel(String email, long id) {
        return given().spec(Specs.as(email))
                .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                .pathParam("id", id)
                .when().post("/etransfers/{id}/cancel");
    }

    /** direction is "sent" or "received". */
    public Response list(String email, String direction, Map<String, ?> query) {
        return given().spec(Specs.as(email)).queryParam("direction", direction).queryParams(query).when().get("/etransfers");
    }
}`,
        },
      ],
      exercises: [
        "Prove where the <em>upper</em> boundary of the transfer amount sits, using a throwaway customer with $100.00: one value that is the largest valid amount and one that is the smallest invalid amount above it. Write them as a two-row <code>@CsvSource</code> with the expected status and code, and explain why the valid one does not return 201.",
        "Ice Bank also accepts JSON <em>numbers</em> as amounts. Write a <code>@MethodSource</code> test with at least five amounts of different Java types (an <code>Integer</code>, a <code>double</code>, <code>BigDecimal</code>s with 1, 2 and 3 decimals, a negative one) sent through a <code>Map</code> body, with the expected status and (for 201) the amount string the API answers with. Move any money back.",
        "Find the boundaries of the e-Transfer <code>recipientName</code> in Swagger. Test the shortest and longest valid lengths and the invalid lengths next to them, for a customer with $0.00. Explain how you can tell a valid length passed validation although no money moves.",
        "Do the same for <code>securityQuestion</code>: four rows, two on each side of the two boundaries.",
        "Debit cards have a daily point-of-sale limit (README, Cards). Read your throwaway customer's debit card id from <code>GET /cards</code> and write one <code>@CsvSource</code> covering both edges of the range, a value just outside each, and a value inside the range that breaks the other rule. Assert the field and message for the invalid rows.",
      ],
      quiz: [
        {
          q: "Transfer rule: $0.01 to $999,999.99. Which set tests the boundaries best?",
          options: ["10.00, 500.00, 5000.00", "-1, 0, 1", "0.00, 0.01, 999999.99, 1000000.00", "0.01 only"],
          answer: 2,
          explain: "Each edge and its neighbour outside: the minimum and below it, the maximum and above it.",
        },
        {
          q: "An e-Transfer of <code>3000.00</code> from a $100 account returns 422 <code>INSUFFICIENT_FUNDS</code>. What does that tell you about the per-transfer limit?",
          options: ["Nothing", "That 3000.00 is within the limit: the limit check passed and the funds check failed", "That the limit is 100.00", "That the API is broken"],
          answer: 1,
          explain: "The next rule fired. 3000.01 gives <code>LIMIT_PER_TRANSFER</code>, so the limit is inclusive at 3000.00.",
        },
        {
          q: "<code>@CsvSource({\"sort, balance,desc, sort\"})</code> fails with a parameter count error. Why?",
          options: ["CSV cannot contain the word sort", "<code>@CsvSource</code> needs a file", "JUnit forbids three columns", "The comma inside <code>balance,desc</code> splits it into two columns; quote it as <code>'balance,desc'</code>"],
          answer: 3,
          explain: "Use single quotes or a different <code>delimiter</code> in a <code>textBlock</code>.",
        },
        {
          q: "Why give a throwaway customer exactly $100.00 before boundary tests?",
          options: ["Ice Bank requires a minimum balance", "Cheques are faster than transfers", "So \"exactly the available balance\" and \"one cent more\" are known values you control, without touching Emma", "It is required for e-Transfers"],
          answer: 2,
          explain: "Boundaries need a known starting point. A customer only your test uses gives you one.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "chained-flows",
      title: "Chained flows, idempotency and safe retries",
      summary: "Pass values from one call to the next, verify the end state through another endpoint, and make retries harmless with Idempotency-Key.",
      body: `
<p>Real features span several calls. A <strong>chained test</strong> takes ids and references from one response and uses them in the next request, then verifies the result
somewhere else: the response of a payment says PENDING, but the proof is in the account and its transactions.</p>

<h3>The shape of a good chain</h3>
<ol>
<li><strong>Arrange</strong> with your own data: a throwaway customer, money from a cheque, a payee you add.</li>
<li><strong>Look up, do not hard-code</strong>: find the biller by name, read the account id from registration.</li>
<li><strong>Act</strong> once, and keep what you need: ids, <code>referenceId</code>, <code>Location</code>.</li>
<li><strong>Verify through a different door</strong>: the account's balances, the transactions list, the other party's view, Ice Mail, notifications.</li>
<li><strong>Leave nothing behind</strong> that the next run trips over (throwaway customers make this easy).</li>
</ol>

<h3>Worked example: add payee, pay bill, verify the hold</h3>
<p><code>addPayeePayBillVerifyHold</code> gives a new customer $100.00, finds Maple Gas in <code>GET /billers?q=maple</code> with <code>find</code>, adds it as a payee (201 with a
<code>Location</code>), and pays $25.00 now. Ice Bank's rule: a pay-now bill payment holds the money at once and posts on the <em>next business day</em>. So the test asserts
<code>PENDING</code>, a posting date after today that is not a weekend, then reads the account: <code>balance</code> still 100.00, <code>availableBalance</code> 75.00. Finally it
finds exactly one PENDING transaction: a BILL_PAYMENT debit of 25.00 with no <code>balanceAfter</code> and the <em>same</em> <code>referenceId</code> as the payment. That reference
is the thread that ties the two resources together. <code>Allure.step</code> names a block of the chain in the report.</p>

<h3>The second chain: an e-Transfer between two customers</h3>
<p>The sender sends 40.00 with a question and answer; the money leaves at once (available 60.00). The recipient learns about it from Ice Mail (kind <code>ETRANSFER</code>, whose
<code>link</code> ends with the e-Transfer id), sees it as RECEIVED without the sender's account id, fails with a wrong answer (422 <code>WRONG_ANSWER</code>), succeeds with the right
one in any case and with spaces, and the sender's view becomes DEPOSITED. A deposited transfer can no longer be cancelled (409).</p>

<h3>Idempotency-Key</h3>
<p>Money-moving POSTs (transfers, e-Transfers including accept and cancel, bill payments, cheque deposits) need an <code>Idempotency-Key</code> header. The server remembers the key
<strong>per user</strong> with a hash of the method, path and body, and the <em>answer</em> it gave:</p>
<ul>
<li>Same key, same body: the stored answer is replayed with <code>Idempotent-Replayed: true</code>. Nothing runs twice. This includes 4xx answers: a request that failed with 422
fails again with the same key, even if the reason has gone away.</li>
<li>Same key, different body: 409 <code>IDEMPOTENCY_KEY_REUSED</code>. A request still running: 409 <code>IDEMPOTENCY_IN_PROGRESS</code>.</li>
<li>No key: 400 <code>IDEMPOTENCY_KEY_REQUIRED</code>. For multipart uploads the hash covers each part (files by content), so a retry with a new boundary still matches.</li>
</ul>

<h3>Safe retries</h3>
<p>Networks fail after the server did the work: the transfer happened, but your test saw a timeout. Retrying with a <em>new</em> key would move the money twice. Retrying with the
<em>same</em> key and body gets the original answer back. Rules: retry only network errors, 5xx and 429; never retry other 4xx (they are answers, not accidents); wait longer each
time; and for 429 honour <code>Retry-After</code>, as <code>AuthClient</code> does.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Generating a new <code>Idempotency-Key</code> inside the retry loop. That is a new request, not a retry.</li>
<li>Retrying 422 or 409 "just in case". It hides bugs and, with a fresh key, can repeat side effects.</li>
<li>Verifying a flow only through the response of the last call. The account, the other party and the transactions list are where bugs show.</li>
<li>Hard-coding ids from Swagger examples or from your last run: biller ids, payee ids and e-Transfer ids are different on every sandbox and after every reset.</li>
<li>A chain that relies on another test having run first. Each test builds its own chain (tests run in random order).</li>
</ul></div>`,
      examples: [
        {
          title: "api/BillsClient.java (new file, the methods used here)",
          lang: "java",
          code: String.raw`
/** Billers directory, saved payees and bill payments. */
public class BillsClient {

    public Response billers(String email, String q) {
        var spec = given().spec(Specs.as(email));
        if (q != null) {
            spec.queryParam("q", q);
        }
        return spec.when().get("/billers");
    }

    @Step("Add payee: biller {billerId}, account {accountNumber}, as {email}")
    public Response addPayee(String email, long billerId, String accountNumber, String nickname) {
        Map<String, Object> body = new HashMap<>();
        body.put("billerId", billerId);
        body.put("accountNumber", accountNumber);
        if (nickname != null) {
            body.put("nickname", nickname);
        }
        return given().spec(Specs.as(email)).body(body).when().post("/payees");
    }

    /** POST /bill-payments: payeeId, fromAccountId, amount, optional paymentDate, recurrence, endDate. */
    @Step("Pay a bill as {email}")
    public Response pay(String email, Map<String, ?> body, String idempotencyKey) {
        return given().spec(Specs.as(email))
                .header(TransfersClient.IDEMPOTENCY_KEY, idempotencyKey)
                .body(body)
                .when().post("/bill-payments");
    }

    public Response pay(String email, Map<String, ?> body) {
        return pay(email, body, TransfersClient.newIdempotencyKey());
    }

    public Response payment(String email, long paymentId) {
        return given().spec(Specs.as(email)).pathParam("id", paymentId).when().get("/bill-payments/{id}");
    }

    // also: payee(email, id), deletePayee(email, id), cancelPayment(email, id) -> DELETE /bill-payments/{id}
}`,
        },
        {
          title: "tests/api/BillPaymentFlowApiTest.java",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("A pay-now bill payment holds the money at once and posts on the next business day")
void addPayeePayBillVerifyHold() {
    NewCustomer zoe = Customers.register();
    new DepositsClient().uploadCheque(zoe.email(), zoe.chequingId(), "100.00").then().statusCode(201);
    LocalDate today = LocalDate.parse(TestSupportClient.clock().then().statusCode(200).extract().path("today"));

    // 1. Find the biller by name (never hard-code an id you can look up)
    long billerId = Allure.step("Find Maple Gas in the billers directory", () ->
            bills.billers(zoe.email(), "maple").then().statusCode(200)
                    .extract().jsonPath().getLong("find { it.name == 'Maple Gas' }.id"));

    // 2. Add the payee; keep its id from the response
    Response payee = bills.addPayee(zoe.email(), billerId, "1234-5678-9012", "Gas");
    payee.then().statusCode(201)
            .header("Location", matchesPattern(".*/api/v1/payees/\\d+"))
            .body("billerName", equalTo("Maple Gas"));
    long payeeId = payee.jsonPath().getLong("id");

    // 3. Pay it now
    Response payment = bills.pay(zoe.email(), Map.of("payeeId", payeeId, "fromAccountId", zoe.chequingId(), "amount", "25.00"));
    payment.then().statusCode(201)
            .body("status", equalTo("PENDING"))
            .body("paymentDate", equalTo(today.toString()));
    String reference = payment.path("referenceId");
    LocalDate posting = LocalDate.parse(payment.path("postingDate"));
    assertThat(posting).isAfter(today);
    assertThat(posting.getDayOfWeek()).isNotIn(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY);

    // 4. Verify: balance unchanged, available reduced, a PENDING hold with the same reference
    Account chequing = accounts.account(zoe.email(), zoe.chequingId());
    assertThat(chequing.balance()).isEqualByComparingTo("100.00");
    assertThat(chequing.availableBalance()).isEqualByComparingTo("75.00");

    List<Transaction> pending = accounts.transactionPage(zoe.email(), zoe.chequingId(), Map.of("status", "PENDING")).content();
    assertThat(pending).singleElement().satisfies(t -> {
        assertThat(t.type()).isEqualTo("BILL_PAYMENT");
        assertThat(t.direction()).isEqualTo("DEBIT");
        assertThat(t.amount()).isEqualByComparingTo("25.00");
        assertThat(t.balanceAfter()).isNull();
        assertThat(t.referenceId()).isEqualTo(reference);
    });
}`,
          note: "The sandbox date comes from <code>GET /test/clock</code> (read-only, safe). Ice Bank's \"today\" is the sandbox's Toronto date, not your PC's date.",
        },
        {
          title: "tests/api/ETransferFlowApiTest.java",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("Sender pays 40.00; recipient finds it in Ice Mail, answers wrong, then right (any case)")
void sendAndAccept() {
    NewCustomer sender = Customers.register();
    NewCustomer recipient = Customers.register();
    new DepositsClient().uploadCheque(sender.email(), sender.chequingId(), "100.00").then().statusCode(201);

    Response sent = etransfers.send(sender.email(), Map.of(
            "fromAccountId", sender.chequingId(),
            "recipientName", "Rest Tutorial",
            "recipientEmail", recipient.email(),
            "amount", "40.00",
            "message", "Lunch",
            "securityQuestion", "Which lake?",
            "securityAnswer", "Ontario"));
    sent.then().statusCode(201)
            .body("status", equalTo("PENDING"))
            .body("direction", equalTo("SENT"))
            .body("autodeposit", equalTo(false));
    long id = sent.jsonPath().getLong("id");
    assertThat(accounts.account(sender.email(), sender.chequingId()).availableBalance()).isEqualByComparingTo("60.00");

    // The recipient learns about it from Ice Mail: the link ends with the e-Transfer id
    InboxMessage mail = InboxClient.messages(recipient.email(), "ETRANSFER", 1).get(0);
    assertThat(mail.link()).isEqualTo("/etransfer/received/" + id);
    assertThat(mail.body()).contains("Which lake?").doesNotContain("Ontario");

    etransfers.get(recipient.email(), id).then().statusCode(200)
            .body("direction", equalTo("RECEIVED"))
            .body("fromAccountId", nullValue());   // the sender's account is not shown to the recipient

    etransfers.accept(recipient.email(), id, recipient.chequingId(), "Erie")
            .then().statusCode(422).body("code", equalTo("WRONG_ANSWER"));
    etransfers.accept(recipient.email(), id, recipient.chequingId(), "  ONTARIO ")
            .then().statusCode(200).body("status", equalTo("DEPOSITED"));

    assertThat(accounts.account(recipient.email(), recipient.chequingId()).balance()).isEqualByComparingTo("40.00");
    etransfers.get(sender.email(), id).then().body("status", equalTo("DEPOSITED"));
    etransfers.cancel(sender.email(), id).then().statusCode(409).body("code", equalTo("INVALID_STATE"));
}`,
        },
        {
          title: "Idempotency: the key remembers the answer; a lost response; a retry helper",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("The key remembers the ANSWER: a replayed 422 stays 422 even after money arrives")
void failedAnswerIsReplayedToo() {
    String key = TransfersClient.newIdempotencyKey();
    TransferRequest request = new TransferRequest(kai.chequingId(), savings, "5.00", null);

    transfers.create(kai.email(), request, key).then().statusCode(422).body("code", equalTo("INSUFFICIENT_FUNDS"));
    deposits.uploadCheque(kai.email(), kai.chequingId(), "100.00").then().statusCode(201);

    transfers.create(kai.email(), request, key).then()
            .statusCode(422)
            .header(TransfersClient.IDEMPOTENT_REPLAYED, "true");
    transfers.create(kai.email(), request, TransfersClient.newIdempotencyKey()).then().statusCode(201);   // a new key is a new attempt
}

@Test
@DisplayName("Lost response: the retry with the same key gets the original transfer back")
void lostResponseRetry() {
    deposits.uploadCheque(kai.email(), kai.chequingId(), "100.00").then().statusCode(201);
    String key = TransfersClient.newIdempotencyKey();
    TransferRequest request = new TransferRequest(kai.chequingId(), savings, "10.00", "retry demo");

    transfers.create(kai.email(), request, key);   // pretend this response never reached us (timeout)

    Response retried = Retry.withBackoff(() -> transfers.create(kai.email(), request, key), 3, Duration.ofMillis(200));
    retried.then().statusCode(201).header(TransfersClient.IDEMPOTENT_REPLAYED, "true");

    assertThat(accounts.account(kai.email(), kai.chequingId()).balance()).isEqualByComparingTo("90.00");
    transfers.list(kai.email(), 0, 20).then().body("totalElements", equalTo(1));
}

/** support/Retry.java: retries network errors, 5xx and 429 only. Same key on every attempt! */
public static Response withBackoff(Supplier<Response> call, int maxAttempts, Duration firstDelay) {
    RuntimeException lastError = null;
    Duration delay = firstDelay;
    for (int attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            Response r = call.get();
            if (r.statusCode() < 500 && r.statusCode() != 429) {
                return r;                                     // success or a real answer (4xx): never retry those
            }
            if (attempt == maxAttempts) {
                return r;
            }
        } catch (RuntimeException e) {                        // e.g. a connection reset or a read timeout
            lastError = e;
            if (attempt == maxAttempts) {
                throw e;
            }
        }
        sleep(delay);
        delay = delay.multipliedBy(2);
    }
    throw lastError;
}`,
          note: "<code>kai</code> is a throwaway customer registered in <code>@BeforeEach</code>, with a savings account opened for them. The verified <code>Retry</code> class also logs each retry and wraps <code>Thread.sleep</code>.",
        },
      ],
      exercises: [
        "Extend the bill-payment chain: after paying, find the payment in <code>GET /bill-payments</code> filtered by the new payee and assert id, reference, biller name and nickname. Then show that the customer received a notification about it (find the endpoint in Swagger).",
        "Write the cancel chain for an e-Transfer between two throwaway customers: send 30.00, cancel it as the sender, and verify the refund on the sender's account (which transaction type, which direction, and how is it linked to the e-Transfer?). Then show what the recipient gets when trying to accept it, and what Ice Mail told them.",
        "Send the same e-Transfer twice with the same <code>Idempotency-Key</code> and prove only one exists and only one amount left the account. Then reuse the key with a different amount and assert the answer.",
        "Autodeposit chain: a recipient registers autodeposit for their own email and chequing account (two calls; the code arrives in Ice Mail). Then a sender sends them money <em>without</em> a security question. Assert every status along the way and the recipient's balance at the end.",
        "Write a test that proves <code>Retry.withBackoff</code> does <em>not</em> retry a 422: count the attempts with an <code>AtomicInteger</code> inside the supplier. Use a throwaway customer with $0.00.",
      ],
      quiz: [
        {
          q: "A transfer request timed out on your side. What is the safe retry?",
          options: ["Send it again with a new Idempotency-Key", "Wait 15 minutes and check the balance", "Send it without a key", "Send the same body with the same Idempotency-Key"],
          answer: 3,
          explain: "If the first one ran, the server replays its answer; if not, it runs now. Either way the money moves once.",
        },
        {
          q: "A transfer failed with 422 INSUFFICIENT_FUNDS. You deposit money and resend the same body with the same key. What do you get?",
          options: ["The same 422, replayed (<code>Idempotent-Replayed: true</code>)", "201", "409", "400"],
          answer: 0,
          explain: "The key stores the answer, including errors. A new attempt needs a new key.",
        },
        {
          q: "How does the bill-payment test link the payment to its hold transaction?",
          options: ["By amount", "By <code>referenceId</code>, which both share", "By the newest transaction", "By description"],
          answer: 1,
          explain: "Amounts and order are coincidences; the reference id is the designed link.",
        },
        {
          q: "Which responses should an automatic retry repeat?",
          options: ["All non-2xx", "Only 404", "Network errors, 5xx and 429 (honouring Retry-After)", "Only 422"],
          answer: 2,
          explain: "Other 4xx responses are answers. Retrying them hides bugs.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "pagination",
      title: "Pagination, sorting and filtering",
      summary: "Check the page maths, walk every page, prove the order and the filters, and reject bad parameters.",
      body: `
<p>Every Ice Bank list is a page: <code>{content, page, size, totalElements, totalPages}</code>, with <code>?page=0&amp;size=20&amp;sort=field,dir</code>. Page numbers start at 0;
size is 1 to 100 (default 20). Lists are where off-by-one errors, duplicated or missing items and ignored filters hide, so they deserve their own tests.</p>

<h3>What to check</h3>
<ul>
<li><strong>Maths</strong>: <code>totalPages = ceil(totalElements / size)</code>; every page but the last is full; the last has the remainder; a page past the end is 200 with an empty
<code>content</code>.</li>
<li><strong>Completeness</strong>: walking all pages returns <code>totalElements</code> items and no id twice.</li>
<li><strong>Order</strong>: the default (newest first for transactions) and each allowed sort field, ascending and descending. Ice Bank breaks ties by id, so the order is
stable across pages.</li>
<li><strong>Filters</strong>: each filter alone and combined, inclusive edges (<code>from</code>/<code>to</code> are inclusive Toronto dates, <code>minAmount</code>/<code>maxAmount</code>
inclusive), and that the filtered <code>totalElements</code> matches what you walk.</li>
<li><strong>Validation</strong>: size 0 and 101, a negative page, an unknown sort field, an impossible date, an unknown type, <code>from</code> after <code>to</code>,
<code>minAmount</code> above <code>maxAmount</code>.</li>
</ul>

<h3>Worked example: walk every page</h3>
<p><code>walkAllPages</code> reads page 0 with size 50 to learn the totals and checks <code>totalPages</code> with integer maths (<code>(total + size - 1) / size</code>). It then reads
every page, checks each one's <code>page</code> number and expected size, and collects ids. At the end the list has exactly <code>totalElements</code> ids and a <code>Set</code> of
them is the same size (no duplicates). One page past the end must be empty. Emma's chequing account has a few hundred transactions, so this is seven requests: fine for a test.</p>

<h3>Stable data</h3>
<p>Pagination tests read many pages one after another. If someone adds a transaction in the middle, items shift between pages and your test sees a "duplicate". Run them on
read-only data (Emma, whom nobody changes), or freeze the window with a filter that excludes new rows (<code>to</code> = a past date).</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Checking only page 0. Bugs show up on the last page and one past it.</li>
<li>Comparing money strings to check a sort (<code>"9.99" &gt; "10.00"</code> as text). Map to <code>BigDecimal</code>.</li>
<li>Comparing <code>createdAt</code> strings across different offsets (<code>-04:00</code> in summer, <code>-05:00</code> in winter). Parse to <code>OffsetDateTime</code> and compare instants.</li>
<li>Assuming a sort by <code>description</code> matches Java's <code>String.compareTo</code>. The database's collation decides; test what the requirement says, not your assumption.</li>
<li><code>everyItem</code> on a filter result without checking it is non-empty (lesson 3).</li>
</ul></div>`,
      examples: [
        {
          title: "tests/api/PaginationApiTest.java: walking pages",
          lang: "java",
          code: String.raw`
@Tag("api")
@DisplayName("Pagination, sorting and filtering (Emma, read-only)")
class PaginationApiTest {

    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private final AccountsClient accounts = new AccountsClient();
    private final String emma = Personas.EMMA;
    private final long chequing = Personas.EMMA_CHEQUING;

    @Test
    @DisplayName("Walking every page returns each transaction exactly once")
    void walkAllPages() {
        int size = 50;
        Page<Transaction> first = accounts.transactionPage(emma, chequing, Map.of("size", size));
        assertThat(first.totalPages()).isEqualTo((int) ((first.totalElements() + size - 1) / size));

        List<Long> ids = new ArrayList<>();
        for (int p = 0; p < first.totalPages(); p++) {
            Page<Transaction> page = accounts.transactionPage(emma, chequing, Map.of("size", size, "page", p));
            assertThat(page.page()).isEqualTo(p);
            int expected = p < first.totalPages() - 1 ? size : (int) (first.totalElements() - (long) size * p);
            assertThat(page.content()).hasSize(expected);
            page.content().forEach(t -> ids.add(t.id()));
        }
        Set<Long> unique = new HashSet<>(ids);
        assertThat(ids).hasSize((int) first.totalElements());
        assertThat(unique).hasSameSizeAs(ids);

        accounts.transactions(emma, chequing, Map.of("size", size, "page", first.totalPages()))
                .then().statusCode(200).body("content", empty());
    }
}`,
        },
        {
          title: "Sorting and filters",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("Default order is newest first; sort=amount,asc is non-decreasing")
void sorting() {
    List<Transaction> byDefault = accounts.transactionPage(emma, chequing, Map.of("size", 100)).content();
    assertThat(byDefault).extracting(Transaction::createdAt)
            .isSortedAccordingTo(Comparator.reverseOrder());

    List<BigDecimal> amounts = accounts.transactionPage(emma, chequing, Map.of("size", 100, "sort", "amount,asc"))
            .content().stream().map(Transaction::amount).toList();
    assertThat(amounts).isSortedAccordingTo(BigDecimal::compareTo);
}

@Test
@DisplayName("from/to are inclusive Toronto dates; minAmount/maxAmount are inclusive")
void filters() {
    List<Transaction> october = accounts.transactionPage(emma, chequing,
            Map.of("from", "2026-10-01", "to", "2026-10-31", "size", 100)).content();
    assertThat(october).isNotEmpty().allSatisfy(t -> {
        LocalDate day = t.createdAt().atZoneSameInstant(TORONTO).toLocalDate();
        assertThat(day).isBetween(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31));
    });

    List<Transaction> band = accounts.transactionPage(emma, chequing,
            Map.of("minAmount", "50.00", "maxAmount", "100.00", "size", 100)).content();
    assertThat(band).isNotEmpty().allSatisfy(t ->
            assertThat(t.amount()).isBetween(new BigDecimal("50.00"), new BigDecimal("100.00")));
}`,
          note: "<code>Comparator.reverseOrder()</code> on <code>OffsetDateTime</code> compares instants, so a summer row (<code>-04:00</code>) and a winter row (<code>-05:00</code>) are ordered correctly.",
        },
        {
          title: "Invalid parameters, table-driven",
          lang: "java",
          code: String.raw`
@ParameterizedTest(name = "{0}={1} -> 400 on {2}")
@CsvSource({
        "size, 0, size",
        "size, 101, size",
        "page, -1, page",
        "sort, 'balance,desc', sort",
        "from, 2026-02-30, from",
        "type, SHOPPING, type",
})
@DisplayName("Invalid paging and filter parameters are 400 with the parameter name")
void invalidParameters(String name, String value, String field) {
    accounts.transactions(emma, chequing, Map.of(name, value))
            .then().spec(ResponseSpecs.validationFailed())
            .body("errors[0].field", equalTo(field));
}`,
        },
      ],
      exercises: [
        "Walk every page of Emma's <strong>savings</strong> account with an odd page size (for example 37) and prove completeness and no duplicates. Extract the walking loop into a helper you can reuse in the next exercises.",
        "Prove two more orders on Emma's chequing: <code>amount,desc</code> and <code>createdAt,asc</code>, comparing typed values. Then request <code>description,asc</code> and look at the first rows: write down how you would decide whether the order is correct, and what you would ask the product owner.",
        "Combine three filters (a type, a direction and a minimum amount) with paging of 10, walk all pages with your helper, and assert every item satisfies every filter and the count matches <code>totalElements</code>.",
        "Find two cross-field rules of the transaction search (two parameters that are each valid alone but not together). Assert field and message for each, and prove the edge case where both values are equal is accepted.",
        "As Emma, list her <em>sent</em> e-Transfers filtered by status PENDING and assert every item matches. Then send an invalid <code>direction</code> and assert the field error. Do not assume any particular e-Transfer exists.",
      ],
      quiz: [
        {
          q: "<code>totalElements</code> is 334 and <code>size</code> is 50. How many items are on page 6?",
          options: ["34", "50", "0", "6"],
          answer: 0,
          explain: "Pages 0 to 5 hold 300 items; page 6 (the 7th page) holds the remaining 34. Page 7 is empty.",
        },
        {
          q: "What does Ice Bank return for a page number past the last page?",
          options: ["404", "400", "The last page again", "200 with an empty <code>content</code>"],
          answer: 3,
          explain: "Asking for an empty page is valid. Your test should check it.",
        },
        {
          q: "Why compare <code>OffsetDateTime</code> values instead of the <code>createdAt</code> strings when checking order?",
          options: ["Strings cannot be compared", "Rows from summer and winter have different offsets, so string order is not time order", "OffsetDateTime is faster", "The strings are in UTC"],
          answer: 1,
          explain: "Toronto is <code>-04:00</code> in summer and <code>-05:00</code> in winter. Compare instants.",
        },
        {
          q: "A pagination test sometimes finds a duplicate id across pages. The most likely cause?",
          options: ["Someone added a transaction between your page reads, shifting items", "The API is broken", "Java's HashSet", "The page size was odd"],
          answer: 0,
          explain: "Use read-only data, or freeze the window with filters. If it happens on frozen data, then it is a bug.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "files",
      title: "Files: multipart cheque upload, CSV and PDF downloads",
      summary: "Send multipart/form-data with images, and check downloads by headers, bytes and content.",
      body: `
<p>Not every API speaks JSON. Ice Bank's mobile cheque deposit takes <strong>multipart/form-data</strong> (text fields plus two images), and the statements area returns
<strong>CSV</strong> and <strong>PDF</strong> files. Both need small changes to how you use REST Assured.</p>

<h3>Uploading a cheque</h3>
<p><code>POST /deposits/cheque</code> takes four parts: <code>accountId</code> and <code>amount</code> (text), <code>frontImage</code> and <code>backImage</code> (JPG or PNG, at most 5 MB
each, checked by their bytes, not their names), plus an <code>Idempotency-Key</code> header. Rules: daily limit $5,000.00 across the customer's deposits that day; the first $100.00
is available immediately and the rest is held until a teller approves; only chequing and savings can receive deposits.</p>
<ul>
<li><code>.multiPart("accountId", "123")</code> adds a text part; <code>.multiPart("frontImage", "front.png", bytes, "image/png")</code> adds a file part with a name and type.</li>
<li><code>Specs.base()</code> sets <code>Content-Type: application/json</code>; multipart needs <code>.contentType("multipart/form-data")</code> (REST Assured adds the boundary).</li>
<li>Keep test files in <code>src/test/resources</code> and read them from the classpath, so the test works on every machine. Copy <code>postman/sample-cheque-front.png</code> and
<code>-back.png</code> to <code>src/test/resources/cheques/front.png</code> and <code>back.png</code>.</li>
</ul>

<h3>Worked example: a $250 cheque</h3>
<p><code>chequeUpload</code> deposits 250.00 for a new customer and asserts: 201 with a <code>Location</code>, status PENDING, <code>immediateAmount</code> 100.00, <code>heldAmount</code>
150.00, and that the server stored the front image as <code>image/png</code> with exactly as many bytes as the file you sent. Then the account: balance 250.00 (the deposit is posted)
but available 100.00 (the hold). The second test sends text bytes named <code>front.png</code>: Ice Bank sniffs the content and answers 400 on <code>frontImage</code>.</p>

<h3>Downloads</h3>
<ul>
<li><strong>CSV</strong>: <code>GET /accounts/{id}/transactions.csv</code> takes the same filters as the JSON search (no paging). Check <code>text/csv; charset=utf-8</code>, the
<code>Content-Disposition</code> file name, the exact header line, the line ending (<code>\\r\\n</code>), and compare rows with the JSON endpoint for the same filter.</li>
<li><strong>PDF</strong>: <code>GET /accounts/{id}/statements/{yyyy-MM}.pdf</code> (complete months only; <code>?inline=1</code> to view in a browser). Check
<code>application/pdf</code>, the file name, and that the bytes start with <code>%PDF-</code>. Get bytes with <code>asByteArray()</code>, text with <code>asString()</code>.</li>
<li><code>GET /accounts/{id}/statements</code> lists the months with opening and closing balances, which you can check against each other.</li>
</ul>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Forgetting the content type: REST Assured throws <code>IllegalArgumentException: Content-Type application/json is not valid when using multiparts, it must start with
"multipart/" or contain "multipart+".</code></li>
<li>Reading test files with an absolute path from your laptop. Use the classpath.</li>
<li>Splitting CSV lines on every comma. Descriptions can contain commas and are then quoted. Use a CSV parser, or only read columns before the first text column.</li>
<li>Asserting PDF text with <code>contains</code> on the raw bytes. PDF content is usually compressed; check the headers and magic bytes, or use a PDF library.</li>
<li>Asking for the current month's statement: it does not exist until the month is complete (404). Compute "last month" from the sandbox clock.</li>
</ul></div>`,
      examples: [
        {
          title: "api/DepositsClient.java (new file)",
          lang: "java",
          code: String.raw`
/** Mobile cheque deposit: POST /deposits/cheque as multipart/form-data. */
public class DepositsClient {

    /** Bytes of a file in src/test/resources, e.g. resource("cheques/front.png"). */
    public static byte[] resource(String path) {
        try (InputStream in = DepositsClient.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("Missing test resource " + path);
            }
            return in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Step("Deposit a {amount} cheque into account {accountId} as {email}")
    public Response uploadCheque(String email, long accountId, String amount, byte[] front, byte[] back, String idempotencyKey) {
        var spec = given().spec(Specs.as(email))
                .contentType("multipart/form-data")          // overrides the JSON content type from Specs.base()
                .multiPart("accountId", String.valueOf(accountId))
                .multiPart("amount", amount)
                .multiPart("frontImage", "front.png", front, "image/png")
                .multiPart("backImage", "back.png", back, "image/png");
        if (idempotencyKey != null) {
            spec.header(TransfersClient.IDEMPOTENCY_KEY, idempotencyKey);
        }
        return spec.when().post("/deposits/cheque");
    }

    /** The sample cheque images, a fresh Idempotency-Key. */
    public Response uploadCheque(String email, long accountId, String amount) {
        return uploadCheque(email, accountId, amount, resource("cheques/front.png"), resource("cheques/back.png"),
                TransfersClient.newIdempotencyKey());
    }

    public Response get(String email, long depositId) {
        return given().spec(Specs.as(email)).pathParam("id", depositId).when().get("/deposits/{id}");
    }
}`,
        },
        {
          title: "tests/api/FilesApiTest.java: uploads",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("A $250 cheque: $100 available now, $150 held")
void chequeUpload() {
    NewCustomer leo = Customers.register();
    byte[] front = DepositsClient.resource("cheques/front.png");

    deposits.uploadCheque(leo.email(), leo.chequingId(), "250.00")
            .then().statusCode(201)
            .header("Location", containsString("/api/v1/deposits/"))
            .body("status", equalTo("PENDING"))
            .body("immediateAmount", equalTo("100.00"))
            .body("heldAmount", equalTo("150.00"))
            .body("frontImage.contentType", equalTo("image/png"))
            .body("frontImage.bytes", equalTo(front.length));

    Account chequing = accounts.account(leo.email(), leo.chequingId());
    assertThat(chequing.balance()).isEqualByComparingTo("250.00");
    assertThat(chequing.availableBalance()).isEqualByComparingTo("100.00");
}

@Test
@DisplayName("Images are checked by content: a text file called .png is rejected")
void fakeImageRejected() {
    NewCustomer leo = Customers.register();
    byte[] notAnImage = "this is not a picture".getBytes(StandardCharsets.UTF_8);

    deposits.uploadCheque(leo.email(), leo.chequingId(), "10.00", notAnImage, DepositsClient.resource("cheques/back.png"),
                    TransfersClient.newIdempotencyKey())
            .then().spec(ResponseSpecs.validationFailed())
            .body("errors[0].field", equalTo("frontImage"))
            .body("errors[0].message", equalTo("must be a JPG or PNG image"));
}`,
        },
        {
          title: "api/StatementsClient.java and the download tests",
          lang: "java",
          code: String.raw`
public class StatementsClient {
    public Response csv(String email, long accountId, Map<String, ?> query) {
        return given().spec(Specs.as(email)).accept("text/csv")
                .pathParam("id", accountId).queryParams(query)
                .when().get("/accounts/{id}/transactions.csv");
    }
    public Response list(String email, long accountId) {
        return given().spec(Specs.as(email)).pathParam("id", accountId).when().get("/accounts/{id}/statements");
    }
    /** month is yyyy-MM, e.g. "2026-10". */
    public Response pdf(String email, long accountId, String month) {
        return given().spec(Specs.as(email)).accept("application/pdf")
                .pathParam("id", accountId).pathParam("month", month)
                .when().get("/accounts/{id}/statements/{month}.pdf");
    }
}

@Test
@DisplayName("CSV export: headers, exact column line, and the same rows as the JSON search")
void csvExport() {
    Map<String, String> october = Map.of("from", "2026-10-01", "to", "2026-10-31");
    Response csv = statements.csv(Personas.EMMA, Personas.EMMA_CHEQUING, october);

    csv.then().statusCode(200)
            .contentType("text/csv; charset=utf-8")
            .header("Content-Disposition", "attachment; filename=\"icebank-7919-transactions.csv\"");
    List<String> lines = Arrays.asList(csv.asString().split("\r\n"));
    assertThat(lines.get(0)).isEqualTo("id,createdAt,postedAt,description,type,direction,amount,balanceAfter,status,referenceId");

    long jsonTotal = accounts.transactionPage(Personas.EMMA, Personas.EMMA_CHEQUING,
            Map.of("from", "2026-10-01", "to", "2026-10-31", "size", 1)).totalElements();
    assertThat(lines).hasSize((int) jsonTotal + 1);
    assertThat(lines.subList(1, lines.size())).allSatisfy(l -> assertThat(l).matches("^\\d+,2026-10-.*"));
}

@Test
@DisplayName("PDF statement: bytes start with %PDF; the current month is not available yet")
void pdfStatement() {
    YearMonth thisMonth = YearMonth.from(LocalDate.parse(TestSupportClient.clock().path("today")));
    String lastMonth = thisMonth.minusMonths(1).toString();

    Response pdf = statements.pdf(Personas.EMMA, Personas.EMMA_CHEQUING, lastMonth);
    pdf.then().statusCode(200)
            .contentType("application/pdf")
            .header("Content-Disposition", startsWith("attachment; filename=\"icebank-statement-7919-" + lastMonth));
    byte[] bytes = pdf.asByteArray();
    assertThat(new String(bytes, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    assertThat(bytes.length).isGreaterThan(1000);

    statements.pdf(Personas.EMMA, Personas.EMMA_CHEQUING, thisMonth.toString())
            .then().spec(ResponseSpecs.problem(404, "NOT_FOUND"));
}`,
          note: "Downloads are reads, so Emma is fine here. The CSV test splits on <code>\\r\\n</code>, the line ending Ice Bank uses.",
        },
      ],
      exercises: [
        "For a new customer, deposit a cheque small enough to be available in full and assert the immediate and held amounts. Then use up the daily limit exactly with a second cheque and show what a third cheque of one cent returns, including any extra field in the problem.",
        "Send a cheque upload with two mistakes at once (an amount with three decimals and no back image) and assert both field errors. Then send the same fields as a JSON body instead of multipart, and assert what Ice Bank says.",
        "Download Emma's chequing CSV for September and October 2026 and compare the <code>id</code> column, in order, with the ids from the JSON search with the same filter. Do it without splitting whole lines on commas.",
        "Using <code>GET /accounts/1/statements</code>, prove for the three most recent statements that each month's opening balance equals the previous month's closing balance. Record how many statements there are and the newest month.",
        "Download a statement with <code>?inline=1</code> and assert what changes. Then try: a new customer asking for Emma's statement, a month that cannot exist (<code>2026-13</code>) and a month in the wrong format. Record status, code and field for each.",
      ],
      quiz: [
        {
          q: "Your multipart request throws <code>Content-Type application/json is not valid when using multiparts</code>. Fix?",
          options: ["Remove the images", "Use <code>.body(bytes)</code>", "Add <code>.contentType(\"multipart/form-data\")</code> after the spec", "Use <code>Specs.sandbox()</code>"],
          answer: 2,
          explain: "<code>Specs.base()</code> sets JSON. Override it; REST Assured adds the boundary for you.",
        },
        {
          q: "How does Ice Bank decide whether an upload is a PNG?",
          options: ["By the file name", "By the first bytes of the file (magic numbers)", "By the part's declared content type", "It does not check"],
          answer: 1,
          explain: "A text file called <code>front.png</code> is rejected with \"must be a JPG or PNG image\".",
        },
        {
          q: "A $250.00 cheque is accepted. What are the account's balance and available balance afterwards, for a customer who started at $0.00?",
          options: ["250.00 and 250.00", "100.00 and 100.00", "0.00 and 100.00", "250.00 and 100.00"],
          answer: 3,
          explain: "The deposit posts in full; $150.00 of it is held until a teller approves.",
        },
        {
          q: "Which check on a PDF download is reliable without a PDF library?",
          options: ["The text of the statement appears in <code>asString()</code>", "The file is exactly 1 MB", "Content type, Content-Disposition and the bytes starting with <code>%PDF-</code>", "The PDF has 3 pages"],
          answer: 2,
          explain: "PDF text is usually compressed. Headers and magic bytes are stable.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "authorization",
      title: "Authorization and IDOR tests",
      summary: "Signed in is not the same as allowed: test other people's ids, the wrong role, broken tokens and fields you should not be able to set.",
      body: `
<p><strong>Authentication</strong> asks "who are you?" (401 when it fails). <strong>Authorization</strong> asks "may <em>you</em> do <em>this</em> to <em>that</em>?". The classic hole is
an <strong>IDOR</strong> (insecure direct object reference): the API checks that you are signed in, but not that the id in the URL or body is yours. Change
<code>/accounts/1</code> to <code>/accounts/2</code> and you read a stranger's account. Every endpoint that takes an id needs an authorization test.</p>

<h3>Ice Bank's policy</h3>
<ul>
<li>Another customer's resource answers <strong>404 NOT_FOUND</strong>, exactly like an id that does not exist, so an attacker cannot even learn which ids exist.</li>
<li>The wrong <em>role</em> answers <strong>403 FORBIDDEN</strong>: a customer on <code>/admin/*</code>, the teller on customer endpoints such as <code>/accounts</code>.</li>
<li>A missing, tampered, expired or logged-out token, a wrong <code>Authorization</code> scheme, or a wrong sandbox key answer <strong>401</strong>.</li>
</ul>

<h3>Building the matrix</h3>
<p>Think in three columns: <strong>who</strong> (owner, another customer, teller, nobody), <strong>what</strong> (each resource with an id: accounts, transactions, statements, cards,
payees, bill payments, e-Transfers, deposits, disputes, transfers), <strong>which action</strong> (read, change, delete, use as a source of money). For each "not allowed" cell,
assert the status and code <em>and that nothing changed</em>, by reading the victim's resource as the victim afterwards.</p>
<p>Use a throwaway "attacker" and victims whose data you may touch: Sophie, or a second throwaway. Reading Emma's resources as the attacker is fine (nothing changes if the API is
correct); never aim a <em>write</em> at Emma.</p>

<h3>Worked example: spending someone else's money</h3>
<p><code>cannotSpendSomeoneElsesMoney</code> reads Emma's chequing balance as Emma, then Mallory (a throwaway) asks for a $1.00 transfer from Emma's account 1 to Mallory's own
chequing. Correct answer: 404 <code>NOT_FOUND</code>. Then the test reads Emma's account again and asserts the balance did not change. The status code alone is not enough: an API
could answer 404 <em>and</em> move the money.</p>

<h3>Make only the ownership wrong</h3>
<p>An IDOR test is only meaningful if the request would succeed for the owner. If the body is invalid, you get 400 from validation before ownership is even checked, and the test
"passes" while proving nothing. Start from a request that works for the owner, then change only who sends it.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Expecting 403 for another customer's resource. Ice Bank's documented answer is 404; a 403 there leaks that the id exists (worth a bug report).</li>
<li>Testing only reads. Writes (lock a card, cancel an e-Transfer, accept someone else's e-Transfer, deposit into someone else's account) matter more.</li>
<li>Asserting the status without checking the victim's data afterwards.</li>
<li>Assuming the sandbox key is a super-user token. It opens test support and Ice Mail, nothing else.</li>
<li>Forgetting body fields that carry ids or roles: <code>fromAccountId</code>, <code>accountId</code> on accept, <code>transactionId</code> on disputes, a <code>role</code> on
<code>PATCH /me</code>.</li>
</ul></div>`,
      examples: [
        {
          title: "tests/api/AuthorizationApiTest.java: other customers' ids",
          lang: "java",
          code: String.raw`
@Tag("api")
@DisplayName("Authorization and IDOR")
class AuthorizationApiTest {

    private static NewCustomer mallory;   // a customer poking at other people's ids
    private final AccountsClient accounts = new AccountsClient();
    private final TransfersClient transfers = new TransfersClient();

    @BeforeAll
    static void attacker() {
        mallory = Customers.register();
    }

    @ParameterizedTest(name = "GET {0}")
    @ValueSource(strings = {"/accounts/1", "/accounts/1/transactions", "/accounts/1/statements", "/etransfers/105", "/payees/1"})
    @DisplayName("Another customer's resources are 404, exactly like ids that do not exist")
    void othersResourcesAreNotFound(String path) {
        given().spec(Specs.as(mallory.email())).when().get(path)
                .then().spec(ResponseSpecs.problem(404, "NOT_FOUND"));
    }

    @Test
    @DisplayName("404 for 'not yours' and 404 for 'does not exist' are indistinguishable")
    void sameAnswerForNotYoursAndMissing() {
        Response notMine = accounts.get(mallory.email(), Personas.EMMA_CHEQUING);
        Response missing = accounts.get(mallory.email(), 999_999_999);
        assertThat(notMine.statusCode()).isEqualTo(missing.statusCode());
        assertThat(notMine.path("detail").toString()).isEqualTo(missing.path("detail"));
    }

    @Test
    @DisplayName("Moving money out of Emma's account is 404 and her balance does not change")
    void cannotSpendSomeoneElsesMoney() {
        Account before = accounts.account(Personas.EMMA, Personas.EMMA_CHEQUING);

        transfers.create(mallory.email(), Personas.EMMA_CHEQUING, mallory.chequingId(), "1.00")
                .then().spec(ResponseSpecs.problem(404, "NOT_FOUND"));

        Account after = accounts.account(Personas.EMMA, Personas.EMMA_CHEQUING);
        assertThat(after.balance()).isEqualByComparingTo(before.balance());
    }

    @Test
    @DisplayName("Another customer's transfer id is 404")
    void otherCustomersTransfer() {
        long sophiesTransfer = transfers.list(Personas.SOPHIE, 0, 1).then().statusCode(200)
                .extract().jsonPath().getLong("content[0].id");
        transfers.get(mallory.email(), sophiesTransfer).then().spec(ResponseSpecs.problem(404, "NOT_FOUND"));
        transfers.get(Personas.SOPHIE, sophiesTransfer).then().statusCode(200);
    }
}`,
        },
        {
          title: "Roles, broken credentials and mass assignment",
          lang: "java",
          code: String.raw`
@Test
@DisplayName("Wrong role: a customer on a teller endpoint, a teller on a customer endpoint, both 403")
void wrongRoleIsForbidden() {
    given().spec(Specs.as(mallory.email())).body(Map.of("reason", "test")).when().post("/admin/accounts/10/unfreeze")
            .then().spec(ResponseSpecs.problem(403, "FORBIDDEN"));
    given().spec(Specs.as(Personas.TELLER)).when().get("/accounts")
            .then().spec(ResponseSpecs.problem(403, "FORBIDDEN"))
            .body("detail", equalTo("This endpoint is for customers."));
}

@Test
@DisplayName("A tampered token, a wrong scheme and a wrong sandbox key are all 401")
void badCredentials() {
    String token = AuthClient.accessToken(mallory.email());
    String tampered = token.substring(0, token.length() - 2) + (token.endsWith("A") ? "BB" : "AA");
    given().spec(Specs.withToken(tampered)).when().get("/me")
            .then().spec(ResponseSpecs.problem(401, "INVALID_TOKEN"));
    given().spec(Specs.base()).header("Authorization", "Token " + token).when().get("/me")
            .then().spec(ResponseSpecs.problem(401, "INVALID_TOKEN"))
            .body("detail", equalTo("Authorization header must use the Bearer scheme."));
    given().spec(Specs.base()).header(Specs.SANDBOX_KEY_HEADER, "guess").queryParam("email", Personas.EMMA)
            .when().get("/inbox")
            .then().spec(ResponseSpecs.problem(401, "INVALID_SANDBOX_KEY"));
}

@Test
@DisplayName("Mass assignment: PATCH /me refuses fields it does not know, such as role")
void cannotPromoteYourself() {
    given().spec(Specs.as(mallory.email())).body(Map.of("role", "ADMIN"))
            .when().patch("/me")
            .then().spec(ResponseSpecs.validationFailed());
    given().spec(Specs.as(mallory.email())).when().get("/me").then().body("role", equalTo("CUSTOMER"));
}`,
          note: "The unfreeze attempt is rejected with 403 before anything is looked up, so Ava's frozen account stays frozen. The teller signs in once through the token cache.",
        },
      ],
      exercises: [
        "Build a parameterised IDOR test of <em>write</em> attempts by a throwaway attacker against Sophie's resources: at least locking, changing the limit of, and reporting lost one of her cards, plus disputing one of her posted debits and downloading her CSV. After each attempt, prove as Sophie that her card is unchanged. Make sure each request would succeed if Sophie sent it.",
        "With three throwaway customers A (sender), B (recipient) and M (attacker): A sends B an e-Transfer. Show that M cannot read or accept it, that A cannot accept their own transfer, that B cannot cancel it, and that B cannot deposit it into A's account. Finish with B accepting it correctly.",
        "Show that the sandbox key is not a user: call a customer endpoint with only <code>X-Sandbox-Key</code> and record the answer; then show one thing the key <em>does</em> allow. Write two sentences on why a QA sandbox key must still be kept secret.",
        "Pick two endpoints from Swagger that the examples did not cover and that take an id in the path. Test them for IDOR (read and, if they have one, write) and write down your verdict for each.",
      ],
      quiz: [
        {
          q: "Mallory requests <code>GET /accounts/1</code> (Emma's). The correct Ice Bank answer?",
          options: ["200 with Emma's data", "401 UNAUTHORIZED", "403 FORBIDDEN", "404 NOT_FOUND"],
          answer: 3,
          explain: "Not yours looks exactly like not there.",
        },
        {
          q: "The teller calls <code>GET /accounts</code>. Answer?",
          options: ["403 FORBIDDEN, \"This endpoint is for customers.\"", "200, the teller sees all accounts", "404", "401"],
          answer: 0,
          explain: "The teller is authenticated but has the wrong role for customer endpoints.",
        },
        {
          q: "An IDOR write test gets 404 as expected. What else must it check?",
          options: ["Nothing", "That the victim's resource is unchanged, read as the victim", "That the attacker's token still works", "The response time"],
          answer: 1,
          explain: "An API can answer with an error and still perform the change.",
        },
        {
          q: "Your IDOR test on <code>POST /disputes</code> gets 400 VALIDATION_FAILED. What does it prove?",
          options: ["The endpoint is secure", "The attacker owns the transaction", "Nothing about ownership: validation failed before ownership was checked", "Disputes are disabled"],
          answer: 2,
          explain: "Send a body that would succeed for the owner, then change only the sender.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "clock-qa-allure",
      title: "Clock-driven tests, running on QA and reading Allure",
      summary: "Test scheduling with the sandbox clock (and keep it destructive-tagged), run the same suite on QA, and turn red tests into bug reports.",
      body: `
<p>Week 2 ends with the two things that make a suite useful to a team: tests for <em>time</em> (scheduled payments, holidays, expiry) and a run against the QA build, read
through an Allure report.</p>

<h3>The sandbox clock</h3>
<p>Ice Bank uses a virtual clock per sandbox for everything business-related: "today", daily limits, business days, OTP expiry, scheduled payments, e-Transfer expiry, interest.
<code>TestSupportClient.clock()</code> (<code>GET /test/clock</code>, sandbox key) reads it and is always safe. <code>POST /test/clock</code> with exactly one of
<code>advanceDays</code>, <code>advanceMinutes</code>, <code>date</code> or <code>dateTime</code> moves it <em>forward</em>, and runs all due work (posting scheduled payments, failing
short ones, expiring e-Transfers, paying interest) <strong>before</strong> it responds, so the very next request sees the result. It never moves backwards; only
<code>POST /test/reset</code> returns to the seed instant, Monday 2 November 2026, 09:00 Toronto.</p>

<div class="callout rule"><p><strong>Moving the clock or resetting is destructive.</strong> It changes "today" for every person and every test in the sandbox. Such tests carry
<code>@Tag("destructive")</code>, reset in <code>@BeforeAll</code> (so they start from known dates) and in <code>@AfterAll</code>, and run only on a sandbox that is yours alone:
<code>mvn test -Dgroups=destructive -DexcludedGroups=</code>. Never run them on a shared local app or on a teammate's QA sandbox.</p></div>

<h3>Much of scheduling needs no clock move</h3>
<p>The posting date is calculated when you <em>schedule</em>. So "a Saturday payment posts on Monday", "Remembrance Day moves to the next day", "a monthly series from the 31st falls
on the last day of shorter months" and "funds are checked on the posting date, not today" can all be tested by reading the clock and computing dates from <em>its</em> today, never
from your PC's. Only "it actually posts (or fails) when the day comes" needs the clock to move.</p>

<h3>Worked example: the weekend rule, then the posting</h3>
<p><code>saturdayMovesToMonday</code> reads the sandbox's today, computes the next Saturday with <code>TemporalAdjusters.next(DayOfWeek.SATURDAY)</code>, schedules a payment for it
and asserts SCHEDULED and a posting date two days later. Safe anywhere. The destructive companion resets, schedules Emma's payee 1 for Saturday 7 November, moves the clock to
Sunday 8 (still SCHEDULED), then to Monday 9: the response's <code>dueWork.billPaymentsPosted</code> is 1, the payment is POSTED and the balance dropped by exactly the amount.</p>

<h3>Running on QA</h3>
<ul>
<li>Put your values in <code>src/test/resources/config/qa.local.properties</code> (git-ignored) or <code>ICEBANK_*</code> environment variables: base URL, sandbox id, <strong>sandbox
key (secret)</strong>, email suffix, database password. Then <code>mvn test -Denv=qa</code> (PowerShell: <code>mvn test "-Denv=qa"</code>).</li>
<li>Persona emails get your suffix: <code>Personas.EMMA</code> becomes <code>emma.tremblay+s3@icebank.test</code>, and <code>Customers.uniqueEmail()</code> adds it too. Encode
<code>+</code> in query strings; <code>queryParam</code> does it for you.</li>
<li>A placeholder that is still <code>CHANGE_ME</code> stops the run with a message naming the key: the suite fails fast instead of half-running.</li>
<li>Same code, same ids: a test that is green locally and red on QA is a <em>candidate</em> bug. Re-run it alone, read the request and response, and confirm by hand before filing.</li>
</ul>

<h3>Reading Allure</h3>
<p><code>mvn allure:serve</code> after a run opens the report. <strong>Suites</strong> and <strong>Behaviors</strong> (<code>@Epic</code>, <code>@Feature</code>, <code>@Story</code>) group
tests; each test shows its steps (<code>@Step</code> client methods, <code>Allure.step</code> blocks), and each HTTP call as request and response attachments with the
<code>X-Request-Id</code>. A good bug report quotes: the test name, the request (method, path, body), expected versus actual, the request id, and the environment. Do not publish QA
reports: they contain short-lived tokens.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Computing dates from <code>LocalDate.now()</code>. The sandbox may be days ahead of your PC; read <code>GET /test/clock</code>.</li>
<li>A destructive test without a reset at the start: it depends on whatever date the last person left behind.</li>
<li>Expecting the clock to go back after a test. Only a reset does that.</li>
<li>Pasting the QA sandbox key into <code>qa.properties</code> (committed) instead of <code>qa.local.properties</code> (ignored).</li>
<li>Filing a bug from a red QA test without re-running it, or without the request id.</li>
</ul></div>`,
      examples: [
        {
          title: "tests/api/SchedulingApiTest.java: safe, reads the clock only",
          lang: "java",
          code: String.raw`
/** Safe on a shared sandbox: it only READS the clock and schedules payments for a throwaway customer. */
@Tag("api")
@Feature("Bill payments")
@DisplayName("Scheduling rules (no clock moves)")
class SchedulingApiTest {

    private final BillsClient bills = new BillsClient();
    private NewCustomer ivy;
    private long payeeId;
    private LocalDate today;

    @BeforeEach
    void customerWithPayee() {
        ivy = Customers.register();
        payeeId = bills.addPayee(ivy.email(), 1, "4410028731", "Hydro").then().statusCode(201)
                .extract().jsonPath().getLong("id");
        today = LocalDate.parse(TestSupportClient.clock().then().statusCode(200).extract().path("today"));
    }

    @Test
    @Story("Weekend dates move to Monday")
    @DisplayName("A payment requested for a Saturday posts on the following Monday")
    void saturdayMovesToMonday() {
        LocalDate saturday = today.with(TemporalAdjusters.next(DayOfWeek.SATURDAY));

        Response r = bills.pay(ivy.email(), Map.of("payeeId", payeeId, "fromAccountId", ivy.chequingId(),
                "amount", "80.00", "paymentDate", saturday.toString()));

        r.then().statusCode(201)
                .body("status", equalTo("SCHEDULED"))
                .body("paymentDate", equalTo(saturday.toString()))
                .body("postingDate", equalTo(saturday.plusDays(2).toString()));
    }

    @Test
    @Story("Funds are checked on the posting date, not today")
    @DisplayName("A $0.00 customer can schedule a payment: funds are checked later")
    void fundsCheckedLater() {
        bills.pay(ivy.email(), Map.of("payeeId", payeeId, "fromAccountId", ivy.chequingId(),
                        "amount", "9000.00", "paymentDate", today.plusDays(10).toString()))
                .then().statusCode(201).body("status", equalTo("SCHEDULED"));
    }

    @Test
    @Story("Monthly series on the 31st")
    @DisplayName("MONTHLY from 2027-01-31 falls on the last day of shorter months")
    void monthEnd() {
        bills.pay(ivy.email(), Map.of("payeeId", payeeId, "fromAccountId", ivy.chequingId(), "amount", "10.00",
                        "paymentDate", "2027-01-31", "recurrence", "MONTHLY"))
                .then().statusCode(201)
                .body("postingDate", equalTo("2027-02-01"))                   // Sunday 31 Jan -> Monday
                .body("upcoming.paymentDate[0..2]", equalTo(List.of("2027-02-28", "2027-03-31", "2027-04-30")))
                .body("upcoming.postingDate[0..1]", equalTo(List.of("2027-03-01", "2027-03-31")));
    }
}`,
          note: "If a Monday is a holiday, the Saturday rule moves further. The seed date is in November, where the next Monday holiday is far away; a robust version would look the holiday list up.",
        },
        {
          title: "tests/api/SchedulingDestructiveTest.java: moves the clock (your own sandbox only)",
          lang: "java",
          code: String.raw`
/**
 * Moves the sandbox clock, so: tagged destructive (skipped by the default run), resets before and after,
 * and only ever run against a sandbox that is yours alone:
 *   mvn test -Dgroups=destructive -DexcludedGroups= -Dtest=SchedulingDestructiveTest
 */
@Tag("api")
@Tag("destructive")
@Feature("Bill payments")
@DisplayName("Scheduled payments post when the clock reaches them (destructive)")
class SchedulingDestructiveTest {

    private final BillsClient bills = new BillsClient();
    private final AccountsClient accounts = new AccountsClient();

    @BeforeAll
    static void seedState() {
        TestSupportClient.reset().then().statusCode(200).body("clock.today", equalTo("2026-11-02"));
    }

    @AfterAll
    static void backToSeed() {
        TestSupportClient.reset().then().statusCode(200);
    }

    @Test
    @DisplayName("A payment for Saturday 7 Nov posts on Monday 9 Nov, not before")
    void postsOnTheBusinessDay() {
        long paymentId = bills.pay(Personas.EMMA, Map.of("payeeId", 1, "fromAccountId", Personas.EMMA_CHEQUING,
                        "amount", "80.00", "paymentDate", "2026-11-07"))
                .then().statusCode(201).body("postingDate", equalTo("2026-11-09"))
                .extract().jsonPath().getLong("id");
        BigDecimal before = accounts.account(Personas.EMMA, Personas.EMMA_CHEQUING).balance();

        TestSupportClient.setClock(Map.of("date", "2026-11-08")).then().statusCode(200);   // Sunday: nothing yet
        bills.payment(Personas.EMMA, paymentId).then().body("status", equalTo("SCHEDULED"));

        TestSupportClient.setClock(Map.of("date", "2026-11-09")).then().statusCode(200)
                .body("dueWork.billPaymentsPosted", equalTo(1));
        bills.payment(Personas.EMMA, paymentId).then().body("status", equalTo("POSTED"));
        Account after = accounts.account(Personas.EMMA, Personas.EMMA_CHEQUING);
        assertThat(after.balance()).isEqualByComparingTo(before.subtract(new BigDecimal("80.00")));
    }
}`,
          note: "This is the one place where Emma may be changed: right after a reset of your own sandbox, which the class also resets afterwards. It compiles with the rest of the suite and is skipped by every normal run.",
        },
        {
          title: "Running on QA and building the report",
          lang: "bash",
          code: String.raw`
# src/test/resources/config/qa.local.properties  (git-ignored; values from your instructor)
#   baseUrl=https://...
#   sandboxId=3
#   sandboxKey=...
#   emailSuffix=+s3

mvn clean test -Denv=qa            # PowerShell: mvn clean test "-Denv=qa"
mvn allure:serve                   # opens the report in a browser

# Forgot a value? The run stops at the first placeholder, naming the key:
#   IllegalStateException: Config key 'baseUrl' for env 'qa' is still a placeholder (https://CHANGE_ME).
#   Put the real value in src/test/resources/config/qa.local.properties or set ICEBANK_BASE_URL. ...`,
        },
        {
          title: "Allure annotations and steps",
          lang: "java",
          code: String.raw`
@Tag("api")
@Epic("Payments")
@Feature("Bill payments")
class HolidayApiTest {

    @Test
    @Story("Holidays")
    @Severity(SeverityLevel.CRITICAL)
    @DisplayName("A payment on a holiday posts on the next business day")
    void holidayMovesPayment() {
        // ... arrange a customer and a payee ...
        Allure.step("Schedule for the holiday", () -> {
            // the request and its assertions; the HTTP call is attached under this step
        });
        Allure.addAttachment("note", "text/plain", "Why this date was chosen");
    }
}`,
          note: "Imports: <code>io.qameta.allure.Allure</code>, <code>Epic</code>, <code>Feature</code>, <code>Story</code>, <code>Severity</code>, <code>SeverityLevel</code>. Client methods marked <code>@Step</code> appear as steps automatically when you run through Maven.",
        },
      ],
      exercises: [
        "Read the sandbox clock and assert, in Java, that its fields agree with each other: <code>offsetDays</code> with <code>offsetSeconds</code>, and <code>today</code> with <code>now</code> in Toronto. Do not move the clock.",
        "Without moving the clock, test that a bill payment requested for Remembrance Day 2026 posts on the right day. Make the test <em>skip</em> (not fail) when the sandbox date is already past that day, and add Allure annotations (epic, feature, story, severity) and one <code>Allure.step</code>.",
        "Write, but do <strong>not</strong> run on a shared sandbox, a destructive test for e-Transfer expiry: a throwaway customer sends a pending e-Transfer, the clock moves past the expiry, and you assert the new status and the refund on the sender's account. Show it compiles with <code>mvn test-compile</code> and is skipped by <code>mvn test</code>.",
        "Run <code>HealthApiTest</code> with <code>-Denv=qa -DbaseUrl=http://localhost:3000</code> (against your local app). Which tests pass, which fail, and why exactly those? What does this tell you about when <code>Config</code> reads a key?",
        "After a full local run, open the Allure report and find, for one transfer test: its steps, the request body of the POST, the response's <code>X-Request-Id</code>, and the same id in <code>target/logs/tests.log</code>. Write a mock bug report for that test as if it had failed, using the template from Tutorial 5.",
      ],
      quiz: [
        {
          q: "Which call is always safe on a shared sandbox?",
          options: ["<code>GET /test/clock</code>", "<code>POST /test/clock {\"advanceMinutes\": 1}</code>", "<code>POST /test/reset</code>", "<code>POST /test/clock {\"date\": \"2026-11-02\"}</code>"],
          answer: 0,
          explain: "Reading the clock changes nothing. Every POST to <code>/test/*</code> changes the sandbox for everyone.",
        },
        {
          q: "After <code>POST /test/clock {\"date\": \"2026-11-09\"}</code> returns, is the Monday payment already POSTED?",
          options: ["No, it posts within the hour", "Only after a reset", "Only if you call <code>GET /bill-payments</code> twice", "Yes: due work runs before the response"],
          answer: 3,
          explain: "The response even reports what ran in <code>dueWork</code>.",
        },
        {
          q: "Where do you compute \"next Saturday\" from in a scheduling test?",
          options: ["<code>LocalDate.now()</code>", "The sandbox's <code>today</code> from <code>GET /test/clock</code>", "The README", "The system clock of the database server"],
          answer: 1,
          explain: "The sandbox may be days or months ahead of real time.",
        },
        {
          q: "A test is green locally and red on QA. What is your next step?",
          options: ["Re-run it alone on QA, read the request and response (Allure, request id), confirm by hand, then report", "Mark it <code>@Disabled</code>", "File a bug immediately", "Delete the QA config"],
          answer: 0,
          explain: "Red on QA is a candidate. Confirm it and collect evidence before reporting.",
        },
        {
          q: "Where does your QA sandbox key belong?",
          options: ["In <code>qa.properties</code>, committed", "In the test class", "In <code>qa.local.properties</code> (git-ignored) or an <code>ICEBANK_SANDBOX_KEY</code> environment variable", "In the Allure report"],
          answer: 2,
          explain: "Whoever has it can reset your sandbox and move its clock.",
        },
      ],
    },
  ],
});
