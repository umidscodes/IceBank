/* Tutorial 8: Database testing with JDBC. Every Java example was compiled and run in a copy of starter/ against Ice Bank local
   (tests tagged destructive were compiled only). SQL was run as qa_reader unless the example says qa_writer. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "db-testing",
  number: 8,
  title: "Database testing with JDBC",
  summary: "Prove in the tables what the API claims: JDBC with the starter's Db class, API-to-DB checks, constraints, post_transfer, triggers, views, the sandbox clock, and a capstone across API, UI and DB.",
  intro: `
<p>Tutorial 1 taught you to <em>read</em> the Ice Bank database in SQL. This tutorial turns that into <strong>automated tests</strong> in the starter project
(<code>starter/</code>): JUnit 5 tests that call the API, then open a JDBC connection and prove that the rows, balances, audit entries and views tell the same story.
Week 3 of the plan ends with a capstone: one end-to-end test spanning the API, the browser and the database, with an Allure report.</p>
<div class="callout rule"><p><strong>Where the code goes.</strong> New tests go in <code>src/test/java/com/icebank/tests/db</code> (or <code>tests/e2e</code> for the capstone), named
<code>&lt;Feature&gt;DbTest</code>, tagged <code>@Tag("db")</code> (plus <code>api</code>, <code>ui</code>, <code>writer</code> or <code>destructive</code> when they apply). Reusable
checks go in <code>com.icebank.db.DbChecks</code> (lesson 10). Run one class with <code>mvn test -Dtest=TransferConsistencyDbTest</code>.</p></div>
<div class="callout warn"><p><strong>Shared data rules.</strong> Read the personas, never assume a balance. Write with Sophie (customer 7, accounts 14 and 15) using tiny amounts that you
move back, or with a brand-new customer you register. Database writes as <code>qa_writer</code> happen inside a transaction that is always rolled back. Anything that
resets the sandbox or moves its clock is tagged <code>destructive</code> and runs only on a sandbox that is yours alone.</p></div>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "why",
      title: "Why test the database",
      summary: "The API response proves the contract; the rows prove the behaviour. Four kinds of database test, and where each one fits.",
      body: `
<p>An API test checks what the server <em>said</em>. In a bank that is not enough: the database is the <strong>system of record</strong>. A transfer that answers
<code>201 Created</code> but writes only one leg, moves a balance without a transaction row, or forgets the audit entry is a serious defect, and the JSON response
looks perfect while it happens. Database tests close that gap.</p>

<h3>Four kinds of database test</h3>
<div class="table-wrap"><table>
<thead><tr><th>Kind</th><th>Question it answers</th><th>Ice Bank example</th><th>Lesson</th></tr></thead>
<tbody>
<tr><td><strong>Verification</strong> of an API action</td><td>Did the API write what it claimed, and nothing else?</td><td>After <code>POST /transfers</code>: one <code>transfers</code> row, two legs with the response's ids, the right <code>balance_after</code>, three audit rows</td><td>3</td></tr>
<tr><td><strong>Integrity</strong> (health) checks</td><td>Is the data still internally consistent?</td><td>Every transfer has exactly two legs; no chequing account is below zero. The query returns 0 rows when healthy.</td><td>1, 4</td></tr>
<tr><td><strong>Database object</strong> tests</td><td>Do constraints, triggers, views and functions behave as specified?</td><td><code>post_transfer</code> is all or nothing; <code>trg_transactions_immutable</code> refuses to delete a POSTED row</td><td>4 to 7</td></tr>
<tr><td><strong>Test data</strong> support</td><td>Can tests find, create and clean up what they need?</td><td>Read Sophie's account ids; build a scenario as <code>qa_writer</code> inside a rolled-back transaction</td><td>10</td></tr>
</tbody></table></div>

<h3>Where database tests fit</h3>
<ul>
<li>They are <strong>slower than a SQL query</strong> but much faster than a UI test: a JDBC round trip is a few milliseconds.</li>
<li>They need <strong>two kinds of access</strong>. <code>qa_reader</code> reads everything and changes nothing; it works on local and QA. <code>qa_writer</code> can write
(constraints and triggers still apply) and exists only locally, so tests that need it carry <code>@Tag("writer")</code> and an assumption that skips them on QA.</li>
<li>They test <strong>business rules from README section 5</strong>, not PostgreSQL itself. "A CHECK constraint works" is not a test; "a chequing balance can never go below
$0.00" is.</li>
</ul>

<h3>Worked example: what the starter already proves</h3>
<p>Open <code>tests/api/TransfersApiTest</code>. Its first test reads both of Sophie's balances (<em>read before</em>), sends a $1.00 transfer (<em>act</em>), asserts the
response (<em>contract</em>), then queries <code>transactions</code> by the response's <code>referenceId</code> and checks two legs, their accounts, directions,
status and amount (<em>behaviour</em>). It finishes by transferring the dollar back (<em>restore</em>). That five-step shape is the backbone of every test in this
tutorial: <strong>read before, act, assert the response, assert the rows, restore</strong>.</p>
<p>Now look at <code>tests/db/DbSmokeTest</code>: three tests run as <code>qa_reader</code> (they work on QA too) and three carry <code>@Tag("writer")</code>. Run
<code>mvn test -Dgroups="db &amp; !writer"</code> and you get exactly what would run on QA.</p>

<h3>What not to do</h3>
<p>Do not re-implement the application in SQL (recomputing every fee and interest rule), and do not assert the whole table. Keep each check small, specific, scoped to
the rows <em>your</em> test touched, and tied to one rule.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Asserting a seed balance such as "Emma's chequing is 5703.95". Other tests and people move money; read the value first and assert the <em>difference</em>.</li>
<li>Stopping at the response. A <code>201</code> with the right JSON says nothing about the second leg or the audit row.</li>
<li>Using <code>qa_writer</code> for checks "because it can do more". Read as <code>qa_reader</code>; it cannot change anything by accident.</li>
<li>Writing a health check that returns rows and then asserting the count is "about right". A health check returns <strong>0 rows</strong> when healthy, and each row
it returns is the evidence for a bug report.</li>
<li>Forgetting <code>sandbox_id</code>. Locally there is one sandbox, so the mistake is invisible; on QA it mixes every student's data (lesson 8).</li>
</ul></div>`,
      examples: [
        {
          title: "Run the database tests that exist today",
          lang: "bash",
          code: `
mvn test -Dgroups=db                 # every DB test except destructive ones
mvn test -Dgroups="db & !writer"     # what can run on QA (qa_reader only)
mvn test -Dtest=DbSmokeTest          # one class`,
          note: "PowerShell: quote every flag, for example <code>mvn test \"-Dgroups=db &amp; !writer\"</code>.",
        },
        {
          title: "An integrity health check as a JUnit test (0 rows = healthy)",
          lang: "java",
          code: `
@Tag("db")
@Feature("Data integrity")
@DisplayName("Integrity health checks")
class IntegrityDbTest {

    private final Db db = Db.reader();

    @Test
    @DisplayName("Every transfer has exactly two transaction legs")
    void everyTransferHasTwoLegs() {
        List<Map<String, Object>> broken = db.queryList("""
                SELECT tr.id, tr.reference_id, count(t.id) AS legs
                  FROM transfers tr
                  LEFT JOIN transactions t
                         ON t.sandbox_id = tr.sandbox_id AND t.reference_id = tr.reference_id
                 WHERE tr.sandbox_id = ?
                 GROUP BY tr.id, tr.reference_id
                HAVING count(t.id) <> 2""", Config.sandboxId());

        assertThat(broken).as("transfers without exactly 2 legs (the rows are the bug report)").isEmpty();
    }
}`,
          note: "Read-only, so it runs on QA too. When it fails, AssertJ prints the offending rows and <code>Db</code> attaches the SQL and result to the Allure report.",
        },
        {
          title: "Who can do what (local vs QA)",
          lang: "text",
          code: `
                      qa_reader (local + QA)        qa_writer (local only)
SELECT any table      yes                           yes
UPDATE / INSERT       42501 permission denied       yes (CHECKs and triggers still apply)
post_transfer(...)    42501 permission denied       yes
In tests              Db.reader()                   Db.writer() + @Tag("writer")
                                                    + assumeTrue(Config.hasDbWriter())`,
        },
      ],
      exercises: [
        "Run <code>mvn test -Dgroups=db</code> in the starter. For every test method in <code>DbSmokeTest</code> and the DB parts of <code>TransfersApiTest</code>, write which of the four kinds it is (verification, integrity, database object, test data) and whether it could run on QA.",
        "Pick three rules from README section 5 (for example transfers, e-Transfer limits, cheque deposits). For each, write one sentence on what the API response proves and one on what only a database check can prove.",
        "Write a read-only health check test: no POSTED transaction on a CHEQUING or SAVINGS account has a negative <code>balance_after</code>. Run it on local and confirm it returns 0 rows.",
        "In three sentences, explain to a teammate why the <code>writer</code> tests in <code>DbSmokeTest</code> are skipped on QA instead of failing, and which line of code makes that happen.",
      ],
      quiz: [
        {
          q: "A transfer returns 201 with the right JSON. Which defect can only a database check find?",
          options: ["The amount has three decimals", "The Location header is missing", "The credit leg was never written", "The response took 900 ms"],
          answer: 2,
          explain: "The response looks the same whether one or two legs were written. Only the <code>transactions</code> table shows it.",
        },
        {
          q: "A healthy integrity check should return…",
          options: ["Exactly one row", "Zero rows", "The same number of rows as yesterday", "One row per account"],
          answer: 1,
          explain: "Health checks list impossible rows. Zero rows means healthy; every row returned is evidence for a bug report.",
        },
        {
          q: "Which user should a verification test use to read the rows after an API call?",
          options: ["<code>qa_reader</code>", "<code>qa_writer</code>, because it can see more", "<code>icebank_app</code>", "Whichever is configured first"],
          answer: 0,
          explain: "Both see the same rows. <code>qa_reader</code> cannot change anything by accident and exists on QA too.",
        },
        {
          q: "Why should a test not assert \"Emma's chequing balance is 5703.95\"?",
          options: ["The value is a string in the API", "Balances are hidden from qa_reader", "BigDecimal cannot hold that value", "Other tests and people move money, so the seed value is not stable"],
          answer: 3,
          explain: "Read the balance before you act and assert the difference. Seed values are only true right after a reset.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "jdbc",
      title: "JDBC basics and the starter's Db class",
      summary: "DriverManager, Connection, PreparedStatement, ResultSet and try-with-resources; how SQL types map to Java; and the helper that does it for you.",
      links: [
        { label: "PostgreSQL JDBC driver docs", href: "https://jdbc.postgresql.org/documentation/" },
        { label: "java.sql package (Java 17)", href: "https://docs.oracle.com/en/java/javase/17/docs/api/java.sql/java/sql/package-summary.html" },
      ],
      body: `
<p>JDBC is Java's standard API for relational databases. The PostgreSQL driver (<code>org.postgresql:postgresql</code>, already in the starter's <code>pom.xml</code>)
implements it. You need five pieces, always in this order:</p>
<ol>
<li><strong><code>DriverManager.getConnection(url, user, password)</code></strong> opens a <code>Connection</code> (a network session to the database).</li>
<li><strong><code>connection.prepareStatement(sql)</code></strong> sends SQL with <code>?</code> placeholders; you bind values with <code>setInt</code>, <code>setLong</code>,
<code>setString</code>, <code>setBigDecimal</code> or <code>setObject</code>, numbered from 1.</li>
<li><strong><code>executeQuery()</code></strong> returns a <code>ResultSet</code>, a cursor over the rows. Call <code>next()</code> to move to each row (it returns
<code>false</code> when there are no more), then read columns by label or position.</li>
<li><strong><code>executeUpdate()</code></strong> for INSERT/UPDATE/DELETE returns the number of rows changed.</li>
<li><strong>Close everything</strong>: result set, statement, connection. <code>try (...)</code> with resources closes them in reverse order even when an assertion fails.</li>
</ol>

<h3>SQL types to Java types</h3>
<div class="table-wrap"><table>
<thead><tr><th>PostgreSQL</th><th>Ice Bank columns</th><th>Read with</th><th>Java type</th></tr></thead>
<tbody>
<tr><td><code>NUMERIC(14,2)</code></td><td><code>balance</code>, <code>amount</code>, <code>balance_after</code></td><td><code>getBigDecimal</code></td><td><code>BigDecimal</code>, scale 2. Never <code>getDouble</code>.</td></tr>
<tr><td><code>BIGINT</code> / <code>INT</code></td><td><code>id</code>, <code>account_id</code> / <code>sandbox_id</code></td><td><code>getLong</code> / <code>getInt</code></td><td><code>long</code> / <code>int</code> (NULL becomes 0!)</td></tr>
<tr><td><code>TIMESTAMPTZ</code></td><td><code>created_at</code>, <code>posted_at</code></td><td><code>getObject(col, OffsetDateTime.class)</code></td><td><code>OffsetDateTime</code>, always in UTC from this driver</td></tr>
<tr><td><code>DATE</code></td><td><code>posting_date</code>, <code>processed_through</code></td><td><code>getObject(col, LocalDate.class)</code></td><td><code>LocalDate</code></td></tr>
<tr><td><code>TEXT</code>, <code>BOOLEAN</code></td><td><code>status</code>, <code>autodeposit</code></td><td><code>getString</code>, <code>getBoolean</code></td><td><code>String</code>, <code>boolean</code></td></tr>
<tr><td><code>JSONB</code></td><td><code>audit_log.new_value</code></td><td>extract in SQL: <code>new_value -&gt;&gt; 'amount'</code></td><td><code>String</code> (cast in SQL: <code>(new_value -&gt;&gt; 'amount')::numeric</code>)</td></tr>
</tbody></table></div>

<h3>The starter's <code>Db</code> class</h3>
<p><code>com.icebank.db.Db</code> wraps those five steps so a test is one line. It reads the URL and users from <code>Config</code> (<code>jdbcUrl</code>,
<code>dbUser</code>/<code>dbPassword</code>, <code>dbWriterUser</code>/<code>dbWriterPassword</code>).</p>
<ul>
<li><code>Db.reader()</code> connects as <code>qa_reader</code>; <code>Db.writer()</code> as <code>qa_writer</code> (throws if none is configured, e.g. on QA).</li>
<li><code>queryList(sql, params...)</code> returns <code>List&lt;Map&lt;String, Object&gt;&gt;</code> with column labels as keys; <code>queryOne</code> demands exactly one row;
<code>scalar(Type.class, sql, params...)</code> returns the first column of the single row; <code>update</code> returns rows changed.</li>
<li>Values arrive already typed: <code>numeric</code> as <code>BigDecimal</code>, <code>int8</code> as <code>Long</code>, <code>int4</code> as <code>Integer</code>,
<code>timestamptz</code> as <code>OffsetDateTime</code>, <code>date</code> as <code>LocalDate</code>.</li>
<li>Each call opens and closes <strong>its own connection</strong>, and is an Allure step with the SQL, parameters and rows attached.</li>
<li><code>callPostTransfer(...)</code> and <code>inRolledBackTransaction(work)</code> are for writer tests (lessons 4 and 5).</li>
</ul>

<h3>Worked example: one account row, by hand and with <code>Db</code></h3>
<p>The first example below opens a connection with the values from <code>Config</code> (never literals), binds <code>sandbox_id</code> and the account id as
parameters, and reads four columns. Walk through it: <code>rs.next()</code> must be <code>true</code> once (one row) and then <code>false</code> (only one row);
<code>getBigDecimal("balance")</code> keeps the two decimals (<code>scale() == 2</code>); <code>getObject("opened_at", OffsetDateTime.class)</code> comes back with offset
<code>Z</code> (UTC) even though the API prints the same instant with <code>-05:00</code>. The second example asks the same question through <code>Db</code> in one line
and gets the same types in a map.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Building SQL with <code>+</code>: <code>"... WHERE email = '" + email + "'"</code>. It breaks on <code>O'Brien</code> and is an injection hole. Always <code>?</code>.
(Placeholders are for <em>values</em> only, never table or column names.)</li>
<li><code>rs.getDouble("balance")</code>: <code>0.1 + 0.2</code> is not <code>0.3</code> in binary floating point. Money is <code>BigDecimal</code>, end to end.</li>
<li>Comparing money with <code>equals</code>: <code>new BigDecimal("5.00").equals(new BigDecimal("5"))</code> is <code>false</code> (different scale). Use
<code>compareTo</code> or AssertJ's <code>isEqualByComparingTo</code>.</li>
<li><code>rs.getLong("balance_after")</code> on a PENDING row returns <code>0</code>, not null. Use <code>getObject(col, Long.class)</code> or check <code>wasNull()</code>.</li>
<li>Reading a column before calling <code>rs.next()</code> (<em>"ResultSet not positioned properly"</em>), or forgetting that <code>next()</code> moves the cursor.</li>
<li>Not closing connections. Locally nobody notices; on QA the hosted pooler has a small connection limit and a leaking suite starts failing half-way.</li>
<li>Comparing timestamps as strings (<code>"2026-11-02T09:15-05:00"</code> vs <code>"2026-11-02T14:15Z"</code>). Compare instants with <code>isEqual</code>.</li>
</ul></div>`,
      examples: [
        {
          title: "Plain JDBC: one account row, money as BigDecimal, timestamptz as OffsetDateTime",
          lang: "java",
          code: `
@Tag("db")
@DisplayName("JDBC basics")
class JdbcBasicsDbTest {

    @Test
    @DisplayName("Plain JDBC: one account row, money as BigDecimal, timestamptz as OffsetDateTime")
    void plainJdbcReadsOneAccount() throws SQLException {
        String sql = "SELECT id, type, balance, opened_at FROM accounts WHERE sandbox_id = ? AND id = ?";
        try (Connection c = DriverManager.getConnection(Config.jdbcUrl(), Config.dbUser(), Config.dbPassword());
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, Config.sandboxId());
            ps.setLong(2, Personas.EMMA_CHEQUING);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("one row expected").isTrue();
                long id = rs.getLong("id");
                String type = rs.getString("type");
                BigDecimal balance = rs.getBigDecimal("balance");
                OffsetDateTime openedAt = rs.getObject("opened_at", OffsetDateTime.class);
                assertThat(rs.next()).as("only one row").isFalse();

                assertThat(id).isEqualTo(1L);
                assertThat(type).isEqualTo("CHEQUING");
                assertThat(balance.scale()).isEqualTo(2);                    // NUMERIC(14,2) keeps its 2 decimals
                assertThat(openedAt.getOffset()).isEqualTo(ZoneOffset.UTC);  // the driver hands back UTC
            }
        }
    }
}`,
          note: "Imports are left out of the examples in this tutorial: <code>java.sql.*</code>, <code>java.math.BigDecimal</code>, <code>java.time.*</code>, AssertJ's <code>assertThat</code>, and the starter's <code>Config</code>, <code>Db</code> and <code>Personas</code>. IntelliJ adds them with Alt+Enter.",
        },
        {
          title: "The same question through the starter's Db",
          lang: "java",
          code: `
@Test
@DisplayName("The starter's Db gives the same values in one line")
void starterDbGivesTheSameValues() {
    Db db = Db.reader();
    Map<String, Object> row = db.queryOne(
            "SELECT id, type, balance, opened_at FROM accounts WHERE sandbox_id = ? AND id = ?",
            Config.sandboxId(), Personas.EMMA_CHEQUING);

    assertThat(row.get("id")).isEqualTo(1L);                         // int8 -> Long
    assertThat(row.get("balance")).isInstanceOf(BigDecimal.class);  // numeric -> BigDecimal
    assertThat(row.get("opened_at")).isInstanceOf(OffsetDateTime.class);

    BigDecimal balance = db.scalar(BigDecimal.class,
            "SELECT balance FROM accounts WHERE sandbox_id = ? AND id = ?", Config.sandboxId(), Personas.EMMA_CHEQUING);
    assertThat(balance).isEqualByComparingTo((BigDecimal) row.get("balance"));
}`,
        },
        {
          title: "BigDecimal: equals() looks at the scale, compareTo() at the value",
          lang: "java",
          code: `
@Test
void bigDecimalEqualsVersusCompareTo() {
    BigDecimal fromDb = Db.reader().scalar(BigDecimal.class, "SELECT 5.00::numeric(14,2)");
    assertThat(fromDb.equals(new BigDecimal("5"))).isFalse();     // 5.00 vs 5: different scale
    assertThat(fromDb.compareTo(new BigDecimal("5"))).isZero();   // same amount
    assertThat(fromDb).isEqualByComparingTo("5");                 // AssertJ form
    assertThat(0.1 + 0.2).isNotEqualTo(0.3);                      // why money is never double
}`,
        },
        {
          title: "What Db does for every query (excerpt of starter/src/test/java/com/icebank/db/Db.java)",
          lang: "java",
          code: `
public List<Map<String, Object>> queryList(String sql, Object... params) {
    return Allure.step("SQL (" + user + "): " + oneLine(sql), () -> {
        try (Connection c = connect(); PreparedStatement ps = prepare(c, sql, params); ResultSet rs = ps.executeQuery()) {
            List<Map<String, Object>> rows = readRows(rs);   // column label -> typed value
            attach(sql, params, rows);                       // SQL, params and rows in the Allure report
            return rows;
        }
    });
}`,
          note: "One connection per call keeps tests independent and leak-free. It also means two <code>Db</code> calls never share a transaction: lesson 5 shows why that matters.",
        },
      ],
      exercises: [
        "Without using <code>Db</code>, write a plain-JDBC test that reads Emma's four accounts ordered by id, asserts the types are CHEQUING, SAVINGS, CREDIT, LOAN in that order, and that every balance has scale 2. Open the connection, statement and result set in try-with-resources.",
        "With <code>Db.reader().queryOne(...)</code>, read <code>balance</code> and <code>available_balance</code> of Lucas's chequing (account 12) and assert the available balance is lower. Then prove the difference equals the held amount of his PENDING cheque deposits.",
        "Find out what JDBC returns for SQL NULL. Run <code>SELECT NULL::bigint AS n, NULL::numeric(14,2) AS m</code> and write one assertion each for <code>getLong</code>, <code>wasNull()</code>, <code>getObject(\"n\", Long.class)</code> and <code>getBigDecimal</code>.",
        "Compare Emma's chequing <code>openedAt</code> from <code>GET /accounts/1</code> (use <code>AccountsClient.account</code>) with <code>accounts.opened_at</code>. Write the assertion that passes and explain in one sentence why <code>equals</code> fails.",
        "Add a method <code>public boolean exists(String sql, Object... params)</code> to <code>Db</code> and a test that uses it for an account that exists and one that does not.",
      ],
      quiz: [
        {
          q: "Which getter reads <code>accounts.balance</code> correctly?",
          options: ["<code>rs.getDouble(\"balance\")</code>", "<code>rs.getFloat(\"balance\")</code>", "<code>rs.getBigDecimal(\"balance\")</code>", "<code>rs.getString(\"balance\")</code> then <code>Double.parseDouble</code>"],
          answer: 2,
          explain: "<code>NUMERIC(14,2)</code> maps to <code>BigDecimal</code>. Floating point cannot represent most cent values exactly.",
        },
        {
          q: "<code>rs.getLong(\"balance_after\")</code> on a PENDING transaction (balance_after is NULL) returns…",
          options: ["<code>null</code>", "<code>0</code>", "It throws <code>SQLException</code>", "<code>-1</code>"],
          answer: 1,
          explain: "Primitive getters turn NULL into 0. Use <code>getObject(col, Long.class)</code> or check <code>wasNull()</code> right after.",
        },
        {
          q: "Why does every <code>Db</code> query use <code>?</code> placeholders?",
          options: ["They bind values safely (no quoting bugs, no SQL injection)", "They make queries run in parallel", "They are required for SELECT but not UPDATE", "They let you pass a table name"],
          answer: 0,
          explain: "The driver sends the values separately from the SQL text. Placeholders cannot stand for table or column names.",
        },
        {
          q: "<code>db.scalar(OffsetDateTime.class, \"SELECT opened_at ...\")</code> returns <code>2026-01-15T14:00Z</code>; the API shows <code>2026-01-15T09:00-05:00</code>. What should the test assert?",
          options: ["The strings are equal", "The hours are equal", "<code>dbValue.equals(apiValue)</code>", "<code>dbValue.isEqual(apiValue)</code>"],
          answer: 3,
          explain: "Same instant, different offset. <code>isEqual</code> compares instants; <code>equals</code> also compares the offset.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "api-to-db",
      title: "API-to-DB consistency: a transfer, end to end",
      summary: "Do a transfer through TransfersClient, then prove the transfers row, both legs, balance_after and the audit rows match the response field for field.",
      body: `
<p>The response and the database must tell the same story. For each field the API returns, know which column holds it, and assert both. Then check what the API
does <em>not</em> return but must have happened: the second leg, the running balance on each leg, the audit trail.</p>

<h3>The map for <code>POST /transfers</code></h3>
<div class="table-wrap"><table>
<thead><tr><th>Response field</th><th>Database</th><th>How to compare</th></tr></thead>
<tbody>
<tr><td><code>id</code></td><td><code>transfers.id</code></td><td>find the row by it (scoped by <code>sandbox_id</code>)</td></tr>
<tr><td><code>fromAccountId</code>, <code>toAccountId</code></td><td><code>transfers.from_account_id</code>, <code>to_account_id</code>; the legs' <code>account_id</code></td><td><code>Long</code> equality</td></tr>
<tr><td><code>amount</code> <code>"0.01"</code></td><td><code>transfers.amount</code>, both legs' <code>amount</code></td><td><code>isEqualByComparingTo</code></td></tr>
<tr><td><code>referenceId</code></td><td><code>transfers.reference_id</code> = both legs' <code>reference_id</code></td><td>the key that links everything</td></tr>
<tr><td><code>debitTransactionId</code>, <code>creditTransactionId</code></td><td><code>transactions.id</code> of the DEBIT and CREDIT leg</td><td>exactly these two ids, nothing else</td></tr>
<tr><td><code>createdAt</code> <code>2026-11-02T09:09:32-05:00</code></td><td><code>transfers.created_at</code> <code>2026-11-02 14:09:32.499536+00</code></td><td>same instant; the API prints <strong>whole seconds</strong>, so truncate the DB value first</td></tr>
<tr><td>(not in the response)</td><td>legs' <code>balance_after</code>, <code>accounts.balance</code></td><td>balance before minus/plus the amount</td></tr>
<tr><td>(not in the response)</td><td><code>audit_log</code>: 2 x <code>TRANSACTION_CREATED</code> + 1 x <code>TRANSFER_POSTED</code>, <code>actor_user_id</code> = Sophie's user</td><td>lesson 6 explains where each row comes from</td></tr>
</tbody></table></div>

<h3>Worked example: <code>TransferConsistencyDbTest</code></h3>
<ol>
<li><strong>Find the accounts</strong> through the API (<code>firstOfType</code>), never by hard-coded ids: they are 14 and 15 locally, but you do not want to care.</li>
<li><strong>Read before</strong>: both balances from the database.</li>
<li><strong>Act</strong>: <code>transfers.transfer(...)</code> expects 201 and returns the <code>Transfer</code> record. Everything after it sits in <code>try</code>, and the
<code>finally</code> moves the cent back, so a failed assertion still restores Sophie's balances.</li>
<li><strong>The transfers row</strong>: <code>queryOne</code> by id, then field by field. The timestamp needs care: <code>dbCreated.truncatedTo(ChronoUnit.SECONDS).isEqual(t.createdAt())</code>.
Without the truncation the test fails, because the database keeps microseconds and the API drops them.</li>
<li><strong>The legs</strong>: exactly the two ids from the response (<code>containsExactlyInAnyOrder</code>, so a third leg fails the test), then account, status and type for each.</li>
<li><strong>Balances</strong>: each leg's <code>balance_after</code> is the balance before minus (DEBIT) or plus (CREDIT) the amount, and <code>GET /accounts/{id}</code> agrees with the table.</li>
<li><strong>Audit</strong>: one query finds the rows for both legs and the <code>TRANSFER_POSTED</code> row (by the reference inside its JSON), and every row's actor is
Sophie's <code>user_id</code> (read from <code>customers</code>, not assumed).</li>
</ol>

<h3>Scoping: find exactly the rows your test created</h3>
<ul>
<li>By a <strong>reference</strong> the API returned (<code>referenceId</code>) or an <strong>id</strong> (response body or the <code>Location</code> header).</li>
<li>When there is neither (notifications, audit rows of a sign-in), read <code>max(id)</code> for that user <em>before</em> the action and select <code>id &gt; maxBefore</code> after
it. Runtime ids come from one increasing sequence.</li>
<li>Never "the newest row in the table": someone else may have written one a millisecond later.</li>
</ul>
<p><strong>Shared data caveat.</strong> Balance before/after assertions assume nobody else moves Sophie's money during your test. That holds on your own machine; on a busy
shared sandbox it can flake. The legs, ids and audit rows are scoped by reference and never flake; for balances, use a customer that is yours alone when it matters.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Checking only the DEBIT leg, or only that "two rows exist". Assert which two (the ids in the response), and their accounts.</li>
<li>Comparing <code>createdAt</code> with <code>equals</code> or as strings. Different offset and precision: truncate to seconds and use <code>isEqual</code>.</li>
<li>Putting the clean-up transfer at the end of the test body. When an assertion fails, it never runs and Sophie is one cent poorer. Use <code>try/finally</code> (or the
<code>Cleanup</code> helper from lesson 10).</li>
<li>Asserting the audit <em>count for the whole table</em> went up by 3. Other activity writes audit rows too; select only the rows of your legs and reference.</li>
<li>Assuming Sophie's user id equals her customer id. It does in the seed, not for customers registered at runtime. Read <code>customers.user_id</code>.</li>
</ul></div>`,
      examples: [
        {
          title: "TransferConsistencyDbTest: the response and the database tell the same story",
          lang: "java",
          code: `
@Tag("api")
@Tag("db")
@Feature("Transfers")
@DisplayName("Transfer: the API response and the database tell the same story")
class TransferConsistencyDbTest {

    private static final String LEGS_SQL = """
            SELECT id, account_id, direction, amount, balance_after, status, type, created_at
              FROM transactions
             WHERE sandbox_id = ? AND reference_id = ?
             ORDER BY id""";

    private final AccountsClient accounts = new AccountsClient();
    private final TransfersClient transfers = new TransfersClient();
    private final Db db = Db.reader();

    @Test
    @DisplayName("A $0.01 transfer writes 1 transfers row, 2 legs with the right balance_after and 3 audit rows")
    void transferMatchesTheDatabase() {
        String sophie = Personas.SOPHIE;
        long chequing = accounts.firstOfType(sophie, AccountType.CHEQUING).id();
        long savings = accounts.firstOfType(sophie, AccountType.SAVINGS).id();
        BigDecimal amount = TestData.money("0.01");

        // 1. Read before
        BigDecimal chequingBefore = balance(chequing);
        BigDecimal savingsBefore = balance(savings);

        // 2. Act through the API
        Transfer t = Allure.step("Transfer $0.01 chequing -> savings", () -> transfers.transfer(sophie, chequing, savings, amount));
        try {
            // 3. The transfers row matches the response field for field
            Map<String, Object> row = db.queryOne(
                    "SELECT customer_id, from_account_id, to_account_id, amount, reference_id, created_at "
                            + "FROM transfers WHERE sandbox_id = ? AND id = ?", Config.sandboxId(), t.id());
            assertThat(row)
                    .containsEntry("customer_id", Personas.SOPHIE_CUSTOMER_ID)
                    .containsEntry("from_account_id", chequing)
                    .containsEntry("to_account_id", savings)
                    .containsEntry("reference_id", t.referenceId());
            assertThat((BigDecimal) row.get("amount")).isEqualByComparingTo(t.amount());
            // Same instant, different offset and precision: the API prints whole seconds at -05:00,
            // the driver gives microseconds in UTC. Compare instants at the API's precision.
            OffsetDateTime dbCreated = (OffsetDateTime) row.get("created_at");
            assertThat(dbCreated.truncatedTo(ChronoUnit.SECONDS).isEqual(t.createdAt())).isTrue();

            // 4. Exactly two legs, with the ids the response announced
            List<Map<String, Object>> legs = db.queryList(LEGS_SQL, Config.sandboxId(), t.referenceId());
            assertThat(legs).extracting(l -> l.get("id")).containsExactlyInAnyOrder(t.debitTransactionId(), t.creditTransactionId());
            Map<String, Object> debit = legs.stream().filter(l -> l.get("direction").equals("DEBIT")).findFirst().orElseThrow();
            Map<String, Object> credit = legs.stream().filter(l -> l.get("direction").equals("CREDIT")).findFirst().orElseThrow();
            assertThat(debit).containsEntry("account_id", chequing).containsEntry("status", "POSTED").containsEntry("type", "TRANSFER");
            assertThat(credit).containsEntry("account_id", savings).containsEntry("status", "POSTED").containsEntry("type", "TRANSFER");

            // 5. balance_after on each leg, and the account balances, moved by exactly the amount
            assertThat((BigDecimal) debit.get("balance_after")).isEqualByComparingTo(chequingBefore.subtract(amount));
            assertThat((BigDecimal) credit.get("balance_after")).isEqualByComparingTo(savingsBefore.add(amount));
            assertThat(balance(chequing)).isEqualByComparingTo(chequingBefore.subtract(amount));
            assertThat(accounts.account(sophie, chequing).balance()).isEqualByComparingTo(balance(chequing)); // API agrees with DB

            // 6. The audit trail: two TRANSACTION_CREATED (trigger) + one TRANSFER_POSTED (post_transfer), acted by Sophie
            long sophieUserId = db.scalar(Long.class, "SELECT user_id FROM customers WHERE sandbox_id = ? AND id = ?",
                    Config.sandboxId(), Personas.SOPHIE_CUSTOMER_ID);
            List<Map<String, Object>> audit = db.queryList("""
                    SELECT action, entity_id, actor_user_id
                      FROM audit_log
                     WHERE sandbox_id = ?
                       AND ((entity_type = 'transaction' AND entity_id IN (?, ?))
                         OR (action = 'TRANSFER_POSTED' AND new_value ->> 'reference' = ?))
                     ORDER BY id""",
                    Config.sandboxId(), t.debitTransactionId(), t.creditTransactionId(), t.referenceId());
            assertThat(audit).extracting(a -> a.get("action"))
                    .containsExactlyInAnyOrder("TRANSACTION_CREATED", "TRANSACTION_CREATED", "TRANSFER_POSTED");
            assertThat(audit).allSatisfy(a -> assertThat(a.get("actor_user_id")).isEqualTo(sophieUserId));
        } finally {
            transfers.transfer(sophie, savings, chequing, amount); // put the cent back
        }
    }

    private BigDecimal balance(long accountId) {
        return db.scalar(BigDecimal.class, "SELECT balance FROM accounts WHERE sandbox_id = ? AND id = ?", Config.sandboxId(), accountId);
    }
}`,
        },
        {
          title: "The same evidence by hand in DBeaver (paste the referenceId from the response)",
          lang: "sql",
          code: `
SELECT id, account_id, direction, amount, balance_after, status, type, created_at
FROM transactions
WHERE sandbox_id = 1 AND reference_id = 'TRF-488D580C8A60'
ORDER BY id;

-- the audit rows of those legs: TRANSACTION_CREATED per leg, TRANSFER_POSTED on the debit id
SELECT action, entity_type, entity_id, actor_user_id, created_at
FROM audit_log
WHERE sandbox_id = 1
  AND entity_type IN ('transaction', 'transfer')
  AND entity_id IN (SELECT id FROM transactions WHERE sandbox_id = 1 AND reference_id = 'TRF-488D580C8A60')
ORDER BY id;`,
          note: "Locally <code>sandbox_id</code> is 1; on QA use yours. Doing it by hand once, before writing the assertions, shows you exactly what the test should expect.",
        },
        {
          title: "Rows without a reference: select id > max(id) read before the action",
          lang: "java",
          code: `
int sb = Config.sandboxId();
long userId = db.scalar(Long.class, "SELECT user_id FROM customers WHERE sandbox_id = ? AND id = ?", sb, Personas.SOPHIE_CUSTOMER_ID);
long maxBefore = db.scalar(Long.class,
        "SELECT COALESCE(max(id), 0) FROM notifications WHERE sandbox_id = ? AND user_id = ?", sb, userId);

Transfer t = transfers.transfer(Personas.SOPHIE, chequing, savings, TestData.money("0.01"));

List<Map<String, Object>> fresh = db.queryList(
        "SELECT type, title, body FROM notifications WHERE sandbox_id = ? AND user_id = ? AND id > ? ORDER BY id", sb, userId, maxBefore);
assertThat(fresh).singleElement().satisfies(n ->
        assertThat(n).containsEntry("type", "MONEY_MOVEMENT").containsEntry("title", "Transfer completed"));`,
          note: "<code>COALESCE(max(id), 0)</code> because <code>max</code> of no rows is NULL. Scope by the user as well as the id, so other customers' activity does not count.",
        },
      ],
      exercises: [
        "Payees: as Sophie, <code>POST /payees</code> with billerId 4 and a random account number <code>W</code> + 7 digits. Using the id from the <code>Location</code> header, assert the <code>payees</code> row field for field and the <code>PAYEE_ADDED</code> audit row's <code>new_value -&gt;&gt; 'accountNumber'</code>. Delete the payee and prove the row is gone (it was never paid, so it is a hard delete) and a <code>PAYEE_DELETED</code> row exists.",
        "Compare <code>GET /accounts/{id}/transactions?size=5</code> for Sophie's chequing with the newest 5 rows of <code>transactions</code> for that account (same order as the API). Assert id, amount, balanceAfter, status, referenceId and createdAt for each row.",
        "Send a $0.01 transfer with a memo (use <code>TransferRequest</code> and <code>TestData.unique(...)</code> for the memo). Assert <code>transfers.memo</code> and the memo returned by <code>GET /transfers/{id}</code>, then move the cent back.",
        "Write the test from the third example: a transfer creates exactly one new MONEY_MOVEMENT notification for Sophie, found with <code>id &gt; maxBefore</code>. Explain in one sentence why the notification for the transfer back must not be counted.",
      ],
      quiz: [
        {
          q: "Which response field links the transfers row, both legs and the TRANSFER_POSTED audit row?",
          options: ["<code>id</code>", "<code>createdAt</code>", "<code>referenceId</code>", "<code>memo</code>"],
          answer: 2,
          explain: "Both legs and the transfers row share <code>reference_id</code>; post_transfer also writes it into the audit row's JSON.",
        },
        {
          q: "The DB has <code>14:09:32.499536Z</code>, the API <code>09:09:32-05:00</code>. The right assertion is…",
          options: ["<code>db.equals(api)</code>", "<code>db.truncatedTo(ChronoUnit.SECONDS).isEqual(api)</code>", "<code>db.isEqual(api)</code>", "compare <code>toString()</code>"],
          answer: 1,
          explain: "The API drops the fraction of a second and uses Toronto's offset. Truncate, then compare instants.",
        },
        {
          q: "Where should the transfer that puts the money back go?",
          options: ["In a <code>finally</code> block (or a registered cleanup)", "At the end of the test body", "In <code>@BeforeAll</code>", "Nowhere; the next reset fixes it"],
          answer: 0,
          explain: "A failed assertion stops the test body. <code>finally</code> runs anyway, so the data is restored even when the test fails.",
        },
        {
          q: "A notification has no reference id. How do you find the one your action created?",
          options: ["The newest row in <code>notifications</code>", "<code>LIMIT 1</code>", "Rows created in the last second", "<code>id &gt; max(id)</code> read before the action, for that user"],
          answer: 3,
          explain: "Runtime ids only grow. Scoped to the user and above the id you read before, the rows are yours.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "constraints",
      title: "Constraints as tests (qa_writer, rolled back)",
      summary: "Prove CHECKs, foreign keys with ON DELETE RESTRICT and partial unique indexes fire on the boundary, without keeping a single row.",
      body: `
<p>Constraints are the bank's last line of defence: whatever the application gets wrong, the database refuses a negative chequing balance, a payee that still has
payments being deleted, or a second open dispute. Tutorial 1 showed you each constraint in SQL. Here you turn them into repeatable tests, with two techniques:</p>
<ol>
<li><strong>Attempt the forbidden write</strong> as <code>qa_writer</code> inside <code>Db.writer().inRolledBackTransaction(...)</code> and assert the error. Local only
(<code>@Tag("writer")</code> + <code>assumeTrue(Config.hasDbWriter())</code>). Nothing is ever committed.</li>
<li><strong>Scan for impossible rows</strong> as <code>qa_reader</code>: a query that lists rows breaking the rule. It runs on QA too, and it still catches a problem if a
constraint is missing there or a write path slipped past it.</li>
</ol>

<h3>Assert the code and the name, not the wording</h3>
<p>PostgreSQL reports every violation with a five-character <strong>SQLSTATE</strong> and, for constraints, the constraint's name. The driver throws
<code>org.postgresql.util.PSQLException</code>; <code>getServerErrorMessage()</code> gives you the details as fields.</p>
<div class="table-wrap"><table>
<thead><tr><th>SQLSTATE</th><th>Meaning</th><th>Ice Bank example</th><th>Useful field</th></tr></thead>
<tbody>
<tr><td><code>23514</code></td><td>check_violation</td><td><code>accounts_credit_limit_check</code>, <code>customers_postal_code_check</code></td><td><code>getConstraint()</code></td></tr>
<tr><td><code>23503</code></td><td>foreign_key_violation</td><td>deleting payee 2, which <code>bill_payments</code> still reference (<code>ON DELETE RESTRICT</code>)</td><td><code>getTable()</code>: the table that still points at it</td></tr>
<tr><td><code>23505</code></td><td>unique_violation</td><td>a second OPEN dispute: <code>ux_disputes_one_open</code></td><td><code>getConstraint()</code></td></tr>
<tr><td><code>23502</code></td><td>not_null_violation</td><td>an account without <code>customer_id</code></td><td><code>getColumn()</code></td></tr>
<tr><td><code>42501</code></td><td>insufficient_privilege</td><td>any write as <code>qa_reader</code></td><td></td></tr>
</tbody></table></div>

<h3>Test both sides of the boundary</h3>
<p>A constraint that refuses <code>-5000.01</code> on Olivia's $5,000 card is only half the rule. If it also refused <code>-5000.00</code>, customers could not use their full
limit. Every constraint test therefore has a <strong>valid edge</strong> (accepted: one row updated) and an <strong>invalid edge</strong> (refused with the expected SQLSTATE
and constraint name). Partial unique indexes have a second "valid" case: the same values are allowed when the row falls outside the index's <code>WHERE</code>
(a RESOLVED dispute, a deleted payee).</p>

<h3>Worked example: the credit limit</h3>
<p>In <code>creditLimitBoundary()</code> below, the first <code>inRolledBackTransaction</code> sets the card's balance to exactly <code>-5000.00</code> and returns
<code>executeUpdate()</code>'s count: <code>1</code> means accepted. The second tries <code>-5000.01</code>; the helper <code>violation(...)</code> catches the
exception, checks it really is a <code>PSQLException</code> (not, say, a typo in the SQL), and returns the server message so the test can assert
<code>23514</code> and <code>accounts_credit_limit_check</code>. Both transactions are rolled back in <code>Db</code>'s <code>finally</code>, so Olivia's real balance never
changes, even for a moment visible to anyone else.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Asserting only "an exception was thrown". A typo in your SQL throws too (<code>42601</code> syntax error) and the test passes for the wrong reason. Assert the SQLSTATE
<em>and</em> the constraint name.</li>
<li>Matching the English message text. It can change with the server's language; the SQLSTATE and constraint name do not.</li>
<li>Testing only the refusal. Without the valid edge you never learn the constraint is stricter than the rule.</li>
<li>Several violations in one transaction without savepoints: after the first error every statement fails with <code>25P02</code> (lesson 5). One transaction per attempt.</li>
<li>Writing <code>assertThat(psqlException)</code>: <code>SQLException</code> is <code>Iterable</code>, so the call is ambiguous and does not compile. Use
<code>catchThrowable(...)</code> and <code>isInstanceOf(PSQLException.class)</code>, as in the helper below.</li>
<li>Running writer tests on QA. There is no writer there; without the assumption the test fails with a config error instead of being skipped.</li>
</ul></div>`,
      examples: [
        {
          title: "ConstraintsDbTest: a CHECK, a RESTRICT foreign key and a partial unique index",
          lang: "java",
          code: `
/** Each test tries one forbidden write as qa_writer inside a transaction that is always rolled back. */
@Tag("db")
@Tag("writer")
@Feature("Database constraints")
@DisplayName("Database constraints refuse impossible data")
class ConstraintsDbTest {

