# Ice Bank starter test project

API (REST Assured), database (JDBC) and UI (Selenium) tests for [Ice Bank](../README.md), in one small Maven project.
It is the starting point for Tutorials 7 to 10: each lesson adds tests and helpers to this project.

- Java 17+, JUnit 5, REST Assured 5, Selenium 4, PostgreSQL JDBC, AssertJ, Allure 2, SLF4J + Logback
- The same suite runs against your local Ice Bank (`-Denv=local`, the default) and the hosted QA build (`-Denv=qa`)
- The default run is safe on a shared sandbox: it never resets the data or moves the clock

## 1. Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| JDK | 17 or 21 (Temurin, Microsoft or Oracle builds are all fine) | `java -version` |
| Maven | 3.9 or newer | `mvn -v` |
| Google Chrome | current | Chrome menu, Help, About |
| Ice Bank | running locally | open http://localhost:3000/api/v1/test/health and see `"status":"UP"` |

Start Ice Bank from the repository root with `npm run dev` (see the main README). The tests also connect to its database on port 5433.

You do **not** need to install chromedriver: Selenium Manager (part of Selenium) downloads the right one the first time a UI test runs.
That needs internet access once; see [Troubleshooting](#9-troubleshooting) if you are offline or behind a strict proxy.

**IntelliJ IDEA** (Community is enough):
1. *File, Open*, pick the `starter` folder (the one with `pom.xml`), and choose *Open as Project*. IntelliJ imports it as a Maven project.
2. *File, Project Structure, Project*: set the SDK to your JDK 17 or 21.
3. Run a test with the green arrow next to the class or method. To pass flags such as `-Denv=qa`, edit the run configuration and add them to *VM options*.
4. The Maven tool window (right edge) has *Lifecycle, test* and *Plugins, allure* if you prefer clicking to typing.

## 2. Run the tests

All commands run in the `starter` folder.

```bash
mvn test                                  # everything except @Tag("destructive"), against local
mvn test -Dgroups=api                     # only API tests (also: db, ui, writer)
mvn test -Dgroups="api & !ui"             # tag expressions work too
mvn test -Dtest=AccountsApiTest           # one class
mvn test -Dtest="AccountsApiTest#emma*"   # matching methods of one class
mvn test -Dheadless=true                  # Chrome without a window
mvn test -Denv=qa                         # against QA (see section 3 first)
```

**Windows PowerShell** splits `-Dname=value` at the dot or equals sign unless you quote it. Quote every `-D` flag:

```powershell
mvn test "-Denv=qa"
mvn test "-Dgroups=api" "-Dheadless=true"
mvn test "-Dgroups=destructive" "-DexcludedGroups="
```

Command Prompt (cmd.exe) and Git Bash do not need the quotes (except around values with spaces or `&`).

**Tags** used in this project:

| Tag | Meaning |
| --- | --- |
| `api` | Talks to the REST API |
| `db` | Reads the database over JDBC (`qa_reader`) |
| `writer` | Needs `qa_writer`; skipped automatically when no writer is configured (QA) |
| `ui` | Opens Chrome |
| `destructive` | Resets the sandbox or moves its clock. **Excluded by default.** Run them only on a sandbox that is yours alone: `mvn test -Dgroups=destructive -DexcludedGroups=` |

Test methods and classes run in a **random order** (see `src/test/resources/junit-platform.properties`), so a test that secretly depends on another one shows up quickly.

### Allure report

Every run writes results to `target/allure-results`. Then:

```bash
mvn allure:serve      # builds the report in a temporary folder and opens it in your browser
mvn allure:report     # writes target/site/allure-maven-plugin/index.html
```

The plugin downloads the Allure command-line tool the first time. Open the generated `index.html` through `allure:serve` (or any local web server):
browsers block the report's data files when it is opened straight from disk. Each test shows its steps (`@Step` methods), every HTTP request and
response, the SQL it ran with the rows it got back, and for failed UI tests a screenshot and the page source. `mvn clean` deletes old results.

## 3. Environments (`-Denv=local` or `-Denv=qa`)

Settings live in `src/test/resources/config/{env}.properties`:

| Key | local | Notes |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3000` | the API is `baseUrl` + `/api/v1` |
| `sandboxId` | `1` | your sandbox on QA |
| `sandboxKey` | `ICEBANK-LOCAL-KEY` | header `X-Sandbox-Key`. **Secret on QA** |
| `emailSuffix` | empty | e.g. `+s3` on QA: `emma.tremblay+s3@icebank.test` |
| `personaPassword` | `IceBank#2026` | |
| `jdbcUrl` | `jdbc:postgresql://localhost:5433/icebank` | |
| `dbUser` / `dbPassword` | `qa_reader` / `qa_reader` | read-only. **Password secret on QA** |
| `dbWriterUser` / `dbWriterPassword` | `qa_writer` / `qa_writer` | empty on QA: `writer` tests are skipped |
| `headless` | `false` | `true` runs Chrome without a window |
| `uiTimeoutSeconds` | `10` | longest explicit wait |

`qa.properties` is committed with `CHANGE_ME` placeholders only. A run that reaches a placeholder stops with a message naming the key.
Provide the real QA values in one of these ways (highest priority first):

1. **System property:** `mvn test -Denv=qa -DbaseUrl=https://...`
2. **Environment variable:** `ICEBANK_` plus the key in upper snake case: `ICEBANK_SANDBOX_KEY`, `ICEBANK_DB_PASSWORD`, `ICEBANK_BASE_URL`, ...
   ```bash
   export ICEBANK_SANDBOX_KEY='paste-your-key'          # Git Bash / macOS / Linux
   $env:ICEBANK_SANDBOX_KEY = 'paste-your-key'          # PowerShell
   ```
3. **A personal file** `src/test/resources/config/qa.local.properties` with just the lines you need. `*.local.properties` is in `.gitignore`, so it never gets committed.

Before every commit, run `git status` and make sure no `*.local.properties` file and no real key appears.

## 4. Project map

```
starter/
  pom.xml                        dependencies, surefire (tags, -Denv, Allure agent), allure-maven
  .gitignore                     target/, allure-results/, *.local.properties
  src/test/resources/
    config/local.properties      local values (not secret)
    config/qa.properties         QA placeholders only
    schemas/account.json         JSON schema for one account (draft-04, used by REST Assured)
    logback-test.xml             console INFO, target/logs/tests.log DEBUG
    allure.properties            results folder when running from the IDE
    junit-platform.properties    random test order, display names
  src/test/java/com/icebank/
    config/   Config             -Denv, properties files, overrides, fail-fast
    api/      Specs              shared RequestSpecifications (base, as(email), withToken, sandbox)
              RequestIdFilter    adds X-Request-Id to every call
              ApiLogFilter       one log line per call, error bodies at DEBUG, no headers
              AuthClient         login -> OTP from Ice Mail -> verify; token cache
              InboxClient        Ice Mail through the sandbox key
              TestSupportClient  health, clock, reset (reset/clock are destructive)
              AccountsClient     /accounts, /accounts/{id}, transactions
              TransfersClient    /transfers with Idempotency-Key helpers
    model/    Account, Transaction, Page<T>, Transfer, TransferRequest, Problem, Tokens, InboxMessage
              (records, money as BigDecimal, dates as OffsetDateTime)
    db/       Db                 JDBC helper: queryList, queryOne, scalar, update, callPostTransfer, inRolledBackTransaction
    ui/       DriverFactory      Chrome (headless option, implicit wait 0), explicit waits
              DriverExtension    JUnit extension: a Chrome per test, screenshot on failure, always quits
              pages/             BasePage, LoginPage, OtpPage, DashboardPage (data-testid locators)
    support/  Personas           persona emails (suffix applied) and fixed ids
              TestData           money helpers, UI money format, unique names
              Json               the shared Jackson ObjectMapper
    tests/
      api/    HealthApiTest, AuthApiTest, AccountsApiTest, TransfersApiTest, TestSupportDestructiveTest
      db/     DbSmokeTest
      ui/     LoginUiTest
```

Rules this project follows (from Tutorial 6, *Framework hygiene*):
- Tests contain steps and assertions only. No URLs, passwords, raw HTTP setup or `Thread.sleep` in test classes.
- Clients send requests and return the `Response` (or a record); they never assert business results.
- Money is always `BigDecimal`. Compare it with AssertJ's `isEqualByComparingTo("1.00")`.
- UI code uses explicit waits only (implicit wait is 0).
- Each test creates or restores the data it changes and runs alone, in any order, as often as you like.

## 5. How the OTP sign-in works in tests

Ice Bank sign-in has two steps, and the second needs a 6-digit code that is "emailed" to Ice Mail. Tests read the code through the API:

```
POST /api/v1/auth/login        {"email": "...", "password": "IceBank#2026"}   -> {"mfaToken": "...", ...}
GET  /api/v1/inbox?email=...&kind=OTP&size=1    header X-Sandbox-Key         -> content[0].otpCode
POST /api/v1/auth/mfa/verify   {"mfaToken": "...", "code": "123456"}           -> {"accessToken", "refreshToken", ...}
```

In code:

```java
Tokens tokens = AuthClient.signIn(Personas.EMMA);           // the whole flow, fresh
String token  = AuthClient.accessToken(Personas.EMMA);      // cached token (signs in only when needed)
given().spec(Specs.as(Personas.EMMA)).when().get("/accounts");   // the usual way: spec with a cached token
```

- **Rate limit:** sign-in endpoints allow 10 calls per minute per machine. The token cache keeps the whole suite to a handful of sign-ins.
  If you still get a 429, `AuthClient` waits for the `Retry-After` the server sends (at most twice).
- **Access tokens last 15 minutes.** The cache signs in again a minute before expiry.
- **The UI test** types email and password in the browser, then reads the same code with `InboxClient.latestOtp(email)` and types it on the OTP page.

## 6. Test data in this project

- **Read-only use of personas:** `AccountsApiTest` checks Emma's account ids, types and numbers, which the seed fixes. It never asserts a balance, because other tests and people move money.
- **Writes use a background customer:** `TransfersApiTest` and the wrong-password test use Sophie Bouchard (customer 7), whom no tutorial scenario uses, move at most $1.00 and transfer it back. The wrong-password test signs in correctly afterwards so the failed-login counter goes back to 0.
- **DB writes are rolled back:** the `writer` tests in `DbSmokeTest` run inside `Db.inRolledBackTransaction(...)`, or call `post_transfer` with arguments it refuses.
- **No reset in the default run:** `POST /test/reset` and the clock live only in `TestSupportDestructiveTest`.

## 7. Where to go next: Tutorials 7 to 10

Open the tutorial site (`npm run tutorials`, then http://localhost:4000). Each tutorial grows this project:

| Tutorial | Builds on |
| --- | --- |
| **7. REST Assured with Ice Bank** | `Specs`, `AuthClient`, `AccountsClient`, `TransfersClient`, `model/*`, `AccountsApiTest`, `TransfersApiTest` |
| **8. Database testing with JDBC** | `Db`, `DbSmokeTest`, the DB checks in `TransfersApiTest` |
| **9. Selenium against Ice Bank** | `DriverFactory`, `DriverExtension`, `pages/*`, `LoginUiTest` |
| **10. Load testing with JMeter** | the sign-in flow in section 5, `Specs` conventions; JMeter itself runs outside Maven |

## 8. Writing a new test (checklist)

1. Put it in `tests/api`, `tests/db` or `tests/ui`, named `<Feature><Layer>Test`, with `@Tag` and `@DisplayName`.
2. Call a client method (add one to the client if it is missing) instead of building requests in the test.
3. Read data you depend on; create or restore data you change; use Sophie or a new customer for writes.
4. Run it alone, then the whole suite twice: `mvn test && mvn test`.

## 9. Troubleshooting

| Problem | Fix |
| --- | --- |
| `Connection refused` on port 3000 or 5433 | Ice Bank is not running: `npm run dev` in the repository root |
| `Config key '...' is still a placeholder` | You ran `-Denv=qa` without real values: see section 3 |
| `429 Too Many Requests` on sign-in | More than 10 sign-ins in a minute (several runs or tools at once). Wait a minute; `AuthClient` already retries twice |
| `401 ACCOUNT_LOCKED` for a persona | 5 wrong passwords lock a user for 15 minutes. A teller can unlock (user id in the Ice Bank README), or reset your own sandbox |
| UI test: `SessionNotCreatedException`, or Selenium Manager cannot download a driver | No internet or a strict proxy. Install a chromedriver matching your Chrome version (https://googlechromelabs.github.io/chrome-for-testing/) and run `mvn test -Dwebdriver.chrome.driver=C:\tools\chromedriver.exe` (or set `CHROMEDRIVER`) |
| `This version of ChromeDriver only supports Chrome version N` | Driver and Chrome versions differ. Get the matching driver. As a last resort `-Dwebdriver.chrome.disableBuildCheck=true` lets a slightly older driver try anyway |
| Chrome fails to start in Docker / CI as root | Add `-Dheadless=true -DchromeArgs=--no-sandbox,--disable-dev-shm-usage` |
| Allure `@Step`s missing from the report | Run through Maven (`mvn test`), which adds the AspectJ agent. In IntelliJ add the same `-javaagent:...aspectjweaver-<version>.jar` to *VM options* |

The Allure results contain the full responses of the API calls, including the short-lived access tokens returned by sign-in. They are harmless
locally; do not publish reports from QA runs.
