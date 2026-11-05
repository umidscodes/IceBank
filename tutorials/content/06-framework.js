/* Tutorial 6: Framework hygiene. Aligned with the starter project (starter/): Maven, Java 17+, JUnit 5, REST Assured 5, Allure 2, SLF4J + Logback,
   -Denv=local|qa. Exercises keep their original positions (progress and answer keys are keyed by position); new ones are appended. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "framework",
  number: 6,
  title: "Framework hygiene",
  summary: "Structure a Java test framework that runs the same suite against local and QA, keeps secrets out of Git and produces reports people trust.",
  intro: `
<p>Writing one green test is easy. Keeping 200 tests green, readable and trustworthy for three people over three weeks, against two environments, is what a framework is for.
This tutorial covers the habits that separate a framework from a folder of tests. Every example comes from (or plugs into) the <strong>starter project</strong> in
<code>starter/</code>: Maven, Java 17+, JUnit 5, REST Assured 5, Selenium 4, PostgreSQL JDBC, AssertJ, Allure 2, and SLF4J with Logback. Read
<code>starter/README.md</code> next to this tutorial; TestNG equivalents are mentioned where they differ.</p>
<div class="callout rule"><p><strong>Target:</strong> <code>mvn test -Denv=local</code> and <code>mvn test -Denv=qa</code> run the same code. Local must be green; QA is red exactly
where the instructor planted bugs.</p></div>
<div class="callout warn"><p><strong>About the exercises.</strong> Some exercises were written before the starter existed and use older names. Where an exercise says
<code>qa.example.properties</code> / git-ignored <code>qa.properties</code>, the starter's equivalent is the committed <code>config/qa.properties</code> (placeholders only) plus your
git-ignored <code>config/qa.local.properties</code>; where it says <code>db.one(...)</code>, use <code>Db.reader().queryOne(...)</code>. Do the exercise in the starter's terms.</p></div>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "structure",
      title: "Project structure",
      summary: "A layout where every class has an obvious home and tests read like specifications.",
      body: `
<p>A good structure separates <strong>what you test</strong> (test classes) from <strong>how you talk to the system</strong> (clients, page objects, DB helpers) and from
<strong>configuration and data</strong>. When an endpoint changes, you fix one client method, not 40 tests.</p>

<h3>Layers (as in the starter)</h3>
<ul>
<li><strong>config</strong>: <code>Config</code> loads the environment (<code>-Denv=local</code>/<code>qa</code>) and exposes typed values: <code>baseUrl()</code>, <code>sandboxId()</code>,
<code>sandboxKey()</code>, <code>jdbcUrl()</code>, <code>dbUser()</code>, <code>hasDbWriter()</code>, <code>headless()</code>, <code>uiTimeout()</code>.</li>
<li><strong>api</strong>: <code>Specs</code> (shared <code>RequestSpecification</code>s: <code>base()</code>, <code>as(email)</code>, <code>withToken(token)</code>, <code>sandbox()</code>), the filters
<code>RequestIdFilter</code> and <code>ApiLogFilter</code>, and one client per area: <code>AuthClient</code>, <code>InboxClient</code>, <code>AccountsClient</code>,
<code>TransfersClient</code>, <code>TestSupportClient</code>. Clients return a <code>Response</code> (or a record from a typed helper that expects 200); they never assert business results.</li>
<li><strong>model</strong>: Java records for bodies (<code>Account</code>, <code>Transaction</code>, <code>Transfer</code>, <code>TransferRequest</code>, <code>Problem</code>, <code>Page&lt;T&gt;</code>, ...),
money as <code>BigDecimal</code>, dates as <code>OffsetDateTime</code>.</li>
<li><strong>db</strong>: <code>Db</code>, the JDBC helper (<code>reader()</code>/<code>writer()</code>, <code>queryList</code>, <code>queryOne</code>, <code>scalar</code>, <code>update</code>,
<code>callPostTransfer</code>, <code>inRolledBackTransaction</code>). Tutorial 8 adds <code>DbChecks</code>.</li>
<li><strong>ui</strong>: <code>DriverFactory</code>, the JUnit extension <code>DriverExtension</code> (a Chrome per test, screenshot on failure) and page objects with
<code>data-testid</code> locators.</li>
<li><strong>support</strong>: <code>Personas</code> (emails with the environment's suffix, fixed ids), <code>TestData</code> (money helpers, unique names), <code>Json</code> (the one Jackson mapper).</li>
<li><strong>tests</strong>: <code>tests/api</code>, <code>tests/db</code>, <code>tests/ui</code>, named <code>&lt;Feature&gt;&lt;Layer&gt;Test</code>. Tests contain the steps and the assertions, and nothing else.</li>
</ul>

<h3>Rules of thumb</h3>
<ul>
<li>Tests never contain URLs, passwords, raw HTTP setup or <code>Thread.sleep</code>. (SQL in a DB test is fine while it is short; move it to <code>DbChecks</code> once it repeats.)</li>
<li>Each helper has one job. A 900-line <code>Utils</code> class is a smell.</li>
<li>Put shared setup in specifications, extensions and clients, not in copy-pasted <code>@BeforeEach</code>s.</li>
<li>Test resources (JSON schemas, config, logging) live in <code>src/test/resources</code>. The starter has no <code>src/main</code>: everything is test code.</li>
</ul>

<h3>Worked example: where does an e-Transfer test go?</h3>
<p>You want to test "sending an e-Transfer and cancelling it refunds the money". Walk the layers: the HTTP calls (<code>POST /etransfers</code>,
<code>POST /etransfers/{id}/cancel</code>, <code>GET /etransfers/{id}</code>) become methods of a new <code>api/ETransfersClient</code>, each starting from
<code>Specs.as(email)</code> and adding the <code>Idempotency-Key</code> the API requires, each returning the <code>Response</code>. If several tests read the body, add a record
<code>model/ETransfer</code>. The test itself goes in <code>tests/api/ETransfersApiTest</code>, tagged <code>api</code>, using Sophie (the background customer) and
$0.01. A refund check in the database would go in <code>tests/db</code> or reuse <code>Db</code> from the API test. Nothing about URLs, tokens or headers appears in the test.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>A client method that asserts (<code>.then().statusCode(201)</code> inside <code>send()</code>). Then no test can check the 422 for an over-limit amount. Assert in tests;
offer a separate typed helper that expects success, like <code>TransfersClient.transfer(...)</code>.</li>
<li>Copying <code>given().baseUri("http://localhost:3000")</code> into a test "just this once". It will be the one test that fails on QA.</li>
<li>Putting test classes in <code>src/main/java</code>: Surefire does not run them and Maven packages them.</li>
<li>One giant <code>BaseTest</code> that every class extends, holding clients, drivers and DB connections. Prefer small fields and JUnit extensions (<code>DriverExtension</code>).</li>
<li>Money as <code>double</code> in a record. Use <code>BigDecimal</code>; the API sends <code>"5703.95"</code> as a string for a reason.</li>
</ul></div>`,
      examples: [
        {
          title: "The starter's layout (starter/README.md, section 4)",
          lang: "text",
          code: `
starter/
  pom.xml                        dependencies, surefire (tags, -Denv, Allure agent), allure-maven
  .gitignore                     target/, allure-results/, *.local.properties
  src/test/resources/
    config/local.properties      local values (not secret)
    config/qa.properties         QA placeholders only (CHANGE_ME)
    schemas/account.json         JSON schema for one account
    logback-test.xml             console INFO, target/logs/tests.log DEBUG
    allure.properties            results folder when running from the IDE
    junit-platform.properties    random test order, display names
  src/test/java/com/icebank/
    config/   Config             -Denv, properties files, overrides, fail-fast
    api/      Specs, RequestIdFilter, ApiLogFilter
              AuthClient, InboxClient, TestSupportClient, AccountsClient, TransfersClient
    model/    Account, Transaction, Page<T>, Transfer, TransferRequest, Problem, Tokens, InboxMessage
    db/       Db
    ui/       DriverFactory, DriverExtension, pages/ (BasePage, LoginPage, OtpPage, DashboardPage)
    support/  Personas, TestData, Json
    tests/
      api/    HealthApiTest, AuthApiTest, AccountsApiTest, TransfersApiTest, TestSupportDestructiveTest
      db/     DbSmokeTest
      ui/     LoginUiTest`,
        },
        {
          title: "Shared request specification (excerpt of api/Specs.java)",
          lang: "java",
          code: `
public final class Specs {

    public static final String API_BASE_PATH = "/api/v1";
    public static final String SANDBOX_KEY_HEADER = "X-Sandbox-Key";

    private Specs() {
    }

    /** No authentication. JSON in and out, logging, Allure, X-Request-Id. */
    public static RequestSpecification base() {
        return new RequestSpecBuilder()
                .setBaseUri(Config.baseUrl())              // http://localhost:3000 or the QA URL
                .setBasePath(API_BASE_PATH)
                .setConfig(config())                       // Jackson mapper, masked headers in logs
                .setContentType(ContentType.JSON)
                .setAccept(ContentType.JSON)
                .addFilter(new RequestIdFilter())
                .addFilter(new ApiLogFilter())
                .addFilter(new AllureRestAssured())        // request/response attached to the report
                .build();
    }

    /** Signed in as email (a persona): adds Authorization: Bearer ... from AuthClient's token cache. */
    public static RequestSpecification as(String email) {
        return withToken(AuthClient.accessToken(email));
    }

    /** With the X-Sandbox-Key header: test-support endpoints and the Ice Mail inbox API. */
    public static RequestSpecification sandbox() {
        return new RequestSpecBuilder()
                .addRequestSpecification(base())
                .addHeader(SANDBOX_KEY_HEADER, Config.sandboxKey())
                .build();
    }
}`,
        },
        {
          title: "A test that reads like a specification (from tests/api/TransfersApiTest.java)",
          lang: "java",
          code: `
@Test
@DisplayName("An amount with 3 decimals is rejected (400), never rounded")
void threeDecimalAmountIsRejected() {
    transfers.create(sophie, chequing, savings, "1.005")
            .then()
            .statusCode(400)
            .body("code", equalTo("VALIDATION_FAILED"))
            .body("errors[0].field", equalTo("amount"))
            .body("errors[0].message", equalTo("must have at most 2 decimal places"));
}`,
          note: "<code>transfers</code> is a <code>TransfersClient</code> field; <code>chequing</code> and <code>savings</code> are Sophie's account ids, looked up through the API in <code>@BeforeEach</code>.",
        },
        {
          title: "A new client following the same conventions (api/ETransfersClient.java)",
          lang: "java",
          code: `
/** /etransfers: Interac e-Transfers sent by the signed-in customer. Raw methods return the Response. */
public class ETransfersClient {

    /** POST /etransfers with a security question (no autodeposit) and a fresh Idempotency-Key. */
    @Step("Send e-Transfer of {amount} from account {fromAccountId} to {recipientEmail} as {email}")
    public Response send(String email, long fromAccountId, String recipientName, String recipientEmail, String amount,
                         String question, String answer) {
        return given().spec(Specs.as(email))
                .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                .body(Map.of("fromAccountId", fromAccountId, "recipientName", recipientName, "recipientEmail", recipientEmail,
                        "amount", amount, "securityQuestion", question, "securityAnswer", answer))
                .when().post("/etransfers");
    }