    private static final long OLIVIA_CARD = 8;          // credit card, limit 5000.00
    private static final long PAYEE_WITH_PAYMENTS = 2;  // Emma's "Phone" payee, has bill payments
    private static final long DISPUTED_TX = 19868;      // already has one OPEN dispute in the seed

    private Db writer;

    @BeforeEach
    void needsWriter() {
        assumeTrue(Config.hasDbWriter(), "needs qa_writer (local only)");
        writer = Db.writer();
    }

    @Test
    @DisplayName("Credit card: balance -5000.00 is allowed, -5000.01 breaks accounts_credit_limit_check (23514)")
    void creditLimitBoundary() throws SQLException {
        int atLimit = writer.inRolledBackTransaction(c -> setBalance(c, OLIVIA_CARD, "-5000.00"));
        assertThat(atLimit).isEqualTo(1);                                 // on the boundary: accepted

        ServerErrorMessage err = violation(c -> setBalance(c, OLIVIA_CARD, "-5000.01"));
        assertThat(err.getSQLState()).isEqualTo("23514");                 // check_violation
        assertThat(err.getConstraint()).isEqualTo("accounts_credit_limit_check");
    }

    @Test
    @DisplayName("A payee with bill payments cannot be deleted: ON DELETE RESTRICT (23503)")
    void payeeWithPaymentsCannotBeDeleted() {
        ServerErrorMessage err = violation(c -> {
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM payees WHERE sandbox_id = ? AND id = ?")) {
                ps.setInt(1, Config.sandboxId());
                ps.setLong(2, PAYEE_WITH_PAYMENTS);
                return ps.executeUpdate();
            }
        });
        assertThat(err.getSQLState()).isEqualTo("23503");                 // foreign_key_violation
        assertThat(err.getTable()).isEqualTo("bill_payments");            // the table that still points at it
    }

    @Test
    @DisplayName("Partial unique index: a second OPEN dispute is refused (23505), a RESOLVED one is fine")
    void oneOpenDisputePerTransaction() throws SQLException {
        String insert = """
                INSERT INTO disputes (sandbox_id, customer_id, transaction_id, reason, status, created_at)
                SELECT sandbox_id, customer_id, transaction_id, 'DUPLICATE', ?, app_now(sandbox_id)
                  FROM disputes WHERE sandbox_id = ? AND transaction_id = ? AND status = 'OPEN'""";

        int resolved = writer.inRolledBackTransaction(c -> run(c, insert, "RESOLVED", Config.sandboxId(), DISPUTED_TX));
        assertThat(resolved).isEqualTo(1);                                // the index only covers OPEN rows

        ServerErrorMessage err = violation(c -> run(c, insert, "OPEN", Config.sandboxId(), DISPUTED_TX));
        assertThat(err.getSQLState()).isEqualTo("23505");                 // unique_violation
        assertThat(err.getConstraint()).isEqualTo("ux_disputes_one_open");
    }

    // ---- helpers ---------------------------------------------------------------------------------

    /** Runs the work in a rolled-back transaction and returns the server's error details. Fails if nothing was refused. */
    private ServerErrorMessage violation(Db.SqlWork<?> work) {
        Throwable thrown = catchThrowable(() -> writer.inRolledBackTransaction(work));
        assertThat(thrown).as("the database should refuse this write").isInstanceOf(PSQLException.class);
        return ((PSQLException) thrown).getServerErrorMessage();
    }

    private static int setBalance(Connection c, long accountId, String balance) throws SQLException {
        return run(c, "UPDATE accounts SET balance = ?, available_balance = ? WHERE sandbox_id = ? AND id = ?",
                new BigDecimal(balance), new BigDecimal(balance), Config.sandboxId(), accountId);
    }

    private static int run(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                ps.setObject(i + 1, params[i]);
            }
            return ps.executeUpdate();
        }
    }
}`,
          note: "Extra imports: <code>org.postgresql.util.PSQLException</code>, <code>org.postgresql.util.ServerErrorMessage</code>, AssertJ's <code>catchThrowable</code>, JUnit's <code>assumeTrue</code>. The INSERT copies the existing dispute's customer and transaction, so the test does not depend on knowing them.",
        },
        {
          title: "A parameterised boundary test for the postal code CHECK",
          lang: "java",
          code: `
