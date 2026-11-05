/* Tutorial 6: Framework hygiene. Java examples: REST Assured, JUnit 5 (TestNG notes), Allure, SLF4J, -Denv=local|qa. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "framework",
  number: 6,
  title: "Framework hygiene",
  summary: "Structure a Java test framework that runs the same suite against local and QA, keeps secrets out of Git and produces reports people trust.",
  intro: `
<p>Writing one green test is easy. Keeping 200 tests green, readable and trustworthy for three people over three weeks, against two environments, is what a framework is for.
This tutorial covers the habits that separate a framework from a folder of tests. Examples use Maven, Java 17+, REST Assured 5, JUnit 5 (with TestNG equivalents where they
differ), Allure 2 and SLF4J with Logback.</p>
<div class="callout rule"><p><strong>Target:</strong> <code>mvn test -Denv=local</code> and <code>mvn test -Denv=qa</code> run the same code. Local must be green; QA is red exactly
where the instructor planted bugs.</p></div>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "structure",
      title: "Project structure",
      summary: "A layout where every class has an obvious home and tests read like specifications.",
      body: `
<p>A good structure separates <strong>what you test</strong> (test classes) from <strong>how you talk to the system</strong> (clients, page objects, DB helpers) and from
<strong>configuration and data</strong>. When an endpoint changes, you fix one client method, not 40 tests.</p>

<h3>Layers</h3>
<ul>
<li><strong>config</strong>: loads the environment (<code>local</code>/<code>qa</code>) and exposes typed values: base URL, sandbox id, sandbox key, JDBC URL, persona emails.</li>
<li><strong>api</strong>: one client per area (<code>AuthClient</code>, <code>AccountsClient</code>, <code>TransfersClient</code>, <code>ETransfersClient</code>…) built on shared
<code>RequestSpecification</code>s. Clients return <code>Response</code> or POJOs; they do not assert business results.</li>
<li><strong>model</strong>: POJOs/records for request and response bodies (money as <code>BigDecimal</code>).</li>
<li><strong>db</strong>: a small JDBC utility (connection from config, query helpers) and <code>DbChecks</code> with the toolkit queries from Tutorial 1.</li>
<li><strong>ui</strong>: Selenium driver factory and page objects with <code>data-testid</code> locators.</li>
<li><strong>tests</strong>: grouped by feature, extending a small base class. Tests contain the steps and the assertions, and nothing else.</li>
</ul>

<h3>Rules of thumb</h3>
<ul>
<li>Tests never contain URLs, passwords, raw SQL strings or <code>Thread.sleep</code>.</li>
<li>Each helper has one job. A 900-line <code>Utils</code> class is a smell.</li>
<li>Put shared setup in specifications and fixtures, not in copy-pasted <code>@BeforeEach</code>s.</li>
<li>Test resources (JSON schemas, CSV data, config) live in <code>src/test/resources</code>.</li>
</ul>`,
      examples: [
        {
          title: "Layout",
          lang: "text",
          code: `
icebank-tests/
  pom.xml
  README.md
  .gitignore
  src/test/java/com/icebank/
    config/      Env.java, Config.java
    api/         Specs.java, AuthClient.java, AccountsClient.java, TransfersClient.java, ETransfersClient.java
    model/       Account.java, Transaction.java, Transfer.java, Problem.java
    db/          Db.java, DbChecks.java
    ui/          DriverFactory.java, pages/LoginPage.java, pages/DashboardPage.java
    support/     TestData.java, Personas.java, AllureSteps.java
    tests/
      api/       HealthTest.java, AuthTest.java, AccountsTest.java, TransfersTest.java, ETransferLimitsTest.java
      db/        PostTransferFunctionTest.java, AuditTriggerTest.java
      ui/        LoginUiTest.java, TransferUiTest.java
      BaseApiTest.java
  src/test/resources/
    config/      local.properties, qa.example.properties   (qa.properties is git-ignored)
    schemas/     account.json, transfer.json, problem.json
    logback-test.xml
    allure.properties
    junit-platform.properties`,
        },
        {
          title: "Shared request specification",
          lang: "java",
          code: `
public final class Specs {
    private Specs() {}

    public static RequestSpecification base() {
        return new RequestSpecBuilder()
            .setBaseUri(Config.baseUrl())          // http://localhost:3000 or the QA URL
            .setBasePath("/api/v1")
            .setContentType(ContentType.JSON)
            .setAccept(ContentType.JSON)
            .addFilter(new AllureRestAssured())     // request/response attached to the report
            .build();
    }

    public static RequestSpecification as(String email) {
        return new RequestSpecBuilder()
            .addRequestSpecification(base())
            .addHeader("Authorization", "Bearer " + AuthClient.tokenFor(email))
            .build();
    }
}`,
        },
        {
          title: "A test that reads like a specification",
          lang: "java",
          code: `
class TransfersTest extends BaseApiTest {

    @Test
    @DisplayName("A transfer with 3 decimals is rejected, not rounded")
    void threeDecimalAmountIsRejected() {
        transfers.create(emma, 1, 2, "10.005")
            .then()
            .statusCode(400)
            .body("code", equalTo("VALIDATION_FAILED"))
            .body("errors[0].field", equalTo("amount"))
            .body("errors[0].message", equalTo("must have at most 2 decimal places"));
    }
}`,
        },
      ],
      exercises: [
        "Create the package layout above in your framework repo (empty classes are fine) and push it on a branch for review.",
        "Move every hard-coded URL and every <code>given().baseUri(...)</code> from your existing tests into <code>Specs</code>. Count how many lines of duplication you removed.",
        "Write <code>AccountsClient</code> with <code>list()</code>, <code>get(id)</code> and <code>transactions(id, Map&lt;String, Object&gt; query)</code>, and rewrite two existing tests to use it against Ice Bank local.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "config-env",
      title: "Config per environment (local, qa) with -Denv",
      summary: "One switch selects every URL, key and credential, so the same suite runs everywhere.",
      body: `
<p>Ice Bank has two environments, and your suite must run on both without editing code. The standard Java approach: one properties file per environment, selected by a
system property, with optional overrides.</p>

<h3>How it works</h3>
<ol>
<li><code>mvn test -Denv=qa</code> sets the system property <code>env</code>. Default to <code>local</code> if it is missing.</li>
<li><code>Config</code> loads <code>config/&lt;env&gt;.properties</code> from the classpath.</li>
<li>Any key can be overridden by a system property (<code>-DbaseUrl=…</code>) or an environment variable (<code>ICEBANK_SANDBOX_KEY</code>), so CI or a teammate can change one value
without touching files.</li>
<li>Fail fast: if a required key is missing, throw a clear exception before any test runs.</li>
</ol>

<h3>What differs between Ice Bank environments</h3>
<div class="table-wrap"><table>
<thead><tr><th>Key</th><th>local</th><th>qa</th></tr></thead>
<tbody>
<tr><td><code>baseUrl</code></td><td><code>http://localhost:3000</code></td><td>QA URL from the instructor</td></tr>
<tr><td><code>sandboxId</code></td><td><code>1</code></td><td>your sandbox id</td></tr>
<tr><td><code>sandboxKey</code></td><td><code>ICEBANK-LOCAL-KEY</code></td><td>your personal key (secret)</td></tr>
<tr><td><code>emailSuffix</code></td><td>empty</td><td>e.g. <code>+s1</code> → <code>emma.tremblay+s1@icebank.test</code></td></tr>
<tr><td><code>db.url</code></td><td><code>jdbc:postgresql://localhost:5433/icebank</code></td><td>Supabase session-pooler JDBC URL with <code>sslmode=require</code></td></tr>
<tr><td><code>db.user</code> / <code>db.password</code></td><td><code>qa_reader</code> / <code>qa_reader</code></td><td><code>qa_reader</code> / secret</td></tr>
<tr><td><code>db.writer.user</code></td><td><code>qa_writer</code></td><td>none (tests that need it are skipped on QA)</td></tr>
<tr><td><code>allowReset</code></td><td><code>true</code></td><td><code>true</code> only for your own sandbox key</td></tr>
</tbody></table></div>
<p>Persona emails are built from the suffix: <code>"emma.tremblay" + suffix + "@icebank.test"</code>. Ids are the same in every sandbox after a reset (Emma's chequing is always
account 1), which is why one suite works on both environments.</p>
<p>Use JUnit 5 assumptions for environment-specific tests: <code>assumeTrue(Config.env() == Env.LOCAL)</code> skips (not fails) a test that needs <code>qa_writer</code> on QA. In TestNG,
throw <code>SkipException</code>.</p>`,
      examples: [
        {
          title: "src/test/resources/config/local.properties",
          lang: "properties",
          code: `
baseUrl=http://localhost:3000
sandboxId=1
sandboxKey=ICEBANK-LOCAL-KEY
emailSuffix=
personaPassword=IceBank#2026
db.url=jdbc:postgresql://localhost:5433/icebank
db.user=qa_reader
db.password=qa_reader
db.writer.user=qa_writer
db.writer.password=qa_writer
allowReset=true`,
        },
        {
          title: "Config loader with overrides and fail-fast",
          lang: "java",
          code: `
public final class Config {
    private static final String ENV = System.getProperty("env", "local").toLowerCase();
    private static final Properties P = load();

    private static Properties load() {
        String file = "config/" + ENV + ".properties";
        try (InputStream in = Config.class.getClassLoader().getResourceAsStream(file)) {
            if (in == null) throw new IllegalStateException(
                "Missing " + file + ". For qa, copy qa.example.properties to qa.properties (see README).");
            Properties p = new Properties();
            p.load(in);
            return p;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** System property beats environment variable beats file. */
    public static String get(String key) {
        String sys = System.getProperty(key);
        if (sys != null) return sys;
        String envVar = System.getenv("ICEBANK_" + key.toUpperCase().replace('.', '_'));
        if (envVar != null) return envVar;
        String v = P.getProperty(key);
        if (v == null) throw new IllegalStateException("Config key '" + key + "' missing for env " + ENV);
        return v;
    }

    public static String env()        { return ENV; }
    public static String baseUrl()    { return get("baseUrl"); }
    public static int sandboxId()     { return Integer.parseInt(get("sandboxId")); }
    public static String sandboxKey() { return get("sandboxKey"); }
    public static String persona(String name) { return name + get("emailSuffix") + "@icebank.test"; }
}`,
        },
        {
          title: "Pass -Denv through Maven Surefire to the tests",
          lang: "xml",
          code: `