    @Step("Get e-Transfer {id} as {email}")
    public Response get(String email, long id) {
        return given().spec(Specs.as(email)).pathParam("id", id).when().get("/etransfers/{id}");
    }

    /** POST /etransfers/{id}/cancel: sender only, while PENDING; full refund. */
    @Step("Cancel e-Transfer {id} as {email}")
    public Response cancel(String email, long id) {
        return given().spec(Specs.as(email))
                .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                .pathParam("id", id).when().post("/etransfers/{id}/cancel");
    }
}`,
          note: "Imports: <code>io.qameta.allure.Step</code>, <code>io.restassured.response.Response</code>, <code>java.util.Map</code>, <code>static io.restassured.RestAssured.given</code>.",
        },
      ],
      exercises: [
        "Create the package layout above in your framework repo (empty classes are fine) and push it on a branch for review.",
        "Move every hard-coded URL and every <code>given().baseUri(...)</code> from your existing tests into <code>Specs</code>. Count how many lines of duplication you removed.",
        "Write <code>AccountsClient</code> with <code>list()</code>, <code>get(id)</code> and <code>transactions(id, Map&lt;String, Object&gt; query)</code>, and rewrite two existing tests to use it against Ice Bank local.",
        "Add the <code>ETransfersClient</code> above to your project and write <code>ETransfersApiTest</code>: Sophie sends $0.01 to an outside email (PENDING), cancels it (CANCELLED), and <code>get</code> confirms the status. The test must contain no URL, header or token.",
      ],
      quiz: [
        {
          q: "Where does the <code>Idempotency-Key</code> header for a new e-Transfer belong?",
          options: ["In each test that sends one", "In the client method that sends the request", "In <code>junit-platform.properties</code>", "In the page object"],
          answer: 1,
          explain: "How to talk to the API is the client's job. Tests should not know which headers an endpoint needs.",
        },
        {
          q: "A client method <code>send()</code> ends with <code>.then().statusCode(201)</code>. What is the problem?",
          options: ["No test can use it to check a 422 or 400 response", "Nothing, it saves typing", "REST Assured does not allow it", "It makes the test slower"],
          answer: 0,
          explain: "Raw client methods return the Response; offer a separate typed helper (like <code>TransfersClient.transfer</code>) for the happy path.",
        },
        {
          q: "Which class in the starter decides the base URL for every API call?",
          options: ["Each test class", "<code>Personas</code>", "<code>pom.xml</code>", "<code>Specs.base()</code>, from <code>Config.baseUrl()</code>"],
          answer: 3,
          explain: "One place for the base URL, base path, JSON settings, filters and Allure, so switching environment changes them all.",
        },
        {
          q: "Why does the starter have no <code>src/main/java</code>?",
          options: ["Maven forbids it", "Main code is generated", "It only contains tests and their helpers; everything is test code", "IntelliJ hides it"],
          answer: 2,
          explain: "The project tests Ice Bank; it ships nothing. <code>maven.main.skip</code> is set in the pom.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "config-env",
      title: "Config per environment (local, qa) with -Denv",
      summary: "One switch selects every URL, key and credential, so the same suite runs everywhere.",
      body: `
<p>Ice Bank has two environments, and your suite must run on both without editing code. The standard Java approach, and the one the starter's <code>Config</code> class
implements: one properties file per environment, selected by a system property, with overrides on top.</p>

<h3>How it works</h3>
<ol>
<li><code>mvn test -Denv=qa</code> sets the system property <code>env</code>. The pom defaults it to <code>local</code> and passes it to the test JVM
(<code>&lt;systemPropertyVariables&gt;</code>).</li>
<li><code>Config</code> loads <code>config/{env}.properties</code> from the classpath (required) and <code>config/{env}.local.properties</code> (optional, git-ignored).</li>
<li>Every key is looked up in this order, <strong>first hit wins</strong>:
<ol>
<li>a system property with the same name: <code>-DbaseUrl=http://127.0.0.1:3000</code></li>
<li>an environment variable <code>ICEBANK_</code> + the key in UPPER_SNAKE_CASE: <code>sandboxKey</code> → <code>ICEBANK_SANDBOX_KEY</code>, <code>jdbcUrl</code> → <code>ICEBANK_JDBC_URL</code></li>
<li><code>config/{env}.local.properties</code> (your personal, git-ignored file)</li>
<li><code>config/{env}.properties</code> (committed)</li>
</ol></li>
<li><strong>Fail fast</strong>: a missing key, or a value that still contains <code>CHANGE_ME</code>, throws an <code>IllegalStateException</code> naming the key and how to set it,
on first use, before any request is sent.</li>
</ol>

<h3>What differs between Ice Bank environments (starter keys)</h3>
<div class="table-wrap"><table>
<thead><tr><th>Key</th><th>local</th><th>qa</th></tr></thead>
<tbody>
<tr><td><code>baseUrl</code></td><td><code>http://localhost:3000</code></td><td>QA URL from the instructor</td></tr>
<tr><td><code>sandboxId</code></td><td><code>1</code></td><td>your sandbox id</td></tr>
<tr><td><code>sandboxKey</code></td><td><code>ICEBANK-LOCAL-KEY</code></td><td>your personal key (secret)</td></tr>
<tr><td><code>emailSuffix</code></td><td>empty</td><td>e.g. <code>+s3</code> → <code>emma.tremblay+s3@icebank.test</code></td></tr>
<tr><td><code>personaPassword</code></td><td><code>IceBank#2026</code></td><td><code>IceBank#2026</code></td></tr>
<tr><td><code>jdbcUrl</code></td><td><code>jdbc:postgresql://localhost:5433/icebank</code></td><td>Supabase session-pooler JDBC URL with <code>sslmode=require</code> (secret)</td></tr>
<tr><td><code>dbUser</code> / <code>dbPassword</code></td><td><code>qa_reader</code> / <code>qa_reader</code></td><td><code>qa_reader</code> / secret</td></tr>
<tr><td><code>dbWriterUser</code> / <code>dbWriterPassword</code></td><td><code>qa_writer</code> / <code>qa_writer</code></td><td>empty: tests that need it are skipped (<code>Config.hasDbWriter()</code> is false)</td></tr>
<tr><td><code>headless</code></td><td><code>false</code></td><td><code>true</code></td></tr>
<tr><td><code>uiTimeoutSeconds</code></td><td><code>10</code></td><td><code>15</code></td></tr>
</tbody></table></div>
<p>Persona emails are built from the suffix by <code>Personas.email("emma.tremblay")</code>. Ids are the same in every sandbox after a reset (Emma's chequing is always
account 1), which is why one suite works on both environments.</p>
<p>Use JUnit 5 assumptions for environment-specific tests: <code>assumeTrue(Config.hasDbWriter(), "needs qa_writer (local only)")</code> skips (not fails) a writer test on QA.
In TestNG, throw <code>SkipException</code>.</p>

<h3>Worked example: where does <code>sandboxKey</code> come from on QA?</h3>
<p>Ana runs <code>mvn test -Denv=qa</code>. <code>Config</code> loads <code>config/qa.properties</code> (committed: <code>sandboxKey=CHANGE_ME</code>) and her
<code>config/qa.local.properties</code> (git-ignored: <code>sandboxKey=ana-key</code>). When <code>Specs.sandbox()</code> asks for <code>sandboxKey</code>: no
<code>-DsandboxKey</code>, no <code>ICEBANK_SANDBOX_KEY</code>, so the local file wins with <code>ana-key</code>. In CI, the pipeline sets <code>ICEBANK_SANDBOX_KEY</code> and has no
local file; the environment variable wins. If neither exists, the lookup falls through to <code>CHANGE_ME</code> and the run stops with:
<em>Config key 'sandboxKey' for env 'qa' is still a placeholder (CHANGE_ME). Put the real value in src/test/resources/config/qa.local.properties or set ICEBANK_SANDBOX_KEY.</em></p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Guessing the environment-variable name. It is upper snake case of the key: <code>ICEBANK_SANDBOX_KEY</code>, not <code>ICEBANK_SANDBOXKEY</code>; <code>Config.envVarName(key)</code> tells you.</li>
<li>Putting real QA values into the committed <code>qa.properties</code> "for a minute". Use <code>qa.local.properties</code> or environment variables.</li>
<li>PowerShell splitting <code>-Denv=qa</code>: quote every flag, <code>mvn test "-Denv=qa"</code>.</li>
<li>Expecting a new key in <code>local.local.properties</code> to work when the same key is also set as an environment variable from an old experiment: the variable wins.
<code>echo $ICEBANK_BASE_URL</code> before you debug anything else.</li>
<li>Reading <code>System.getProperty("baseUrl")</code> directly in a test, bypassing the order and the fail-fast check. Always go through <code>Config</code>.</li>
</ul></div>`,
      examples: [
        {
          title: "src/test/resources/config/local.properties (the starter's, comments shortened)",
          lang: "properties",
          code: `
# Ice Bank on your own machine. Nothing here is secret: these values are published in the Ice Bank README.
# Override without editing: -DbaseUrl=...   ICEBANK_BASE_URL=...   config/local.local.properties
baseUrl=http://localhost:3000
sandboxId=1
sandboxKey=ICEBANK-LOCAL-KEY
emailSuffix=
personaPassword=IceBank#2026
jdbcUrl=jdbc:postgresql://localhost:5433/icebank
dbUser=qa_reader
dbPassword=qa_reader
dbWriterUser=qa_writer
dbWriterPassword=qa_writer
headless=false
uiTimeoutSeconds=10`,
        },
        {
          title: "The lookup order and the fail-fast check (excerpt of config/Config.java)",
          lang: "java",
          code: `
private static final String PLACEHOLDER = "CHANGE_ME";
private static final String ENV = System.getProperty("env", "local").trim().toLowerCase(Locale.ROOT);
private static final Properties FILE = load("config/" + ENV + ".properties", true);
private static final Properties LOCAL_FILE = load("config/" + ENV + ".local.properties", false);

/** The value for key, after overrides. Throws if it is missing or still a placeholder. */
public static String get(String key) {
    String value = lookup(key);
    if (value == null) {
        throw new IllegalStateException("Config key '" + key + "' is missing for env '" + ENV
                + "'. Add it to src/test/resources/config/" + ENV + ".properties or set " + envVarName(key) + ".");
    }
    if (value.contains(PLACEHOLDER)) {
        throw new IllegalStateException("Config key '" + key + "' for env '" + ENV + "' is still a placeholder (" + value
                + "). Put the real value in src/test/resources/config/" + ENV + ".local.properties or set "
                + envVarName(key) + ". See starter/README.md, section Environments.");
    }
    return value.trim();
}

/** sandboxKey -> ICEBANK_SANDBOX_KEY. */
public static String envVarName(String key) {
    return "ICEBANK_" + key.replaceAll("([a-z0-9])([A-Z])", "$1_$2").replace('.', '_').toUpperCase(Locale.ROOT);
}

private static String lookup(String key) {
    String sys = System.getProperty(key);            // 1. -Dkey=...
    if (sys != null) {
        return sys;
    }
    String envVar = System.getenv(envVarName(key));  // 2. ICEBANK_UPPER_SNAKE
    if (envVar != null) {
        return envVar;
    }
    String local = LOCAL_FILE.getProperty(key);      // 3. config/{env}.local.properties
    if (local != null) {
        return local;
    }
    return FILE.getProperty(key);                    // 4. config/{env}.properties
}`,
        },
        {
          title: "How -Denv reaches the tests (excerpt of the starter's pom.xml)",
          lang: "xml",
          code: `