@ParameterizedTest(name = "\\"{0}\\" is accepted")
@ValueSource(strings = {"M5J 2T3", "H2X 1Y4", "V6B 4Y8"})
void validPostalCodes(String code) throws SQLException {
    int updated = writer.inRolledBackTransaction(c -> setPostalCode(c, code));
    assertThat(updated).isEqualTo(1);
}

@ParameterizedTest(name = "\\"{0}\\" is refused")
@ValueSource(strings = {"D5J 2T3", "M5J2T3", "m5j 2t3", "M5J 2T", "W5J 2T3"})
void invalidPostalCodes(String code) {
    Throwable thrown = catchThrowable(() -> writer.inRolledBackTransaction(c -> setPostalCode(c, code)));
    assertThat(thrown).as("refused: %s", code).isInstanceOf(PSQLException.class);
    PSQLException e = (PSQLException) thrown;
    assertThat(e.getSQLState()).isEqualTo("23514");
    assertThat(e.getServerErrorMessage().getConstraint()).isEqualTo("customers_postal_code_check");
}

private static int setPostalCode(Connection c, String code) throws SQLException {
    try (PreparedStatement ps = c.prepareStatement("UPDATE customers SET postal_code = ? WHERE sandbox_id = ? AND id = ?")) {
        ps.setString(1, code);
        ps.setInt(2, Config.sandboxId());
        ps.setLong(3, 4L);   // Noah; rolled back, so his row never changes
        return ps.executeUpdate();
    }
}`,
          note: "From <code>PostalCodeCheckDbTest</code> (same <code>@BeforeEach</code> writer setup as above). D and W are never the first letter of a Canadian postal code; lower case and a missing space break the pattern too.",
        },
        {
          title: "The read-only version: scan for rows the CHECKs should make impossible (runs on QA)",
          lang: "java",
          code: `
@Test
@DisplayName("No account breaks a balance rule from the README")
void noAccountBreaksABalanceRule() {
    assertThat(Db.reader().queryList("""
            SELECT id, type, balance, available_balance, credit_limit
              FROM accounts
             WHERE sandbox_id = ?
               AND (   (type IN ('CHEQUING', 'SAVINGS') AND balance < 0)
                    OR (type = 'CREDIT' AND balance < -credit_limit)
                    OR (type = 'LOAN' AND balance > 0))""", Config.sandboxId()))
            .as("accounts breaking a balance rule").isEmpty();
}`,
        },
      ],
      exercises: [
        "Write a parameterised writer test for the phone CHECK on <code>customers</code> (format <code>(###) ###-####</code>): three valid numbers accepted, at least four invalid ones refused with <code>23514</code> and constraint <code>customers_phone_check</code>. Use Noah's row (customer 4) and roll back.",
        "Province: prove all 13 codes from README section 5 are accepted and <code>QB</code>, <code>on</code>, <code>ONT</code> and the empty string are refused with <code>customers_province_check</code>.",
        "Prove that an account with history cannot be deleted: try <code>DELETE</code> of Sophie's savings account (rolled back) and assert the SQLSTATE and the table the error points at.",
        "Partial unique index on payees: show that inserting a copy of Sophie's payee 8 (same biller and account number) is refused with <code>ux_payees_active</code>, and that the same insert succeeds in a transaction where you first set payee 8's <code>deleted_at</code>. Both rolled back.",
        "Write a read-only health check for debit cards: no DEBIT card has a <code>daily_pos_limit</code> that is NULL, outside $500 to $5,000, or not a multiple of $100. Run it on local.",
      ],
      quiz: [
        {
          q: "Your constraint test passes because <em>some</em> exception was thrown. What is the risk?",
          options: ["None, an exception means the constraint fired", "The transaction is committed", "A SQL typo (42601) also throws, so the test can pass while the constraint is never reached", "The test becomes slower"],
          answer: 2,
          explain: "Assert the SQLSTATE and the constraint name so only the right refusal makes the test pass.",
        },
        {
          q: "What does SQLSTATE <code>23503</code> on <code>DELETE FROM payees ...</code> tell you?",
          options: ["The payee does not exist", "Another table still references the payee (foreign key, RESTRICT)", "qa_writer may not delete", "The payee is soft-deleted"],
          answer: 1,
          explain: "23503 is foreign_key_violation. <code>getServerErrorMessage().getTable()</code> names the referencing table, here <code>bill_payments</code>.",
        },
        {
          q: "Why does <code>ux_disputes_one_open</code> accept a second dispute with status RESOLVED?",
          options: ["It is a partial index: it only covers rows WHERE status = 'OPEN'", "RESOLVED disputes are stored in another table", "The index is disabled for qa_writer", "Unique indexes ignore text columns"],
          answer: 0,
          explain: "A partial unique index enforces uniqueness only among rows matching its WHERE clause.",
        },
        {
          q: "Which test still finds a problem on QA, where there is no qa_writer?",
          options: ["The rolled-back UPDATE that expects 23514", "Both, if you add <code>@Tag(\"writer\")</code>", "Neither", "A read-only scan that lists accounts breaking the balance rules"],
          answer: 3,
          explain: "The scan needs only SELECT, and it catches bad rows however they got there.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "atomicity",
      title: "Atomicity, rollback and post_transfer with CallableStatement",
      summary: "All or nothing: call post_transfer from Java, prove a refused call writes nothing, recover from an aborted transaction, and check the API's 422 leaves no trace.",
      body: `
<p><code>post_transfer(from_account, to_account, amount, reference [, sandbox])</code> moves money in one database transaction: two transaction rows sharing the
reference, two balance updates and one <code>TRANSFER_POSTED</code> audit row, <strong>or nothing at all</strong>. The API's <code>POST /transfers</code> calls it too.
Atomicity has two sides and you test both: the happy path writes <em>everything</em>, and every refusal writes <em>nothing</em>.</p>