<properties>
  <env>local</env>
</properties>
...
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-surefire-plugin</artifactId>
  <version>3.5.2</version>
  <configuration>
    <systemPropertyVariables>
      <env>\${env}</env>
    </systemPropertyVariables>
  </configuration>
</plugin>`,
          note: "Run with <code>mvn test -Denv=qa</code>. Without the plugin configuration, <code>-D</code> values usually still reach the forked JVM, but declaring it makes the default explicit.",
        },
      ],
      exercises: [
        "Implement <code>Config</code> with <code>local.properties</code> and <code>qa.example.properties</code>. Print the resolved base URL and sandbox id in a test, with <code>-Denv=local</code> and <code>-Denv=qa</code>.",
        "Make <code>Config</code> fail fast with a helpful message when <code>qa.properties</code> is missing. Run <code>mvn test -Denv=qa</code> without it and check the message tells a new teammate what to do.",
        "Override one value from the command line (<code>-DbaseUrl=http://127.0.0.1:3000</code>) and prove the override wins.",
        "Run your whole current suite with <code>-Denv=qa</code>. Every test must either pass, fail for a real (planted) bug, or be skipped with an assumption. Fix anything that fails for environment reasons.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "secrets",
      title: "Keeping secrets out of Git",
      summary: "Where credentials live, how they reach the tests, and what to do if one leaks.",
      body: `