<properties>
  <!-- Which config/{env}.properties file to load: local (default) or qa. Override with -Denv=qa. -->
  <env>local</env>
  <!-- Tests tagged "destructive" (reset, clock) are skipped unless you clear this: -DexcludedGroups= -->
  <excludedGroups>destructive</excludedGroups>
</properties>
...
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-surefire-plugin</artifactId>
  <version>\${surefire.version}</version>
  <configuration>
    <excludedGroups>\${excludedGroups}</excludedGroups>
    <systemPropertyVariables>
      <env>\${env}</env>
      <allure.results.directory>\${project.build.directory}/allure-results</allure.results.directory>
    </systemPropertyVariables>
  </configuration>
</plugin>`,
          note: "Run with <code>mvn test -Denv=qa</code>. Other <code>-D</code> values on the command line (<code>-DbaseUrl=...</code>) also reach the forked test JVM, which is how override 1 works.",
        },
        {
          title: "Proving the order: one key, four sources",
          lang: "bash",
          code: `
mvn test -Dtest=ConfigOverrideTest                                   # file only: uiTimeoutSeconds=10
echo "uiTimeoutSeconds=12" > src/test/resources/config/local.local.properties
mvn test -Dtest=ConfigOverrideTest                                   # local file wins: 12
ICEBANK_UI_TIMEOUT_SECONDS=9 mvn test -Dtest=ConfigOverrideTest      # environment variable wins: 9
ICEBANK_UI_TIMEOUT_SECONDS=9 mvn test -Dtest=ConfigOverrideTest -DuiTimeoutSeconds=7   # system property wins: 7
rm src/test/resources/config/local.local.properties`,
          note: "<code>ConfigOverrideTest</code> is a one-method test that logs <code>Config.uiTimeout()</code>; the values in the comments are what it printed. In PowerShell set the variable with <code>$env:ICEBANK_UI_TIMEOUT_SECONDS = '9'</code> and remove it afterwards.",
        },
      ],
      exercises: [
        "Implement <code>Config</code> with <code>local.properties</code> and <code>qa.example.properties</code>. Print the resolved base URL and sandbox id in a test, with <code>-Denv=local</code> and <code>-Denv=qa</code>.",
        "Make <code>Config</code> fail fast with a helpful message when <code>qa.properties</code> is missing. Run <code>mvn test -Denv=qa</code> without it and check the message tells a new teammate what to do.",
        "Override one value from the command line (<code>-DbaseUrl=http://127.0.0.1:3000</code>) and prove the override wins.",
        "Run your whole current suite with <code>-Denv=qa</code>. Every test must either pass, fail for a real (planted) bug, or be skipped with an assumption. Fix anything that fails for environment reasons.",
        "Write <code>ConfigOverrideTest</code>: it logs <code>Config.uiTimeout()</code> and, when <code>-DexpectTimeout=N</code> is given, asserts it equals N; it also asserts <code>Config.envVarName(\"sandboxKey\")</code> and <code>Config.envVarName(\"dbWriterPassword\")</code>. Run it the four ways shown in the last example and record which source won each time.",
      ],
      quiz: [
        {
          q: "<code>sandboxKey</code> is set in <code>qa.local.properties</code> and in the environment variable <code>ICEBANK_SANDBOX_KEY</code>. Which value does <code>Config</code> use?",
          options: ["The file's", "The environment variable's", "Whichever was changed last", "Neither: it throws"],
          answer: 1,
          explain: "Order: -D system property, then ICEBANK_ environment variable, then {env}.local.properties, then {env}.properties.",
        },
        {
          q: "What is the environment variable for the key <code>jdbcUrl</code>?",
          options: ["<code>ICEBANK_JDBC_URL</code>", "<code>ICEBANK_JDBCURL</code>", "<code>JDBC_URL</code>", "<code>icebank.jdbcUrl</code>"],
          answer: 0,
          explain: "ICEBANK_ plus the key in upper snake case: each lower-to-upper case change becomes an underscore.",
        },
        {
          q: "You run <code>-Denv=qa</code> with no real values anywhere. What happens?",
          options: ["Tests run against localhost", "Maven fails to compile", "All tests are skipped", "The first use of a key stops the run with a message naming the key and how to set it"],
          answer: 3,
          explain: "qa.properties holds CHANGE_ME placeholders; Config refuses them on first use instead of sending requests to https://CHANGE_ME.",
        },
        {
          q: "Which file should hold your personal QA sandbox key?",
          options: ["<code>config/qa.properties</code>", "<code>pom.xml</code>", "<code>config/qa.local.properties</code>", "<code>README.md</code>"],
          answer: 2,
          explain: "<code>*.local.properties</code> is git-ignored; the committed qa.properties keeps placeholders only.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "secrets",
      title: "Keeping secrets out of Git",
      summary: "Where credentials live, how they reach the tests, and what to do if one leaks.",
      body: `
<p>A secret is anything that gives access: your QA sandbox key (it lets anyone reset your sandbox and move its clock), the Supabase <code>qa_reader</code> connection string and
password, tokens copied from DevTools, Postman environments with those values, and Allure reports from QA runs (they contain full API responses, including access
tokens). Once a secret is pushed, it is in the history forever and must be considered leaked.</p>

<h3>The pattern (as in the starter)</h3>
<ol>
<li><strong>Commit placeholders, not values</strong>: <code>config/qa.properties</code> is committed with <code>sandboxKey=CHANGE_ME</code>, <code>dbPassword=CHANGE_ME</code> and so on.
<code>Config</code> refuses to use a placeholder, so a forgotten value stops the run with a clear message.</li>
<li><strong>Real values in a git-ignored file</strong>: <code>config/qa.local.properties</code>, with just the lines you need. The starter's <code>.gitignore</code> has
<code>*.local.properties</code> (Tutorial 4, lesson 7).</li>
<li><strong>Or environment variables</strong>: <code>ICEBANK_SANDBOX_KEY</code>, <code>ICEBANK_DB_PASSWORD</code>, <code>ICEBANK_JDBC_URL</code>, read by <code>Config</code> before the files.
Good for CI and shared machines.</li>
<li><strong>Never log secrets</strong>: the starter's <code>ApiLogFilter</code> logs no headers, and <code>Specs.config()</code> blacklists <code>Authorization</code>,
<code>X-Sandbox-Key</code>, <code>Cookie</code> and <code>Set-Cookie</code> in REST Assured's own logs and the Allure attachments (lesson 5).</li>
<li><strong>Check before you commit</strong>: <code>git status</code> (no <code>*.local.properties</code>), <code>git diff --staged</code>, and search for patterns like <code>eyJ</code> (JWTs)
or <code>pooler.supabase.com</code>.</li>
</ol>

<h3>What is and is not secret in Ice Bank</h3>
<ul>
<li><strong>Not secret</strong> (published in the README for the local build): <code>ICEBANK-LOCAL-KEY</code>, <code>qa_reader</code>/<code>qa_reader</code>, <code>qa_writer</code>/<code>qa_writer</code>,
<code>IceBank#2026</code>. Fine to commit in <code>local.properties</code>.</li>
<li><strong>Secret</strong>: your QA sandbox key, the QA database connection string and password, any access or refresh token, Allure results and reports of QA runs.</li>
</ul>
<p>Even for non-secret local values, keep the habit: values come from config, never from literals inside tests.</p>