<h3>Calling a function from Java: <code>CallableStatement</code></h3>
<p>The starter's <code>Db.callPostTransfer(connection, from, to, amount, reference)</code> uses the JDBC escape syntax <code>{? = call post_transfer(?, ?, ?, ?)}</code>:</p>
<ul>
<li><code>registerOutParameter(1, Types.BIGINT)</code>: the first <code>?</code> is the return value (the DEBIT transaction id).</li>
<li><code>setLong(2, from)</code>, <code>setLong(3, to)</code>, <code>setBigDecimal(4, amount)</code>, <code>setString(5, reference)</code>: the arguments, numbered after the return value.</li>
<li><code>execute()</code>, then <code>getLong(1)</code> reads the result. The fifth argument, <code>sandbox</code>, defaults to 1 (the local sandbox).</li>
<li>A business refusal is a <code>SQLException</code> with SQLSTATE <code>P0001</code> and a message starting with the code:
<code>ERROR: SAME_ACCOUNT: source and target accounts must differ</code>. The API turns the same code into a 422 problem with <code>"code": "SAME_ACCOUNT"</code>.</li>
<li>It needs <code>qa_writer</code>: <code>qa_reader</code> gets <code>42501 permission denied for function post_transfer</code>.</li>
</ul>

<h3>Transactions in JDBC</h3>
<ul>
<li>A new connection is in <strong>auto-commit</strong> mode: every statement commits on its own. <code>Db.inRolledBackTransaction</code> switches it off, runs your work on
<em>that</em> connection, and calls <code>rollback()</code> in a <code>finally</code>.</li>
<li>Inside the work, use the connection <code>c</code> you are given. A <code>Db.reader()</code> query opens a <strong>different</strong> connection and, under PostgreSQL's
default READ COMMITTED isolation, does not see your uncommitted rows. That is exactly what makes rolled-back tests safe for everyone else.</li>
<li>After an error, PostgreSQL marks the transaction as failed: every further statement fails with <code>25P02</code>
(<em>current transaction is aborted, commands ignored until end of transaction block</em>). Set a <code>Savepoint</code> before the risky call and
<code>rollback(savepoint)</code> to continue.</li>
</ul>

<h3>Worked example: five refusals, one parameterised test</h3>
<p><code>refusedTransferWritesNothing</code> runs once per CSV row. For row <code>10, 11, 1.00, ACCOUNT_FROZEN</code>: it reads account 10's balance, calls
<code>post_transfer(10, 11, 1.00, ref)</code> in a rolled-back transaction, and expects a <code>SQLException</code> whose message contains <code>ACCOUNT_FROZEN:</code> and whose
SQLSTATE is <code>P0001</code>. Then, as <code>qa_reader</code>, it proves there are 0 rows with that reference and the balance is unchanged. The unique reference
(<code>TestData.unique</code>) is what makes "0 rows" meaningful: no other test can have used it. The same test covers SAME_ACCOUNT, INVALID_AMOUNT (0.001, three
decimals), INVALID_SOURCE (a loan cannot send) and INSUFFICIENT_FUNDS.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Calling <code>Db.writer().callPostTransfer(from, to, amount, ref)</code> (the overload without a connection) in a test: it runs in auto-commit and <strong>really moves the
money</strong>. In tests, pass the connection from <code>inRolledBackTransaction</code>.</li>
<li>Checking the result inside the transaction with <code>Db.reader()</code> and getting 0 legs. Different connection: query through <code>c</code> instead.</li>
<li>Continuing after a caught error without a savepoint, then chasing the confusing <code>25P02</code> on the <em>next</em> statement.</li>
<li><code>cs.setDouble(4, 0.1)</code> for the amount. Use <code>setBigDecimal</code>: the function rejects more than two decimals and a double may carry more.</li>
<li>Asserting the full message text (<code>"... available balance is 4817.15"</code>). The balance part changes; assert the code prefix.</li>
<li>Forgetting the API side: a 422 response must also leave <code>transactions</code>, <code>transfers</code> and both balances untouched.</li>
</ul></div>`,
      examples: [
        {
          title: "A refused post_transfer raises P0001 with the business code and writes nothing",
          lang: "java",
          code: `
@Tag("db")
@Feature("post_transfer")
@DisplayName("post_transfer is all or nothing")
class PostTransferAtomicityDbTest {

    private final Db reader = Db.reader();

    @ParameterizedTest(name = "{0} -> {1}, {2}: {3}")
    @Tag("writer")
    @CsvSource({
            "14, 14, 1.00,      SAME_ACCOUNT",
            "14, 15, 0.001,     INVALID_AMOUNT",
            "10, 11, 1.00,      ACCOUNT_FROZEN",
            " 4,  1, 1.00,      INVALID_SOURCE",
            "14, 15, 999999.99, INSUFFICIENT_FUNDS"
    })
    @DisplayName("A refused post_transfer raises P0001 with the business code and writes nothing")
    void refusedTransferWritesNothing(long from, long to, BigDecimal amount, String code) {
        assumeTrue(Config.hasDbWriter(), "needs qa_writer (local only)");
        String reference = TestData.unique("T8-ATOM");
        BigDecimal fromBefore = balance(from);

        assertThatThrownBy(() -> Db.writer().inRolledBackTransaction(c -> Db.callPostTransfer(c, from, to, amount, reference)))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining(code + ":")
                .satisfies(e -> assertThat(((SQLException) e).getSQLState()).isEqualTo("P0001"));

        assertThat(reader.scalar(Long.class, "SELECT count(*) FROM transactions WHERE sandbox_id = ? AND reference_id = ?",
                Config.sandboxId(), reference)).isZero();
        assertThat(balance(from)).isEqualByComparingTo(fromBefore);
    }

    private BigDecimal balance(long accountId) {
        return reader.scalar(BigDecimal.class, "SELECT balance FROM accounts WHERE sandbox_id = ? AND id = ?", Config.sandboxId(), accountId);
    }
}`,
          note: "Accounts 14/15 are Sophie's, 10 is Ava's frozen chequing, 4 is Emma's loan. Nothing is committed: every call runs inside a rolled-back transaction and is refused anyway.",
        },
        {
          title: "After an error the transaction is aborted (25P02) until you roll back to a savepoint",
          lang: "java",
          code: `
@Test
@Tag("writer")
void errorAbortsTheTransactionUntilSavepointRollback() throws SQLException {
    assumeTrue(Config.hasDbWriter(), "needs qa_writer (local only)");

    String state = Db.writer().inRolledBackTransaction(c -> {
        Savepoint sp = c.setSavepoint();
        assertThatThrownBy(() -> Db.callPostTransfer(c, 14, 14, TestData.money("1.00"), TestData.unique("T8")))
                .hasMessageContaining("SAME_ACCOUNT:");

        // Without the savepoint, every later statement in this transaction fails:
        assertThatThrownBy(() -> count(c))
                .isInstanceOf(SQLException.class)
                .satisfies(e -> assertThat(((SQLException) e).getSQLState()).isEqualTo("25P02")); // in_failed_sql_transaction

        c.rollback(sp);                     // undo only the failed part
        assertThat(count(c)).isPositive();  // the connection works again
        return "recovered";
    });
    assertThat(state).isEqualTo("recovered");
}

private static long count(Connection c) throws SQLException {
    try (PreparedStatement ps = c.prepareStatement("SELECT count(*) FROM accounts WHERE sandbox_id = ?")) {
        ps.setInt(1, Config.sandboxId());
        try (ResultSet rs = ps.executeQuery()) {
            rs.next();
            return rs.getLong(1);
        }
    }
}`,
        },
        {
          title: "Through the API: 422 INSUFFICIENT_FUNDS leaves no transaction row and no balance change",
          lang: "java",
          code: `
@Test
@Tag("api")
void apiRefusalLeavesNoTrace() {
    AccountsClient accounts = new AccountsClient();
    Account chequing = accounts.firstOfType(Personas.SOPHIE, AccountType.CHEQUING);
    Account savings = accounts.firstOfType(Personas.SOPHIE, AccountType.SAVINGS);
    BigDecimal tooMuch = chequing.availableBalance().add(TestData.money("0.01"));   // one cent over
    String countSql = "SELECT count(*) FROM transactions WHERE sandbox_id = ? AND account_id = ? AND amount = ?";
    long sameAmountBefore = reader.scalar(Long.class, countSql, Config.sandboxId(), chequing.id(), tooMuch);

    new TransfersClient().create(Personas.SOPHIE, chequing.id(), savings.id(), tooMuch)
            .then()
            .statusCode(422)
            .body("code", equalTo("INSUFFICIENT_FUNDS"));

    assertThat(reader.scalar(Long.class, countSql, Config.sandboxId(), chequing.id(), tooMuch)).isEqualTo(sameAmountBefore);
    assertThat(reader.scalar(Long.class, countSql, Config.sandboxId(), savings.id(), tooMuch)).isZero();
    assertThat(balance(chequing.id())).isEqualByComparingTo(chequing.balance());
}`,
          note: "The odd amount (available + $0.01) is its own scope: no other transaction is likely to have exactly that amount, so \"no row with this amount\" proves nothing was written.",
        },
      ],
      exercises: [
        "Inside one rolled-back transaction, call <code>post_transfer</code> for $0.01 from Sophie's chequing to her savings. Through the same connection, assert both balances moved by the amount and that the <code>TRANSFER_POSTED</code> row's <code>old_value</code> (<code>fromBalance</code>, <code>toBalance</code>) equals the balances you read before the call. After the rollback, prove (as <code>qa_reader</code>) that no audit row with your reference exists.",
        "Write <code>static String businessCode(SQLException e)</code> that turns <code>ERROR: INSUFFICIENT_FUNDS: available balance is ...</code> into <code>INSUFFICIENT_FUNDS</code>, and a parameterised test that checks it for SAME_ACCOUNT, INVALID_AMOUNT (amount 0.00) and INSUFFICIENT_FUNDS.",
        "Prove isolation: inside the rolled-back transaction, after <code>post_transfer</code>, count the legs once through the transaction's connection and once with <code>Db.reader()</code>. Assert 2 and 0, and 0 again after the rollback.",
        "For SAME_ACCOUNT and INSUFFICIENT_FUNDS, call the function (writer, rolled back) and the API as Sophie with the same accounts and amount. Assert the API's 422 <code>code</code> equals the function's business code.",
        "Read <code>Db.callPostTransfer(long, long, BigDecimal, String)</code> (the overload without a connection). Explain in two sentences why it would commit, and why the starter's tests never use it on shared data.",
      ],
      quiz: [
        {
          q: "In <code>{? = call post_transfer(?, ?, ?, ?)}</code>, which index do you bind the amount to?",
          options: ["3", "1", "4", "5"],
          answer: 2,
          explain: "Index 1 is the return value (registered as BIGINT); the arguments are 2 (from), 3 (to), 4 (amount), 5 (reference).",
        },
        {
          q: "After catching a <code>SAME_ACCOUNT</code> error in a transaction, the next SELECT fails with 25P02. Why?",
          options: ["The connection was closed", "PostgreSQL marks the whole transaction as failed after an error until rollback (or rollback to a savepoint)", "qa_writer lost its privileges", "The SELECT has a syntax error"],
          answer: 1,
          explain: "Use a <code>Savepoint</code> before the risky statement and <code>rollback(savepoint)</code> to keep working in the same transaction.",
        },
        {
          q: "Inside <code>inRolledBackTransaction</code>, you call post_transfer and then <code>Db.reader().queryList(legs)</code>. What do you get?",
          options: ["0 rows: a different connection cannot see uncommitted rows", "The two legs", "An exception", "Only the DEBIT leg"],
          answer: 0,
          explain: "Each <code>Db</code> call opens its own connection. Under READ COMMITTED it only sees committed data.",
        },
        {
          q: "Which SQLSTATE does post_transfer use for business refusals such as INSUFFICIENT_FUNDS?",
          options: ["<code>23514</code>", "<code>42501</code>", "<code>25P02</code>", "<code>P0001</code>"],
          answer: 3,
          explain: "P0001 is raise_exception from PL/pgSQL. The message starts with the business code.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "triggers-audit",
      title: "Triggers and the audit trail",
      summary: "Test the work nobody calls explicitly: trg_transactions_audit writes the audit rows, trg_transactions_immutable protects posted history.",
      body: `
<p>Triggers run inside the database on every matching row change. Nobody calls them, so nobody notices when one stops working, which is exactly why they need
tests. Ice Bank has two on <code>transactions</code>:</p>
<div class="table-wrap"><table>
<thead><tr><th>Trigger</th><th>When</th><th>What it does</th></tr></thead>
<tbody>
<tr><td><code>trg_transactions_audit</code></td><td>AFTER INSERT or UPDATE, each row</td><td>INSERT: one <code>audit_log</code> row <code>TRANSACTION_CREATED</code>, <code>entity_type = 'transaction'</code>,
<code>entity_id</code> = the transaction id, <code>new_value</code> JSON with accountId, direction, amount, status, type, balanceAfter, referenceId.
UPDATE that changes <code>status</code>: one <code>TRANSACTION_STATUS_CHANGED</code> row with old and new status. Other updates: nothing.</td></tr>
<tr><td><code>trg_transactions_immutable</code></td><td>BEFORE UPDATE or DELETE, each row</td><td>Refuses changing amount, direction, account or sandbox; a POSTED row may only become REVERSED; refuses deleting a POSTED row.
All with <code>P0001 IMMUTABLE_TRANSACTION</code>. Only <code>reset_sandbox()</code>, running as its owner, may delete posted rows.</td></tr>
</tbody></table></div>

<h3>Who did it: <code>actor_user_id</code></h3>
<p>The app sets a session setting for each request's transaction, <code>icebank.actor_user_id</code>, and the trigger copies it into <code>actor_user_id</code>. In a JDBC
test you do the same with <code>SELECT set_config('icebank.actor_user_id', '7', true)</code>: the <code>true</code> makes it local to the current transaction, like
<code>SET LOCAL</code>. Without it the actor is NULL, which is also what due work (expiry, interest) records.</p>

<h3>Two sources of audit rows</h3>
<ul>
<li><strong>Database</strong>: the trigger (<code>TRANSACTION_CREATED</code>, <code>TRANSACTION_STATUS_CHANGED</code>) and <code>post_transfer</code> itself (<code>TRANSFER_POSTED</code>,
<code>entity_type = 'transfer'</code>, <code>entity_id</code> = the DEBIT id, <code>old_value</code> with both balances before).</li>
<li><strong>Application</strong>: business events written by the API, such as <code>LOGIN</code>, <code>CUSTOMER_REGISTERED</code>, <code>PAYEE_ADDED</code>, <code>PAYEE_DELETED</code>,
<code>ETRANSFER_CANCELLED</code>, <code>ETRANSFER_EXPIRED</code>. Test these from API tests, with the same queries.</li>
</ul>
<p><strong>Seed detail:</strong> the two years of seeded history were inserted with auditing switched off. Only transactions created at runtime (id 1,000,000 and up) have a
<code>TRANSACTION_CREATED</code> row. A check "every transaction is audited" must say <code>id &gt;= 1000000</code>.</p>

<h3>Worked example: the audit row of an inserted leg</h3>
<p><code>insertWritesAuditRowWithActor</code> opens a writer transaction, sets the actor to 7, calls <code>post_transfer</code> and keeps the DEBIT id. Still on the same
connection, it selects the audit rows for that id, pulling JSON fields out in SQL (<code>new_value -&gt;&gt; 'status'</code>, and
<code>(new_value -&gt;&gt; 'amount')::numeric</code> so the amount arrives as a <code>BigDecimal</code>). It expects exactly one row: action
<code>TRANSACTION_CREATED</code>, actor <code>7L</code> (<code>actor_user_id</code> is BIGINT, so a <code>Long</code>), status POSTED, the reference it passed in, amount 0.01.
The rollback then removes the legs <em>and</em> the audit rows: trigger work is part of the same transaction.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Expecting audit rows for seeded transactions (ids below 1,000,000). They were never audited.</li>
<li>Counting all <code>audit_log</code> rows before and after. Other activity (every sign-in writes <code>LOGIN</code>) changes the total; select by entity and action.</li>
<li>Comparing JSON as a string (<code>new_value::text = '{"amount": 0.01, ...}'</code>). Key order and number formatting differ; extract the fields with <code>-&gt;&gt;</code>.</li>
<li>Checking the action and forgetting the actor, entity and values. "An audit row exists" is a weak test; "Sophie's user recorded TRANSACTION_CREATED for leg X with amount 0.01" is a strong one.</li>
<li>Trying to clean up test data by deleting POSTED transactions. The immutability trigger refuses, which is the point. Use compensating actions (lesson 10).</li>
<li>Asserting <code>audit_log.created_at</code> against your PC's clock. It uses the sandbox clock (<code>app_now</code>), which can be days away.</li>
</ul></div>`,
      examples: [
        {
          title: "AuditTriggerDbTest: the audit row of an inserted leg, and immutable history",
          lang: "java",
          code: `
@Tag("db")
@Tag("writer")
@Feature("Audit trail")
@DisplayName("Triggers on transactions: audit and immutability")
class AuditTriggerDbTest {

    private static final String AUDIT_FOR_TX = """
            SELECT action, entity_id, actor_user_id, old_value ->> 'status' AS old_status,
                   new_value ->> 'status' AS new_status, (new_value ->> 'amount')::numeric AS amount,
                   new_value ->> 'referenceId' AS reference_id
              FROM audit_log
             WHERE sandbox_id = ? AND entity_type = 'transaction' AND entity_id = ?
             ORDER BY id""";

    private Db writer;
    private long sophieChequing;
    private long sophieSavings;

    @BeforeEach
    void setUp() {
        assumeTrue(Config.hasDbWriter(), "needs qa_writer (local only)");
        writer = Db.writer();
        Db reader = Db.reader();
        String sql = "SELECT id FROM accounts WHERE sandbox_id = ? AND customer_id = ? AND type = ? ORDER BY id LIMIT 1";
        sophieChequing = reader.scalar(Long.class, sql, Config.sandboxId(), Personas.SOPHIE_CUSTOMER_ID, "CHEQUING");
        sophieSavings = reader.scalar(Long.class, sql, Config.sandboxId(), Personas.SOPHIE_CUSTOMER_ID, "SAVINGS");
    }