<p>A secret is anything that gives access: your QA sandbox key (it lets anyone reset your sandbox and move its clock), the Supabase <code>qa_reader</code> connection string, tokens
copied from DevTools, Postman environments with those values. Once a secret is pushed, it is in the history forever and must be considered leaked.</p>

<h3>The pattern</h3>
<ol>
<li><strong>Commit templates, not values</strong>: <code>qa.example.properties</code> with <code>sandboxKey=CHANGE_ME</code>.</li>
<li><strong>Ignore the real file</strong>: <code>src/test/resources/config/qa.properties</code> in <code>.gitignore</code> (Tutorial 4, lesson 7).</li>
<li><strong>Or use environment variables</strong>: <code>ICEBANK_SANDBOXKEY</code>, read by <code>Config</code> before the file. Good for CI and shared machines.</li>
<li><strong>Never log secrets</strong>: mask <code>Authorization</code> and <code>X-Sandbox-Key</code> in REST Assured logging and Allure attachments (lesson 5).</li>
<li><strong>Check before you commit</strong>: <code>git diff --staged</code>, and search for patterns like <code>eyJ</code> (JWTs) or <code>postgresql://</code>.</li>
</ol>

<h3>What is and is not secret in Ice Bank</h3>
<ul>
<li><strong>Not secret</strong> (published in the README for the local build): <code>ICEBANK-LOCAL-KEY</code>, <code>qa_reader</code>/<code>qa_reader</code>, <code>qa_writer</code>/<code>qa_writer</code>,
<code>IceBank#2026</code>. Fine to commit in <code>local.properties</code>.</li>
<li><strong>Secret</strong>: your QA sandbox key, the QA database connection string and password, any access or refresh token.</li>
</ul>
<p>Even for non-secret local values, keep the habit: values come from config, never from literals inside tests.</p>

<h3>If a secret leaks</h3>
<p>Tell the instructor straight away so the key or password can be rotated. Rewriting history (<code>git filter-repo</code>) only helps after rotation, because clones and forks
may already have it. Rotation first, cleanup second.</p>`,
      examples: [
        {
          title: "src/test/resources/config/qa.example.properties (committed)",
          lang: "properties",
          code: `
# Copy to qa.properties (git-ignored) and fill in the values from your instructor.
baseUrl=https://CHANGE-ME.vercel.app
sandboxId=CHANGE_ME
sandboxKey=CHANGE_ME
emailSuffix=+sCHANGE_ME
personaPassword=IceBank#2026
db.url=jdbc:postgresql://CHANGE-ME.pooler.supabase.com:5432/postgres?sslmode=require
db.user=CHANGE_ME
db.password=CHANGE_ME
allowReset=true`,
        },
        {
          title: "Provide secrets via environment variables instead (Git Bash)",
          lang: "bash",
          code: `
export ICEBANK_SANDBOXKEY='paste-your-qa-key'
export ICEBANK_DB_PASSWORD='paste-the-qa-reader-password'
mvn test -Denv=qa`,
        },
        {
          title: "A pre-commit check you can run by hand",
          lang: "bash",
          code: `
git diff --staged | grep -nE 'eyJ[A-Za-z0-9_-]{10,}|pooler\\.supabase\\.com|sandboxKey=[^C]' \\
  && echo "Possible secret staged - check before committing" \\
  || echo "No obvious secrets staged"`,
        },
      ],
      exercises: [
        "Set up <code>qa.example.properties</code>, the ignored <code>qa.properties</code> and environment-variable overrides. Show that <code>git status</code> never lists <code>qa.properties</code>.",
        "Have a teammate clone the repo fresh and get <code>-Denv=qa</code> running using only the README. Fix the README wherever they got stuck.",
        "Search your repository history (all branches) for JWTs, Supabase hosts and your QA key with <code>git log -p --all -S</code>. Report and rotate if you find anything.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "test-data",
      title: "Test data strategy (API setup, DB checks, reset)",
      summary: "Create what each test needs, verify in the database, and know when to reset.",
      body: `
<p>Most flaky or order-dependent suites are really test-data problems: test B passes only if test A ran first, or fails after someone else used up Emma's daily e-Transfer limit.
Decide your data strategy deliberately.</p>

<h3>Three sources of data</h3>
<ul>
<li><strong>Seed data (read-only use)</strong>: Ice Bank's deterministic seed gives fixed personas and ids (Emma = customer 1, accounts 1 to 4; Ava's frozen chequing = 10; Olivia's card
= 8, $40 under its limit). Use it for <em>reading</em> and for special states that are hard to create (locked user, frozen account). Never assume balances: read them first.</li>
<li><strong>Data created through the API (preferred for writes)</strong>: each test creates what it changes (a payee, a contact, a new customer via <code>POST /auth/register</code>, a fresh
savings account). The API applies every rule, so the data is realistic. Use unique values (timestamp or UUID in nicknames and emails).</li>
<li><strong>Data written with SQL (rarely)</strong>: only locally, as <code>qa_writer</code>, for states the API cannot reach. Prefer the sandbox clock and admin endpoints over SQL.</li>
</ul>