<h3>Worked example: a teammate's first QA run</h3>
<p>Ben clones the repo and runs <code>mvn test -Denv=qa</code>. It stops at once: <em>Config key 'baseUrl' for env 'qa' is still a placeholder (https://CHANGE_ME). Put the real
value in src/test/resources/config/qa.local.properties or set ICEBANK_BASE_URL.</em> He creates <code>qa.local.properties</code> with the six lines the instructor sent him
(base URL, sandbox id, key, suffix, JDBC URL, DB password), runs again, and the suite runs against his sandbox. Before his first commit, <code>git status</code> shows his
test changes but not the new file, and <code>git check-ignore -v src/test/resources/config/qa.local.properties</code> answers
<code>.gitignore:8:*.local.properties</code>: the rule that keeps it out.</p>

<h3>If a secret leaks</h3>
<p>Tell the instructor straight away so the key or password can be rotated. Rewriting history (<code>git filter-repo</code>) only helps after rotation, because clones and forks
may already have it. Rotation first, cleanup second.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Naming the file <code>qa-local.properties</code> or <code>qa.properties.local</code>: it is not matched by <code>*.local.properties</code> and <code>Config</code> does not read it either.</li>
<li><code>git add .</code> without looking. Use <code>git status</code> first; <code>git add -p</code> or named paths for the rest.</li>
<li>Pasting the key into an IntelliJ run configuration that is saved in <code>.idea/</code> and then committed. Prefer the local file or an OS environment variable.</li>
<li>Sharing a QA Allure report (or <code>target/</code> zipped) in chat. It holds access tokens and your sandbox data.</li>
<li>Deleting a leaked key from the latest commit and thinking it is gone. It is still in history and in every clone: rotate.</li>
</ul></div>`,
      examples: [
        {
          title: "src/test/resources/config/qa.properties (committed: placeholders only)",
          lang: "properties",
          code: `
# Ice Bank QA (hosted). PLACEHOLDERS ONLY: never commit real values to this file.
# Put the real values in config/qa.local.properties (git-ignored) or in ICEBANK_* environment variables.
baseUrl=https://CHANGE_ME
sandboxId=CHANGE_ME
# Secret: whoever has it can reset your sandbox and move its clock.
sandboxKey=CHANGE_ME
emailSuffix=+sCHANGE_ME
personaPassword=IceBank#2026
# Secret: the QA database connection (read-only user).
jdbcUrl=jdbc:postgresql://CHANGE_ME:5432/postgres?sslmode=require
dbUser=qa_reader
dbPassword=CHANGE_ME
# There is no writer account on QA: tests that need it are skipped there.
dbWriterUser=
dbWriterPassword=
headless=true
uiTimeoutSeconds=15`,
        },
        {
          title: "src/test/resources/config/qa.local.properties (git-ignored, yours alone)",
          lang: "properties",
          code: `
baseUrl=https://the-qa-url-from-your-instructor
sandboxId=3
sandboxKey=your-personal-key
emailSuffix=+s3
jdbcUrl=jdbc:postgresql://the-pooler-host:5432/postgres?sslmode=require
dbPassword=the-qa-reader-password`,
          note: "Only the lines that differ from <code>qa.properties</code>. Every other key falls through to the committed file.",
        },
        {
          title: "Or provide secrets as environment variables (Git Bash / macOS / Linux, then PowerShell)",
          lang: "bash",
          code: `
export ICEBANK_SANDBOX_KEY='paste-your-qa-key'
export ICEBANK_DB_PASSWORD='paste-the-qa-reader-password'
mvn test -Denv=qa

# PowerShell
$env:ICEBANK_SANDBOX_KEY = 'paste-your-qa-key'
$env:ICEBANK_DB_PASSWORD = 'paste-the-qa-reader-password'
mvn test "-Denv=qa"`,
        },
        {
          title: "A pre-commit check you can run by hand",
          lang: "bash",
          code: `
git status --porcelain | grep -E '\\.local\\.properties$' && echo "A local properties file is about to be committed!"
git diff --staged | grep -nE 'eyJ[A-Za-z0-9_-]{10,}|pooler\\.supabase\\.com|sandboxKey=[^C]' \\
  && echo "Possible secret staged - check before committing" \\
  || echo "No obvious secrets staged"
git check-ignore -v src/test/resources/config/qa.local.properties   # prints the .gitignore rule that ignores it`,
        },
      ],
      exercises: [
        "Set up <code>qa.example.properties</code>, the ignored <code>qa.properties</code> and environment-variable overrides. Show that <code>git status</code> never lists <code>qa.properties</code>.",
        "Have a teammate clone the repo fresh and get <code>-Denv=qa</code> running using only the README. Fix the README wherever they got stuck.",
        "Search your repository history (all branches) for JWTs, Supabase hosts and your QA key with <code>git log -p --all -S</code>. Report and rotate if you find anything.",
        "Prove your ignore rule works: create <code>src/test/resources/config/qa.local.properties</code> with a fake key, run <code>git check-ignore -v</code> on it and on <code>qa.properties</code>, and <code>git status --porcelain --untracked-files=all</code>. Write down what each command shows and why <code>qa.properties</code> must <em>not</em> be ignored.",
      ],
      quiz: [
        {
          q: "Which file is committed to Git in the starter?",
          options: ["<code>config/qa.local.properties</code>", "<code>config/qa.properties</code> with CHANGE_ME placeholders", "Both", "Neither"],
          answer: 1,
          explain: "The committed file documents every key with placeholders; real values live in the git-ignored local file or in environment variables.",
        },
        {
          q: "You pushed your QA sandbox key an hour ago. What comes first?",
          options: ["Tell the instructor so the key is rotated", "git filter-repo to remove it", "Delete the file and push again", "Make the repo private"],
          answer: 0,
          explain: "The key is already in clones and history. Rotation makes the leaked value useless; cleanup comes second.",
        },
        {
          q: "Why should you not share an Allure report from a QA run?",
          options: ["It is too big", "It shows your source code", "Allure reports only work locally", "It contains full API responses, including short-lived access tokens"],
          answer: 3,
          explain: "The starter README warns about this: harmless locally, sensitive on QA.",
        },
        {
          q: "Which of these is <em>not</em> a secret?",
          options: ["Your QA sandbox key", "The QA qa_reader password", "<code>ICEBANK-LOCAL-KEY</code>", "A refresh token"],
          answer: 2,
          explain: "The local key and local DB passwords are published in the README; they only work on your own machine.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "test-data",
      title: "Test data strategy (API setup, DB checks, reset)",
      summary: "Create what each test needs, verify in the database, and know when to reset.",
      body: `
<p>Most flaky or order-dependent suites are really test-data problems: test B passes only if test A ran first, or fails after someone else used up Emma's daily e-Transfer limit.
Decide your data strategy deliberately. The starter's rule: <strong>the default run is safe on a shared sandbox</strong>. It never resets the data or moves the clock.</p>

<h3>Three sources of data</h3>
<ul>
<li><strong>Seed data (read-only use)</strong>: Ice Bank's deterministic seed gives fixed personas and ids (Emma = customer 1, accounts 1 to 4; Ava's frozen chequing = 10; Olivia's card
= 8, $40 under its limit). Use it for <em>reading</em> and for special states that are hard to create (locked user, frozen account). Never assume balances: read them first.
<code>AccountsApiTest</code> checks Emma's ids, types and numbers, never her balances.</li>
<li><strong>Data created through the API (preferred for writes)</strong>: each test creates what it changes. Money moves use <strong>Sophie Bouchard</strong> (customer 7,
<code>Personas.SOPHIE</code>), a background customer no tutorial scenario uses, with tiny amounts that the test moves back. Anything that changes a customer's state uses a
brand-new customer from <code>POST /auth/register</code> with a unique email. The API applies every rule, so the data is realistic.</li>
<li><strong>Data written with SQL (rarely)</strong>: only locally, as <code>qa_writer</code>, and inside <code>Db.writer().inRolledBackTransaction(...)</code> so nothing is kept.
Prefer the API, the sandbox clock and admin endpoints over SQL.</li>
</ul>

<h3>Verify in the database</h3>
<p>After an API action, check the rows with <code>Db.reader()</code> (<code>qa_reader</code>): the API response proves the contract, the rows prove the behaviour. Scope queries to
the data the test created (the id from <code>Location</code>, the <code>referenceId</code>) and always to <code>Config.sandboxId()</code>. Tutorial 8 goes deep on this.</p>

<h3>Reset and the clock</h3>
<p><code>POST /api/v1/test/reset</code> (header <code>X-Sandbox-Key</code>) restores the seed: same ids and balances, clock back to 2026-11-02 09:00 Toronto. It takes a few seconds and
wipes everything for everyone using that sandbox. <code>POST /api/v1/test/clock</code> moves the sandbox date forward (never back) to test scheduling, interest and expiry.
In the starter both live in <code>TestSupportClient</code> and are only called from classes tagged <code>destructive</code> (<code>TestSupportDestructiveTest</code>), which the pom
excludes from <code>mvn test</code>. Run them deliberately, only on a sandbox that is yours alone: <code>mvn test -Dgroups=destructive -DexcludedGroups=</code>.</p>

<h3>Independence rules</h3>
<ul>
<li>A test must pass when run alone and in any order. The starter runs methods <em>and</em> classes in random order (<code>junit-platform.properties</code>) to prove it.</li>
<li>Use Sophie or a new customer for writes, different personas for tests that consume limits, and never Emma's balances.</li>
<li>Restore what you change in a <code>finally</code> (transfer back, delete the payee, cancel the e-Transfer) so a failing test cleans up too.</li>
<li>Tests that reset or move the clock go in their own <code>destructive</code> class, reset before <em>and</em> after, and run alone.</li>
</ul>

<h3>Worked example: <code>TransfersApiTest</code> line by line</h3>
<p>Its first test: <code>@BeforeEach</code> looks up Sophie's chequing and savings ids through the API (no hard-coded 14 and 15). The test reads both balances from the
database, transfers $1.00 through <code>TransfersClient</code>, asserts the response (201, <code>Location</code>, amount, status), queries the two legs by
<code>referenceId</code> and checks account, direction, status and amount of each, checks the chequing balance dropped by exactly $1.00, and finally transfers the dollar back and
checks both balances are what they were. Run it a hundred times and Sophie's balances end where they started. The idempotency test does the same with a
<code>finally</code>, so even a failed assertion puts the money back.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Writing with Emma "because her data is nice". Other tests read her balances and history; use Sophie or a new customer.</li>
<li>A <code>@BeforeAll</code> reset in a normal test class. On a shared sandbox it wipes your teammates' data mid-run; in the starter, reset belongs only to destructive classes.</li>
<li>Undo code at the end of the test body instead of in <code>finally</code>: it never runs when an assertion fails.</li>
<li>Registering a new customer in every test. Registration counts toward the sign-in rate limit (10 per minute); create one per class.</li>
<li>Deleting rows with <code>qa_writer</code> to clean up after API tests. Posted transactions cannot be deleted (a trigger refuses), and half-deleted data is worse than none.</li>
</ul></div>`,
      examples: [
        {
          title: "Reset only where it belongs: a destructive class (from tests/api/TestSupportDestructiveTest.java)",
          lang: "java",
          code: `
@Tag("api")
@Tag("destructive")
@Feature("Test support")
@DisplayName("Sandbox reset and clock (destructive)")
class TestSupportDestructiveTest {

    @Test
    @DisplayName("Reset restores the seed and sets the clock to Mon 2026-11-02 09:00 Toronto")
    void resetRestoresSeed() {
        TestSupportClient.reset()
                .then()
                .statusCode(200)
                .body("sandboxId", equalTo(Config.sandboxId()))
                .body("clock.today", equalTo("2026-11-02"))
                .body("clock.now", startsWith("2026-11-02T09:0"))
                .body("customers", greaterThanOrEqualTo(50));
    }
}`,
          note: "<code>TestSupportClient.reset()</code> also clears <code>AuthClient</code>'s token cache, because a reset deletes every session. In TestNG, tag with <code>groups = \"destructive\"</code> and exclude the group in <code>testng.xml</code>.",
        },
        {
          title: "Create your own data, then verify the row (Sophie, a payee, cleaned up in finally)",
          lang: "java",
          code: `
@Test
@Tag("db")
void addPayeeStoresTheAccountNumber() {
    String number = "W" + ThreadLocalRandom.current().nextInt(1_000_000, 10_000_000);   // biller 4: W + 7 digits
    Response r = given().spec(Specs.as(Personas.SOPHIE))
            .body(Map.of("billerId", 4, "accountNumber", number, "nickname", "Water"))
            .when().post("/payees");
    r.then().statusCode(201);
    long id = Long.parseLong(r.header("Location").replaceAll(".*/", ""));
    try {
        Map<String, Object> row = Db.reader().queryOne(
                "SELECT customer_id, biller_id, account_number, nickname, deleted_at FROM payees WHERE sandbox_id = ? AND id = ?",
                Config.sandboxId(), id);
        assertThat(row).containsEntry("customer_id", Personas.SOPHIE_CUSTOMER_ID)
                .containsEntry("biller_id", 4L)
                .containsEntry("account_number", number)
                .containsEntry("nickname", "Water")
                .containsEntry("deleted_at", null);
    } finally {
        given().spec(Specs.as(Personas.SOPHIE)).when().delete("/payees/{id}", id).then().statusCode(204);   // clean up
    }
}`,
          note: "A random account number keeps the test repeatable: the same biller and number twice for one customer would be refused as a duplicate. A payee that was never paid is deleted for real.",
        },
        {
          title: "Register a brand-new customer for tests that change a customer's state",
          lang: "java",
          code: `
public static String newCustomer() {
    String email = "tester." + UUID.randomUUID().toString().substring(0, 8) + "@icebank.test";
    given().spec(Specs.base())
        .body(Map.ofEntries(
            Map.entry("firstName", "Test"), Map.entry("lastName", "Customer"), Map.entry("dateOfBirth", "1995-05-05"),
            Map.entry("email", email), Map.entry("phone", "(416) 555-0199"),
            Map.entry("addressLine1", "200 Bay Street"), Map.entry("city", "Toronto"), Map.entry("province", "ON"),
            Map.entry("postalCode", "M5J 2T3"), Map.entry("sin", "193 746 286"), Map.entry("password", "Glacier#2026")))
    .when().post("/auth/register")
    .then().statusCode(201);
    return email;   // new customer with an empty chequing account and a debit card
}`,
          note: "<code>Map.of</code> stops at 10 pairs; registration has 11 fields. A new customer starts with $0.00 and signs in with <em>their</em> password: <code>AuthClient.signIn(email, \"Glacier#2026\")</code>, after which <code>Specs.as(email)</code> uses the cached token.",
        },
      ],
      exercises: [
        "Classify every test you have so far: uses seed data read-only, creates its own data, or changes seed data. Fix one that changes seed data so it creates its own instead.",
        "Add the reset-once mechanism to your base class, guarded by the <code>allowReset</code> config key. Run the suite twice in a row on local and check the second run gives identical results.",
        "Write a JDBC helper <code>db.one(sql, params...)</code> returning a <code>Map</code>, and use it in two API tests to verify the rows they created.",
        "Run your test classes in random order (<code>junit.jupiter.testmethod.order.default=org.junit.jupiter.api.MethodOrderer$Random</code> in <code>junit-platform.properties</code>) three times. Fix every test that fails only in some orders.",
        "Add the payee example above to your suite and run it twice in a row on local. Then make it fail on purpose (expect the wrong nickname) and prove with a SQL query that the payee was still deleted.",
      ],
      quiz: [
        {
          q: "Which persona does the starter use for tests that move money?",
          options: ["Emma, she has the most money", "Sophie, a background customer no scenario uses", "Noah, he has no history", "The teller"],
          answer: 1,
          explain: "Sophie (customer 7) with tiny amounts that are moved back, so nobody else's balances or limits change.",
        },
        {
          q: "Where may <code>TestSupportClient.reset()</code> be called in the starter?",
          options: ["Only in classes tagged <code>destructive</code>", "In a <code>@BeforeAll</code> of every class", "In <code>Config</code>", "Anywhere, it is harmless"],
          answer: 0,
          explain: "A reset wipes the sandbox for everyone; the default run excludes destructive tests.",
        },
        {
          q: "Why does the payee example use a random account number?",
          options: ["The API requires it", "Random numbers are faster", "To hide the data", "So the test can run again: an active duplicate payee would be refused"],
          answer: 3,
          explain: "Repeatable tests do not collide with what an earlier (possibly failed) run left behind.",
        },
        {
          q: "A test transfers money and its last line transfers it back. An assertion in the middle fails. Result?",
          options: ["The money is moved back anyway", "JUnit rolls it back", "The money stays moved; the undo should be in finally (or a cleanup hook)", "The next test fixes it"],
          answer: 2,
          explain: "A failed assertion throws and ends the test body. Put undo steps where they always run.",
        },
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
<code>src/test/resources/logback-test.xml</code>. The starter's configuration: the <strong>console shows INFO and up</strong> (a <code>ThresholdFilter</code> on the console appender),
<strong><code>target/logs/tests.log</code> also keeps DEBUG</strong> for <code>com.icebank</code>, and chatty libraries (Apache HTTP, Selenium, Netty) are turned down to WARN. Use levels deliberately:</p>
<ul>
<li><code>ERROR</code>: something broke in the framework itself.</li>
<li><code>WARN</code>: unexpected but recoverable (a 429 retry, a concurrent-sign-in retry in <code>AuthClient</code>).</li>
<li><code>INFO</code>: one line per meaningful step: "Signed in as sophie.bouchard@icebank.test (env=local)", one line per HTTP call.</li>
<li><code>DEBUG</code>: details such as error response bodies and every SQL query <code>Db</code> runs.</li>
</ul>
<p>Use placeholders, not string concatenation: <code>log.info("Transfer {} created, ref {}", id, ref)</code>. Do not use <code>System.out.println</code> in a framework.</p>

<h3>REST Assured filters in the starter</h3>
<ul>
<li><code>RequestIdFilter</code> adds <code>X-Request-Id: &lt;uuid&gt;</code> to every request. Ice Bank echoes it and writes it to its own log, so one id links a failed test to the server's log line.</li>
<li><code>ApiLogFilter</code> logs one INFO line per call (method, URL, status, time, <code>X-Request-Id</code>) and, for status 400 and up, the response body at DEBUG. It logs
<strong>no headers</strong>, so tokens and the sandbox key never reach the log.</li>
<li><code>Specs.config()</code> sets <code>LogConfig.logConfig().blacklistHeader("Authorization", "X-Sandbox-Key", "Cookie", "Set-Cookie").enableLoggingOfRequestAndResponseIfValidationFails()</code>:
REST Assured stays silent while assertions pass and prints the whole request and response (with those headers masked) when a <code>then()</code> assertion fails.</li>
<li>Avoid <code>.log().all()</code> on every request: it is noise when green and duplicates what the filters already do.</li>
</ul>

<h3>Worked example: reading a failure from the log alone</h3>
<p>A transfer test fails. The console shows <code>POST http://localhost:3000/api/v1/transfers -&gt; 422 in 41 ms, X-Request-Id=5c0e9a1f-...</code>, then REST Assured's dump with
<code>Authorization=[ BLACKLISTED ]</code> and the problem body. <code>target/logs/tests.log</code> additionally has the DEBUG line with the body. From these three facts you know the
endpoint, the status, the business code (<code>INSUFFICIENT_FUNDS</code>) and the id to search for in Ice Bank's own log (the terminal running <code>npm run dev</code> prints one
<code>[api] POST /api/v1/transfers -&gt; 422 ... &lt;request id&gt;</code> line per call; on QA, ask the instructor for the hosted log). You never needed to rerun the test, and no secret was printed.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Logging the <code>Authorization</code> header "to debug sign-in". The token works for 15 minutes for anyone who reads the log.</li>
<li>Setting the root logger to DEBUG: thousands of HTTP-client lines bury the one that matters. Raise <code>com.icebank</code> only.</li>
<li>Building messages with <code>+</code>: the string is built even when the level is off, and placeholders read better.</li>
<li>Catching an exception, logging it, and carrying on. A test that cannot do its setup should fail, not log and pass.</li>
<li>Logging response bodies at INFO for every call. Error bodies at DEBUG (file) are enough; Allure has the full bodies anyway.</li>
</ul></div>`,
      examples: [
        {
          title: "src/test/resources/logback-test.xml (the starter's)",
          lang: "xml",
          code: `
<!-- Logging for the tests. Console shows INFO and up; target/logs/tests.log also keeps DEBUG lines. -->
<configuration>
  <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <filter class="ch.qos.logback.classic.filter.ThresholdFilter"><level>INFO</level></filter>
    <encoder><pattern>%d{HH:mm:ss.SSS} %-5level %logger{20} - %msg%n</pattern></encoder>
  </appender>
  <appender name="FILE" class="ch.qos.logback.core.FileAppender">
    <file>target/logs/tests.log</file>
    <encoder><pattern>%d{ISO8601} %-5level [%thread] %logger{36} - %msg%n</pattern></encoder>
  </appender>

  <logger name="com.icebank" level="DEBUG"/>
  <!-- Third-party libraries are chatty at DEBUG. -->
  <logger name="org.apache.http" level="WARN"/>
  <logger name="org.openqa.selenium" level="WARN"/>
  <logger name="io.netty" level="WARN"/>
  <logger name="org.asynchttpclient" level="WARN"/>

  <root level="INFO">
    <appender-ref ref="CONSOLE"/>
    <appender-ref ref="FILE"/>
  </root>
</configuration>`,
        },
        {
          title: "api/ApiLogFilter.java: one line per call, error bodies at DEBUG, no headers",
          lang: "java",
          code: `
public class ApiLogFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(ApiLogFilter.class);

    @Override
    public Response filter(FilterableRequestSpecification request, FilterableResponseSpecification responseSpec, FilterContext ctx) {
        long start = System.nanoTime();
        Response response = ctx.next(request, responseSpec);
        long ms = (System.nanoTime() - start) / 1_000_000;
        log.info("{} {} -> {} in {} ms, X-Request-Id={}", request.getMethod(), request.getURI(), response.statusCode(), ms,
                response.header(RequestIdFilter.HEADER));
        if (response.statusCode() >= 400) {
            log.debug("Response body: {}", response.asString());
        }
        return response;
    }
}

// in Specs.base():   .addFilter(new RequestIdFilter()).addFilter(new ApiLogFilter()).addFilter(new AllureRestAssured())
// in Specs.config(): .logConfig(LogConfig.logConfig()
//                        .blacklistHeader("Authorization", SANDBOX_KEY_HEADER, "Cookie", "Set-Cookie")
//                        .enableLoggingOfRequestAndResponseIfValidationFails())`,
        },
        {
          title: "What a useful failure log looks like",
          lang: "text",
          code: `
09:14:03.120 INFO  c.i.api.AuthClient - Signed in as sophie.bouchard@icebank.test (env=local)
09:14:03.311 INFO  c.i.api.ApiLogFilter - POST http://localhost:3000/api/v1/transfers -> 422 in 41 ms, X-Request-Id=5c0e9a1f-...
Request method: POST
Request URI:    http://localhost:3000/api/v1/transfers
Headers:        Authorization=[ BLACKLISTED ]
                Idempotency-Key=0b8f...
                X-Request-Id=5c0e9a1f-...
...
HTTP/1.1 422 Unprocessable Entity
{"type":"https://icebank.test/problems/insufficient-funds",...,"code":"INSUFFICIENT_FUNDS"}`,
          note: "The DEBUG line with the body (<code>Response body: {...}</code>) is in <code>target/logs/tests.log</code>, not on the console.",
        },
      ],
      exercises: [
        "Add SLF4J + Logback to your framework with the config above and replace every <code>System.out.println</code>.",
        "Implement <code>ApiLogFilter</code>, add it to <code>Specs.base()</code>, and make one test fail on purpose. Check the log alone tells you the endpoint, status, <code>X-Request-Id</code> and error <code>code</code>.",
        "Turn on REST Assured's <code>ifValidationFails</code> logging with blacklisted headers and prove (by searching <code>target/logs/tests.log</code>) that no access token or sandbox key appears anywhere.",
        "Improve <code>ApiLogFilter</code>: for an error response with content type <code>application/problem+json</code>, log one extra INFO line with the problem's <code>code</code> and <code>detail</code>. Run <code>TransfersApiTest#threeDecimal*</code> and paste the new line.",
      ],
      quiz: [
        {
          q: "Where does the starter write DEBUG lines such as error response bodies?",
          options: ["Only to the console", "To <code>target/logs/tests.log</code>; the console shows INFO and up", "Nowhere", "Into the Allure report only"],
          answer: 1,
          explain: "The console appender has a ThresholdFilter at INFO; the file appender keeps DEBUG for com.icebank.",
        },
        {
          q: "Why does <code>ApiLogFilter</code> log no headers?",
          options: ["So access tokens and the sandbox key never reach the log", "Headers are too long", "SLF4J cannot print maps", "REST Assured hides them"],
          answer: 0,
          explain: "The masked dump on assertion failure comes from REST Assured's own logging with blacklisted headers.",
        },
        {
          q: "What is the <code>X-Request-Id</code> in the log line for?",
          options: ["Authentication", "Rate limiting", "Idempotency", "Linking the test's call to the same request in Ice Bank's own log"],
          answer: 3,
          explain: "RequestIdFilter sends it, Ice Bank echoes and logs it: one id, both sides of the story.",
        },
        {
          q: "Which logging call is best?",
          options: ["<code>System.out.println(\"Transfer \" + id)</code>", "<code>log.info(\"Transfer \" + id)</code>", "<code>log.info(\"Transfer {} created\", id)</code>", "<code>log.error(\"Transfer created\")</code>"],
          answer: 2,
          explain: "SLF4J placeholders, at the right level.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "allure",
      title: "Allure steps, attachments and history",
      summary: "Reports that show what each test did, with evidence, and trends across runs.",
      links: [{ label: "Allure report docs", href: "https://allurereport.org/docs/" }],
      body: `
<p>Allure turns test results into an HTML report with steps, attachments, categories and history. A good report lets someone who has never seen the code understand what failed and why,
which is exactly what you need when you show the instructor that your suite catches a planted bug.</p>

<h3>Setup in the starter</h3>
<ul>
<li>Dependencies: <code>allure-jupiter</code> (the current name of <code>allure-junit5</code>; TestNG users take <code>allure-testng</code>) and <code>allure-rest-assured</code>, versions from the
<code>allure-bom</code>.</li>
<li>Surefire's <code>argLine</code> adds the <strong>AspectJ agent</strong> (<code>-javaagent:.../aspectjweaver-1.9.27.jar</code>), which makes <code>@Step</code> and <code>Allure.step(...)</code> work.
Run through Maven; in IntelliJ add the same <code>-javaagent</code> to the VM options.</li>
<li>Results go to <code>target/allure-results</code> (Surefire sets <code>allure.results.directory</code>; <code>allure.properties</code> is the fallback for IDE runs).</li>
<li>The <code>allure-maven</code> plugin builds the report: <code>mvn allure:serve</code> (temporary folder, opens the browser) or <code>mvn allure:report</code>
(<code>target/site/allure-maven-plugin/index.html</code>; open it through a web server, browsers block its data files from disk). The first run downloads the Allure command-line tool.</li>
</ul>

<h3>Steps</h3>
<p>Annotate client and helper methods with <code>@Step("Transfer {request.amount} from account {request.fromAccountId} to {request.toAccountId} as {email}")</code>; parameters,
even fields of record parameters, appear in the step name. Or wrap code in <code>Allure.step("Check balance in DB", () -&gt; { ... })</code>. The starter already has steps on
<code>AuthClient.signIn</code>, <code>InboxClient.latestOtp</code>, the clients and the page objects, and every <code>Db</code> query is a step named <code>SQL (qa_reader): SELECT ...</code>.</p>

<h3>Attachments</h3>
<ul>
<li><code>AllureRestAssured</code> (in <code>Specs.base()</code>): every request and response attached automatically.</li>
<li><code>Db</code>: the SQL, its parameters and the rows it returned, attached to each query step.</li>
<li><code>DriverExtension</code>: for a failed UI test, a screenshot, the URL and the page source.</li>
<li>Your own: <code>Allure.addAttachment("name", "text/plain", content)</code>.</li>
</ul>

<h3>Metadata</h3>
<p><code>@Epic("Payments")</code>, <code>@Feature("Transfers")</code>, <code>@Story("Idempotency")</code>, <code>@Severity(SeverityLevel.CRITICAL)</code>, <code>@Issue("IB-17")</code> and
<code>@Owner</code> group and filter the report (Behaviors tab). <code>@DisplayName</code> becomes the test's title. Put <code>environment.properties</code> (env, base URL, sandbox) in the
results folder so the Overview shows where it ran.</p>

<h3>History and trends</h3>
<p>Allure shows trends (pass rate over time, flaky tests, retries) if the new <em>results</em> contain the <code>history</code> folder of the previous <em>report</em>. With
<code>allure-maven</code> that folder is <code>target/site/allure-maven-plugin/history</code>; because <code>mvn clean</code> deletes <code>target/</code>, copy it somewhere outside first.</p>

<h3>Worked example: reading a step tree</h3>
<p>Run <code>TransfersApiTest</code>, then <code>mvn allure:serve</code>. Open "A $1.00 transfer posts a DEBIT and a CREDIT leg...". The tree reads top to bottom like the test: <em>List
accounts of sophie...</em> (with the sign-in and OTP steps nested inside it the first time a token is needed), <em>SQL (qa_reader): SELECT balance ...</em> twice,
<em>Transfer 1.00 from account 14 to 15 as sophie...</em> with the request and response attached, <em>SQL (qa_reader): SELECT account_id, direction ...</em> with the two legs attached,
and the transfer back. A failure shows on the exact step, with its evidence one click away.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Running from the IDE without the agent: tests pass, the report has no steps. The fix is the <code>-javaagent</code> VM option, not more <code>Allure.step</code> calls.</li>
<li>Forgetting <code>mvn clean</code>: results of earlier runs (including old failures) mix into the new report.</li>
<li>Opening <code>index.html</code> by double-click: an empty or "Loading..." report. Use <code>allure:serve</code> or a local web server.</li>
<li>Step names without parameters (<code>@Step("Transfer")</code>): ten identical lines tell nobody anything.</li>
<li>Sharing a report from a QA run: it contains full API responses, including access tokens.</li>
</ul></div>`,
      examples: [
        {
          title: "Steps and metadata",
          lang: "java",
          code: `
@Epic("Payments") @Feature("Transfers") @Story("Validation")
@Severity(SeverityLevel.CRITICAL)
@Test
@DisplayName("A transfer of 1.005 is rejected, not rounded")
void threeDecimalsAreRejected() {
    Response r = transfers.create(Personas.SOPHIE, chequing, savings, "1.005");   // @Step on TransfersClient.create
    Allure.step("Expect 400 VALIDATION_FAILED on amount", () ->
        r.then().statusCode(400)
            .body("code", equalTo("VALIDATION_FAILED"))
            .body("errors[0].field", equalTo("amount")));
}

// in api/TransfersClient.java
@Step("Transfer {request.amount} from account {request.fromAccountId} to {request.toAccountId} as {email}")
public Response create(String email, TransferRequest request, String idempotencyKey) { ... }`,
        },
        {
          title: "Your own evidence: attach anything as text",
          lang: "java",
          code: `
String sql = "SELECT id, direction, amount, balance_after FROM transactions WHERE sandbox_id = ? AND reference_id = ?";
List<Map<String, Object>> rows = Db.reader().queryList(sql, Config.sandboxId(), ref);   // Db attaches SQL + rows already
Allure.addAttachment("Legs of " + ref + " (summary)", "text/plain",
    rows.stream().map(r -> r.get("direction") + " " + r.get("amount") + " -> " + r.get("balance_after"))
        .collect(Collectors.joining("\\n")));
assertThat(rows).hasSize(2);`,
        },
        {
          title: "A report that keeps history (allure-maven, Git Bash)",
          lang: "bash",
          code: `
mvn clean test -Denv=local || true
mvn allure:report                                              # target/site/allure-maven-plugin
cp -r target/site/allure-maven-plugin/history ./allure-history # keep it outside target/

mvn clean test -Denv=local || true                             # next run
cp -r ./allure-history target/allure-results/history
printf "env=local\\nbaseUrl=http://localhost:3000\\nsandboxId=1\\n" > target/allure-results/environment.properties
mvn allure:report                                              # Trend graph now shows both runs
cp -r target/site/allure-maven-plugin/history/. ./allure-history/
mvn allure:serve`,
          note: "Add <code>allure-history/</code> to <code>.gitignore</code>. A quick check that history arrived: <code>history-trend.json</code> in the new report's <code>history</code> folder has one entry per run.",
        },
      ],
      exercises: [
        "Add Allure to your framework and generate a report for your current suite on local. Every API call should appear as an attachment.",
        "Add <code>@Step</code> to every client method and <code>@Feature</code>/<code>@Story</code>/<code>@Severity</code> to every test class. Check the Behaviors tab groups tests sensibly.",
        "Attach SQL evidence in at least two DB-verification tests, and a screenshot on failure in your UI tests.",
        "Run the suite three times keeping history (once on QA so some tests fail). Take a screenshot of the Trend graph and add it to your PR or notes.",
        "Run one test class from IntelliJ <em>without</em> the AspectJ agent and once with <code>-javaagent:...aspectjweaver-1.9.27.jar</code> in the VM options. Compare the two reports and write down exactly what was missing in the first.",
      ],
      quiz: [
        {
          q: "Your report shows tests but no steps. What is the most likely cause?",
          options: ["No @Step annotations exist", "The AspectJ agent was not on the JVM (e.g. run from the IDE)", "Allure needs a newer Java", "The tests passed"],
          answer: 1,
          explain: "@Step works through AspectJ weaving; the starter's Surefire argLine adds the agent.",
        },
        {
          q: "Where must the previous report's <code>history</code> folder go to get a Trend graph?",
          options: ["Into the new <code>target/allure-results</code> before generating", "Next to pom.xml", "Into src/test/resources", "Nowhere, Allure finds it"],
          answer: 0,
          explain: "History flows from the old report into the new results; copy it outside target/ first because mvn clean deletes target/.",
        },
        {
          q: "Which starter class attaches the SQL and rows of every query to the report?",
          options: ["<code>Specs</code>", "<code>Personas</code>", "<code>Config</code>", "<code>Db</code>"],
          answer: 3,
          explain: "Each Db call is an Allure step with the SQL, parameters and result attached.",
        },
        {
          q: "Why open the report with <code>mvn allure:serve</code> instead of double-clicking index.html?",
          options: ["It is faster", "Double-click deletes the history", "Browsers block the report's data files when opened straight from disk", "index.html is not generated"],
          answer: 2,
          explain: "The report loads JSON files with requests; file:// URLs are blocked by most browsers.",
        },
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
<thead><tr><th>Cause</th><th>Example</th><th>Fix (and where the starter already does it)</th></tr></thead>
<tbody>
<tr><td>Timing in the UI</td><td>Reading the confirmation during the 1–3 s "Processing" state; toast gone after 4 s</td><td>Explicit waits for the exact condition; no <code>Thread.sleep</code> (implicit wait is 0, page objects wait in <code>BasePage.visible</code>)</td></tr>
<tr><td>Shared or leftover data</td><td>Emma's daily e-Transfer limit used up by an earlier test; a teammate moving Sophie's money while your balance check runs</td><td>Each test creates or isolates its data; assert on rows scoped by reference rather than on totals</td></tr>
<tr><td>Order dependence</td><td>Test B relies on the payee test A created</td><td>Independent setup; the starter runs methods and classes in random order</td></tr>
<tr><td>Time and dates</td><td>"Today" computed in UTC on your PC but Toronto in Ice Bank; tests near midnight</td><td>Use the sandbox clock (<code>GET /test/clock</code> or <code>app_now()</code>), Toronto time, fixed dates</td></tr>
<tr><td>Unordered results</td><td>Asserting the first item of a list without a sort</td><td>Sort explicitly or find by id</td></tr>
<tr><td>Expired state</td><td>Access token cached for more than 15 minutes; OTP older than 5 minutes</td><td><code>AuthClient.accessToken</code> signs in again a minute before expiry; always read the newest OTP</td></tr>
<tr><td>Rate limits</td><td>Signing in more than 10 times a minute → 429</td><td>Token cache per persona; <code>AuthClient</code> waits for <code>Retry-After</code> (at most twice); <code>PERF_MODE=true</code> locally only for JMeter</td></tr>
<tr><td>Concurrent sign-in</td><td>Someone signs the same persona in at the same moment; the newest OTP in Ice Mail is theirs</td><td><code>AuthClient.signIn</code> starts over once on <code>OTP_INVALID</code></td></tr>
<tr><td>Parallel runs</td><td>Two tests transfer from account 14 at once and both assert its balance</td><td>Separate accounts per parallel thread, or run that class in <code>SAME_THREAD</code></td></tr>
</tbody></table></div>

<h3>Retries: a bandage, used carefully</h3>
<p>Retrying failed tests (Surefire's <code>rerunFailingTestsCount</code>, TestNG's <code>IRetryAnalyzer</code>, JUnit Pioneer's <code>@RetryingTest</code>) can keep a pipeline usable
while you fix a known environment hiccup. Rules: retries are visible in the report (Surefire and Allure mark them flaky), limited to 1 or 2, never used on tests that move money twice, and every
retried test gets a ticket. A test that only passes on retry is a test that is failing.</p>

<h3>Investigating</h3>
<p>Run the single test 20 times (<code>@RepeatedTest(20)</code> or a loop), with throttling, in random order, and in parallel. Compare the logs of a passing and a failing run line by line,
especially timestamps and <code>X-Request-Id</code>s. To replay one random order exactly, fix the seed: <code>-Djunit.jupiter.execution.order.random.seed=42</code> gives the
same order every run, so you can switch between "fails" and "passes" by changing only the code.</p>

<h3>Worked example: a balance check that fails once in thirty runs</h3>
<p><code>TransfersApiTest</code> reads Sophie's chequing balance, transfers $1.00, and asserts the balance dropped by exactly $1.00. On your own machine it never fails. On a shared
sandbox, a teammate's run of the same test can land between your "read before" and "read after", and your delta is off by a dollar. The log shows two transfers on account 14 within the
same second with different <code>X-Request-Id</code>s. The cause is shared data, not timing, so a retry would only hide it. Fixes, in order of preference: assert what is scoped to your
action (the two legs by <code>referenceId</code> and the debit leg's own <code>balance_after</code>), use a customer only your run touches, or do not run the suite twice against
one sandbox at the same time.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Adding <code>Thread.sleep(2000)</code> "until it passes". It slows every run and fails on a slower machine anyway.</li>
<li>Turning on retries for the whole suite. Real bugs that fail intermittently (a race in the app) disappear from the report.</li>
<li>Retrying a test that transferred money: the first attempt's transfer is not undone, so the retry starts from different data.</li>
<li>Calling a test "flaky" without a theory. Write the suspected cause from the table, then prove or disprove it.</li>
<li>Assuming the random order is the problem and switching it off. It only revealed a dependency that was already there.</li>
</ul></div>`,
      examples: [
        {
          title: "Reproduce a flaky test on purpose",
          lang: "java",
          code: `
@RepeatedTest(value = 20, name = "run {currentRepetition}/{totalRepetitions}")
@DisplayName("Emma signs in and the dashboard shows her chequing balance")
void emmaSignsInAndSeesChequingBalance(WebDriver driver) {
    DashboardPage dashboard = new LoginPage(driver).open()
            .signIn(Personas.EMMA, Personas.password())
            .enterCode(InboxClient.latestOtp(Personas.EMMA));
    assertThat(dashboard.balanceText("chequing")).matches("-?\\\\$\\\\d{1,3}(,\\\\d{3})*\\\\.\\\\d{2}");   // waits inside the page object
}`,
          note: "In a class with <code>@ExtendWith(DriverExtension.class)</code>: each repetition gets its own Chrome. Twenty sign-ins in a few minutes stay under the rate limit only because each takes a few seconds; watch the log for 429.",
        },
        {
          title: "Replay one random order exactly",
          lang: "bash",
          code: `
mvn test -Dtest=DbSmokeTest -Djunit.jupiter.execution.order.random.seed=42   # same order every time
mvn test -Dtest=DbSmokeTest                                                    # a new random order each run`,
          note: "The seed applies to both random orderers configured in <code>junit-platform.properties</code> (methods and classes). Checked: with seed 42 three runs gave the same method order; without it, two runs gave two different orders.",
        },
        {
          title: "Surefire: one rerun, reported as flaky (stopgap only)",
          lang: "xml",
          code: `
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-surefire-plugin</artifactId>
  <version>\${surefire.version}</version>
  <configuration>
    <rerunFailingTestsCount>1</rerunFailingTestsCount>
    <!-- keep the starter's argLine, excludedGroups and systemPropertyVariables here too -->
  </configuration>
</plugin>`,
        },
        {
          title: "The starter's token cache (excerpt of api/AuthClient.java)",
          lang: "java",
          code: `
/** A valid access token for email, signing in only when there is no cached token or it expires within a minute. Thread-safe. */
public static String accessToken(String email) {
    CachedToken cached = CACHE.get(key(email));
    if (cached == null || Instant.now().isAfter(cached.expiresAt().minusSeconds(60))) {
        synchronized (AuthClient.class) {
            cached = CACHE.get(key(email));
            if (cached == null || Instant.now().isAfter(cached.expiresAt().minusSeconds(60))) {
                signIn(email);
                cached = CACHE.get(key(email));
            }
        }
    }
    return cached.tokens().accessToken();
}`,
          note: "<code>Specs.as(email)</code> calls this, so the whole suite signs each persona in once per 14 minutes. Tests about the login itself call <code>AuthClient.signIn</code> or the raw <code>login</code>/<code>verifyMfa</code> methods.",
        },
      ],
      exercises: [
        "Run your whole suite five times in a row on local and list every test that failed at least once. For each, write the suspected cause from the table above.",
        "Take one UI test and run it 20 times with <code>@RepeatedTest</code> under network throttling. Fix the waits until all 20 pass.",
        "Add a token cache so the suite signs in each persona at most once per 14 minutes. Check in the logs that you never hit <code>429 RATE_LIMITED</code>.",
        "Write the team rule for retries (when allowed, how many, how reported) into the framework README.",
        "Fix the random order with <code>-Djunit.jupiter.execution.order.random.seed=&lt;n&gt;</code>: run one test class three times with the same seed and twice without, and record the method order each time (from <code>target/surefire-reports/TEST-*.xml</code>).",
      ],
      quiz: [
        {
          q: "A test passes on retry. What does that tell you?",
          options: ["It is fixed", "It is failing intermittently and needs a ticket and a root cause", "The retry setting works, nothing else", "The app is down"],
          answer: 1,
          explain: "A test that only passes on retry is a failing test with a hidden cause.",
        },
        {
          q: "Your transfer test's balance delta is off by exactly $1.00 once in thirty runs on a shared sandbox. Most likely cause?",
          options: ["Another run transferred on the same account between your two reads", "Rounding in BigDecimal", "The token expired", "The random order"],
          answer: 0,
          explain: "Shared data. Assert on rows scoped to your reference, or use data only your run touches.",
        },
        {
          q: "How do you reproduce one specific random test order?",
          options: ["Run it until it happens again", "Use <code>@Order</code> on every test", "Remove the random orderer", "Set <code>junit.jupiter.execution.order.random.seed</code>"],
          answer: 3,
          explain: "A fixed seed gives the same order every run.",
        },
        {
          q: "Why does the starter not hit the sign-in rate limit even with dozens of API tests?",
          options: ["The limit is off locally", "Tests share one browser", "<code>AuthClient.accessToken</code> caches one token per persona until shortly before it expires", "REST Assured retries silently"],
          answer: 2,
          explain: "One sign-in per persona per run (about 14 minutes), plus a Retry-After wait if a 429 still happens.",
        },
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
<li><strong>Classes</strong> by feature and layer: <code>&lt;Feature&gt;&lt;Layer&gt;Test</code>, as in the starter: <code>TransfersApiTest</code>, <code>DbSmokeTest</code>, <code>LoginUiTest</code>.</li>
<li><strong>Methods</strong> describe behaviour: <em>condition → result</em>. Pick one style as a team, e.g. <code>threeDecimalAmountIsRejected</code> or
<code>transfer_threeDecimals_isRejected</code> (the starter's <code>junit-platform.properties</code> turns underscores into spaces in reports).</li>
<li>Add <code>@DisplayName("…")</code> for a readable sentence in reports (JUnit 5), or <code>@Test(description = "…")</code> in TestNG. Every starter class and test has one.</li>
<li>Use the persona and the rule, not implementation details: "frozen account cannot send" beats "account 10 returns 422".</li>
<li>Parameterised tests get a name template: <code>@ParameterizedTest(name = "account {0} matches schemas/account.json")</code>.</li>
</ul>

<h3>Tagging: the starter's tags</h3>
<div class="table-wrap"><table>
<thead><tr><th>Tag</th><th>Meaning</th><th>Default run</th></tr></thead>
<tbody>
<tr><td><code>api</code></td><td>Talks to the REST API</td><td>runs</td></tr>
<tr><td><code>db</code></td><td>Reads the database over JDBC (<code>qa_reader</code>)</td><td>runs</td></tr>
<tr><td><code>writer</code></td><td>Needs <code>qa_writer</code>; skipped automatically (assumption) when no writer is configured, as on QA</td><td>runs locally, skips on QA</td></tr>
<tr><td><code>ui</code></td><td>Opens Chrome</td><td>runs</td></tr>
<tr><td><code>destructive</code></td><td>Resets the sandbox or moves its clock</td><td><strong>excluded</strong> by the pom (<code>&lt;excludedGroups&gt;destructive&lt;/excludedGroups&gt;</code>)</td></tr>
</tbody></table></div>
<p>A test can carry several tags (<code>TransfersApiTest</code> is <code>api</code> and <code>db</code>). Feature tags (<code>transfers</code>, <code>etransfer</code>, <code>auth</code>, ...) are a
useful addition; keep the list in the README so nobody invents <code>etransfers</code> next to <code>etransfer</code>. Tests that would use up a persona's limits do not need a tag:
they need their own data (a new customer).</p>
<p>JUnit 5: <code>@Tag("db")</code>; run with <code>mvn test -Dgroups=db</code>; tag expressions such as <code>-Dgroups="api &amp; !ui"</code> work. Because the pom already excludes
<code>destructive</code>, running those tests needs <em>both</em> <code>-Dgroups=destructive</code> and an empty <code>-DexcludedGroups=</code>. TestNG: <code>@Test(groups = {"api", "db"})</code> and
<code>-Dgroups=api</code>. Composed annotations (<code>@DbWriterTest</code>) make tags impossible to misspell.</p>

<h3>Worked example: tagging three tests</h3>
<ul>
<li>The capstone (transfer through the API, check the DB, look in the browser): <code>api</code>, <code>db</code>, <code>ui</code>. It runs in the default run and on QA.</li>
<li>A constraint test that writes as <code>qa_writer</code> inside a rolled-back transaction: <code>db</code>, <code>writer</code>, plus <code>assumeTrue(Config.hasDbWriter())</code>.
<code>-Dgroups="db &amp; !writer"</code> is then exactly the QA-safe database subset.</li>
<li>An e-Transfer expiry test that moves the clock 31 days: <code>api</code>, <code>db</code>, <code>destructive</code>. It never runs by accident.</li>
</ul>
<p>Check the result without running anything: JUnit's <strong>dry run</strong> (<code>-Djunit.platform.execution.dryRun.enabled=true</code>) reports every selected test as skipped and
executes nothing, not even <code>@BeforeEach</code>. With the starter, <code>mvn test -Dgroups="db &amp; !writer"</code> in a dry run selects 3 of the 6 <code>DbSmokeTest</code>
methods plus the DB checks in <code>TransfersApiTest</code>.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>A misspelt tag (<code>@Tag("destrutive")</code>): no error, and the test runs in the default run, resetting everyone's sandbox. Composed annotations prevent it.</li>
<li><code>mvn test -Dgroups=destructive</code> and "No tests to run": the pom's <code>excludedGroups</code> still removes them. Add <code>-DexcludedGroups=</code>.</li>
<li>PowerShell eating the expression: quote it, <code>mvn test "-Dgroups=api &amp; !ui"</code>.</li>
<li>Names that describe the code (<code>testTransferEndpoint2</code>) instead of the rule. In a report of 200 tests they say nothing.</li>
<li>Tagging only the class and forgetting a method that needs <code>writer</code> inside an otherwise read-only class. Tag the method too (tags add up).</li>
</ul></div>`,
      examples: [
        {
          title: "Composed annotations (JUnit 5)",
          lang: "java",
          code: `
/** A database test that needs qa_writer (local only). Combine with assumeTrue(Config.hasDbWriter()). */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Tag("db") @Tag("writer")
@Test
public @interface DbWriterTest {}

/** Resets the sandbox or moves its clock: excluded by default, never in parallel. */
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Tag("destructive")
@Execution(ExecutionMode.SAME_THREAD)
public @interface Destructive {}`,
        },
        {
          title: "Names and tags in practice (from the starter)",
          lang: "java",
          code: `
@Tag("api")
@Tag("db")
@Feature("Transfers")
@DisplayName("Transfers between own accounts")
class TransfersApiTest {

    @Test
    @DisplayName("A $1.00 transfer posts a DEBIT and a CREDIT leg; transferring it back restores both balances")
    void transferPostsTwoLegsAndReverseRestoresBalances() { /* ... */ }

    @Test
    @DisplayName("Same Idempotency-Key + same body replays the first transfer; a different body is 409")
    void idempotentReplayDoesNotMoveMoneyTwice() { /* ... */ }

    @Test
    @DisplayName("An amount with 3 decimals is rejected (400), never rounded")
    void threeDecimalAmountIsRejected() { /* ... */ }
}`,
        },
        {
          title: "Running subsets",
          lang: "bash",
          code: `
mvn test                                         # everything except destructive, -Denv=local
mvn test -Dgroups=api -Denv=qa
mvn test -Dgroups="db & !writer" -Denv=qa        # the QA-safe database tests
mvn test -Dgroups="api & !ui"
mvn test -Dgroups=destructive -DexcludedGroups=  # only reset/clock tests: your own sandbox!
mvn test -Dtest=TransfersApiTest
mvn test -Dtest="TransfersApiTest#idempotent*"
mvn test -Dgroups="db & !writer" -Djunit.platform.execution.dryRun.enabled=true   # list, run nothing`,
          note: "PowerShell: quote every <code>-D</code> flag. Git Bash and cmd.exe only need quotes around values with spaces or <code>&amp;</code>.",
        },
      ],
      exercises: [
        "Agree on a method naming style and rename every test in your framework to follow it. Add <code>@DisplayName</code> to each.",
        "Define the tag set for your framework (write it in the README) and create at least two composed annotations.",
        "Tag every test and show that <code>-Dgroups=smoke</code>, <code>-Dgroups=\"api &amp; transfers\"</code> and <code>-DexcludedGroups=\"clock | writer\"</code> each run exactly the tests you expect.",
        "Read your last Allure report as if you were the instructor: could you tell from the names alone which business rule each failure broke? Rename until you can.",
        "With the JUnit dry run, list what <code>-Dgroups=\"db &amp; !writer\"</code>, plain <code>mvn test</code> and <code>-Dgroups=destructive -DexcludedGroups=</code> select in your project. Confirm that no destructive class appears in the first two and paste the three Surefire summaries.",
      ],
      quiz: [
        {
          q: "<code>mvn test -Dgroups=destructive</code> runs no tests in the starter. Why?",
          options: ["There are no destructive tests", "The pom's excludedGroups still excludes destructive; add <code>-DexcludedGroups=</code>", "Tags are case-sensitive", "Destructive tests need -Denv=qa"],
          answer: 1,
          explain: "groups selects, excludedGroups removes; the default exclusion has to be cleared explicitly.",
        },
        {
          q: "Which tag expression selects the database tests that can run on QA?",
          options: ["<code>db &amp; !writer</code>", "<code>db</code>", "<code>db | writer</code>", "<code>!api</code>"],
          answer: 0,
          explain: "QA has no qa_writer; writer tests would only be skipped there anyway.",
        },
        {
          q: "What does a misspelt <code>@Tag(\"destrutive\")</code> do?",
          options: ["Compilation fails", "Surefire fails the build", "JUnit warns and skips it", "Nothing visible: the test is not excluded and runs in the default run"],
          answer: 3,
          explain: "Tags are free text. Composed annotations such as @Destructive make the typo impossible.",
        },
        {
          q: "How can you see which tests a tag expression selects without touching Ice Bank?",
          options: ["Comment out the tests", "<code>-DskipTests</code>", "<code>-Djunit.platform.execution.dryRun.enabled=true</code>", "Run with -Denv=qa"],
          answer: 2,
          explain: "A dry run reports the selected tests as skipped and executes nothing, lifecycle methods included.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "readme",
      title: "Writing a framework README",
      summary: "The page that gets a new teammate from clone to green tests in fifteen minutes.",
      body: `
<p>The README is the framework's front door. A good one answers, in order: what is this, how do I run it, how do I configure it, how is it organised, how do we work on it. Test it the only
way that counts: give it to someone who has never seen the repo and watch where they get stuck. <code>starter/README.md</code> is a worked model: read it with the list below
next to it.</p>

<h3>Sections that matter (and where the starter covers them)</h3>
<ol>
<li><strong>What it is</strong>: one paragraph. "API, DB and UI tests for Ice Bank, runnable against the local clean build and the hosted QA build." (starter intro)</li>
<li><strong>Prerequisites</strong>: Java version, Maven, Chrome, Ice Bank running locally (<code>npm run dev</code>, health URL), IDE import steps. (section 1)</li>
<li><strong>Quick start / running</strong>: copy-paste commands from clone to a green run, tags, single classes, PowerShell quoting, the Allure report. (section 2)</li>
<li><strong>Configuration</strong>: <code>-Denv=local|qa</code>, every key, which values are secret, the override order and the git-ignored local file. (section 3)</li>
<li><strong>Project structure</strong>: the package tree with one line per class or package, and the rules the code follows. (section 4)</li>
<li><strong>The tricky parts</strong>: whatever surprises newcomers. For Ice Bank, the OTP sign-in and the rate limit. (section 5)</li>
<li><strong>Test data</strong>: personas used, which ones may be written, reset behaviour, clock-dependent tests, what not to run on shared environments. (section 6)</li>
<li><strong>Conventions</strong>: naming, tagging, a checklist for a new test, branches, commits, PR rules, Definition of Done. (section 8; add your team's Git rules)</li>
<li><strong>Troubleshooting</strong>: the errors everyone hits, with the exact message and the fix. (section 9)</li>
</ol>

<h3>Style</h3>
<p>Copy-pasteable commands in code blocks. Short sentences. Tables for keys and tags. Keep it up to date in the same PR that changes the behaviour (that is in your Definition of Done). Link to
Ice Bank's own README and Swagger instead of duplicating them.</p>

<h3>Worked example: fixing a weak README</h3>
<p>A team's first README says: <em>"Run the tests with mvn test. For QA, set the config."</em> Walk it as a newcomer. Which config? (Name the file and the keys.) Where do the values come
from? (The instructor; they are secret, so not in Git.) What does "set" mean on Windows? (Show the PowerShell form.) What if it fails with
<em>Config key 'baseUrl' for env 'qa' is still a placeholder</em>? (Troubleshooting entry.) Which tests should I <em>not</em> run on QA? (Tags.) Each question becomes a sentence or a
table row; the result looks like the starter's section 3. The README grew by twenty lines and the next newcomer asks nothing.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Commands nobody ran: a typo in the very first command costs every reader ten minutes. Run each one before you commit the README.</li>
<li>Secrets as examples ("e.g. <code>sandboxKey=8f3c...</code>" with a real key). Use <code>CHANGE_ME</code> or <code>your-personal-key</code>.</li>
<li>Describing the code instead of how to use it. The package tree needs one line per package, not a page.</li>
<li>Letting it rot: a renamed config key that is still old in the README is worse than no README.</li>
<li>Only Git Bash commands, when half the team uses PowerShell.</li>
</ul></div>`,
      examples: [
        {
          title: "README skeleton (modelled on starter/README.md)",
          lang: "markdown",
          code: `
# icebank-tests

API (REST Assured), DB (JDBC) and UI (Selenium) tests for Ice Bank.
Same suite runs against local (clean build, must be green) and QA (planted bugs).
The default run is safe on a shared sandbox: it never resets data or moves the clock.

## 1. Prerequisites
- JDK 17 or 21, Maven 3.9+, Chrome
- Ice Bank running locally: \`npm run dev\` in the Ice Bank repo, then
  http://localhost:3000/api/v1/test/health shows "UP"

## 2. Run the tests
    mvn test                                  # everything except destructive, against local
    mvn test -Dgroups=api                     # also: db, ui, writer
    mvn test -Dtest=TransfersApiTest
    mvn test -Denv=qa                         # see section 3 first
    mvn allure:serve                          # report
PowerShell: quote every -D flag:  mvn test "-Denv=qa"

| Tag | Meaning |
|-----|---------|
| api / db / ui | layer |
| writer | needs qa_writer; skipped on QA |
| destructive | resets or moves the clock; excluded by default; own sandbox only |

## 3. Environments
config/{env}.properties; override order: -Dkey > ICEBANK_UPPER_SNAKE > config/{env}.local.properties > file.
qa.properties holds CHANGE_ME placeholders; put real values in config/qa.local.properties (git-ignored)
or ICEBANK_SANDBOX_KEY, ICEBANK_DB_PASSWORD, ...

## 4. Project map
config/ api/ model/ db/ ui/ support/ tests/  (one line each)

## 5. Test data
Read personas; write with Sophie (tiny amounts, moved back) or a new customer.
DB writes only inside rolled-back transactions. Reset and clock only in destructive tests.

## 6. How we work
Naming, tags, branches, commits, PR template, Definition of Done

## 7. Troubleshooting
- Connection refused on 3000/5433 -> Ice Bank is not running (npm run dev)
- Config key '...' is still a placeholder -> you ran -Denv=qa without real values (section 3)
- 429 Too Many Requests on sign-in -> more than 10 sign-ins a minute; wait, AuthClient retries twice
- Allure @Steps missing -> run through Maven (AspectJ agent), or add -javaagent in the IDE`,
        },
      ],
      exercises: [
        "Write your framework's README using the skeleton, with real commands that you have run on Ice Bank local.",
        "Do a \"fresh clone test\": one teammate follows only the README on a clean folder (and ideally a different PC) and gets the smoke suite green on local. Fix every step where they needed help.",
        "Add a Troubleshooting entry for every problem anyone on the team hit during the three weeks, with its fix.",
        "Compare your README with <code>starter/README.md</code> section by section. List three things the starter documents that yours does not (or does worse), and fix the one a newcomer would hit first.",
      ],
      quiz: [
        {
          q: "What is the only real test of a README?",
          options: ["A spell checker", "Someone who has never seen the repo follows it and gets green tests", "The instructor reads it", "It renders on GitHub"],
          answer: 1,
          explain: "Watch where a newcomer gets stuck; each stop is a missing sentence.",
        },
        {
          q: "When should the README change?",
          options: ["In the same PR that changes the behaviour it describes", "At the end of the project", "Once a week", "Only when someone complains"],
          answer: 0,
          explain: "Put it in your Definition of Done so it never drifts from the code.",
        },
        {
          q: "Which example value is safe in a README?",
          options: ["Your real QA sandbox key, shortened", "The QA database password", "A recent access token", "<code>CHANGE_ME</code>"],
          answer: 3,
          explain: "Placeholders only. Even a shortened real key leaks part of a secret.",
        },
      ],
    },
  ],
});