    @Test
    @DisplayName("Each inserted leg gets a TRANSACTION_CREATED row with the acting user and the leg's values")
    void insertWritesAuditRowWithActor() throws SQLException {
        String reference = TestData.unique("T8-AUDIT");
        List<Map<String, Object>> audit = writer.inRolledBackTransaction(c -> {
            exec(c, "SELECT set_config('icebank.actor_user_id', ?, true)", "7");   // what the app does per request (SET LOCAL)
            long debitId = Db.callPostTransfer(c, sophieChequing, sophieSavings, TestData.money("0.01"), reference);
            return query(c, AUDIT_FOR_TX, Config.sandboxId(), debitId);
        });

        assertThat(audit).hasSize(1);
        assertThat(audit.get(0))
                .containsEntry("action", "TRANSACTION_CREATED")
                .containsEntry("actor_user_id", 7L)
                .containsEntry("new_status", "POSTED")
                .containsEntry("reference_id", reference);
        assertThat((BigDecimal) audit.get(0).get("amount")).isEqualByComparingTo("0.01");
    }

    @Test
    @DisplayName("POSTED -> REVERSED is allowed and audited; amount changes and deletes are refused")
    void postedRowsAreImmutable() throws SQLException {
        long txId = Db.reader().scalar(Long.class, """
                SELECT max(id) FROM transactions WHERE sandbox_id = ? AND account_id = ? AND status = 'POSTED'""",
                Config.sandboxId(), sophieChequing);

        // Allowed: status change, and it leaves an audit row (rolled back afterwards)
        List<Map<String, Object>> audit = writer.inRolledBackTransaction(c -> {
            exec(c, "UPDATE transactions SET status = 'REVERSED' WHERE sandbox_id = ? AND id = ?", Config.sandboxId(), txId);
            return query(c, AUDIT_FOR_TX, Config.sandboxId(), txId);
        });
        assertThat(audit).extracting(a -> a.get("action")).contains("TRANSACTION_STATUS_CHANGED");

        // Refused: the trigger raises P0001 IMMUTABLE_TRANSACTION
        for (String sql : List.of(
                "UPDATE transactions SET amount = amount + 1 WHERE sandbox_id = ? AND id = ?",
                "UPDATE transactions SET status = 'PENDING' WHERE sandbox_id = ? AND id = ?",
                "DELETE FROM transactions WHERE sandbox_id = ? AND id = ?")) {
            assertThatThrownBy(() -> writer.inRolledBackTransaction(c -> exec(c, sql, Config.sandboxId(), txId)))
                    .as(sql)
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("IMMUTABLE_TRANSACTION")
                    .satisfies(e -> assertThat(((SQLException) e).getSQLState()).isEqualTo("P0001"));
        }
    }

    // ---- small helpers on a connection you manage --------------------------------------------------

    private static int exec(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                ps.setObject(i + 1, params[i]);
            }
            return ps.execute() ? 0 : ps.getUpdateCount();
        }
    }

    private static List<Map<String, Object>> query(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                ps.setObject(i + 1, params[i]);
            }
            return Db.readRows(ps.executeQuery());
        }
    }
}`,
          note: "<code>Db.readRows(ResultSet)</code> is public so you can turn a result set from your own connection into the same <code>List&lt;Map&gt;</code> that <code>queryList</code> returns.",
        },
        {
          title: "Read an API action's audit trail with JSON fields (here: a payee Sophie added)",
          lang: "sql",
          code: `
SELECT al.id, al.action, al.actor_user_id, al.entity_id AS payee_id,
       al.new_value ->> 'billerId'      AS biller_id,
       al.new_value ->> 'accountNumber' AS account_number,
       al.created_at
FROM audit_log al
WHERE al.sandbox_id = 1
  AND al.entity_type = 'payee'
  AND al.actor_user_id = (SELECT user_id FROM customers WHERE sandbox_id = 1 AND id = 7)
ORDER BY al.id DESC
LIMIT 10;`,
          note: "<code>-&gt;&gt;</code> returns text; cast in SQL (<code>::bigint</code>, <code>::numeric</code>) when you want typed values in Java.",
        },
      ],
      exercises: [
        "After an API transfer by Sophie, join each leg to its <code>TRANSACTION_CREATED</code> row and assert that <code>new_value</code>'s accountId, direction, amount, balanceAfter and referenceId equal the leg's own columns, for both legs. Move the money back.",
        "Write the read-only coverage check: every transaction with id &gt;= 1,000,000 has <strong>exactly one</strong> <code>TRANSACTION_CREATED</code> row (0 rows returned when healthy).",
        "In one rolled-back transaction on one of Sophie's POSTED rows: change only the <code>description</code> and prove no audit row appears; then change the status to REVERSED and prove exactly one <code>TRANSACTION_STATUS_CHANGED</code> row with old status POSTED and new status REVERSED.",
        "Register a throwaway customer (<code>POST /auth/register</code>, unique email), sign them in with <code>AuthClient.signIn(email, password)</code>, and assert their audit trail is <code>CUSTOMER_REGISTERED</code> (entity: the customer) then <code>LOGIN</code> (entity: the user), both with their own <code>actor_user_id</code>.",
        "Show that the reset flag does not help a test role: in a rolled-back transaction set <code>icebank.reset_sandbox</code> to your sandbox id with <code>set_config</code>, then try to delete a POSTED row. Explain from <code>002_objects.sql</code> which condition still refuses it.",
      ],
      quiz: [
        {
          q: "How many audit rows does one successful <code>post_transfer</code> write?",
          options: ["1", "2", "3", "0, auditing is done by the API"],
          answer: 2,
          explain: "Two TRANSACTION_CREATED rows from the trigger (one per leg) and one TRANSFER_POSTED row from the function.",
        },
        {
          q: "Why does a check \"every transaction has a TRANSACTION_CREATED row\" need <code>id &gt;= 1000000</code>?",
          options: ["Old rows are archived elsewhere", "The seed history was inserted with auditing off", "The trigger ignores small ids", "Audit rows expire"],
          answer: 1,
          explain: "Seed ids are below 1,000,000 and were loaded with <code>icebank.skip_audit</code> on. Runtime rows start at 1,000,000.",
        },
        {
          q: "Which UPDATE on a POSTED transaction does <code>trg_transactions_immutable</code> allow?",
          options: ["status = 'REVERSED'", "status = 'PENDING'", "amount = amount + 1", "account_id = another account"],
          answer: 0,
          explain: "A POSTED row may only become REVERSED. Amount, direction and account never change.",
        },
        {
          q: "In a JDBC test, how do you make the trigger record actor 7?",
          options: ["Connect as user 7", "UPDATE audit_log afterwards", "Pass 7 as the 5th argument of post_transfer", "<code>SELECT set_config('icebank.actor_user_id', '7', true)</code> in the same transaction"],
          answer: 3,
          explain: "The trigger reads the session setting through <code>current_actor()</code>. <code>true</code> scopes it to the transaction, like SET LOCAL.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "views",
      title: "Views checked against the API",
      summary: "Treat v_account_summary and v_daily_etransfer_totals like endpoints: compare them with the API, with your own grouping, and with a controlled change.",
      body: `
<p>A view is a stored query: an API inside the database. Reports, limit checks and admin screens read it, so a wrong view means wrong numbers everywhere. Test a view
like an endpoint: a known input, an expected output, and the edge cases its definition promises.</p>

<h3>The two Ice Bank views</h3>
<div class="table-wrap"><table>
<thead><tr><th>View</th><th>Contract</th><th>Oracle in the API</th></tr></thead>
<tbody>
<tr><td><code>v_account_summary</code></td><td>One row per account: number, type, nickname, status, balance, available balance, <code>pending_count</code> (PENDING transactions),
<code>last_transaction_at</code></td><td><code>GET /accounts</code> (balances, status, number); <code>GET /accounts/{id}/transactions?size=1</code> (newest row)</td></tr>
<tr><td><code>v_daily_etransfer_totals</code></td><td>One row per sender per <strong>Toronto</strong> calendar day: count and total of PENDING and DEPOSITED e-Transfers. CANCELLED and EXPIRED do not count. No e-Transfers that day: <strong>no row</strong>.</td><td><code>GET /etransfers?direction=sent</code>, grouped by the Toronto date of <code>createdAt</code></td></tr>
</tbody></table></div>

<h3>Three oracles</h3>
<ol>
<li><strong>The API</strong>: the same facts through another path. If they disagree, one of them is wrong, and either way it is a bug.</li>
<li><strong>Your own computation</strong>: group the API's list in Java (example 2), or write your own SQL over the base table.</li>
<li><strong>A controlled change</strong>: read the view, cause one change (send $0.01, then cancel it), read again and assert the exact difference.</li>
</ol>

<h3>Worked example: daily totals against the API</h3>
<p><code>dailyTotalsMatchApi</code> signs in as Emma (read-only), lists her sent e-Transfers, keeps only PENDING and DEPOSITED, and groups them by
<code>OffsetDateTime.parse(createdAt).atZoneSameInstant(America/Toronto).toLocalDate()</code>, summing amounts as <code>BigDecimal</code> into a sorted
<code>TreeMap</code>. It then reads the view for her customer id into a second <code>TreeMap&lt;LocalDate, BigDecimal&gt;</code> (the driver returns <code>day</code> as a
<code>LocalDate</code>). Equal key sets prove the view has a row for exactly the right days; then each total is compared with <code>isEqualByComparingTo</code>. Grouping by
<code>createdAt.toLocalDate()</code> without the zone conversion would put an e-Transfer sent at 20:30 Toronto time on the next (UTC) day.</p>
<p>The third example is the controlled change: Sophie sends $0.01 (PENDING), the row for today grows by 0.01; she cancels it, and the total is back where it started. Today
comes from <code>app_now()</code>, not your computer's date (lesson 9).</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Grouping by the UTC date. Ice Bank's days are Toronto days; from 19:00 or 20:00 Toronto time (depending on daylight saving) the UTC date is already tomorrow.</li>
<li>Expecting a row with total 0.00 for a day without e-Transfers. The view has no row; read it with <code>COALESCE(sum(...), 0)</code> or treat "missing" as zero.</li>
<li>Comparing <code>SELECT *</code> from a view. Name the columns: a column added to the view later should not break your test.</li>
<li>Forgetting that CANCELLED and EXPIRED do not count, so a cancel <em>removes</em> money from the day's total.</li>
<li>Comparing <code>last_transaction_at</code> with the API at full precision. The API drops fractions of a second.</li>
<li>Using <code>LocalDate.now()</code> for "today". The sandbox clock may be days away from your PC.</li>
</ul></div>`,
      examples: [
        {
          title: "ViewsDbTest: account summary vs GET /accounts, daily totals vs GET /etransfers, and a controlled change",
          lang: "java",
          code: `
@Tag("api")
@Tag("db")
@Feature("Database views")
@DisplayName("Views agree with the API")
class ViewsDbTest {

    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private final Db db = Db.reader();

    @Test
    @DisplayName("v_account_summary: one row per account, same balances and status as GET /accounts")
    void accountSummaryMatchesApi() {
        List<Account> api = new AccountsClient().listAccounts(Personas.EMMA);
        List<Map<String, Object>> view = db.queryList("""
                SELECT account_id, account_number, type, status, balance, available_balance
                  FROM v_account_summary
                 WHERE sandbox_id = ? AND customer_id = ?
                 ORDER BY account_id""", Config.sandboxId(), Personas.EMMA_CUSTOMER_ID);

        assertThat(view).hasSameSizeAs(api);
        for (int i = 0; i < api.size(); i++) {
            Account a = api.get(i);
            Map<String, Object> v = view.get(i);
            assertThat(v).containsEntry("account_id", a.id())
                    .containsEntry("account_number", a.accountNumber())
                    .containsEntry("type", a.type().name())
                    .containsEntry("status", a.status());
            assertThat((BigDecimal) v.get("balance")).as("balance of %d", a.id()).isEqualByComparingTo(a.balance());
            assertThat((BigDecimal) v.get("available_balance")).isEqualByComparingTo(a.availableBalance());
        }
    }

    @Test
    @DisplayName("v_daily_etransfer_totals: the same per-Toronto-day totals as Emma's sent e-Transfers in the API")
    void dailyTotalsMatchApi() {
        JsonPath sent = given().spec(Specs.as(Personas.EMMA))
                .queryParam("direction", "sent").queryParam("size", 100)
                .when().get("/etransfers")
                .then().statusCode(200).extract().jsonPath();
        List<Map<String, Object>> content = sent.getList("content");

        // Expected: group the API list ourselves, counting only PENDING and DEPOSITED, by Toronto calendar day
        Map<LocalDate, BigDecimal> expected = content.stream()
                .filter(e -> List.of("PENDING", "DEPOSITED").contains(e.get("status")))
                .collect(Collectors.groupingBy(
                        e -> OffsetDateTime.parse((String) e.get("createdAt")).atZoneSameInstant(TORONTO).toLocalDate(),
                        TreeMap::new,
                        Collectors.reducing(BigDecimal.ZERO, e -> new BigDecimal((String) e.get("amount")), BigDecimal::add)));

        Map<LocalDate, BigDecimal> actual = db.queryList("""
                        SELECT day, total_amount FROM v_daily_etransfer_totals
                         WHERE sandbox_id = ? AND customer_id = ? ORDER BY day""",
                        Config.sandboxId(), Personas.EMMA_CUSTOMER_ID).stream()
                .collect(Collectors.toMap(r -> (LocalDate) r.get("day"), r -> (BigDecimal) r.get("total_amount"), (a, b) -> a, TreeMap::new));

        assertThat(actual.keySet()).containsExactlyElementsOf(expected.keySet());
        expected.forEach((day, total) -> assertThat(actual.get(day)).as("total on %s", day).isEqualByComparingTo(total));
    }

    @Test
    @DisplayName("A pending e-Transfer adds to today's row; cancelling it takes it out again (Sophie, $0.01)")
    void pendingCountsCancelledDoesNot() {
        long chequing = db.scalar(Long.class, "SELECT id FROM accounts WHERE sandbox_id = ? AND customer_id = ? AND type = 'CHEQUING' ORDER BY id LIMIT 1",
                Config.sandboxId(), Personas.SOPHIE_CUSTOMER_ID);
        LocalDate today = db.scalar(LocalDate.class, "SELECT (app_now(?) AT TIME ZONE 'America/Toronto')::date", Config.sandboxId());
        BigDecimal before = todayTotal(today);

        long id = given().spec(Specs.as(Personas.SOPHIE))
                .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                .body(Map.of("fromAccountId", chequing, "recipientName", "Tutorial Eight",
                        "recipientEmail", "db.tut.view@example.com", "amount", "0.01",
                        "securityQuestion", "Which tutorial?", "securityAnswer", "eight"))
                .when().post("/etransfers")
                .then().statusCode(201).extract().<Number>path("id").longValue();
        try {
            assertThat(todayTotal(today)).isEqualByComparingTo(before.add(TestData.money("0.01")));
        } finally {
            given().spec(Specs.as(Personas.SOPHIE))
                    .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                    .when().post("/etransfers/{id}/cancel", id)
                    .then().statusCode(200);
        }
        assertThat(todayTotal(today)).isEqualByComparingTo(before);
    }

    /** Sophie's total for one Toronto day; 0.00 when the view has no row (no e-Transfers that day). */
    private BigDecimal todayTotal(LocalDate day) {
        return db.scalar(BigDecimal.class, """
                SELECT COALESCE(sum(total_amount), 0.00) FROM v_daily_etransfer_totals
                 WHERE sandbox_id = ? AND customer_id = ? AND day = ?""",
                Config.sandboxId(), Personas.SOPHIE_CUSTOMER_ID, day);
    }
}`,
          note: "The e-Transfer goes to an outside address (no autodeposit), so it stays PENDING until the cancel refunds it with a REVERSAL credit. The cancel is in <code>finally</code>, so Sophie gets her cent back even if the assertion fails.",
        },
        {
          title: "Where the Toronto day and the UTC day differ (run it before you trust a date)",
          lang: "sql",
          code: `
SELECT id, sender_customer_id, created_at,
       (created_at AT TIME ZONE 'America/Toronto')::date AS toronto_day,
       (created_at AT TIME ZONE 'UTC')::date             AS utc_day,
       status
FROM etransfers
WHERE sandbox_id = 1
  AND (created_at AT TIME ZONE 'America/Toronto')::date <> (created_at AT TIME ZONE 'UTC')::date
ORDER BY created_at DESC
LIMIT 5;`,
          note: "On the seed, e-Transfer 29 was created at 00:59 UTC on 7 September, which is 6 September in Toronto. The view counts it on the 6th.",
        },
      ],
      exercises: [
        "For each of Emma's four accounts, compare <code>v_account_summary.last_transaction_at</code> with the <code>createdAt</code> of the newest row from <code>GET /accounts/{id}/transactions?size=1</code>. Mind the precision.",
        "Time-zone edge, rolled back as <code>qa_writer</code>: insert two e-Transfers for Noah (customer 4, account 9), a PENDING one of 12.34 at <code>2026-11-03T04:30:00Z</code> and a CANCELLED one of 50.00 ten minutes later. In the same transaction, assert the view has exactly one row for Noah: day 2026-11-02, count 1, total 12.34.",
        "Extend the controlled-change example: also assert <code>transfer_count</code> goes up by 1 and back, and that the cancel created a REVERSAL CREDIT of 0.01 with the e-Transfer's <code>referenceId</code>.",
        "In a rolled-back writer transaction, place a $1.00 hold on Sophie's chequing with <code>SELECT hold_entry(sandbox, account, 1.00, 'BILL_PAYMENT', 'T8 hold', 'T8-HOLD')</code>. Through the same connection, assert <code>pending_count</code> went up by 1, <code>available_balance</code> down by 1.00 and <code>balance</code> stayed the same.",
      ],
      quiz: [
        {
          q: "Emma sends an e-Transfer at 20:30 Toronto time on 4 November (EST). Which <code>day</code> does the view put it on?",
          options: ["2026-11-05, the UTC date", "Both days, half each", "2026-11-04, the Toronto date", "None until it is deposited"],
          answer: 2,
          explain: "20:30 EST is 01:30 UTC the next day, but the view groups by <code>created_at AT TIME ZONE 'America/Toronto'</code>.",
        },
        {
          q: "Sophie has sent nothing today. What does <code>SELECT total_amount FROM v_daily_etransfer_totals WHERE ... day = today</code> return?",
          options: ["One row with 0.00", "No row at all", "One row with NULL", "An error"],
          answer: 1,
          explain: "The view is a GROUP BY over e-Transfers; no e-Transfers means no group. Use <code>COALESCE(sum(...), 0)</code>.",
        },
        {
          q: "A pending e-Transfer is cancelled. What happens to that day's total in the view?",
          options: ["It goes down by the amount", "It stays the same", "It goes up by the refund", "The row is marked cancelled"],
          answer: 0,
          explain: "Only PENDING and DEPOSITED count. After the cancel the e-Transfer no longer qualifies.",
        },
        {
          q: "Which is the strongest test of <code>v_account_summary.pending_count</code>?",
          options: ["Assert it is 0 for every account", "Check the column exists", "Compare it with yesterday's value", "Read it, create one PENDING transaction (rolled back), read again and assert +1"],
          answer: 3,
          explain: "A controlled change with an exact expected difference tests the view's logic, not just today's data.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "multi-tenant",
      title: "Multi-tenant data: sandbox_id in every query and join",
      summary: "Every student has a sandbox with the same ids. Forget sandbox_id once and a test that is green locally reads someone else's data on QA.",
      body: `