<h3>Verify in the database</h3>
<p>After an API action, check the rows with <code>qa_reader</code>: the API response proves the contract, the rows prove the behaviour. Scope queries to the data the test created
(the id from <code>Location</code>, the <code>referenceId</code>).</p>

<h3>Reset and the clock</h3>
<p><code>POST /api/v1/test/reset</code> (header <code>X-Sandbox-Key</code>) restores the seed: same ids and balances, clock back to 2026-11-02 09:00 Toronto. It takes a few seconds and wipes
everything, so call it <em>once</em> before a suite (or a clock-dependent class), not before every test. <code>POST /api/v1/test/clock</code> moves the sandbox date forward (never back) to test
scheduling, interest and expiry. Only call either with <em>your own</em> sandbox key; on shared environments they affect everyone using that sandbox.</p>

<h3>Independence rules</h3>
<ul>
<li>A test must pass when run alone and in any order.</li>
<li>Use different personas for tests that consume limits, or new customers created via registration.</li>
<li>Clean up what you create when it would affect others (delete the payee), or rely on the suite-level reset.</li>
<li>Tests that move the clock go in their own tagged class that runs last or alone.</li>
</ul>`,
      examples: [
        {
          title: "Reset once per test run (JUnit 5 extension or base class)",
          lang: "java",
          code: `
public abstract class BaseApiTest {
    private static boolean resetDone = false;

    @BeforeAll
    static synchronized void resetSandboxOnce() {
        if (resetDone || !Boolean.parseBoolean(Config.get("allowReset"))) return;
        given().spec(Specs.base())
            .header("X-Sandbox-Key", Config.sandboxKey())
        .when()
            .post("/test/reset")
        .then()
            .statusCode(200)
            .body("sandboxId", equalTo(Config.sandboxId()));
        resetDone = true;
    }
}`,
          note: "In TestNG use <code>@BeforeSuite</code> instead.",
        },
        {
          title: "Create your own data, then verify the row",
          lang: "java",
          code: `
@Test
void addPayeeStoresTheAccountNumber() throws SQLException {
    String nickname = "Gas " + System.currentTimeMillis() % 100000;
    Response r = payees.create(emma, 3, "1234-5678-9012", nickname);
    r.then().statusCode(201);
    long id = Long.parseLong(r.header("Location").replaceAll(".*/", ""));

    Map<String, Object> row = db.one(
        "SELECT biller_id, account_number, nickname, deleted_at FROM payees WHERE sandbox_id = ? AND id = ?",
        Config.sandboxId(), id);
    assertEquals(3L, ((Number) row.get("biller_id")).longValue());
    assertEquals("1234-5678-9012", row.get("account_number"));
    assertEquals(nickname, row.get("nickname"));
    assertNull(row.get("deleted_at"));

    payees.delete(emma, id).then().statusCode(204);      // clean up
}`,
        },
        {
          title: "Register a brand-new customer for tests that consume limits",
          lang: "java",
          code: `
public static String newCustomer() {
    String email = "tester." + UUID.randomUUID().toString().substring(0, 8) + "@icebank.test";
    given().spec(Specs.base())
        .body(Map.of(
            "firstName", "Test", "lastName", "Customer", "dateOfBirth", "1995-05-05",
            "email", email, "phone", "(416) 555-0199",
            "addressLine1", "200 Bay Street", "city", "Toronto", "province", "ON", "postalCode", "M5J 2T3",
            "sin", "046 454 286", "password", "Glacier#2026"))
    .when().post("/auth/register")
    .then().statusCode(201);
    return email;   // new customer with an empty chequing account and a debit card
}`,
          note: "A new customer starts with $0.00, so fund the account first (for example an e-Transfer from Emma) before testing outgoing limits.",
        },
      ],
      exercises: [
        "Classify every test you have so far: uses seed data read-only, creates its own data, or changes seed data. Fix one that changes seed data so it creates its own instead.",
        "Add the reset-once mechanism to your base class, guarded by the <code>allowReset</code> config key. Run the suite twice in a row on local and check the second run gives identical results.",
        "Write a JDBC helper <code>db.one(sql, params...)</code> returning a <code>Map</code>, and use it in two API tests to verify the rows they created.",
        "Run your test classes in random order (<code>junit.jupiter.testmethod.order.default=org.junit.jupiter.api.MethodOrderer$Random</code> in <code>junit-platform.properties</code>) three times. Fix every test that fails only in some orders.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "logging",
      title: "Logging with SLF4J and REST Assured filters",
      summary: "Log enough to diagnose a failure from the output alone, without leaking secrets.",
      body: `