<p>Ice Bank is <strong>multi-tenant</strong>: one database holds many sandboxes. Locally there is one (sandbox 1); on QA every student has their own. Every business table
has a <code>sandbox_id</code> column, and it is part of every primary key (<code>(sandbox_id, id)</code>) and every foreign key.</p>

<h3>Why it bites on QA and never locally</h3>
<ul>
<li><strong>Seed ids repeat in every sandbox.</strong> A reset re-creates the same rows with the same ids, so Emma's chequing is account 1 in <em>every</em> sandbox. On QA,
<code>SELECT ... FROM accounts WHERE id = 1</code> returns one row per student. <code>queryOne</code> then fails with "expected 1 row but got 4", or worse,
<code>LIMIT 1</code> silently picks someone else's.</li>
<li><strong>Runtime ids do not repeat.</strong> Rows created at runtime take ids from one global sequence (1,000,000 and up), so a transfer id is unique across sandboxes. That
makes the bug intermittent: tests on runtime rows pass, tests on seed rows read the wrong data.</li>
<li><strong><code>qa_reader</code> sees every sandbox on QA.</strong> The database does not filter for you. Only your <code>WHERE</code> does.</li>
<li><strong>Joins fan out.</strong> <code>JOIN accounts a ON a.id = t.account_id</code> (without <code>a.sandbox_id = t.sandbox_id</code>) matches account 1 in every sandbox: with N
sandboxes every count and sum is N times too big.</li>
</ul>
<p>Locally, with one sandbox, all of these give the right answer. That is the trap: the suite is green on your machine and wrong on QA. A missing tenant filter is a
real and common bug class in multi-tenant systems, in test code and in application code alike, so it is worth testing for deliberately.</p>

<h3>The habits</h3>
<ol>
<li>Every query: <code>WHERE x.sandbox_id = ?</code> bound to <code>Config.sandboxId()</code>, never a literal <code>1</code>.</li>
<li>Every join: on <code>sandbox_id</code> <em>and</em> the id: <code>ON a.sandbox_id = t.sandbox_id AND a.id = t.account_id</code>.</li>
<li>Persona emails through <code>Personas</code>, which adds the QA suffix (<code>emma.tremblay+s3@icebank.test</code>).</li>
<li>Make the rule hard to break: put SQL in <code>DbChecks</code> and let it refuse unscoped queries (example 3).</li>
</ol>

<h3>Worked example: proving the ids repeat</h3>
<p><code>seedIdsRepeatInEverySandbox</code> counts sandboxes (<code>SELECT count(id) FROM sandboxes</code>; <code>qa_reader</code> may read the id column but not the key
hashes, so <code>SELECT *</code> is refused), then counts accounts with <code>id = 1</code> without and with the sandbox filter. Locally: 1 sandbox, 1 unscoped row,
1 scoped row. On QA with four students: 4, 4 and 1. The same assertions hold in both places, and the unscoped count is exactly the number of sandboxes, which shows the
mechanism instead of just stating it.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li><code>WHERE sandbox_id = 1</code> copied from DBeaver into Java. Bind <code>Config.sandboxId()</code>.</li>
<li>Filtering the first table and forgetting the joins: <code>WHERE t.sandbox_id = ?</code> with <code>JOIN accounts a ON a.id = t.account_id</code> still fans out.</li>
<li>Looking a user up by <code>email = 'emma.tremblay@icebank.test'</code> on QA, where her email has your suffix. Use <code>Personas.EMMA</code> as a parameter.</li>
<li>Using <code>LIMIT 1</code> to "fix" a query that returns too many rows. It hides the missing filter instead of fixing it.</li>
<li>Assuming a green local run proves your SQL is scoped. Only review (or the guard in <code>DbChecks</code>) proves it.</li>
</ul></div>`,
      examples: [
        {
          title: "SandboxScopeDbTest: seed ids repeat per sandbox, runtime ids never do",
          lang: "java",
          code: `
@Tag("db")
@Feature("Multi-tenant data")
@DisplayName("Every sandbox has the same seed ids")
class SandboxScopeDbTest {

    private final Db db = Db.reader();

    @Test
    @DisplayName("WHERE id = 1 without sandbox_id returns one account per sandbox")
    void seedIdsRepeatInEverySandbox() {
        long sandboxes = db.scalar(Long.class, "SELECT count(id) FROM sandboxes");
        long unscoped = db.scalar(Long.class, "SELECT count(*) FROM accounts WHERE id = 1");
        long scoped = db.scalar(Long.class, "SELECT count(*) FROM accounts WHERE sandbox_id = ? AND id = 1", Config.sandboxId());

        assertThat(unscoped).isEqualTo(sandboxes);   // 1 locally, one per student on QA
        assertThat(scoped).isEqualTo(1L);
    }

    @Test
    @DisplayName("Rows created at runtime get ids from one global sequence, so they never repeat across sandboxes")
    void runtimeIdsAreGloballyUnique() {
        long repeated = db.scalar(Long.class, """
                SELECT count(*) FROM (
                  SELECT id FROM transactions WHERE id >= 1000000 GROUP BY id HAVING count(*) > 1
                ) d""");
        assertThat(repeated).isZero();
    }
}`,
          note: "The two unscoped queries here are deliberate: they measure the whole database. Everywhere else, scope.",
        },
        {
          title: "The same question, wrong and right (identical locally, N times too big on QA)",
          lang: "sql",
          code: `
-- WRONG on QA: no sandbox filter, joins on id only, persona email without the suffix
SELECT count(*)
FROM transactions t
JOIN accounts a  ON a.id = t.account_id
JOIN customers c ON c.id = a.customer_id
JOIN users u     ON u.id = c.user_id
WHERE u.email = 'emma.tremblay@icebank.test';

-- RIGHT: every join on (sandbox_id, id), one sandbox, the email as your suite builds it
SELECT count(*)
FROM transactions t
JOIN accounts a  ON a.sandbox_id = t.sandbox_id AND a.id = t.account_id
JOIN customers c ON c.sandbox_id = a.sandbox_id AND c.id = a.customer_id
JOIN users u     ON u.sandbox_id = c.sandbox_id AND u.id = c.user_id
WHERE t.sandbox_id = 1
  AND u.email = 'emma.tremblay@icebank.test';   -- in Java: Personas.EMMA as a parameter`,
        },
        {
          title: "Make the rule hard to break: DbChecks refuses unscoped SQL (excerpt)",
          lang: "java",
          code: `
/** Runs a query whose first parameter is the sandbox id; the caller passes only the other parameters. */
private List<Map<String, Object>> rows(String sql, Object... params) {
    List<Object> all = new ArrayList<>();
    all.add(sandboxId);                      // Config.sandboxId(), read once in the constructor
    all.addAll(List.of(params));
    return db.queryList(requireScoped(sql), all.toArray());
}

/** Refuses SQL that is not scoped to one sandbox. On QA, qa_reader can see every sandbox. */
public static String requireScoped(String sql) {
    if (!sql.contains("sandbox_id = ?")) {
        throw new IllegalArgumentException("Query is not scoped to a sandbox (missing 'sandbox_id = ?'): " + sql);
    }
    return sql;
}`,
          note: "A simple text check, not a SQL parser: it catches the forgotten filter, not a forgotten join condition. Lesson 10 builds the whole class.",
        },
        {
          title: "What qa_reader may see of the sandboxes table",
          lang: "sql",
          code: `
SELECT id, name, clock_offset_seconds, processed_through FROM sandboxes;   -- allowed (column privileges)
SELECT * FROM sandboxes;                                                   -- ERROR 42501: the key hashes are not for test users`,
        },
      ],
      exercises: [
        "Search your test code for SQL that might be unscoped: <code>grep -rn --include=*.java -E '(FROM|JOIN) [a-z_]+' src/test/java | grep -v sandbox_id</code>. For each hit, decide whether it is a real problem (text blocks span several lines, so also read them by eye) and fix the real ones.",
        "Rewrite this query so it is correct on QA, and bind the values in Java: <code>SELECT p.nickname, b.name FROM payees p JOIN billers b ON b.id = p.biller_id WHERE p.customer_id = 1 AND p.deleted_at IS NULL</code>.",
        "On a QA database with 4 sandboxes, all reset to the seed, how many rows does the WRONG query of example 2 count compared with the RIGHT one? Explain the factor in two sentences.",
        "Run <code>mvn test -Dtest=\"DbSmokeTest,SandboxScopeDbTest\" -DsandboxId=2</code> locally (there is no sandbox 2). Record which tests fail and how. Why is a loud failure here better than a silent pass?",
      ],
      quiz: [
        {
          q: "On QA with 5 student sandboxes, <code>SELECT count(*) FROM accounts WHERE id = 1</code> returns…",
          options: ["1", "0", "5", "It depends on who created the account"],
          answer: 2,
          explain: "Seed ids repeat in every sandbox. Without <code>sandbox_id = ?</code> you count Emma's chequing in all five.",
        },
        {
          q: "Why do tests on transfers you just created often pass even without the sandbox filter?",
          options: ["The API filters for you", "Runtime ids come from one global sequence, so they are unique across sandboxes", "qa_reader only sees your sandbox", "Transfers have no sandbox_id"],
          answer: 1,
          explain: "Only seed ids repeat. That makes the missing filter an intermittent bug, which is the worst kind.",
        },
        {
          q: "Which join is correct?",
          options: ["<code>ON a.sandbox_id = t.sandbox_id AND a.id = t.account_id</code>", "<code>ON a.id = t.account_id</code>", "<code>ON a.sandbox_id = 1</code>", "<code>USING (id)</code>"],
          answer: 0,
          explain: "Keys are composite <code>(sandbox_id, id)</code>; join on both columns.",
        },
        {
          q: "Your suite is green locally. What does that prove about sandbox scoping?",
          options: ["Every query is scoped", "QA will also be green", "Joins are correct, filters may not be", "Nothing: with one sandbox, scoped and unscoped queries return the same rows"],
          answer: 3,
          explain: "Locally there is nothing to leak. Review the SQL, or enforce the rule in code.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "clock",
      title: "Clock-driven DB checks",
      summary: "app_now() and processed_through; read-only clock checks for the default run, and destructive tests that move the clock and verify the due work in the tables.",
      body: `
<p>Every business rule in Ice Bank runs on the <strong>sandbox clock</strong>, not your computer's: limits per Toronto day, OTP and lockout expiry, scheduled bills,
e-Transfer expiry after 30 days, daily savings interest. In the database the clock is one function and one column:</p>
<ul>
<li><code>app_now(sandbox_id)</code> = <code>now()</code> + <code>sandboxes.clock_offset_seconds</code>. Every <code>created_at</code> and <code>posted_at</code> Ice Bank writes comes from it.
Real time keeps ticking from wherever the clock was set.</li>
<li><code>sandboxes.processed_through</code>: the last Toronto day whose <strong>due work</strong> (bills, loan collections, e-Transfer expiry, interest) has run. Normally
yesterday.</li>
<li><code>POST /api/v1/test/clock</code> moves the clock <em>forward only</em> and runs the due work for every day it crosses <strong>before it responds</strong>; the response's
<code>dueWork</code> object counts what happened (<code>etransfersExpired</code>, <code>interestPayments</code>, ...). Only a reset brings the clock back.</li>
</ul>

<h3>Two kinds of clock test</h3>
<div class="table-wrap"><table>
<thead><tr><th></th><th>Read-only clock checks</th><th>Clock-moving tests</th></tr></thead>
<tbody>
<tr><td>Examples</td><td><code>app_now</code> = <code>now()</code> + offset; a transfer is stamped with sandbox time; <code>processed_through</code> is yesterday</td><td>an e-Transfer expires after 30 days and is refunded; one day of interest accrues; a scheduled bill posts</td></tr>
<tr><td>Tags</td><td><code>db</code> (+ <code>api</code>)</td><td><code>api</code>, <code>db</code>, <strong><code>destructive</code></strong></td></tr>
<tr><td>Runs in</td><td>the default <code>mvn test</code>, local and QA</td><td>only on demand, only in a sandbox that is yours alone: <code>mvn test -Dgroups=destructive -DexcludedGroups=</code></td></tr>
<tr><td>Data</td><td>reads, plus tiny reversible actions</td><td><code>TestSupportClient.reset()</code> before and after (the clock never moves back otherwise)</td></tr>
</tbody></table></div>

<h3>Worked example: an e-Transfer expires</h3>
<p><code>ETransferExpiryDestructiveTest</code> (example 3) resets the sandbox in <code>@BeforeEach</code>, so it starts from known data (Sophie's chequing is account 14). It sends
Sophie's $1.00 e-Transfer to an outside address (PENDING), keeps its <code>id</code> and <code>referenceId</code>, and moves the clock 31 days. The response must report at least
one expired e-Transfer. Then the database: the e-Transfer row is <code>EXPIRED</code> with <code>expired_at</code> set; a <code>REVERSAL</code> CREDIT of 1.00 with the same
reference refunded it; exactly one <code>ETRANSFER_EXPIRED</code> audit row exists for it. It does <em>not</em> assert Sophie's final balance: in 31 days other due work ran too
(interest, bills, loan payments), so the final balance is the wrong oracle. <code>@AfterEach</code> resets again so the next person gets the seed clock.</p>
<p><strong>Before you run it:</strong> it wipes the sandbox (twice) and moves the clock. Locally, on your own machine, that is fine. On QA, only ever with your own sandbox key,
and never while a teammate is using that sandbox.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Moving the clock in a test without the <code>destructive</code> tag. The default run then changes the date for everyone using that sandbox.</li>
<li>No reset afterwards. The clock stays 31 days ahead; every later test that depends on "today" or on pending e-Transfers misbehaves.</li>
<li><code>LocalDate.now()</code> as "today". Use <code>(app_now(?) AT TIME ZONE 'America/Toronto')::date</code> (or <code>GET /test/clock</code>'s <code>today</code>).</li>
<li>Asserting a final balance after many simulated days. Assert the rows the due work wrote (status, refund, audit) instead.</li>
<li>Running destructive tests in parallel or in random order with other classes: one test's reset wipes another test's data. Run them alone.</li>
<li>Expecting the clock to go back after the test because "it was only a test". It does not; only <code>POST /test/reset</code> resets it.</li>
</ul></div>`,
      examples: [
        {
          title: "Read-only: the database clock and the API clock agree (safe in the default run)",
          lang: "java",
          code: `
/** Read-only checks on the sandbox clock. They never move it. */
@Tag("db")
@Feature("Sandbox clock")
@DisplayName("The database and the API use the sandbox clock")
class SandboxClockDbTest {

    private final Db db = Db.reader();
    private final Cleanup cleanup = new Cleanup();

    @AfterEach
    void undo() {
        cleanup.runAll();
    }

    @Test
    @DisplayName("app_now() = now() + clock_offset_seconds, and daily jobs have run up to yesterday (Toronto)")
    void appNowIsRealTimePlusOffset() {
        Map<String, Object> row = db.queryOne("""
                SELECT extract(epoch FROM app_now(s.id) - now())::bigint AS shift_seconds,
                       s.clock_offset_seconds,
                       (app_now(s.id) AT TIME ZONE 'America/Toronto')::date AS toronto_today,
                       s.processed_through
                  FROM sandboxes s WHERE s.id = ?""", Config.sandboxId());

        assertThat(row.get("shift_seconds")).isEqualTo(row.get("clock_offset_seconds"));
        LocalDate today = (LocalDate) row.get("toronto_today");
        assertThat((LocalDate) row.get("processed_through")).isEqualTo(today.minusDays(1));
    }

    @Test
    @Tag("api")
    @DisplayName("A transfer is stamped with the sandbox time, not the wall clock")
    void transferUsesSandboxTime() {
        AccountsClient accounts = new AccountsClient();
        TransfersClient transfers = new TransfersClient();
        long chequing = accounts.firstOfType(Personas.SOPHIE, AccountType.CHEQUING).id();
        long savings = accounts.firstOfType(Personas.SOPHIE, AccountType.SAVINGS).id();
        BigDecimal amount = TestData.money("0.01");

        Transfer t = transfers.transfer(Personas.SOPHIE, chequing, savings, amount);
        cleanup.add("transfer back", () -> transfers.transfer(Personas.SOPHIE, savings, chequing, amount));

        OffsetDateTime sandboxNow = db.scalar(OffsetDateTime.class, "SELECT app_now(?)", Config.sandboxId());
        long offset = db.scalar(Long.class, "SELECT clock_offset_seconds FROM sandboxes WHERE id = ?", Config.sandboxId());

        assertThat(Duration.between(t.createdAt(), sandboxNow).abs()).isLessThan(Duration.ofSeconds(30));
        if (Math.abs(offset) > 60) {   // only meaningful when the sandbox clock is not real time
            assertThat(Duration.between(t.createdAt(), OffsetDateTime.now()).abs()).isGreaterThan(Duration.ofSeconds(30));
        }
    }
}`,
          note: "<code>Cleanup</code> is a small helper from lesson 10: undo steps registered during the test run in <code>@AfterEach</code>, even when the test fails.",
        },
        {
          title: "The clock in SQL",
          lang: "sql",
          code: `
SELECT s.id,
       app_now(s.id)                                       AS sandbox_now,
       (app_now(s.id) AT TIME ZONE 'America/Toronto')::date AS toronto_today,
       round(s.clock_offset_seconds / 86400.0, 2)          AS offset_days,
       s.processed_through
FROM sandboxes s
WHERE s.id = 1;`,
          note: "A negative <code>offset_days</code> means the sandbox is behind your calendar: the seed instant is Monday 2 November 2026, 09:00 Toronto, whatever today's real date is.",
        },
        {
          title: "Destructive: move the clock 31 days and verify the expiry in the tables",
          lang: "java",
          code: `
/**
 * Moves the sandbox clock 31 days, so it is DESTRUCTIVE: excluded from the default run.
 * Run it only on a sandbox that is yours alone:  mvn test -Dgroups=destructive -DexcludedGroups= -Dtest=ETransferExpiryDestructiveTest
 */
@Tag("api")
@Tag("db")
@Tag("destructive")
@Feature("Sandbox clock")
@DisplayName("A pending e-Transfer expires after 30 days and is refunded (clock moved)")
class ETransferExpiryDestructiveTest {

    private final Db db = Db.reader();

    @BeforeEach
    void startFromTheSeed() {
        TestSupportClient.reset().then().statusCode(200);
    }

    @AfterEach
    void putTheClockBack() {
        TestSupportClient.reset().then().statusCode(200);   // the clock never moves backwards: only a reset helps
    }

    @Test
    void pendingETransferExpiresAndIsRefunded() {
        long chequing = 14;   // Sophie's chequing right after a reset
        JsonPath sent = given().spec(Specs.as(Personas.SOPHIE))
                .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                .body(Map.of("fromAccountId", chequing, "recipientName", "Expiry Check",
                        "recipientEmail", "expiry.check@example.com", "amount", "1.00",
                        "securityQuestion", "Which tutorial?", "securityAnswer", "eight"))
                .when().post("/etransfers")
                .then().statusCode(201).extract().jsonPath();
        long id = sent.getLong("id");
        String reference = sent.getString("referenceId");

        TestSupportClient.advanceDays(31)
                .then().statusCode(200)
                .body("dueWork.etransfersExpired", greaterThanOrEqualTo(1));

        Map<String, Object> et = db.queryOne("SELECT status, expired_at FROM etransfers WHERE sandbox_id = ? AND id = ?",
                Config.sandboxId(), id);
        assertThat(et.get("status")).isEqualTo("EXPIRED");
        assertThat(et.get("expired_at")).isNotNull();

        Map<String, Object> refund = db.queryOne("""
                SELECT direction, amount, type FROM transactions
                 WHERE sandbox_id = ? AND reference_id = ? AND type = 'REVERSAL'""", Config.sandboxId(), reference);
        assertThat(refund.get("direction")).isEqualTo("CREDIT");
        assertThat((BigDecimal) refund.get("amount")).isEqualByComparingTo("1.00");

        assertThat(db.scalar(Long.class, """
                SELECT count(*) FROM audit_log WHERE sandbox_id = ? AND action = 'ETRANSFER_EXPIRED' AND entity_id = ?""",
                Config.sandboxId(), id)).isEqualTo(1L);
        // Other due work (interest, bill payments, loan collections) also ran during those 31 days,
        // so assert the refund row, not the final balance.
    }
}`,
          note: "Extra imports: the starter's <code>TestSupportClient</code>, <code>Specs</code>, <code>TransfersClient</code>; <code>io.restassured.path.json.JsonPath</code>; Hamcrest's <code>greaterThanOrEqualTo</code>; <code>RestAssured.given</code>. The tag keeps it out of every default run.",
        },
        {
          title: "Running (and not running) destructive tests",
          lang: "bash",
          code: `
mvn test                                                    # default: destructive excluded by the pom
mvn test -Dgroups=destructive -DexcludedGroups=             # ONLY destructive tests (your own sandbox!)
mvn test -Dgroups=destructive -DexcludedGroups= -Dtest=ETransferExpiryDestructiveTest

# See what a tag expression selects without running anything (JUnit dry run):
mvn test -Dgroups=destructive -DexcludedGroups= -Djunit.platform.execution.dryRun.enabled=true`,
          note: "PowerShell: <code>mvn test \"-Dgroups=destructive\" \"-DexcludedGroups=\"</code>. In a dry run every selected test is reported as skipped and nothing touches Ice Bank, a safe way to check your tags.",
        },
      ],
      exercises: [
        "Add <code>LocalDate sandboxToday()</code> to your <code>DbChecks</code> (Toronto date of <code>app_now</code>) and a read-only test showing it equals the wall-clock date shifted by <code>clock_offset_seconds</code>, not <code>LocalDate.now()</code>. Replace one use of <code>LocalDate.now()</code> in your suite with it.",
        "<strong>Destructive, your own local sandbox only.</strong> After a reset, read Sophie's savings <code>balance</code>, <code>interest_rate</code> and <code>accrued_interest</code>, move the clock 1 day, and assert <code>accrued_interest</code> grew by exactly <code>round(balance x rate / 365, 6)</code> and <code>processed_through</code> moved one day. Tag it correctly and reset afterwards.",
        "<strong>Destructive.</strong> Find the expiry boundary: send a pending e-Transfer, move the clock 29 days and assert it is still PENDING, then 2 more days and assert EXPIRED.",
        "Prove your tags work without running anything: with the JUnit dry run, show that plain <code>mvn test</code> does not select your clock-moving classes and that <code>-Dgroups=destructive -DexcludedGroups=</code> selects only them. Paste both Surefire summaries in your notes.",
      ],
      quiz: [
        {
          q: "Which tag must a test that calls <code>POST /test/clock</code> carry?",
          options: ["<code>writer</code>", "<code>slow</code>", "<code>destructive</code>", "None, the clock is read-only"],
          answer: 2,
          explain: "Moving the clock changes the date for everyone in that sandbox, and only a reset undoes it. The pom excludes <code>destructive</code> by default.",
        },
        {
          q: "After moving the clock 31 days, why not assert Sophie's exact final balance?",
          options: ["Balances are hidden after a clock move", "Other due work (interest, bills, loan payments) also ran, so the final balance mixes many effects", "The API caches the old balance", "BigDecimal cannot compare dates"],
          answer: 1,
          explain: "Assert the rows the due work wrote for <em>your</em> scenario: status, refund row, audit row.",
        },
        {
          q: "<code>app_now(1)</code> returns 2026-11-02 14:10 UTC while your PC says 5 November. What is \"today\" for Ice Bank?",
          options: ["2 November (the Toronto date of app_now)", "5 November", "3 November", "It depends on the browser"],
          answer: 0,
          explain: "All business dates come from the sandbox clock in America/Toronto.",
        },
        {
          q: "What does <code>sandboxes.processed_through</code> tell you?",
          options: ["When the sandbox was created", "The date of the newest transaction", "The last reset", "The last day whose due work (bills, expiry, interest) has run"],
          answer: 3,
          explain: "Normally it is yesterday (Toronto). After a clock move it jumps forward with the due work.",
        },
        {
          q: "How can you check which tests <code>-Dgroups=destructive -DexcludedGroups=</code> selects without resetting anything?",
          options: ["Run it and watch carefully", "Use <code>-DskipTests</code>", "Add <code>-Djunit.platform.execution.dryRun.enabled=true</code>", "Comment out the reset"],
          answer: 2,
          explain: "JUnit's dry run reports every selected test as skipped without executing it, including lifecycle methods.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "dbchecks",
      title: "Reusable DbChecks and test data cleanup",
      summary: "Move SQL out of tests into one class of named questions, return records, compose soft assertions, and clean up with compensating actions that always run.",
      body: `
<p>By now your tests contain a lot of SQL. When the same query appears in three tests, or a test reads like a database script, it is time for a layer between
<code>Db</code> (generic JDBC) and the tests: <code>DbChecks</code>, one method per <strong>question a test asks the database</strong>.</p>
<pre role="img" aria-label="Diagram: tests call DbChecks, which calls Db, which talks JDBC to the database" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
tests/...DbTest   "after this transfer, is everything posted?"   checks.assertTransferPosted(t)
      |
db/DbChecks       Ice Bank questions: balance(id), legs(ref), auditActions(type, id), snapshot(id)...
      |           sandbox-scoped, typed records, @Step names, no business assertions except composed ones
db/Db             JDBC: connections, parameters, type mapping, Allure attachments
</pre>

<h3>Design rules</h3>
<ul>
<li><strong>Name methods by the question</strong>: <code>legs(reference)</code>, <code>balance(accountId)</code>, <code>customerByEmail(email)</code>, not <code>query7()</code>.</li>
<li><strong>Return records once a shape repeats</strong>: <code>record Leg(long id, long accountId, String direction, BigDecimal amount, ...)</code> beats
<code>(BigDecimal) row.get("amount")</code> in every test.</li>
<li><strong>Scope every query</strong> to <code>Config.sandboxId()</code> in one place (<code>rows(...)</code> adds it as the first parameter and refuses unscoped SQL).</li>
<li><strong>Questions return data; tests assert.</strong> The exception: <em>composed checks</em> such as <code>assertTransferPosted(t)</code> that bundle the five things every
transfer test checks. Use AssertJ <code>SoftAssertions</code> there so one run reports <em>all</em> differences, not just the first.</li>
<li><strong>Allure</strong>: <code>@Step("DB: legs with reference {reference}")</code> on each method gives a readable report tree, with <code>Db</code>'s SQL attachments underneath.</li>
</ul>

<h3>Test data and cleanup</h3>
<ul>
<li><strong>Read</strong> personas freely. <strong>Write</strong> with data nobody else depends on: Sophie for money (tiny amounts, moved back), or a brand-new customer from
<code>POST /auth/register</code> (a unique email such as <code>t8.3f9a1c2b@icebank.test</code>) for anything that changes a customer's state.</li>
<li><strong>You cannot delete your way back.</strong> POSTED transactions are immutable (lesson 6), and deleting rows behind the API's back leaves the data in a state the app never
produces. Cleanup is a <strong>compensating action through the API</strong>: transfer back, cancel the e-Transfer, delete the payee.</li>
<li><strong>Register the undo right after the action succeeds</strong>, in a <code>Cleanup</code> object, and run all undos in <code>@AfterEach</code>, newest first. They run even
when an assertion failed half-way, and a failing undo is reported instead of silently leaving data behind.</li>
<li><strong>Database-only setup</strong> (a hold, a strange status) happens inside <code>inRolledBackTransaction</code>, so it needs no cleanup at all.</li>
<li>Registered throwaway customers stay in the sandbox. That is harmless (nobody uses their emails), and a reset of your own sandbox removes them.</li>
</ul>

<h3>Worked example: <code>assertTransferPosted</code></h3>
<p>Read the composed check in example 1. It loads the legs by reference once, then for each leg soft-asserts five things: the id matches the response's
<code>debitTransactionId</code>/<code>creditTransactionId</code>, the account matches <code>from</code>/<code>to</code>, the amount, the POSTED status, and a non-null
<code>balance_after</code>; then the leg's audit actions are exactly <code>[TRANSACTION_CREATED]</code>, and the transfer's are exactly <code>[TRANSFER_POSTED]</code>.
<code>soft.assertAll()</code> throws one error listing every failed line with its <code>as(...)</code> description. In the test (example 4) it is one line:
<code>checks.assertTransferPosted(t)</code>, right after the transfer and the line that registers its undo.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>A <code>DbChecks</code> method that asserts inside a plain question (<code>balance()</code> that fails when the balance is negative). The next test that needs a negative
balance cannot use it. Keep questions neutral.</li>
<li>Returning a <code>ResultSet</code> or keeping one static <code>Connection</code> for the whole suite. Results must be plain values, and connections short-lived.</li>
<li>Cleanup at the end of the test body: skipped whenever the test fails, which is exactly when data is most likely to be in a strange state.</li>
<li>Cleaning up API-created data with <code>qa_writer</code> <code>DELETE</code>s. Triggers refuse some, the rest leaves inconsistent data. Undo through the API.</li>
<li>Registering a new customer in every test. Registration counts toward the 10-per-minute sign-in rate limit; reuse one per class where you can.</li>
<li>One huge <code>DbUtils</code> with 60 static methods. Group by area (<code>DbChecks</code> for money and audit, maybe <code>CustomerChecks</code> later) and keep each method short.</li>
</ul></div>`,
      examples: [
        {
          title: "db/DbChecks.java: named, scoped questions and one composed check",
          lang: "java",
          code: `
package com.icebank.db;

import com.icebank.config.Config;
import com.icebank.model.Transfer;
import io.qameta.allure.Step;
import org.assertj.core.api.SoftAssertions;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Ice Bank checks built on {@link Db}: one method per question a test asks the database.
 * Every query is scoped to {@link Config#sandboxId()}: the SQL must contain "sandbox_id = ?" as its first parameter.
 */
public final class DbChecks {

    /** One transactions row (one leg of a money movement). */
    public record Leg(long id, long accountId, String direction, BigDecimal amount, BigDecimal balanceAfter, String status, String type) {
        static Leg of(Map<String, Object> r) {
            return new Leg((Long) r.get("id"), (Long) r.get("account_id"), (String) r.get("direction"), (BigDecimal) r.get("amount"),
                    (BigDecimal) r.get("balance_after"), (String) r.get("status"), (String) r.get("type"));
        }
    }

    private final Db db;
    private final int sandboxId;

    public DbChecks(Db db) {
        this.db = db;
        this.sandboxId = Config.sandboxId();
    }

    /** Read-only checks as qa_reader (works on local and QA). */
    public static DbChecks reader() {
        return new DbChecks(Db.reader());
    }

    @Step("DB: balance of account {accountId}")
    public BigDecimal balance(long accountId) {
        return db.scalar(BigDecimal.class, requireScoped("SELECT balance FROM accounts WHERE sandbox_id = ? AND id = ?"), sandboxId, accountId);
    }

    @Step("DB: transaction legs with reference {reference}")
    public List<Leg> legs(String reference) {
        return rows("""
                SELECT id, account_id, direction, amount, balance_after, status, type
                  FROM transactions WHERE sandbox_id = ? AND reference_id = ? ORDER BY id""", reference)
                .stream().map(Leg::of).toList();
    }

    @Step("DB: audit actions for {entityType} {entityId}")
    public List<String> auditActions(String entityType, long entityId) {
        return rows("SELECT action FROM audit_log WHERE sandbox_id = ? AND entity_type = ? AND entity_id = ? ORDER BY id",
                entityType, entityId).stream().map(r -> (String) r.get("action")).toList();
    }

    @Step("DB: customer, user and accounts for {email}")
    public Map<String, Object> customerByEmail(String email) {
        List<Map<String, Object>> rows = rows("""
                SELECT c.id AS customer_id, u.id AS user_id, u.status AS user_status, c.postal_code
                  FROM users u
                  JOIN customers c ON c.sandbox_id = u.sandbox_id AND c.user_id = u.id
                 WHERE u.sandbox_id = ? AND u.email = ?""", email.toLowerCase());
        if (rows.size() != 1) {
            throw new AssertionError("Expected one customer for " + email + " but found " + rows.size());
        }
        return rows.get(0);
    }

    @Step("DB: accounts of customer {customerId}")
    public List<Map<String, Object>> accountsOf(long customerId) {
        return rows("SELECT id, type, balance, available_balance, status FROM accounts WHERE sandbox_id = ? AND customer_id = ? ORDER BY id",
                customerId);
    }

    /** Everything a completed transfer must leave behind, reported together (soft assertions). */
    @Step("DB: transfer {t.referenceId} is fully posted")
    public void assertTransferPosted(Transfer t) {
        List<Leg> legs = legs(t.referenceId());
        SoftAssertions soft = new SoftAssertions();
        soft.assertThat(legs).as("legs").hasSize(2);
        for (Leg leg : legs) {
            boolean debit = leg.direction().equals("DEBIT");
            soft.assertThat(leg.id()).as("leg id").isEqualTo(debit ? t.debitTransactionId() : t.creditTransactionId());
            soft.assertThat(leg.accountId()).as("%s account", leg.direction()).isEqualTo(debit ? t.fromAccountId() : t.toAccountId());
            soft.assertThat(leg.amount()).as("%s amount", leg.direction()).isEqualByComparingTo(t.amount());
            soft.assertThat(leg.status()).as("%s status", leg.direction()).isEqualTo("POSTED");
            soft.assertThat(leg.balanceAfter()).as("%s balance_after", leg.direction()).isNotNull();
            soft.assertThat(auditActions("transaction", leg.id())).as("audit of leg %d", leg.id()).containsExactly("TRANSACTION_CREATED");
        }
        soft.assertThat(auditActions("transfer", t.debitTransactionId())).as("TRANSFER_POSTED row").containsExactly("TRANSFER_POSTED");
        soft.assertAll();
    }

    /** Runs a query whose first parameter is the sandbox id; the caller passes only the other parameters. */
    private List<Map<String, Object>> rows(String sql, Object... params) {
        List<Object> all = new ArrayList<>();
        all.add(sandboxId);
        all.addAll(List.of(params));
        return db.queryList(requireScoped(sql), all.toArray());
    }

    /** Refuses SQL that is not scoped to one sandbox. On QA, qa_reader can see every sandbox. */
    public static String requireScoped(String sql) {
        if (!sql.contains("sandbox_id = ?")) {
            throw new IllegalArgumentException("Query is not scoped to a sandbox (missing 'sandbox_id = ?'): " + sql);
        }
        return sql;
    }
}`,
        },
        {
          title: "support/Cleanup.java: undo steps that always run, newest first",
          lang: "java",
          code: `
package com.icebank.support;

import io.qameta.allure.Allure;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Undo actions registered while a test runs, executed newest first in @AfterEach, even when the test failed half-way.
 * Every undo runs; if any fail, the first failure is thrown at the end with the others attached.
 */
public final class Cleanup {

    private static final Logger log = LoggerFactory.getLogger(Cleanup.class);
    private final Deque<Runnable> undo = new ArrayDeque<>();
    private final Deque<String> names = new ArrayDeque<>();

    /** Register an undo step. Call it right after the action succeeded. */
    public void add(String what, Runnable action) {
        names.push(what);
        undo.push(action);
    }

    /** Run every registered undo, newest first, then forget them. */
    public void runAll() {
        RuntimeException first = null;
        while (!undo.isEmpty()) {
            String what = names.pop();
            Runnable action = undo.pop();
            try {
                Allure.step("Cleanup: " + what, action::run);
            } catch (RuntimeException e) {
                log.warn("Cleanup step failed: {}", what, e);
                if (first == null) {
                    first = e;
                } else {
                    first.addSuppressed(e);
                }
            }
        }
        if (first != null) {
            throw first;
        }
    }
}`,
        },
        {
          title: "support/TestCustomers.java: a brand-new customer for tests that must not touch personas",
          lang: "java",
          code: `
public final class TestCustomers {

    public static final String PASSWORD = "Glacier#2026";

    private TestCustomers() {
    }

    /** Registers prefix.<8 hex>@icebank.test and returns the email. Counts toward the 10-per-minute sign-in limit. */
    @Step("Register a new customer {prefix}.*@icebank.test")
    public static String register(String prefix) {
        String email = prefix + "." + UUID.randomUUID().toString().substring(0, 8) + "@icebank.test";
        given().spec(Specs.base())
                .body(Map.ofEntries(
                        Map.entry("firstName", "Tutorial"), Map.entry("lastName", "Eight"),
                        Map.entry("dateOfBirth", "1995-05-05"), Map.entry("email", email),
                        Map.entry("phone", "(416) 555-0199"), Map.entry("addressLine1", "200 Bay Street"),
                        Map.entry("city", "Toronto"), Map.entry("province", "ON"), Map.entry("postalCode", "M5J 2T3"),
                        Map.entry("sin", "193 746 286"), Map.entry("password", PASSWORD)))
                .when().post("/auth/register")
                .then().statusCode(201);
        return email;
    }
}`,
          note: "<code>Map.of</code> takes at most 10 pairs; registration has 11 fields, hence <code>Map.ofEntries</code>. The SIN only has to be valid, not unique. To call the API as this customer, sign in once with <code>AuthClient.signIn(email, TestCustomers.PASSWORD)</code>; after that <code>Specs.as(email)</code> uses the cached token.",
        },
        {
          title: "DbChecksDbTest: the checks in use",
          lang: "java",
          code: `
@Tag("api")
@Tag("db")
@Feature("DbChecks")
@DisplayName("Reusable DB checks and cleanup")
class DbChecksDbTest {

    private final DbChecks checks = DbChecks.reader();
    private final Cleanup cleanup = new Cleanup();

    @AfterEach
    void undo() {
        cleanup.runAll();
    }

    @Test
    @DisplayName("Registration creates a user, a customer, an empty chequing account and an audit row")
    void registrationWritesEverything() {
        String email = TestCustomers.register("t8");     // a throwaway customer: nobody else depends on it

        Map<String, Object> customer = checks.customerByEmail(email);
        assertThat(customer).containsEntry("user_status", "ACTIVE").containsEntry("postal_code", "M5J 2T3");
        long customerId = (Long) customer.get("customer_id");

        List<Map<String, Object>> accounts = checks.accountsOf(customerId);
        assertThat(accounts).singleElement().satisfies(a -> {
            assertThat(a).containsEntry("type", "CHEQUING").containsEntry("status", "OPEN");
            assertThat((BigDecimal) a.get("balance")).isEqualByComparingTo("0.00");
        });
        assertThat(checks.auditActions("customer", customerId)).containsExactly("CUSTOMER_REGISTERED");
    }

    @Test
    @DisplayName("A transfer passes the composed check; the cleanup puts the money back")
    void transferIsFullyPosted() {
        AccountsClient accounts = new AccountsClient();
        TransfersClient transfers = new TransfersClient();
        long chequing = accounts.firstOfType(Personas.SOPHIE, AccountType.CHEQUING).id();
        long savings = accounts.firstOfType(Personas.SOPHIE, AccountType.SAVINGS).id();
        BigDecimal amount = TestData.money("0.01");

        Transfer t = transfers.transfer(Personas.SOPHIE, chequing, savings, amount);
        cleanup.add("transfer $0.01 back to chequing", () -> transfers.transfer(Personas.SOPHIE, savings, chequing, amount));

        checks.assertTransferPosted(t);
    }

    @Test
    @DisplayName("DbChecks refuses SQL that is not scoped to a sandbox")
    void unscopedSqlIsRefused() {
        assertThatThrownBy(() -> DbChecks.requireScoped("SELECT balance FROM accounts WHERE id = ?"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not scoped");
    }
}`,
        },
      ],
      exercises: [
        "Add <code>List&lt;Leg&gt; latestTransactions(long accountId, int n)</code> to <code>DbChecks</code> (same order as the API) and a test that compares it with <code>GET /accounts/{id}/transactions?size=3</code> for Sophie's chequing: same ids in the same order, same amounts and directions.",
        "Add a <code>record Snapshot(BigDecimal balance, BigDecimal available, long transactions)</code> with a <code>minus(Snapshot before)</code> method and <code>DbChecks.snapshot(accountId)</code>. Use it to assert that a $0.01 transfer changed Sophie's chequing by exactly -0.01, -0.01 and +1 row. Register the transfer back with <code>Cleanup</code>.",
        "Payee lifecycle on a throwaway customer: register one, sign them in, add a payee (billerId 3, account number <code>1234-5678-9012</code>), verify the row and the <code>PAYEE_ADDED</code> audit row, and register two cleanup steps so that after the test the payee is deleted <em>and</em> a final step proves it is gone with <code>[PAYEE_ADDED, PAYEE_DELETED]</code> in its audit trail. Think about the order you register them in.",
        "Turn <code>Cleanup</code> into a JUnit 5 extension (<code>ParameterResolver</code> + <code>AfterEachCallback</code>) so a test declares <code>void myTest(Cleanup cleanup)</code> and can no longer forget the <code>@AfterEach</code>.",
        "Review your suite: list every test that writes data and how it restores it (transfer back, cancel, delete, rollback, nothing). Fix at least one \"nothing\".",
      ],
      quiz: [
        {
          q: "Why use <code>SoftAssertions</code> in <code>assertTransferPosted</code>?",
          options: ["They are faster", "One run reports every difference (both legs, audit) instead of stopping at the first", "They never fail", "They are required by Allure"],
          answer: 1,
          explain: "A composed check covers many facts; seeing all failures at once makes the bug report complete.",
        },
        {
          q: "A test transferred $0.01 and then failed an assertion. How does the money get back?",
          options: ["The undo registered in <code>Cleanup</code> runs in <code>@AfterEach</code>", "It does not; rerun the test", "The transaction is rolled back automatically", "Delete the legs with qa_writer"],
          answer: 0,
          explain: "API actions are committed. A compensating transfer, registered right after the action, restores the data even on failure.",
        },
        {
          q: "Why not clean up an API transfer by deleting its transaction rows as <code>qa_writer</code>?",
          options: ["qa_writer cannot connect", "The rows are in another schema", "It is too slow", "POSTED rows are immutable (the trigger refuses), and deleting behind the API leaves inconsistent data"],
          answer: 3,
          explain: "Undo through the API, like a customer would.",
        },
        {
          q: "<code>Cleanup</code> runs undo steps newest first. You register \"verify payee is gone\" and then \"delete payee\". In which order do they run?",
          options: ["Verify, then delete", "In parallel", "Delete, then verify", "Only the last one runs"],
          answer: 2,
          explain: "Last in, first out: the delete was registered last, so it runs first, and the verification runs after it.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "capstone",
      title: "Capstone: one test across API, UI and DB, with an Allure report",
      summary: "Act through the API, prove it in the database, see it in the browser, clean up, and read the whole story in one Allure report.",
      links: [{ label: "Allure report docs", href: "https://allurereport.org/docs/" }],
      body: `
<p>The week-3 capstone is one test that spans all three layers of Ice Bank: the <strong>API</strong> does the work, the <strong>database</strong> proves it happened
correctly, and the <strong>browser</strong> shows the customer the same truth. Its Allure report should let someone who has never seen your code follow every step.
Done when: green on your local clean build, and red on QA when the instructor's bug packs are enabled.</p>

<h3>The shape</h3>
<ol>
<li><strong>Arrange</strong>: find Sophie's accounts through the API; read the balance before (DB).</li>
<li><strong>Act (API)</strong>: <code>transfers.transfer(...)</code> $0.01 chequing to savings; register the undo immediately.</li>
<li><strong>Assert (DB)</strong>: <code>DbChecks.assertTransferPosted(t)</code>; balance after = before - 0.01.</li>
<li><strong>Assert (UI)</strong>: sign in as Sophie in Chrome; the dashboard's chequing balance equals the database balance in UI format (<code>TestData.uiMoney</code>); the
account page shows a row for <code>t.debitTransactionId()</code> with <code>-$0.01</code> and the reference id.</li>
<li><strong>Cleanup</strong>: the registered transfer back runs in <code>@AfterEach</code>; <code>DriverExtension</code> closes Chrome (and attaches a screenshot if anything failed).</li>
</ol>

<h3>Design decisions worth defending</h3>
<ul>
<li><strong>API for the act, browser for the check.</strong> The act through the API is fast and stable; the UI step proves what the customer sees. A UI-driven variant
(exercise 2) is a good second test, not a replacement.</li>
<li><strong>The database is the oracle for the UI.</strong> Read the balance from the DB right before comparing, and format it the way the UI does, instead of hard-coding
<code>"$4,817.14"</code>.</li>
<li><strong>Locate by id.</strong> The account page renders each row as <code>data-testid="transaction-row-{id}"</code>; the response gives you the id. No "first row of the table"
guesswork, no text search.</li>
<li><strong>One persona, one amount, one reference.</strong> Every assertion is about this transfer, so the test stays correct while other activity happens in the sandbox.</li>
</ul>

<h3>The Allure report</h3>
<p>Steps come from <code>@Step</code> on client methods (<code>TransfersClient.create</code>, <code>AuthClient.signIn</code>, <code>InboxClient.latestOtp</code>), on
<code>DbChecks</code> and on page objects, plus <code>Allure.step(...)</code> blocks in the test; every SQL query and every HTTP call is attached. Metadata
(<code>@Epic</code>, <code>@Feature</code>, <code>@Story</code>, <code>@Severity</code>) groups the test on the Behaviors tab. Generate it with <code>mvn allure:serve</code> after the run.
A real run of the capstone produced this tree (attachments omitted):</p>
<pre aria-label="Allure step tree of a capstone run" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
List accounts of sophie.bouchard@icebank.test
  Sign in as sophie.bouchard@icebank.test (password + OTP from Ice Mail)
    Read the newest sign-in code for sophie.bouchard@icebank.test from Ice Mail
List accounts of sophie.bouchard@icebank.test
DB: balance of account 14
  SQL (qa_reader): SELECT balance FROM accounts WHERE sandbox_id = ? AND id = ?
Transfer 0.01 from account 14 to 15 as sophie.bouchard@icebank.test
DB: transfer TRF-488D580C8A60 is fully posted
  DB: transaction legs with reference TRF-488D580C8A60
  DB: audit actions for transaction 1001756
  DB: audit actions for transaction 1001758
  DB: audit actions for transfer 1001756
DB: balance of account 14
Sign in as Sophie in the browser
  Open the login page / Sign in with email ... / Read the newest sign-in code ... / Enter the one-time code
Open account 14 in the browser
Cleanup: transfer $0.01 back
  Transfer 0.01 from account 15 to 14 as sophie.bouchard@icebank.test
</pre>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Asserting the UI before the database. If the UI is wrong you do not know whether the data or the screen is at fault; check the system of record first.</li>
<li>Hard-coding the expected dashboard text. Balances move; derive it from the DB value with <code>TestData.uiMoney</code>.</li>
<li><code>Thread.sleep</code> while the page loads. The page objects wait for the exact element (<code>visible(...)</code>); the account page waits for the row with your id.</li>
<li>Forgetting cleanup because "it is only one cent". Run the capstone twenty times and Sophie is twenty cents short, and other tests' balance arithmetic starts to drift.</li>
<li>Running the capstone from IntelliJ without the AspectJ agent: the test passes but the report has no steps. Run it through Maven, or add the agent to the VM options.</li>
<li>Publishing a report from a QA run. It contains full API responses, including short-lived access tokens.</li>
</ul></div>`,
      examples: [
        {
          title: "ui/pages/AccountPage.java: the account page, rows located by transaction id",
          lang: "java",
          code: `
package com.icebank.ui.pages;

import io.qameta.allure.Step;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/** /accounts/{id}: one account with its transactions table (newest first). */
public class AccountPage extends BasePage {

    private static final By BALANCE = testId("account-detail-balance");
    private static final By TABLE = testId("transactions-table");

    public AccountPage(WebDriver driver) {
        super(driver);
    }

    /** Opens the account page and waits for the transactions table. */
    @Step("Open account {accountId} in the browser")
    public AccountPage open(long accountId) {
        openPath("/accounts/" + accountId);
        visible(TABLE);
        return this;
    }

    public String balanceText() {
        return text(BALANCE);
    }

    /** The amount cell of the row for transaction {@code transactionId}, e.g. "-$0.01". Waits for the row. */
    public String amountOf(long transactionId) {
        return visible(row(transactionId)).findElement(testId("transaction-amount")).getText().trim();
    }

    /** The description cell, which also shows the reference id on a second line. */
    public String descriptionOf(long transactionId) {
        return visible(row(transactionId)).findElement(testId("transaction-description")).getText().trim();
    }

    private static By row(long transactionId) {
        return testId("transaction-row-" + transactionId);
    }
}`,
        },
        {
          title: "tests/e2e/TransferEndToEndTest.java: the capstone",
          lang: "java",
          code: `
@Tag("api")
@Tag("db")
@Tag("ui")
@Epic("Payments")
@Feature("Transfers")
@Story("End to end")
@ExtendWith(DriverExtension.class)
@DisplayName("Capstone: one transfer, checked in the API, the database and the browser")
class TransferEndToEndTest {

    private final AccountsClient accounts = new AccountsClient();
    private final TransfersClient transfers = new TransfersClient();
    private final DbChecks db = DbChecks.reader();
    private final Cleanup cleanup = new Cleanup();

    @AfterEach
    void undo() {
        cleanup.runAll();
    }

    @Test
    @Severity(SeverityLevel.CRITICAL)
    @DisplayName("A $0.01 transfer is posted in the DB and shown on the dashboard and the account page")
    void transferIsConsistentEverywhere(WebDriver driver) {
        String sophie = Personas.SOPHIE;
        long chequing = accounts.firstOfType(sophie, AccountType.CHEQUING).id();
        long savings = accounts.firstOfType(sophie, AccountType.SAVINGS).id();
        BigDecimal amount = TestData.money("0.01");
        BigDecimal before = db.balance(chequing);

        // API: act
        Transfer t = transfers.transfer(sophie, chequing, savings, amount);
        cleanup.add("transfer $0.01 back", () -> transfers.transfer(sophie, savings, chequing, amount));

        // DB: the system of record
        db.assertTransferPosted(t);
        BigDecimal after = db.balance(chequing);
        assertThat(after).isEqualByComparingTo(before.subtract(amount));

        // UI: what the customer sees
        DashboardPage dashboard = Allure.step("Sign in as Sophie in the browser", () ->
                new LoginPage(driver).open().signIn(sophie, Personas.password()).enterCode(InboxClient.latestOtp(sophie)));
        assertThat(dashboard.balanceText("chequing")).isEqualTo(TestData.uiMoney(after));

        AccountPage page = new AccountPage(driver).open(chequing);
        assertThat(page.amountOf(t.debitTransactionId())).isEqualTo("-" + TestData.uiMoney(amount));
        assertThat(page.descriptionOf(t.debitTransactionId())).contains(t.referenceId());
    }
}`,
          note: "<code>DriverExtension</code> injects the <code>WebDriver</code> parameter, quits Chrome after the test and attaches a screenshot, the URL and the page source when it fails. <code>Cleanup</code> and <code>DbChecks</code> are from lesson 10.",
        },
        {
          title: "Run it and open the report",
          lang: "bash",
          code: `
mvn clean test -Dtest=TransferEndToEndTest              # Chrome opens and closes by itself
mvn clean test -Dtest=TransferEndToEndTest -Dheadless=true
mvn allure:serve                                        # builds the report and opens it in the browser
mvn allure:report                                       # or: target/site/allure-maven-plugin/index.html`,
          note: "<code>mvn clean</code> first, or results of earlier runs (including old failures) appear in the same report. Open <code>index.html</code> through <code>allure:serve</code> or a local web server; straight from disk the browser blocks its data files.",
        },
      ],
      exercises: [
        "Run the capstone, generate the report with <code>mvn allure:serve</code> and find, in the step tree, the step that proves each layer (API, DB, UI). Write down the three step names and one attachment you would show in a bug report.",
        "UI as the act: write a <code>TransferPage</code> page object for <code>/transfer</code> (select From and To by account id, type the amount, Review, Confirm, read <code>transfer-confirmation-reference</code>) and a test that makes a $0.01 transfer in the browser, then proves it with <code>DbChecks.legs(reference)</code> and finds the reference in <code>GET /transfers</code>. Clean up through the API.",
        "Negative capstone: a transfer of Sophie's available balance + $0.01 is refused with 422 INSUFFICIENT_FUNDS, the database shows no change (balance and number of rows), and the dashboard still shows the database balance.",
        "Make the capstone QA-ready without changing its code: list what must be configured for <code>-Denv=qa</code> (which config keys, where), which tags exclude what, and what should happen to the capstone when a bug pack that breaks transfers is enabled.",
        "Polish the report: add <code>@Step</code> to the page object methods you use, and write <code>environment.properties</code> (env, baseUrl, sandboxId from <code>Config</code>) into <code>target/allure-results</code> before the tests, so the report's Overview shows where it ran.",
      ],
      quiz: [
        {
          q: "Why does the capstone act through the API and check in the browser, rather than the other way round?",
          options: ["The UI cannot make transfers", "The API act is fast and stable; the browser step proves what the customer sees", "Allure only records API calls", "The database blocks UI transfers"],
          answer: 1,
          explain: "A UI-driven act is a valuable second test, but the core capstone keeps the slow, fragile part to what only the UI can prove.",
        },
        {
          q: "How does the test find its own row on the account page?",
          options: ["<code>data-testid=\"transaction-row-{debitTransactionId}\"</code> from the API response", "The first row of the table", "Text search for \"$0.01\"", "The newest date"],
          answer: 0,
          explain: "The id from the response identifies the row exactly, even if other transactions appear at the same moment.",
        },
        {
          q: "Where should the expected dashboard balance come from?",
          options: ["A constant in the test", "The previous test run", "The seed reference document", "The database, read right before the check and formatted with <code>TestData.uiMoney</code>"],
          answer: 3,
          explain: "The database is the oracle; the UI must show the same value in its own format.",
        },
        {
          q: "Your report shows no steps, only the test name. Most likely cause?",
          options: ["Allure is not installed", "The test passed", "The test ran without the AspectJ agent (e.g. from the IDE), so <code>@Step</code> was not woven", "Headless mode hides steps"],
          answer: 2,
          explain: "The starter's Surefire configuration adds the agent; IntelliJ needs it in the VM options.",
        },
      ],
    },
  ],
});