<p>When a test fails on QA at 2 a.m. (or on a teammate's machine), the log is all you have. Good logs show the request and response of the failing call, the persona and environment,
and the <code>X-Request-Id</code>; they never show tokens or keys.</p>

<h3>SLF4J + Logback</h3>
<p>SLF4J is the logging API (<code>LoggerFactory.getLogger(...)</code>); Logback is the implementation that formats and writes the lines, configured in
<code>src/test/resources/logback-test.xml</code>. Use levels deliberately:</p>
<ul>
<li><code>ERROR</code>: something broke in the framework itself.</li>
<li><code>WARN</code>: unexpected but recoverable (a retry, a skipped test on QA).</li>
<li><code>INFO</code>: one line per meaningful step: "Signed in as emma.tremblay@icebank.test (env=qa)".</li>
<li><code>DEBUG</code>: details such as full request/response bodies.</li>
</ul>
<p>Use placeholders, not string concatenation: <code>log.info("Transfer {} created, ref {}", id, ref)</code>. Do not use <code>System.out.println</code> in a framework.</p>

<h3>REST Assured logging</h3>
<ul>
<li><code>.log().all()</code> on every request is noisy. Prefer <code>.then().log().ifValidationFails()</code>: silent when green, full detail when an assertion fails.</li>
<li><code>RestAssured.enableLoggingOfRequestAndResponseIfValidationFails()</code> turns that on globally.</li>
<li>Write a small <code>Filter</code> that logs one INFO line per call (method, path, status, time, <code>X-Request-Id</code>) through SLF4J. Filters see every request and response, so this
is also where you mask secrets.</li>
<li><code>LogConfig.logConfig().blacklistHeader("Authorization", "X-Sandbox-Key")</code> masks those headers in REST Assured's own logging.</li>
</ul>`,
      examples: [
        {
          title: "logback-test.xml",
          lang: "xml",
          code: `
<configuration>
  <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder><pattern>%d{HH:mm:ss.SSS} %-5level [%thread] %logger{20} - %msg%n</pattern></encoder>
  </appender>
  <appender name="FILE" class="ch.qos.logback.core.FileAppender">
    <file>target/logs/tests.log</file>
    <encoder><pattern>%d{ISO8601} %-5level %logger{36} - %msg%n</pattern></encoder>
  </appender>
  <logger name="com.icebank" level="DEBUG"/>
  <root level="INFO">
    <appender-ref ref="CONSOLE"/>
    <appender-ref ref="FILE"/>
  </root>
</configuration>`,
        },
        {
          title: "A one-line-per-call filter with secret masking",
          lang: "java",
          code: `
public class ApiLogFilter implements Filter {
    private static final Logger log = LoggerFactory.getLogger(ApiLogFilter.class);

    @Override
    public Response filter(FilterableRequestSpecification req, FilterableResponseSpecification res, FilterContext ctx) {
        long start = System.nanoTime();
        Response response = ctx.next(req, res);
        long ms = (System.nanoTime() - start) / 1_000_000;
        log.info("{} {} -> {} in {} ms, X-Request-Id={}",
            req.getMethod(), req.getURI(), response.statusCode(), ms, response.header("X-Request-Id"));
        if (response.statusCode() >= 400) {
            log.debug("Response body: {}", response.asString());
        }
        return response;
    }
}

// in Specs.base():
//   .addFilter(new ApiLogFilter())
//   .setConfig(RestAssuredConfig.config().logConfig(
//        LogConfig.logConfig().blacklistHeader("Authorization", "X-Sandbox-Key")
//                 .enableLoggingOfRequestAndResponseIfValidationFails()))`,
        },
        {
          title: "What a useful failure log looks like",
          lang: "text",
          code: `
09:14:03.120 INFO  [main] AuthClient - Signed in as emma.tremblay@icebank.test (env=local)
09:14:03.311 INFO  [main] ApiLogFilter - POST http://localhost:3000/api/v1/transfers -> 422 in 41 ms, X-Request-Id=5c0e9a1f-...
09:14:03.312 DEBUG [main] ApiLogFilter - Response body: {"type":"https://icebank.test/problems/insufficient-funds",...,"code":"INSUFFICIENT_FUNDS"}
Request method: POST
Headers: Authorization=[ BLACKLISTED ]
         Idempotency-Key=0b8f...`,
        },
      ],
      exercises: [
        "Add SLF4J + Logback to your framework with the config above and replace every <code>System.out.println</code>.",
        "Implement <code>ApiLogFilter</code>, add it to <code>Specs.base()</code>, and make one test fail on purpose. Check the log alone tells you the endpoint, status, <code>X-Request-Id</code> and error <code>code</code>.",
        "Turn on REST Assured's <code>ifValidationFails</code> logging with blacklisted headers and prove (by searching <code>target/logs/tests.log</code>) that no access token or sandbox key appears anywhere.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "allure",
      title: "Allure steps, attachments and history",
      summary: "Reports that show what each test did, with evidence, and trends across runs.",
      body: `
<p>Allure turns test results into an HTML report with steps, attachments, categories and history. A good report lets someone who has never seen the code understand what failed and why,
which is exactly what you need when you show the instructor that your suite catches a planted bug.</p>

<h3>Setup in brief</h3>
<p>Add <code>allure-junit5</code> (or <code>allure-testng</code>) and <code>allure-rest-assured</code>, configure the AspectJ agent in Surefire so <code>@Step</code> works, run the tests (results
go to <code>target/allure-results</code>), then <code>allure serve target/allure-results</code> or <code>mvn allure:serve</code> with the Allure Maven plugin.</p>

<h3>Steps</h3>
<p>Annotate client and helper methods with <code>@Step("Transfer {amount} from {from} to {to}")</code>; the parameters appear in the step name. Or wrap code in
<code>Allure.step("Check balance in DB", () -&gt; { ... })</code>. The report then shows a readable tree of what happened.</p>

<h3>Attachments</h3>
<ul>
<li><code>AllureRestAssured</code> filter: every request and response attached automatically (mask secrets with its header blacklist).</li>
<li>SQL evidence: attach the query and its result as text.</li>
<li>UI tests: attach a screenshot and the page source on failure.</li>
</ul>

<h3>Metadata</h3>
<p><code>@Epic("Payments")</code>, <code>@Feature("Interac e-Transfer")</code>, <code>@Story("Daily limit")</code>, <code>@Severity(SeverityLevel.CRITICAL)</code>, <code>@Issue("IB-17")</code> and
<code>@Owner</code> group and filter the report. Put <code>environment.properties</code> (env, base URL, build) in the results folder so the report shows where it ran.</p>

<h3>History and trends</h3>
<p>Allure shows trends (pass rate over time, flaky tests, retries) if you copy the <code>history</code> folder from the previous <em>report</em> into the new <em>results</em> before
generating. Without it every report starts from zero.</p>`,
      examples: [
        {
          title: "Steps and metadata",
          lang: "java",
          code: `
@Epic("Payments") @Feature("Interac e-Transfer") @Story("Per-transfer limit")
@Severity(SeverityLevel.CRITICAL)
@Test
void sendingMoreThan3000IsRejected() {
    String token = stepSignIn(Config.persona("emma.tremblay"));
    Response r = stepSend(token, "3000.01");
    Allure.step("Expect 422 LIMIT_PER_TRANSFER", () ->
        r.then().statusCode(422).body("code", equalTo("LIMIT_PER_TRANSFER")));
}

@Step("Sign in as {email}")
String stepSignIn(String email) { return AuthClient.signIn(email, Config.get("personaPassword")); }

@Step("Send e-Transfer of {amount} to liam.chen")
Response stepSend(String token, String amount) { return etransfers.send(token, 1, "liam.chen@icebank.test", amount); }`,
        },
        {
          title: "Attach SQL evidence",
          lang: "java",
          code: `
String sql = "SELECT id, direction, amount, balance_after FROM transactions WHERE sandbox_id = ? AND reference_id = ?";
List<Map<String, Object>> rows = db.list(sql, Config.sandboxId(), ref);
Allure.addAttachment("DB: legs of " + ref, "text/plain",
    sql + "\\n\\n" + rows.stream().map(Object::toString).collect(Collectors.joining("\\n")));
assertEquals(2, rows.size());`,
        },
        {
          title: "Generate a report that keeps history (Git Bash)",
          lang: "bash",
          code: `
mvn clean test -Denv=local || true
# keep trends: copy history from the last report into the new results
[ -d allure-report/history ] && cp -r allure-report/history target/allure-results/
printf "env=local\\nbaseUrl=http://localhost:3000\\n" > target/allure-results/environment.properties
allure generate target/allure-results --clean -o allure-report
allure open allure-report`,
        },
      ],
      exercises: [
        "Add Allure to your framework and generate a report for your current suite on local. Every API call should appear as an attachment.",
        "Add <code>@Step</code> to every client method and <code>@Feature</code>/<code>@Story</code>/<code>@Severity</code> to every test class. Check the Behaviors tab groups tests sensibly.",
        "Attach SQL evidence in at least two DB-verification tests, and a screenshot on failure in your UI tests.",
        "Run the suite three times keeping history (once on QA so some tests fail). Take a screenshot of the Trend graph and add it to your PR or notes.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "flaky",
      title: "Flaky tests and retries",
      summary: "Find the real cause of intermittent failures instead of hiding them.",
      body: `
<p>A <strong>flaky</strong> test passes and fails on the same code. It is worse than no test: people learn to ignore red, and then miss real bugs. Treat every flaky test as a bug in the
test (or occasionally in the app) and fix the cause.</p>

<h3>Common causes, with Ice Bank examples</h3>
<div class="table-wrap"><table>
<thead><tr><th>Cause</th><th>Example</th><th>Fix</th></tr></thead>
<tbody>
<tr><td>Timing in the UI</td><td>Reading the confirmation during the 1–3 s "Processing" state; toast gone after 4 s</td><td>Explicit waits for the exact condition; no <code>Thread.sleep</code></td></tr>
<tr><td>Shared or leftover data</td><td>Emma's daily e-Transfer limit used up by an earlier test</td><td>Each test creates or isolates its data; reset per run</td></tr>
<tr><td>Order dependence</td><td>Test B relies on the payee test A created</td><td>Independent setup; random order runs</td></tr>
<tr><td>Time and dates</td><td>"Today" computed in UTC on your PC but Toronto in Ice Bank; tests near midnight</td><td>Use the sandbox clock (<code>GET /test/clock</code>), Toronto time, fixed dates</td></tr>
<tr><td>Unordered results</td><td>Asserting the first item of a list without a sort</td><td>Sort explicitly or find by id</td></tr>
<tr><td>Expired state</td><td>Access token cached for more than 15 minutes; OTP older than 5 minutes</td><td>Refresh tokens or sign in per class; always read the newest OTP</td></tr>
<tr><td>Rate limits</td><td>Signing in more than 10 times a minute → 429</td><td>Cache tokens per persona; <code>PERF_MODE=true</code> locally only for JMeter</td></tr>
<tr><td>Parallel runs</td><td>Two tests transfer from account 1 at once and both assert its balance</td><td>Separate personas/accounts per parallel thread</td></tr>
</tbody></table></div>

<h3>Retries: a bandage, used carefully</h3>
<p>Retrying failed tests (Surefire's <code>rerunFailingTestsCount</code>, TestNG's <code>IRetryAnalyzer</code>, JUnit Pioneer's <code>@RetryingTest</code>) can keep a pipeline usable
while you fix a known environment hiccup. Rules: retries are visible in the report (Allure marks them flaky), limited to 1 or 2, never used on tests that move money twice, and every
retried test gets a ticket. A test that only passes on retry is a test that is failing.</p>

<h3>Investigating</h3>
<p>Run the single test 20 times (<code>@RepeatedTest(20)</code> or a loop), with throttling, with random order, and in parallel. Compare the logs of a passing and a failing run line by line,
especially timestamps and <code>X-Request-Id</code>s.</p>`,
      examples: [
        {
          title: "Reproduce a flaky test on purpose",
          lang: "java",
          code: `
@RepeatedTest(value = 20, name = "run {currentRepetition}/{totalRepetitions}")
void transferConfirmationShowsAmount() {
    transferPage.open().fill(1, 2, "1.00").review().confirm();
    assertEquals("$1.00", transferPage.confirmationAmount());   // waits inside the page object
}`,
        },
        {
          title: "Surefire: one rerun, reported as flaky (stopgap only)",
          lang: "xml",
          code: `
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-surefire-plugin</artifactId>
  <version>3.5.2</version>
  <configuration>
    <rerunFailingTestsCount>1</rerunFailingTestsCount>
  </configuration>
</plugin>`,
        },
        {
          title: "Token cache to avoid the login rate limit",
          lang: "java",
          code: `
public final class TokenCache {
    private record Entry(String token, Instant expires) {}
    private static final Map<String, Entry> CACHE = new ConcurrentHashMap<>();

    public static String tokenFor(String email) {
        Entry e = CACHE.get(email);
        if (e == null || Instant.now().isAfter(e.expires().minusSeconds(60))) {
            String token = AuthClient.signIn(email, Config.get("personaPassword"));
            e = new Entry(token, Instant.now().plusSeconds(900));    // access token lives 15 minutes
            CACHE.put(email, e);
        }
        return e.token();
    }
}`,
        },
      ],
      exercises: [
        "Run your whole suite five times in a row on local and list every test that failed at least once. For each, write the suspected cause from the table above.",
        "Take one UI test and run it 20 times with <code>@RepeatedTest</code> under network throttling. Fix the waits until all 20 pass.",
        "Add a token cache so the suite signs in each persona at most once per 14 minutes. Check in the logs that you never hit <code>429 RATE_LIMITED</code>.",
        "Write the team rule for retries (when allowed, how many, how reported) into the framework README.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "naming-tagging",
      title: "Naming and tagging",
      summary: "Names that say what broke, and tags that let you run exactly the set you need.",
      body: `
<p>A failing test's name is the first line of a bug report. <code>test3()</code> says nothing; <code>eTransferOf3000_01IsRejectedWithLimitPerTransfer()</code> tells you the feature, the
input and the expected result before you open the code.</p>

<h3>Naming</h3>
<ul>
<li><strong>Classes</strong> by feature and layer: <code>ETransferLimitsApiTest</code>, <code>PostTransferFunctionDbTest</code>, <code>LoginUiTest</code>.</li>
<li><strong>Methods</strong> describe behaviour: <em>condition → result</em>. Pick one style as a team, e.g. <code>transferOfExactlyAvailableBalanceIsAccepted</code> or
<code>transfer_exactlyAvailableBalance_isAccepted</code>.</li>
<li>Add <code>@DisplayName("…")</code> for a readable sentence in reports (JUnit 5), or <code>@Test(description = "…")</code> in TestNG.</li>
<li>Use the persona and the rule, not implementation details: "frozen account cannot send" beats "account 10 returns 422".</li>
<li>Parameterised tests get a name template: <code>@ParameterizedTest(name = "amount {0} -&gt; {1}")</code>.</li>
</ul>

<h3>Tagging</h3>
<p>Tags select subsets without moving files. A useful set for Ice Bank:</p>
<ul>
<li>By purpose: <code>smoke</code>, <code>regression</code>.</li>
<li>By layer: <code>api</code>, <code>db</code>, <code>ui</code>.</li>
<li>By feature: <code>auth</code>, <code>accounts</code>, <code>transfers</code>, <code>etransfer</code>, <code>bills</code>, <code>cards</code>, <code>loans</code>, <code>admin</code>.</li>
<li>By constraint: <code>clock</code> (moves the sandbox clock, run alone), <code>writer</code> (needs <code>qa_writer</code>, local only), <code>destructive</code> (uses up limits or locks users).</li>
</ul>
<p>JUnit 5: <code>@Tag("etransfer")</code>, run with <code>mvn test -Dgroups=etransfer</code> or exclude with <code>-DexcludedGroups=clock</code>; tag expressions like
<code>-Dgroups="api &amp; !clock"</code> work too. TestNG: <code>@Test(groups = {"smoke", "api"})</code> and <code>-Dgroups=smoke</code>. Create composed annotations
(<code>@SmokeApi</code>) so tags cannot be misspelt.</p>`,
      examples: [
        {
          title: "Composed tag annotations (JUnit 5)",
          lang: "java",
          code: `
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Tag("api") @Tag("smoke")
@Test
public @interface SmokeApiTest {}

@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Tag("clock")
@Execution(ExecutionMode.SAME_THREAD)
public @interface MovesSandboxClock {}`,
        },
        {
          title: "Names and tags in practice",
          lang: "java",
          code: `
@Tag("api") @Tag("etransfer") @Tag("destructive")
@DisplayName("Interac e-Transfer limits")
class ETransferLimitsApiTest extends BaseApiTest {

    @Test
    @DisplayName("$3,000.00 in one e-Transfer is accepted")
    void exactlyPerTransferLimitIsAccepted() { /* ... */ }

    @Test
    @DisplayName("$3,000.01 in one e-Transfer is rejected with LIMIT_PER_TRANSFER")
    void oneCentOverPerTransferLimitIsRejected() { /* ... */ }

    @Test
    @DisplayName("A PENDING e-Transfer counts toward the daily limit")
    void pendingTransferCountsTowardDailyLimit() { /* ... */ }
}`,
        },
        {
          title: "Running subsets",
          lang: "bash",
          code: `
mvn test -Dgroups=smoke -Denv=qa
mvn test -Dgroups="api & etransfer" -Denv=local
mvn test -DexcludedGroups="clock | writer" -Denv=qa
mvn test -Dtest=ETransferLimitsApiTest -Denv=local
mvn test -Dtest='ETransferLimitsApiTest#oneCent*' -Denv=local`,
        },
      ],
      exercises: [
        "Agree on a method naming style and rename every test in your framework to follow it. Add <code>@DisplayName</code> to each.",
        "Define the tag set for your framework (write it in the README) and create at least two composed annotations.",
        "Tag every test and show that <code>-Dgroups=smoke</code>, <code>-Dgroups=\"api &amp; transfers\"</code> and <code>-DexcludedGroups=\"clock | writer\"</code> each run exactly the tests you expect.",
        "Read your last Allure report as if you were the instructor: could you tell from the names alone which business rule each failure broke? Rename until you can.",
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "readme",
      title: "Writing a framework README",
      summary: "The page that gets a new teammate from clone to green tests in fifteen minutes.",
      body: `
<p>The README is the framework's front door. A good one answers, in order: what is this, how do I run it, how do I configure it, how is it organised, how do we work on it. Test it the only
way that counts: give it to someone who has never seen the repo and watch where they get stuck.</p>

<h3>Sections that matter</h3>
<ol>
<li><strong>What it is</strong>: one paragraph. "API, DB and UI tests for Ice Bank, runnable against the local clean build and the hosted QA build."</li>
<li><strong>Prerequisites</strong>: Java version, Maven, Chrome, Allure CLI, Ice Bank running locally (<code>npm run dev</code>, health URL).</li>
<li><strong>Quick start</strong>: three commands from clone to a green smoke run.</li>
<li><strong>Configuration</strong>: <code>-Denv=local|qa</code>, the config files, how to create <code>qa.properties</code> from the example, environment-variable overrides. Which values are secret.</li>
<li><strong>Running subsets</strong>: tags, single classes, reports.</li>
<li><strong>Project structure</strong>: the package tree with one line per package.</li>
<li><strong>Test data</strong>: personas used, reset behaviour, clock-dependent tests, what not to run on shared environments.</li>
<li><strong>Conventions</strong>: naming, tagging, branches, commits, PR rules, Definition of Done.</li>
<li><strong>Troubleshooting</strong>: the five errors everyone hits, with fixes.</li>
</ol>

<h3>Style</h3>
<p>Copy-pasteable commands in code blocks. Short sentences. Keep it up to date in the same PR that changes the behaviour (that is in your Definition of Done). Link to Ice Bank's own README
and Swagger instead of duplicating them.</p>`,
      examples: [
        {
          title: "README skeleton",
          lang: "markdown",
          code: `
# icebank-tests

API (REST Assured), DB (JDBC) and UI (Selenium) tests for Ice Bank.
Same suite runs against local (clean build, must be green) and QA (planted bugs).

## Prerequisites
- Java 17+, Maven 3.9+, Chrome, Allure CLI 2.x
- Ice Bank running locally: \`npm run dev\` in the IceBank repo, then
  http://localhost:3000/api/v1/test/health shows "UP"

## Quick start
    git clone https://github.com/<team>/icebank-tests.git
    cd icebank-tests
    mvn test -Dgroups=smoke -Denv=local

## Configuration
| -Denv | File | Notes |
|-------|------|-------|
| local (default) | config/local.properties | committed, no secrets |
| qa | config/qa.properties | git-ignored; copy qa.example.properties, values from the instructor |
Overrides: -DbaseUrl=... or ICEBANK_SANDBOXKEY=...

## Running
    mvn test -Denv=local                          # everything
    mvn test -Dgroups="api & etransfer"           # one area
    mvn test -DexcludedGroups="clock | writer" -Denv=qa
    allure serve target/allure-results

## Structure
config/ api/ model/ db/ ui/ support/ tests/  (one line each)

## Test data
Personas from the Ice Bank seed (Emma = accounts 1-4, Ava = frozen 10, ...).
The suite resets the sandbox once per run (allowReset=true). Tests tagged clock move the
sandbox clock: run them only in your own sandbox.

## How we work
Branches, commits, PR template, Definition of Done (see CONTRIBUTING section)

## Troubleshooting
- Connection refused on 3000/5433 -> Ice Bank is not running (npm run dev)
- 401 INVALID_TOKEN after 15 min -> token cache expired; rerun
- 429 RATE_LIMITED on login -> too many sign-ins; use the token cache
- Missing config/qa.properties -> copy qa.example.properties`,
        },
      ],
      exercises: [
        "Write your framework's README using the skeleton, with real commands that you have run on Ice Bank local.",
        "Do a \"fresh clone test\": one teammate follows only the README on a clean folder (and ideally a different PC) and gets the smoke suite green on local. Fix every step where they needed help.",
        "Add a Troubleshooting entry for every problem anyone on the team hit during the three weeks, with its fix.",
      ],
    },
  ],
});
