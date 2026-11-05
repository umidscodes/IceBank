/* Tutorial 1: SQL fundamentals. Every query was written against db/migrations/001_schema.sql and 002_objects.sql. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "sql",
  number: 1,
  title: "SQL fundamentals",
  summary: "Connect to the Ice Bank database, read it with confidence, and check that what the API says actually happened in the tables.",
  intro: `
<p>An API test tells you what the server <em>said</em>. A database check tells you what the server <em>did</em>. In week 3 you will verify API actions against
rows over JDBC, so this tutorial gets you fluent in the SQL you need: reading, joining, aggregating, safely changing data for test setup, and
understanding the constraints, triggers, views and the <code>post_transfer</code> function that Ice Bank's data rules depend on.</p>
<div class="callout rule"><p><strong>Two rules for every Ice Bank query.</strong> (1) Every business table has a <code>sandbox_id</code> column, and it is part of every primary
and foreign key. Locally it is always <code>1</code>; on QA each student has their own. Filter on it and join on it, always. (2) Times are stored as
<code>TIMESTAMPTZ</code> (an instant). Ice Bank's business rules use the America/Toronto calendar, so convert with <code>AT TIME ZONE 'America/Toronto'</code>
before you compare dates.</p></div>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "dbeaver",
      title: "DBeaver setup and connecting to Ice Bank",
      summary: "Install a SQL client, connect as the read-only and the read-write user, and run your first queries.",
      body: `
<p><strong>DBeaver</strong> is a free database client: a window where you type SQL, run it, and look at the result as a grid. It plays the same role for
the database that Postman plays for the API. IntelliJ IDEA Ultimate has the same features in its Database tool window, so use that if you already have it;
the connection details are identical.</p>

<h3>Before you connect</h3>
<p>Ice Bank's database is a real PostgreSQL 16 server that <code>npm run dev</code> starts for you on port <strong>5433</strong> (not the usual 5432, so it never
clashes with another Postgres on your machine). If the app is not running, the database is not running either, and DBeaver will report
<em>Connection refused</em>.</p>

<h3>The connection details</h3>
<div class="table-wrap"><table>
<thead><tr><th>Setting</th><th>Local</th><th>QA</th></tr></thead>
<tbody>
<tr><td>JDBC URL</td><td><code>jdbc:postgresql://localhost:5433/icebank</code></td><td>Supabase session-pooler string from the instructor (IPv4)</td></tr>
<tr><td>Host / port / database</td><td><code>localhost</code> / <code>5433</code> / <code>icebank</code></td><td>From the pooler string; SSL mode <code>require</code></td></tr>
<tr><td>Read-only user</td><td><code>qa_reader</code>, password <code>qa_reader</code></td><td><code>qa_reader</code> (the pooler may show it as <code>qa_reader.&lt;project-ref&gt;</code>)</td></tr>
<tr><td>Read-write user</td><td><code>qa_writer</code>, password <code>qa_writer</code></td><td>Not available on QA</td></tr>
</tbody></table></div>
<p><code>qa_reader</code> can <code>SELECT</code> from every table and view but cannot change anything. <code>qa_writer</code> can insert, update and delete, and call
<code>post_transfer</code>; you use it only to set up test data locally. The app itself connects as a third user, <code>icebank_app</code>, which you never need.</p>

<h3>Step by step in DBeaver</h3>
<ol>
<li>Install <em>DBeaver Community</em> for Windows and open it.</li>
<li><strong>Database → New Database Connection → PostgreSQL → Next.</strong></li>
<li>Host <code>localhost</code>, Port <code>5433</code>, Database <code>icebank</code>, Username <code>qa_reader</code>, Password <code>qa_reader</code>, tick <em>Save password</em>.</li>
<li>Click <strong>Test Connection</strong>. The first time, DBeaver offers to download the PostgreSQL JDBC driver: accept.</li>
<li>On the <strong>General</strong> page name it <em>Ice Bank local (reader)</em> and tick <strong>Read-only connection</strong>. Finish.</li>
<li>Create a second connection the same way as <code>qa_writer</code>, name it <em>Ice Bank local (WRITER)</em>, and give it a different
<em>connection type</em> colour (for example "Test", orange) so you always see which one you are in. For this one, switch the editor to
<strong>manual commit</strong> (toolbar button "Auto-commit" off): nothing you change is permanent until you run <code>COMMIT</code>.</li>
</ol>
<p>Open a SQL editor with <kbd>Ctrl</kbd>+<kbd>]</kbd>. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> runs the statement under the cursor; <kbd>Alt</kbd>+<kbd>X</kbd>
runs the whole script. In the navigator, open <em>icebank → Schemas → public</em> to see Tables, Views and Functions. Right-click a table →
<em>View Diagram</em> shows its foreign keys as an ER diagram.</p>

<h3>Time zones</h3>
<p>Timestamps such as <code>transactions.created_at</code> are <code>TIMESTAMPTZ</code>: a single instant in time. DBeaver displays them in your
computer's time zone. Ice Bank's rules (daily limits, business days, statement months) use Toronto time, so start a session with
<code>SET TIME ZONE 'America/Toronto';</code> or convert explicitly with <code>AT TIME ZONE 'America/Toronto'</code>. The app also has a
<em>virtual clock</em> per sandbox; the SQL function <code>app_now(1)</code> returns sandbox 1's "now", which starts at Monday 2 November 2026 09:00 Toronto after every reset.</p>

<h3>The same connection from Java</h3>
<p>Your framework connects with plain JDBC: add the PostgreSQL driver to the <code>pom.xml</code> and open a connection with <code>DriverManager</code>.
Keep the URL, user and password in your environment config (Tutorial 6), never hard-coded in a test.</p>

<h3>How the pieces connect</h3>
<pre role="img" aria-label="Diagram: HTTP clients talk to the Ice Bank app on port 3000, SQL clients talk to PostgreSQL on port 5433, and the app talks to the same database" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 Browser, Postman, REST Assured          DBeaver, IntelliJ, your JDBC tests
            │  HTTP, port 3000                     │  JDBC, port 5433
            ▼                                      │  user qa_reader or qa_writer
  ┌────────────────────┐   SQL as icebank_app      ▼
  │ Ice Bank app (API) │ ─────────────────► ┌──────────────────────────┐
  │ Next.js            │                    │ PostgreSQL 16            │
  └────────────────────┘                    │ database "icebank"       │
                                            └──────────────────────────┘
</pre>
<p>The API and your SQL client look at the <em>same rows</em>. That is the whole point of this tutorial: you change something through HTTP, then read the
evidence directly in the tables, without trusting the API's own answer.</p>

<h3>Worked example: reading your first result</h3>
<p>Run <code>SELECT current_user, current_database(), app_now(1) AS sandbox_now;</code> in the reader connection and read the single row column by column:</p>
<div class="table-wrap"><table>
<thead><tr><th>Column</th><th>Typical value</th><th>What it tells you</th></tr></thead>
<tbody>
<tr><td><code>current_user</code></td><td><code>qa_reader</code></td><td>Which login you are using. If it says <code>qa_writer</code>, you are in the connection that can change data: slow down.</td></tr>
<tr><td><code>current_database</code></td><td><code>icebank</code></td><td>You are in the right database (a server can hold several; <code>postgres</code> is the empty default one).</td></tr>
<tr><td><code>sandbox_now</code></td><td><code>2026-11-02 09:43:39-05</code></td><td>The sandbox's virtual clock. <code>-05</code> is the offset from UTC: Toronto is on Eastern Standard Time in November. If your session is in UTC you see the
same instant as <code>14:43:39+00</code>. After someone moves the clock, this can be days ahead of your computer's date.</td></tr>
</tbody></table></div>
<p>The last row is the one that surprises people: the <em>instant</em> is the same, only the way it is printed changes with the session time zone. Ice Bank's
embedded server uses UTC as its default; DBeaver and Java usually switch the session to your computer's zone. Never compare times by eye across two tools without
checking which zone each one prints in.</p>

<h3>Reading connection errors</h3>
<div class="table-wrap"><table>
<thead><tr><th>Message (shortened)</th><th>SQLState</th><th>What it means and the fix</th></tr></thead>
<tbody>
<tr><td><em>Connection to localhost:5433 refused</em></td><td><code>08001</code></td><td>Nothing is listening on that port. Start the app with <code>npm run dev</code> (or just the database with <code>npm run db:start</code>), and check the port is 5433, not 5432.</td></tr>
<tr><td><em>password authentication failed for user "qa_reader"</em></td><td><code>28P01</code></td><td>Wrong user name or password. Local passwords equal the user names.</td></tr>
<tr><td><em>database "IceBank" does not exist</em></td><td><code>3D000</code></td><td>Database names are exact. The database is <code>icebank</code>, all lower case.</td></tr>
<tr><td><em>permission denied for table accounts</em></td><td><code>42501</code></td><td>You are connected, but this user may not do that (for example <code>qa_reader</code> trying to <code>UPDATE</code>).</td></tr>
</tbody></table></div>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Typing port <code>5432</code> out of habit. Ice Bank's database listens on <code>5433</code>.</li>
<li>Doing all your reading in the WRITER connection "because it can do more". One stray <code>UPDATE</code> and your local data no longer matches the seed. Read as <code>qa_reader</code>.</li>
<li>Comparing a timestamp shown in UTC with a Toronto date from the UI and concluding the data is wrong. Check the session time zone first.</li>
<li>Assuming <code>app_now(1)</code> is the same as your computer's clock. It is the sandbox clock and can be far ahead.</li>
<li>Hard-coding the URL, user and password inside a test class. Put them in config so the same test runs on local and QA.</li>
</ul></div>`,
      examples: [
        {
          title: "First queries: who am I, and what time is it in the sandbox?",
          lang: "sql",
          code: `
SELECT current_user, current_database(), version();

SHOW TIME ZONE;
SET TIME ZONE 'America/Toronto';

-- The sandbox's virtual "now" (moves when someone calls POST /api/v1/test/clock)
SELECT app_now(1) AS sandbox_now;

-- qa_reader may read these columns of sandboxes, but not key_hash
SELECT id, name, clock_offset_seconds, processed_through FROM sandboxes;`,
          note: "Try <code>SELECT * FROM sandboxes;</code> as qa_reader too. The error is deliberate: the hashed sandbox keys are not for test users.",
        },
        {
          title: "How big is the data? (one row per table)",
          lang: "sql",
          code: `
SELECT 'customers' AS table_name, count(*) FROM customers WHERE sandbox_id = 1
UNION ALL SELECT 'accounts', count(*) FROM accounts WHERE sandbox_id = 1
UNION ALL SELECT 'transactions', count(*) FROM transactions WHERE sandbox_id = 1
UNION ALL SELECT 'etransfers', count(*) FROM etransfers WHERE sandbox_id = 1;`,
        },
        {
          title: "Maven dependency for the PostgreSQL JDBC driver",
          lang: "xml",
          code: `
<dependency>
  <groupId>org.postgresql</groupId>
  <artifactId>postgresql</artifactId>
  <version>42.7.4</version>
</dependency>`,
        },
        {
          title: "Connect from Java and run a query",
          lang: "java",
          code: `
import java.sql.*;

public class DbSmokeCheck {
    public static void main(String[] args) throws SQLException {
        String url = "jdbc:postgresql://localhost:5433/icebank";
        try (Connection con = DriverManager.getConnection(url, "qa_reader", "qa_reader");
             PreparedStatement ps = con.prepareStatement(
                 "SELECT count(*) FROM customers WHERE sandbox_id = ?")) {
            ps.setInt(1, 1);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                System.out.println("Customers in sandbox 1: " + rs.getLong(1));
            }
        }
    }
}`,
          note: "Always use <code>PreparedStatement</code> with <code>?</code> placeholders, never string concatenation. It prevents SQL injection and handles quoting for you.",
        },
        {
          title: "Explore the schema with SQL: tables, views and the columns of one table",
          lang: "sql",
          code: `
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_type, table_name;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'accounts'
ORDER BY ordinal_position;`,
          note: "<code>information_schema</code> is the SQL-standard catalogue, so these queries work on most databases, not only PostgreSQL. It is the same information DBeaver's navigator shows.",
        },
        {
          title: "What is this user allowed to do?",
          lang: "sql",
          code: `
SELECT current_user,
       has_table_privilege('accounts', 'SELECT') AS can_select_accounts,
       has_table_privilege('accounts', 'UPDATE') AS can_update_accounts,
       has_function_privilege('post_transfer(bigint, bigint, numeric, text, integer)', 'EXECUTE') AS can_call_post_transfer;`,
          note: "As <code>qa_reader</code> you get <code>true, false, false</code>. Run it in the WRITER connection too and compare.",
        },
        {
          title: "One instant, three ways of printing it",
          lang: "sql",
          code: `
SELECT app_now(1)                                AS stored_instant,
       app_now(1) AT TIME ZONE 'America/Toronto' AS toronto_wall_clock,
       app_now(1) AT TIME ZONE 'UTC'             AS utc_wall_clock,
       current_setting('TimeZone')               AS session_time_zone;`,
          note: "<code>AT TIME ZONE</code> on a <code>TIMESTAMPTZ</code> returns a plain timestamp: the wall-clock time in that zone, with no offset attached.",
        },
      ],
      exercises: [
        "Create the <em>Ice Bank local (reader)</em> connection as <code>qa_reader</code>, mark it read-only, and run the first-queries example. Write down the PostgreSQL version, the default time zone DBeaver's session used, and the value of <code>app_now(1)</code>.",
        "In the navigator, count how many tables, views and functions the <code>public</code> schema has. Open the ER diagram for <code>accounts</code> and list every table that has a foreign key pointing to it.",
        "As <code>qa_reader</code>, try <code>UPDATE accounts SET nickname = 'x' WHERE sandbox_id = 1 AND id = 2;</code>. Record the exact error message and say which layer stopped you: DBeaver's read-only setting or PostgreSQL's permissions (turn the read-only tick off for a moment to find out).",
        "Create the <em>Ice Bank local (WRITER)</em> connection as <code>qa_writer</code> with a different colour and manual commit. Take a screenshot showing both connections side by side so you can tell them apart at a glance.",
        "Run the Java example from your own project (or a JUnit test) and print the number of customers in sandbox 1. Then change the password to a wrong one and note the exception class and SQLState you get.",
        "Run the <code>information_schema.columns</code> query for <code>accounts</code>. Then call <code>GET /api/v1/accounts/1</code> as Emma and make a two-column mapping table: database column ↔ JSON field. Which columns does the API not expose, which JSON fields have no column of their own, and how is <code>interest_rate</code> stored compared with how the API shows <code>interestRate</code> for account 2?",
      ],
      quiz: [
        {
          q: `DBeaver says <em>Connection to localhost:5433 refused</em>. What is the most likely cause?`,
          options: [`<code>qa_reader</code> has no SELECT permission on the tables`, `The password for <code>qa_reader</code> is wrong`, `The Ice Bank database is not running (start <code>npm run dev</code> or <code>npm run db:start</code>)`, `The session time zone is not America/Toronto`],
          answer: 2,
          explain: `"Refused" means nothing answered on that port at all, so the problem is before authentication. A wrong password gives <em>password authentication failed</em> (28P01) and a missing permission gives <em>permission denied</em> (42501), both only after the server has answered.`,
        },
        {
          q: `You are writing a database check that runs after an API test, locally and on QA. Which user should it connect as?`,
          options: [`<code>qa_reader</code>, because the check only reads and that user exists on both environments`, `<code>qa_writer</code>, so it can also clean up`, `<code>icebank_app</code>, because that is what the app uses`, `<code>postgres</code>, to be sure it can see everything`],
          answer: 0,
          explain: `A check only needs SELECT. <code>qa_reader</code> is available locally and on QA, and it cannot change data by accident. <code>qa_writer</code> does not exist on QA, and the app's own user is not for tests.`,
        },
        {
          q: `A row's <code>created_at</code> is <code>2026-11-02 14:00:00+00</code>. What does a session with <code>SET TIME ZONE 'America/Toronto'</code> show?`,
          options: [`<code>2026-11-02 14:00:00-05</code>`, `<code>2026-11-02 19:00:00-05</code>`, `It cannot show it until you convert the column`, `<code>2026-11-02 09:00:00-05</code>`],
          answer: 3,
          explain: `A <code>TIMESTAMPTZ</code> is one instant. The session time zone only changes how it is printed: 14:00 UTC is 09:00 in Toronto, which is UTC−5 in November.`,
        },
        {
          q: `What does <code>app_now(1)</code> return?`,
          options: [`The real current time of the database server`, `Sandbox 1's virtual time: the real time shifted by the sandbox clock offset`, `The time of the last reset`, `The time your DBeaver session was opened`],
          answer: 1,
          explain: `<code>app_now</code> adds the sandbox's <code>clock_offset_seconds</code> to <code>now()</code>. It starts at Monday 2 November 2026 09:00 Toronto after a reset, keeps ticking, and jumps forward when someone calls <code>POST /api/v1/test/clock</code>.`,
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "select",
      title: "SELECT, WHERE, ORDER BY",
      summary: "Read exactly the rows and columns you need, in a predictable order.",
      body: `
<p>Almost every database check in a test is a <code>SELECT</code>: "find the row the API just created and compare its columns with what I expect".
A query is read in this order by the database: <code>FROM</code> (which table) → <code>WHERE</code> (which rows) → <code>SELECT</code> (which columns) →
<code>ORDER BY</code> (in what order) → <code>LIMIT</code> (how many).</p>

<h3>Choose columns on purpose</h3>
<p><code>SELECT *</code> is fine for exploring, but in tests name the columns. The query then documents what you check, and it does not break when a column is
added. Rename output with an alias: <code>SELECT balance AS current_balance</code>.</p>

<h3>WHERE: filtering rows</h3>
<ul>
<li>Comparison: <code>=</code>, <code>&lt;&gt;</code> (not equal), <code>&lt;</code>, <code>&lt;=</code>, <code>&gt;</code>, <code>&gt;=</code>. Combine with <code>AND</code>, <code>OR</code>, <code>NOT</code>,
and use brackets when you mix <code>AND</code> and <code>OR</code>.</li>
<li><code>IN ('PENDING', 'DEPOSITED')</code> is a short way to write several <code>OR</code>s.</li>
<li><code>BETWEEN 10 AND 50</code> includes <em>both</em> ends, exactly like Ice Bank's date filters.</li>
<li><code>LIKE 'POS%'</code> matches text patterns (<code>%</code> = any characters, <code>_</code> = one character). <code>ILIKE</code> is the case-insensitive version, which is what
the API's <code>?q=</code> search does.</li>
<li><code>NULL</code> means "no value". Nothing is ever <code>= NULL</code>, not even <code>NULL</code> itself; use <code>IS NULL</code> and <code>IS NOT NULL</code>.
For example, <code>transactions.balance_after</code> is <code>NULL</code> while a transaction is <code>PENDING</code>.</li>
</ul>

<h3>Money and text values</h3>
<p>Money columns are <code>NUMERIC(14,2)</code>: exact decimals, not floating point. <code>WHERE amount = 25.10</code> is safe in SQL (in Java you will read
it as <code>BigDecimal</code>, never <code>double</code>). Text values use single quotes, and status values are upper case: <code>'POSTED'</code>, not <code>'posted'</code>.
Emails are stored in lower case.</p>

<h3>Dates in Toronto</h3>
<p>To get "everything that happened in October 2026 in Toronto", compare the instant with Toronto midnights. A half-open range (<code>&gt;=</code> start and
<code>&lt;</code> next start) is the safest pattern because it never misses the last second of a day:</p>
<p><code>created_at &gt;= TIMESTAMPTZ '2026-10-01 00:00 America/Toronto' AND created_at &lt; TIMESTAMPTZ '2026-11-01 00:00 America/Toronto'</code></p>
<p>For one Toronto calendar day you can also write <code>(created_at AT TIME ZONE 'America/Toronto')::date = DATE '2026-10-30'</code>.</p>

<h3>ORDER BY and LIMIT</h3>
<p>Without <code>ORDER BY</code> the database may return rows in any order, and that order can change between runs, a classic cause of flaky tests. Ice Bank's
API lists transactions newest first with a tie-breaker: <code>ORDER BY created_at DESC, id DESC</code>. Do the same in SQL so your query and the API agree.
<code>LIMIT 20 OFFSET 40</code> skips 40 rows and returns the next 20, which is exactly API page 2 (<code>?page=2&amp;size=20</code>, pages start at 0).</p>

<h3>The order the database works in</h3>
<p>You write a query top to bottom, but the database evaluates it in a different order. Knowing that order explains most beginner errors:</p>
<pre role="img" aria-label="Diagram: FROM, then WHERE, then SELECT, then ORDER BY, then LIMIT" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 1. FROM transactions            take the table (tens of thousands of rows)
 2. WHERE sandbox_id = 1 AND ... keep only the rows that match
 3. SELECT id, amount, ...       pick and compute the output columns (aliases are born here)
 4. ORDER BY amount DESC         sort what is left
 5. LIMIT 3                      keep the first 3
</pre>
<p>So an alias created in step 3 does not exist yet in step 2: <code>WHERE current_balance &gt; 100</code> fails with <em>column "current_balance" does not exist</em>,
but <code>ORDER BY current_balance</code> works.</p>

<h3>Worked example: Emma's three biggest purchases in October</h3>
<p>Question: <em>"What were the three largest card purchases on Emma's chequing account in October 2026, Toronto time?"</em> The first example below answers it. Line by line:</p>
<div class="table-wrap"><table>
<thead><tr><th>Line</th><th>Why it is there</th></tr></thead>
<tbody>
<tr><td><code>FROM transactions</code></td><td>Card purchases are rows in <code>transactions</code>.</td></tr>
<tr><td><code>WHERE sandbox_id = 1</code></td><td>Rule 1 of every Ice Bank query.</td></tr>
<tr><td><code>AND account_id = 1</code></td><td>Emma's chequing account.</td></tr>
<tr><td><code>AND type = 'PURCHASE' AND direction = 'DEBIT'</code></td><td>Only money going out for purchases. Values are upper case and in single quotes.</td></tr>
<tr><td><code>AND created_at &gt;= TIMESTAMPTZ '2026-10-01 00:00 America/Toronto'</code><br><code>AND created_at &lt; TIMESTAMPTZ '2026-11-01 00:00 America/Toronto'</code></td><td>October on Toronto's calendar, as a half-open range: from the first Toronto midnight, up to but not including the next one.</td></tr>
<tr><td><code>SELECT id, created_at AT TIME ZONE 'America/Toronto' AS toronto_time, amount, description</code></td><td>Only the columns you will look at, with the time shown as a Toronto wall clock.</td></tr>
<tr><td><code>ORDER BY amount DESC, id DESC</code></td><td>Biggest first; <code>id</code> breaks ties so the result is always the same.</td></tr>
<tr><td><code>LIMIT 3</code></td><td>Keep the top three.</td></tr>
</tbody></table></div>
<p>On the seed data the answer is $132.56 (Caribou Clothing, 15 October), $96.38 (Glacier Hardware, 22 October) and $21.09 (Aurora Cinemas, 13 October).</p>

<h3>AND binds tighter than OR</h3>
<p><code>WHERE status = 'POSTED' OR status = 'PENDING' AND amount &gt; 100</code> is read as <code>status = 'POSTED' OR (status = 'PENDING' AND amount &gt; 100)</code>:
every posted row, plus the pending ones over $100. If you meant "posted or pending, and over $100", write the brackets:
<code>(status = 'POSTED' OR status = 'PENDING') AND amount &gt; 100</code>, or simply <code>status IN ('POSTED', 'PENDING') AND amount &gt; 100</code>.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li><code>WHERE nickname = NULL</code>: always zero rows. Use <code>IS NULL</code>, or <code>IS DISTINCT FROM</code> when the value may be <code>NULL</code>.</li>
<li><code>WHERE status = 'posted'</code>: no error, just zero rows. Text comparison is case-sensitive and Ice Bank stores status values in upper case.</li>
<li><code>WHERE status = "POSTED"</code>: double quotes mean a <em>column name</em> in PostgreSQL, so you get <em>column "POSTED" does not exist</em>. Text values take single quotes.</li>
<li><code>created_at BETWEEN '2026-10-01' AND '2026-10-31'</code> on a timestamp: the end means 31 October at 00:00, so the whole last day is missing.</li>
<li><code>LIMIT</code> without <code>ORDER BY</code>, or <code>ORDER BY created_at</code> alone when two rows share a timestamp: the "first" row can change between runs.</li>
</ul></div>`,
      examples: [
        {
          title: "Emma's accounts (customer 1)",
          lang: "sql",
          code: `
SELECT id, account_number, type, nickname, balance, available_balance, credit_limit, status
FROM accounts
WHERE sandbox_id = 1
  AND customer_id = 1
ORDER BY id;`,
          note: "Account ids 1 to 4 are Emma's chequing, savings (\"Rainy day\"), credit card and personal loan. Credit and loan balances are negative when money is owed.",
        },
        {
          title: "Latest 10 transactions on Emma's chequing, newest first (same order as the API)",
          lang: "sql",
          code: `
SELECT id, created_at, type, direction, amount, balance_after, status, description, reference_id
FROM transactions
WHERE sandbox_id = 1
  AND account_id = 1
ORDER BY created_at DESC, id DESC
LIMIT 10;`,
        },
        {
          title: "Text search, like GET /accounts/1/transactions?q=coffee",
          lang: "sql",
          code: `
SELECT id, created_at, amount, description
FROM transactions
WHERE sandbox_id = 1
  AND account_id = 1
  AND description ILIKE '%coffee%'
ORDER BY created_at DESC, id DESC;`,
        },
        {
          title: "October 2026 on Toronto's calendar, purchases between $20 and $100",
          lang: "sql",
          code: `
SELECT id, created_at AT TIME ZONE 'America/Toronto' AS toronto_time, amount, description
FROM transactions
WHERE sandbox_id = 1
  AND account_id = 1
  AND type = 'PURCHASE'
  AND amount BETWEEN 20 AND 100
  AND created_at >= TIMESTAMPTZ '2026-10-01 00:00 America/Toronto'
  AND created_at <  TIMESTAMPTZ '2026-11-01 00:00 America/Toronto'
ORDER BY created_at DESC, id DESC;`,
        },
        {
          title: "Users who are not simply active, and accounts that are not open",
          lang: "sql",
          code: `
SELECT id, email, status, failed_login_count, locked_until
FROM users
WHERE sandbox_id = 1
  AND (status <> 'ACTIVE' OR failed_login_count > 0);

SELECT id, customer_id, type, status
FROM accounts
WHERE sandbox_id = 1
  AND status <> 'OPEN';`,
        },
        {
          title: "Worked example: Emma's three largest purchases in October 2026 (Toronto)",
          lang: "sql",
          code: `
SELECT id,
       created_at AT TIME ZONE 'America/Toronto' AS toronto_time,
       amount,
       description
FROM transactions
WHERE sandbox_id = 1
  AND account_id = 1
  AND type = 'PURCHASE'
  AND direction = 'DEBIT'
  AND created_at >= TIMESTAMPTZ '2026-10-01 00:00 America/Toronto'
  AND created_at <  TIMESTAMPTZ '2026-11-01 00:00 America/Toronto'
ORDER BY amount DESC, id DESC
LIMIT 3;`,
        },
        {
          title: "NULL-safe filtering and display: IS DISTINCT FROM and coalesce",
          lang: "sql",
          code: `
SELECT id, type, nickname,
       coalesce(nickname, '(no nickname)') AS shown_name
FROM accounts
WHERE sandbox_id = 1
  AND customer_id = 1
  AND nickname IS DISTINCT FROM 'Rainy day'
ORDER BY id;`,
          note: "<code>nickname &lt;&gt; 'Rainy day'</code> would return <em>no</em> rows here, because <code>NULL &lt;&gt; 'Rainy day'</code> is unknown, not true. <code>IS DISTINCT FROM</code> treats <code>NULL</code> as an ordinary value, so accounts 1, 3 and 4 come back.",
        },
        {
          title: "CASE: turn raw values into the words a screen would use",
          lang: "sql",
          code: `
SELECT id, type, balance,
       CASE
         WHEN type IN ('CREDIT', 'LOAN') AND balance < 0 THEN 'balance owing'
         WHEN balance = 0 THEN 'empty'
         ELSE 'money available'
       END AS what_it_means
FROM accounts
WHERE sandbox_id = 1
  AND customer_id IN (1, 4)
ORDER BY customer_id, id;`,
          note: "<code>CASE</code> checks its <code>WHEN</code> branches top to bottom and uses the first that is true, like an <code>if / else if</code> chain in Java.",
        },
      ],
      exercises: [
        "List Olivia Singh's accounts (customer 3) with balance and credit limit. From the numbers alone, work out how much more she can spend on her card, then check it against <code>availableCredit</code> in <code>GET /api/v1/accounts</code> signed in as Olivia.",
        "Find the 5 largest <code>PURCHASE</code> debits ever on account 1. Then call <code>GET /api/v1/accounts/1/transactions?type=PURCHASE&amp;sort=amount,desc&amp;size=5</code> as Emma and confirm the API returns the same ids in the same order.",
        "Count the rows on account 1 dated 1 to 31 October 2026 (Toronto) with the half-open range pattern. Compare with <code>totalElements</code> from <code>GET /api/v1/accounts/1/transactions?from=2026-10-01&amp;to=2026-10-31</code>. Then deliberately use <code>created_at &lt;= '2026-10-31'</code> and explain why the count changes.",
        "Find every user whose status is not <code>ACTIVE</code> and every account whose status is not <code>OPEN</code>. Match each row to a persona from the quick reference on the home page.",
        "Show that <code>WHERE nickname = NULL</code> returns no rows from <code>accounts</code> while <code>WHERE nickname IS NULL</code> returns many. Write one sentence on why a test that compares with <code>= NULL</code> would always pass or always fail.",
        "Find every <em>Frostbite Coffee</em> purchase on account 1 with a case-insensitive search, showing the Toronto time, newest first. How many are there, and what is the date and amount of the most recent one? Compare your count with <code>totalElements</code> from <code>GET /api/v1/accounts/1/transactions?q=frostbite</code>.",
      ],
      quiz: [
        {
          q: `Why does <code>SELECT balance AS current_balance FROM accounts WHERE current_balance &gt; 100</code> fail?`,
          options: [`Aliases must be written in double quotes`, `<code>WHERE</code> is evaluated before <code>SELECT</code>, so the alias does not exist yet`, `<code>balance</code> is a reserved word`, `You cannot compare a <code>NUMERIC</code> with an integer`],
          answer: 1,
          explain: `The database runs FROM → WHERE → SELECT → ORDER BY → LIMIT. The alias is created in the SELECT step, after WHERE has already run. Repeat the expression in WHERE (<code>WHERE balance &gt; 100</code>); ORDER BY can use the alias because it runs later.`,
        },
        {
          q: `What does <code>WHERE status = 'POSTED' OR status = 'PENDING' AND amount &gt; 100</code> return?`,
          options: [`Posted or pending rows over $100`, `Every posted row, plus pending rows over $100`, `Only pending rows over $100`, `A syntax error: AND and OR cannot be mixed`],
          answer: 1,
          explain: `AND binds tighter than OR, so the condition is <code>POSTED OR (PENDING AND amount &gt; 100)</code>. Use brackets or <code>IN</code> when you mean something else.`,
        },
        {
          q: `A test counts October rows with <code>created_at BETWEEN '2026-10-01' AND '2026-10-31'</code>. Which rows can it miss?`,
          options: [`Rows on 1 October`, `Only rows created exactly at midnight`, `None: BETWEEN includes both ends`, `Rows after 31 October 00:00, so almost the whole last day`],
          answer: 3,
          explain: `BETWEEN does include both ends, but the end value <code>'2026-10-31'</code> becomes the instant 31 October 00:00. Anything later that day is outside. The half-open pattern (<code>&gt;=</code> 1 October, <code>&lt;</code> 1 November) avoids the problem.`,
        },
        {
          q: `Two transactions share the same <code>created_at</code>. Your query has <code>ORDER BY created_at DESC LIMIT 1</code>. What is the risk?`,
          options: [`Either row may come back, and it can change between runs, which makes the test flaky`, `The query fails with a "duplicate key" error`, `None, PostgreSQL always returns the lower id first`, `Both rows are returned despite <code>LIMIT 1</code>`],
          answer: 0,
          explain: `Rows that tie on every ORDER BY column come back in no guaranteed order. Add a unique tie-breaker, as the API does: <code>ORDER BY created_at DESC, id DESC</code>.`,
        },
        {
          q: `Which condition finds Emma's accounts whose nickname is anything other than "Rainy day", including accounts with no nickname?`,
          options: [`<code>nickname &lt;&gt; 'Rainy day'</code>`, `<code>nickname != 'Rainy day'</code>`, `<code>nickname IS DISTINCT FROM 'Rainy day'</code>`, `<code>NOT nickname = 'Rainy day'</code>`],
          answer: 2,
          explain: `The other three are the same comparison, and comparing <code>NULL</code> with anything gives unknown, so accounts without a nickname drop out. <code>IS DISTINCT FROM</code> treats <code>NULL</code> as a value that is different from 'Rainy day'.`,
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "aggregates",
      title: "Aggregates and GROUP BY",
      summary: "Count, total and average rows, per group, to check limits, totals and summaries.",
      body: `
<p>Aggregate functions turn many rows into one value: <code>count(*)</code>, <code>sum(amount)</code>, <code>avg(amount)</code>, <code>min(created_at)</code>,
<code>max(created_at)</code>. QA uses them constantly: "how many rows did that action create?", "does the daily total match the limit?", "is the
statement's closing balance right?".</p>

<h3>COUNT has three flavours</h3>
<ul>
<li><code>count(*)</code> counts rows.</li>
<li><code>count(balance_after)</code> counts rows where that column is <em>not</em> <code>NULL</code> (so it skips pending transactions).</li>
<li><code>count(DISTINCT account_id)</code> counts different values.</li>
</ul>

<h3>GROUP BY: one result row per group</h3>
<p><code>GROUP BY type</code> splits the rows into buckets (one per transaction type) and runs the aggregate once per bucket. The rule: every column in
<code>SELECT</code> must either be in <code>GROUP BY</code> or be inside an aggregate. If you break it, PostgreSQL tells you
"column must appear in the GROUP BY clause or be used in an aggregate function".</p>

<h3>WHERE vs HAVING</h3>
<p><code>WHERE</code> filters rows <em>before</em> grouping; <code>HAVING</code> filters groups <em>after</em> grouping, so it can use aggregates:
<code>HAVING count(*) &gt; 2</code>. Put as much as possible in <code>WHERE</code> (especially <code>sandbox_id = 1</code>); it is faster and clearer.</p>

<h3>Conditional aggregates with FILTER</h3>
<p><code>sum(amount) FILTER (WHERE direction = 'CREDIT')</code> sums only the credits. Two filtered sums side by side give you "money in" and "money out" in one
query, a pattern you will use for statements.</p>

<h3>Grouping by day or month in Toronto</h3>
<p>Convert first, then truncate: <code>date_trunc('month', created_at AT TIME ZONE 'America/Toronto')</code>. Ice Bank's daily e-Transfer limit is per
Toronto calendar day, and the view <code>v_daily_etransfer_totals</code> uses exactly <code>(created_at AT TIME ZONE 'America/Toronto')::date</code>.</p>

<div class="callout rule"><p><strong>Business rule you can check with aggregates.</strong> e-Transfers: $0.01 to $3,000 per transfer, <strong>$3,000 per Toronto day</strong>,
<strong>$10,000 per rolling 30 days</strong> (now minus 30 × 24 hours). <code>PENDING</code> and <code>DEPOSITED</code> transfers count toward both limits;
<code>CANCELLED</code> and <code>EXPIRED</code> do not.</p></div>

<p><code>sum()</code> of an empty set is <code>NULL</code>, not 0. Wrap it: <code>coalesce(sum(amount), 0)</code>. The same thing bites in Java when
<code>rs.getBigDecimal()</code> returns <code>null</code>.</p>

<h3>What GROUP BY actually does</h3>
<pre role="img" aria-label="Diagram: rows are sorted into buckets by the GROUP BY columns, then each bucket becomes one result row" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 rows after WHERE               buckets (GROUP BY account_id, direction)      one row per bucket
 ─────────────────────          ─────────────────────────────────────────     ──────────────────────────
 acc 1  DEBIT     12.00    ┐    acc 1 / DEBIT  : 12.00, 2337.00, ...      →    1  DEBIT   count  sum
 acc 1  DEBIT   2337.00    ├─►  acc 1 / CREDIT : 2850.00, ...             →    1  CREDIT  count  sum
 acc 1  CREDIT  2850.00    │    acc 2 / CREDIT : ...                      →    2  CREDIT  count  sum
 acc 2  CREDIT    12.00    ┘    ...
</pre>
<p>Every bucket becomes exactly one output row, which is why every column you <code>SELECT</code> must be either a bucket label (in <code>GROUP BY</code>) or a summary of the
bucket (inside an aggregate). A plain column such as <code>description</code> has many different values per bucket, so the database cannot pick one.</p>

<h3>Worked example: do the balances add up?</h3>
<p>Emma's accounts all started at zero, so for each account the posted credits minus the posted debits must equal today's balance. The first example below groups
Emma's posted transactions by account and direction:</p>
<ol>
<li><code>WHERE sandbox_id = 1 AND account_id IN (1, 2, 3, 4) AND status = 'POSTED'</code> keeps only the rows that have moved money on her four accounts.</li>
<li><code>GROUP BY account_id, direction</code> makes one bucket per account and direction, so at most eight buckets.</li>
<li><code>count(*)</code> and <code>sum(amount)</code> summarise each bucket.</li>
<li>Read the result in pairs. For account 1, <em>CREDIT total − DEBIT total</em> must equal <code>accounts.balance</code> for account 1. Account 2 (savings) only has credits, so its
credit total <em>is</em> its balance. Account 4 (the loan) has one big DEBIT, the money borrowed, and a series of CREDIT repayments, so the difference is negative:
the amount still owed.</li>
</ol>
<p>If the pair for any account does not match its balance, something moved the balance without writing a transaction row (or the other way round). That is a real
data-integrity bug, and this query is how you would prove it.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Selecting a column that is neither grouped nor aggregated: <em>column "accounts.type" must appear in the GROUP BY clause or be used in an aggregate function</em>.</li>
<li>Putting an aggregate in <code>WHERE</code> (<code>WHERE count(*) &gt; 2</code>): <em>aggregate functions are not allowed in WHERE</em>. Conditions on groups go in <code>HAVING</code>.</li>
<li>Expecting <code>sum()</code> of no rows to be 0. It is <code>NULL</code>; wrap it in <code>coalesce(..., 0)</code>.</li>
<li>Using <code>count(column)</code> when you meant <code>count(*)</code>: it silently skips rows where that column is <code>NULL</code>.</li>
<li>Comparing <code>avg(amount)</code> with a value from the API without rounding: the average of money has many decimals. Use <code>round(avg(amount), 2)</code>.</li>
<li>Grouping by <code>created_at::date</code> in a UTC session: an evening transaction in Toronto lands on the next day. Convert to Toronto first.</li>
</ul></div>`,
      examples: [
        {
          title: "How many transactions of each type are in the sandbox?",
          lang: "sql",
          code: `
SELECT type, count(*) AS how_many, sum(amount) AS total_amount
FROM transactions
WHERE sandbox_id = 1
GROUP BY type
ORDER BY how_many DESC;`,
        },
        {
          title: "Money in and money out per month on Emma's chequing (Toronto months)",
          lang: "sql",
          code: `
SELECT date_trunc('month', created_at AT TIME ZONE 'America/Toronto')::date AS month,
       count(*)                                         AS tx_count,
       sum(amount) FILTER (WHERE direction = 'CREDIT')  AS money_in,
       sum(amount) FILTER (WHERE direction = 'DEBIT')   AS money_out
FROM transactions
WHERE sandbox_id = 1
  AND account_id = 1
  AND status = 'POSTED'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12;`,
          note: "<code>GROUP BY 1</code> means \"group by the first column in the SELECT list\". Handy, but write the expression out in code you keep.",
        },
        {
          title: "Emma's e-Transfer totals per Toronto day (what the daily limit looks at)",
          lang: "sql",
          code: `
SELECT (created_at AT TIME ZONE 'America/Toronto')::date AS day,
       count(*)    AS transfers,
       sum(amount) AS total_sent
FROM etransfers
WHERE sandbox_id = 1
  AND sender_customer_id = 1
  AND status IN ('PENDING', 'DEPOSITED')
GROUP BY 1
ORDER BY 1 DESC
LIMIT 5;`,
        },
        {
          title: "Emma's remaining e-Transfer allowance right now",
          lang: "sql",
          code: `
SELECT 3000.00 - coalesce(sum(amount) FILTER (
           WHERE (created_at AT TIME ZONE 'America/Toronto')::date
               = (app_now(1) AT TIME ZONE 'America/Toronto')::date), 0) AS remaining_today,
       10000.00 - coalesce(sum(amount) FILTER (
           WHERE created_at > app_now(1) - INTERVAL '30 days'), 0)     AS remaining_30_days
FROM etransfers
WHERE sandbox_id = 1
  AND sender_customer_id = 1
  AND status IN ('PENDING', 'DEPOSITED');`,
          note: "This is your test oracle for limit tests: calculate what should be allowed, then send exactly that amount and one cent more through the API.",
        },
        {
          title: "Customers with more than two payees (HAVING)",
          lang: "sql",
          code: `
SELECT customer_id, count(*) AS payees
FROM payees
WHERE sandbox_id = 1
  AND deleted_at IS NULL
GROUP BY customer_id
HAVING count(*) > 2
ORDER BY payees DESC, customer_id;`,
        },
        {
          title: "Worked example: posted money in and out per account (Emma)",
          lang: "sql",
          code: `
SELECT account_id, direction, count(*) AS how_many, sum(amount) AS total
FROM transactions
WHERE sandbox_id = 1
  AND account_id IN (1, 2, 3, 4)
  AND status = 'POSTED'
GROUP BY account_id, direction
ORDER BY account_id, direction;`,
          note: "Check each account: CREDIT total − DEBIT total should equal its balance in <code>accounts</code>.",
        },
        {
          title: "Average, smallest and largest debit per type, rounded to the cent",
          lang: "sql",
          code: `
SELECT type,
       count(*)              AS how_many,
       round(avg(amount), 2) AS avg_amount,
       min(amount)           AS smallest,
       max(amount)           AS largest
FROM transactions
WHERE sandbox_id = 1
  AND account_id = 1
  AND direction = 'DEBIT'
GROUP BY type
ORDER BY how_many DESC;`,
        },
        {
          title: "The empty-set trap: sum() of no rows is NULL",
          lang: "sql",
          code: `
-- Noah (customer 4) is brand new and has never sent an e-Transfer
SELECT count(*)                 AS transfers,
       sum(amount)              AS raw_sum,
       coalesce(sum(amount), 0) AS safe_sum
FROM etransfers
WHERE sandbox_id = 1
  AND sender_customer_id = 4;`,
          note: "<code>count(*)</code> is 0, <code>raw_sum</code> is <code>NULL</code>, <code>safe_sum</code> is 0. In Java, <code>rs.getBigDecimal(\"raw_sum\")</code> returns <code>null</code> and a careless <code>.compareTo()</code> throws a <code>NullPointerException</code>.",
        },
      ],
      exercises: [
        "Write three queries that count customers, accounts and transactions in sandbox 1. Then write one query that returns the number of accounts and the total balance for each account <code>type</code>. Explain why the CREDIT and LOAN totals are negative.",
        "For 2026 only, find the Toronto month in which Emma spent the most from account 1 (sum of POSTED debits). Show the month and the amount.",
        "Run the \"remaining allowance\" query for Emma. Sign in as Emma and send an e-Transfer for exactly <em>remaining today + $0.01</em> (from account 1 to <code>liam.chen@icebank.test</code>, with a security question). Confirm the API answers 422 and note the <code>code</code>. Do not send the exact amount unless you are happy to use up the allowance.",
        "Count how many transactions on account 1 have <code>balance_after</code> filled in versus all rows, in one query, using <code>count(*)</code> and <code>count(balance_after)</code>. What would a difference between them mean?",
        "In one query, show for each Toronto calendar year the number, the average (rounded to the cent), the smallest and the largest POSTED <code>PURCHASE</code> debit on account 1. Which year has the highest average purchase, and which year has the fewest purchases? Why might the first year be small?",
      ],
      quiz: [
        {
          q: `On one account, <code>count(*)</code> is 120 and <code>count(balance_after)</code> is 117. What does that tell you?`,
          options: [`Three rows have no <code>balance_after</code>, which in Ice Bank means they are still PENDING`, `Three rows are duplicates`, `<code>count(column)</code> is broken for NUMERIC columns`, `Three rows belong to another sandbox`],
          answer: 0,
          explain: `<code>count(column)</code> counts only non-NULL values. <code>balance_after</code> stays NULL until a transaction posts, so the difference is the number of pending rows (a CHECK constraint forbids NULL on any other status).`,
        },
        {
          q: `You want customers whose accounts hold more than $10,000 in total. Where does <code>sum(balance) &gt; 10000</code> go?`,
          options: [`In <code>WHERE</code>`, `In the <code>ORDER BY</code>`, `In <code>HAVING</code>, after <code>GROUP BY customer_id</code>`, `Inside <code>count()</code>`],
          answer: 2,
          explain: `WHERE filters single rows before they are grouped, so it cannot see a total. HAVING filters whole groups after the aggregate has been computed.`,
        },
        {
          q: `Why does <code>SELECT customer_id, type, count(*) FROM accounts WHERE sandbox_id = 1 GROUP BY customer_id</code> fail?`,
          options: [`<code>type</code> is a reserved word`, `<code>count(*)</code> needs a column name`, `<code>type</code> is neither in GROUP BY nor inside an aggregate, and one customer can have several types`, `GROUP BY must list every column of the table`],
          answer: 2,
          explain: `Each customer bucket becomes one row, but a customer with four accounts has four different types. Either group by <code>customer_id, type</code> or aggregate the type, for example <code>string_agg(type, ', ')</code>.`,
        },
        {
          q: `What does <code>SELECT sum(amount) FROM etransfers WHERE sandbox_id = 1 AND sender_customer_id = 4</code> return for Noah, who has never sent one?`,
          options: [`One row containing NULL`, `0.00`, `No row at all`, `0`],
          answer: 0,
          explain: `An aggregate without GROUP BY always returns exactly one row. With no input rows, <code>count(*)</code> is 0 but <code>sum()</code> is NULL. Use <code>coalesce(sum(amount), 0)</code> in limit calculations.`,
        },
        {
          q: `An e-Transfer was sent at 21:30 Toronto time on 30 October. Your session is in UTC and you group by <code>created_at::date</code>. Which day does it land on?`,
          options: [`30 October, like in Toronto`, `It depends on the e-Transfer status`, `29 October`, `31 October, because 21:30 Toronto is already the next day in UTC`],
          answer: 3,
          explain: `21:30 in Toronto (UTC−4 before the clocks change on 1 November) is 01:30 UTC on 31 October. Ice Bank's daily limit uses the Toronto calendar day, so group by <code>(created_at AT TIME ZONE 'America/Toronto')::date</code>.`,
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "joins",
      title: "JOINs",
      summary: "Combine tables by their keys, and never forget sandbox_id in the join.",
      body: `
<p>Data is split across tables so it is stored once: a customer's name lives in <code>customers</code>, their login in <code>users</code>, their money in
<code>accounts</code>. A <code>JOIN</code> puts the pieces back together by matching key columns.</p>

<h3>INNER JOIN and LEFT JOIN</h3>
<ul>
<li><code>JOIN</code> (inner join) keeps only rows that match on both sides. Customers without a credit card simply do not appear when you join to credit accounts.</li>
<li><code>LEFT JOIN</code> keeps every row from the left table, and fills the right side with <code>NULL</code> where there is no match. Adding
<code>WHERE right_table.id IS NULL</code> turns it into an <em>anti-join</em>: "rows that have no partner", for example customers who have no credit card,
or payments whose payee is missing (an orphan check).</li>
</ul>

<h3>Ice Bank's keys are composite</h3>
<p>Every business table's primary key is <code>(sandbox_id, id)</code>, and every foreign key is <code>(sandbox_id, something_id)</code>. So a correct
join always matches both columns:</p>
<p><code>JOIN customers c ON c.sandbox_id = a.sandbox_id AND c.id = a.customer_id</code></p>
<div class="callout warn"><p><strong>The bug that hides locally.</strong> Locally there is only sandbox 1, so a join that forgets <code>sandbox_id</code> still returns the right rows.
On QA there are four sandboxes with the <em>same ids</em>, so the same query silently multiplies every match by four. Write your joins correctly now and your
JDBC checks work unchanged on both environments.</p></div>

<h3>Useful relationships</h3>
<div class="table-wrap"><table>
<thead><tr><th>From</th><th>To</th><th>Join on (plus sandbox_id)</th></tr></thead>
<tbody>
<tr><td><code>customers</code></td><td><code>users</code></td><td><code>customers.user_id = users.id</code> (the email is in users)</td></tr>
<tr><td><code>accounts</code></td><td><code>customers</code></td><td><code>accounts.customer_id = customers.id</code></td></tr>
<tr><td><code>transactions</code></td><td><code>accounts</code></td><td><code>transactions.account_id = accounts.id</code></td></tr>
<tr><td><code>transactions</code></td><td><code>transactions</code></td><td>same <code>reference_id</code>: the DEBIT and CREDIT legs of one movement</td></tr>
<tr><td><code>payees</code></td><td><code>billers</code></td><td><code>payees.biller_id = billers.id</code></td></tr>
<tr><td><code>bill_payments</code></td><td><code>payees</code>, <code>transactions</code></td><td><code>payee_id</code>, <code>transaction_id</code></td></tr>
<tr><td><code>etransfers</code></td><td><code>customers</code>, <code>accounts</code></td><td><code>sender_customer_id</code>, <code>from_account_id</code>, <code>recipient_customer_id</code>, <code>deposit_account_id</code></td></tr>
<tr><td><code>cards</code></td><td><code>accounts</code></td><td><code>cards.account_id = accounts.id</code></td></tr>
</tbody></table></div>
<p>Give every table a short alias (<code>a</code>, <code>c</code>, <code>t</code>) and prefix every column with it. When two tables both have
<code>id</code>, <code>status</code> and <code>created_at</code>, unprefixed names are ambiguous and PostgreSQL refuses the query.</p>

<h3>The main relationships at a glance</h3>
<pre role="img" aria-label="Diagram: users one-to-one customers; customers one-to-many accounts, payees and e-Transfers; accounts one-to-many transactions and cards; payees many-to-one billers" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 users ──1:1── customers ──1:n── accounts ──1:n── transactions
                   │                 └────1:n── cards
                   ├──1:n── payees ──n:1── billers
                   └──1:n── etransfers  (as sender; recipient_customer_id is optional)

 Every arrow is really two columns: (sandbox_id, something_id) → (sandbox_id, id)
</pre>

<h3>INNER vs LEFT, on four rows</h3>
<p>Take two customers, Emma (who has a credit card, account 3) and Noah (who does not), and join them to <code>accounts</code> with <code>a.type = 'CREDIT'</code> in the join condition:</p>
<div class="table-wrap"><table>
<thead><tr><th>Join</th><th>Rows you get</th></tr></thead>
<tbody>
<tr><td><code>JOIN</code></td><td>Emma | 3</td></tr>
<tr><td><code>LEFT JOIN</code></td><td>Emma | 3<br>Noah | <code>NULL</code></td></tr>
<tr><td><code>LEFT JOIN ... WHERE a.id IS NULL</code></td><td>Noah | <code>NULL</code> (the anti-join: "who has no credit card?")</td></tr>
</tbody></table></div>

<h3>Worked example: who sent Emma money?</h3>
<p>The first example below lists e-Transfers Emma has <em>received</em>, with the sender's name:</p>
<ol>
<li><code>FROM etransfers e</code>: start from the e-Transfers, because that is what we are listing.</li>
<li><code>JOIN customers s ON s.sandbox_id = e.sandbox_id AND s.id = e.sender_customer_id</code>: for each e-Transfer find the customer who sent it. The alias <code>s</code> ("sender")
makes it obvious which role this customers row plays; the same table could be joined a second time as <code>r</code> for the recipient.</li>
<li><code>WHERE e.sandbox_id = 1 AND e.recipient_customer_id = 1</code>: only those addressed to Emma.</li>
<li><code>s.first_name || ' ' || s.last_name</code>: <code>||</code> joins strings.</li>
</ol>
<p>On the seed data you get one row: e-Transfer 106, $120.00 from Olivia Singh, still <code>PENDING</code>.</p>

<h3>The fan-out trap</h3>
<p>Joining a table multiplies rows: one customer row × 4 accounts × 3 payees = 12 rows. If you then <code>sum(a.balance)</code>, every balance is counted three times.
For Emma that gives 225,854.28 instead of 75,284.76, exactly three times too much (one per payee). Aggregate each child table <em>separately</em> (a scalar subquery, or a
CTE per child table) and only then put the totals side by side. The second example shows both versions.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Joining on <code>id</code> alone and forgetting <code>sandbox_id</code> (it works locally, multiplies rows on QA).</li>
<li>Putting a condition on the right-hand table of a <code>LEFT JOIN</code> into <code>WHERE</code>: the <code>NULL</code> rows fail it and the LEFT JOIN quietly becomes an inner join.</li>
<li>Summing after joining two independent child tables (fan-out).</li>
<li>Joining <code>customers.id = users.id</code> instead of <code>customers.user_id = users.id</code>. In the seed data every customer's id happens to equal their user id, so the
wrong join "works", until a test registers a new customer, whose user id and customer id are different numbers.</li>
<li>Writing <code>SELECT id, status</code> when two joined tables both have those columns: <em>column reference "id" is ambiguous</em>. Prefix with the alias.</li>
</ul></div>`,
      examples: [
        {
          title: "Customer, email and every account, for the six personas",
          lang: "sql",
          code: `
SELECT c.id AS customer_id, c.first_name, c.last_name, u.email,
       a.id AS account_id, a.type, a.status, a.balance
FROM customers c
JOIN users u    ON u.sandbox_id = c.sandbox_id AND u.id = c.user_id
JOIN accounts a ON a.sandbox_id = c.sandbox_id AND a.customer_id = c.id
WHERE c.sandbox_id = 1
  AND c.id <= 6
ORDER BY c.id, a.id;`,
        },
        {
          title: "Emma's saved payees with the biller name and account-number format",
          lang: "sql",
          code: `
SELECT p.id AS payee_id, b.name AS biller, p.nickname, p.account_number, b.account_number_pattern
FROM payees p
JOIN billers b ON b.sandbox_id = p.sandbox_id AND b.id = p.biller_id
WHERE p.sandbox_id = 1
  AND p.customer_id = 1
  AND p.deleted_at IS NULL
ORDER BY p.id;`,
        },
        {
          title: "Both legs of each recent transfer (self-join on reference_id)",
          lang: "sql",
          code: `
SELECT d.reference_id,
       d.account_id AS from_account, d.amount AS debit_amount,
       c.account_id AS to_account,   c.amount AS credit_amount,
       d.created_at
FROM transactions d
JOIN transactions c
  ON c.sandbox_id = d.sandbox_id
 AND c.reference_id = d.reference_id
 AND c.direction = 'CREDIT'
WHERE d.sandbox_id = 1
  AND d.direction = 'DEBIT'
  AND d.type = 'TRANSFER'
ORDER BY d.created_at DESC, d.id DESC
LIMIT 10;`,
        },
        {
          title: "Anti-join: customers with no credit card account",
          lang: "sql",
          code: `
SELECT c.id, c.first_name, c.last_name
FROM customers c
LEFT JOIN accounts a
  ON a.sandbox_id = c.sandbox_id
 AND a.customer_id = c.id
 AND a.type = 'CREDIT'
WHERE c.sandbox_id = 1
  AND a.id IS NULL
ORDER BY c.id;`,
          note: "The <code>a.type = 'CREDIT'</code> condition belongs in the <code>ON</code> clause. Moving it to <code>WHERE</code> turns the LEFT JOIN back into an inner join and the query returns nothing.",
        },
        {
          title: "e-Transfers with sender name and source account number",
          lang: "sql",
          code: `
SELECT e.id, s.first_name || ' ' || s.last_name AS sender, a.account_number,
       e.recipient_email, e.amount, e.status, e.created_at, e.expires_at
FROM etransfers e
JOIN customers s ON s.sandbox_id = e.sandbox_id AND s.id = e.sender_customer_id
JOIN accounts a  ON a.sandbox_id = e.sandbox_id AND a.id = e.from_account_id
WHERE e.sandbox_id = 1
ORDER BY e.created_at DESC
LIMIT 10;`,
        },
        {
          title: "Worked example: e-Transfers Emma received, with the sender's name",
          lang: "sql",
          code: `
SELECT e.id,
       s.first_name || ' ' || s.last_name AS sender,
       e.amount,
       e.status,
       e.created_at AT TIME ZONE 'America/Toronto' AS sent_toronto
FROM etransfers e
JOIN customers s
  ON s.sandbox_id = e.sandbox_id
 AND s.id = e.sender_customer_id
WHERE e.sandbox_id = 1
  AND e.recipient_customer_id = 1
ORDER BY e.created_at DESC, e.id DESC
LIMIT 5;`,
        },
        {
          title: "Fan-out: the wrong total and the right total for Emma",
          lang: "sql",
          code: `
-- WRONG: accounts x payees = 12 rows, so every balance is summed 3 times
SELECT c.id, c.first_name,
       sum(a.balance) AS wrong_total,
       count(*)       AS joined_rows
FROM customers c
JOIN accounts a ON a.sandbox_id = c.sandbox_id AND a.customer_id = c.id
JOIN payees p   ON p.sandbox_id = c.sandbox_id AND p.customer_id = c.id AND p.deleted_at IS NULL
WHERE c.sandbox_id = 1 AND c.id = 1
GROUP BY c.id, c.first_name;

-- RIGHT: aggregate each child table on its own
SELECT c.id, c.first_name,
       (SELECT sum(a.balance) FROM accounts a
         WHERE a.sandbox_id = c.sandbox_id AND a.customer_id = c.id) AS right_total,
       (SELECT count(*) FROM payees p
         WHERE p.sandbox_id = c.sandbox_id AND p.customer_id = c.id AND p.deleted_at IS NULL) AS payees
FROM customers c
WHERE c.sandbox_id = 1 AND c.id = 1;`,
        },
        {
          title: "Four tables in a chain: who owns transaction 20006?",
          lang: "sql",
          code: `
SELECT t.id AS transaction_id, t.amount, t.description,
       a.account_number, a.type AS account_type,
       c.first_name || ' ' || c.last_name AS owner,
       u.email
FROM transactions t
JOIN accounts a  ON a.sandbox_id = t.sandbox_id AND a.id = t.account_id
JOIN customers c ON c.sandbox_id = a.sandbox_id AND c.id = a.customer_id
JOIN users u     ON u.sandbox_id = c.sandbox_id AND u.id = c.user_id
WHERE t.sandbox_id = 1
  AND t.id = 20006;`,
          note: "Each join walks one arrow of the diagram: transaction → account → customer → user. Note <code>c.user_id = u.id</code>, not <code>c.id = u.id</code>.",
        },
      ],
      exercises: [
        "Write a query that returns, for every persona (customers 1 to 6), their email, number of accounts and total balance. You will need a join and a GROUP BY.",
        "List Emma's debit and credit cards with <code>last4</code>, card status and the account number and type each card is attached to. Compare with <code>GET /api/v1/cards</code>.",
        "Write an anti-join that finds bill payments whose payee row does not exist, and another that finds transfers (<code>type = 'TRANSFER'</code>) that have a DEBIT leg but no CREDIT leg. Both should return no rows in the clean build; keep them, they are bug detectors for QA.",
        "Take the first example and remove <code>u.sandbox_id = c.sandbox_id AND</code> from the join. Run it locally and note that nothing changes. In two sentences, explain what would happen on QA and why that makes this mistake dangerous.",
        "Write two queries that list the e-Transfers Emma has <em>received</em>: one using <code>recipient_customer_id</code>, one matching <code>recipient_email</code> to her email in <code>users</code>. Do they agree? Then find the e-Transfer in the sandbox whose <code>recipient_customer_id</code> is <code>NULL</code>, and explain why an inner join from <code>etransfers</code> to the recipient customer would silently drop it.",
      ],
      quiz: [
        {
          q: `<code>FROM customers c LEFT JOIN accounts a ON ... AND a.customer_id = c.id WHERE a.type = 'CREDIT'</code>. How does this behave?`,
          options: [`Like an inner join: customers without a credit card disappear`, `Like a LEFT JOIN: every customer, with NULL for those without a card`, `It returns only customers without a credit card`, `It is a syntax error`],
          answer: 0,
          explain: `For customers with no credit account, <code>a.type</code> is NULL, and <code>NULL = 'CREDIT'</code> is not true, so WHERE removes them. Conditions on the optional table belong in the ON clause.`,
        },
        {
          q: `Locally, a join without <code>sandbox_id</code> returns 6 rows. On QA there are four sandboxes with the same ids. What will the same query typically return there, filtered to your sandbox on the first table?`,
          options: [`6 rows, the same as locally`, `An error about ambiguous keys`, `0 rows`, `24 rows: each row matches the same id in all four sandboxes`],
          answer: 3,
          explain: `Without <code>sandbox_id</code> in the ON clause, your row matches the partner row with that id in every sandbox. The data looks plausible, the counts and sums are four times too big.`,
        },
        {
          q: `Emma has 4 accounts and 3 payees. You join customers → accounts → payees and compute <code>sum(a.balance)</code>. What do you get?`,
          options: [`The correct total`, `Three times the correct total`, `Four times the correct total`, `The total of the payees`],
          answer: 1,
          explain: `Each account row is repeated once per payee (4 × 3 = 12 rows), so each balance is added 3 times. Aggregate accounts and payees separately before combining them.`,
        },
        {
          q: `Which question is answered by an anti-join (<code>LEFT JOIN ... WHERE right.id IS NULL</code>)?`,
          options: [`Which customers have the most accounts?`, `Which bill payments point at a payee row that does not exist?`, `What is the total balance per customer?`, `Which transactions belong to account 1?`],
          answer: 1,
          explain: `An anti-join keeps left-hand rows that have <em>no</em> partner. Orphan checks ("child rows whose parent is missing") are its classic QA use.`,
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "subqueries-ctes",
      title: "Subqueries and CTEs",
      summary: "Break hard questions into steps with subqueries, WITH clauses and window functions.",
      body: `
<p>Some questions need two steps: "find the latest transfer, then show its legs" or "work out each customer's total, then keep the top 5". SQL lets you put a
query inside another one (a <strong>subquery</strong>) or name intermediate results with <code>WITH</code> (a <strong>common table expression</strong>, CTE).</p>

<h3>Subqueries</h3>
<ul>
<li><strong>In WHERE with IN:</strong> <code>WHERE account_id IN (SELECT id FROM accounts WHERE ... )</code>.</li>
<li><strong>EXISTS:</strong> <code>WHERE EXISTS (SELECT 1 FROM ... WHERE ...)</code> is true if the inner query returns at least one row. It reads naturally ("customers who
have at least one pending e-Transfer") and handles <code>NULL</code> safely, unlike <code>NOT IN</code>.</li>
<li><strong>Scalar subquery:</strong> a subquery that returns one value can be used as a column: <code>(SELECT count(*) FROM payees p WHERE ...) AS payee_count</code>.</li>
</ul>

<h3>CTEs: name your steps</h3>
<p><code>WITH step_one AS (SELECT ...), step_two AS (SELECT ... FROM step_one) SELECT ... FROM step_two</code>. Each step is readable on its own, you can run
them one by one while debugging, and long QA queries stay maintainable. Think of a CTE as a local variable holding a table.</p>

<h3>Window functions: look at neighbouring rows</h3>
<p>A window function computes something across related rows <em>without</em> collapsing them like <code>GROUP BY</code> does.</p>
<ul>
<li><code>row_number() OVER (PARTITION BY account_id ORDER BY created_at DESC)</code> numbers each account's transactions newest first. Keep
<code>= 1</code> to get "the latest transaction per account".</li>
<li><code>lag(balance_after) OVER (PARTITION BY account_id ORDER BY posted_at, id)</code> gives the previous row's balance. That makes a powerful
integrity check: every posted row's <code>balance_after</code> must equal the previous balance plus a credit or minus a debit.</li>
</ul>
<div class="callout"><p><strong>Why this matters for QA.</strong> A bug in the posting logic could write a wrong <code>balance_after</code>
while the API response for the transfer still looks fine. Only a query that compares each row with its neighbour catches it.</p></div>

<h3>Which tool for which question?</h3>
<div class="table-wrap"><table>
<thead><tr><th>Tool</th><th>Gives you</th><th>Use it for</th></tr></thead>
<tbody>
<tr><td><code>IN (subquery)</code></td><td>A list to test membership against</td><td>"rows whose account is one of Emma's accounts". Careful with <code>NOT IN</code> (below).</td></tr>
<tr><td><code>EXISTS</code> / <code>NOT EXISTS</code></td><td>True or false for each outer row</td><td>"has at least one ..." / "has none ...". The safe choice for negative questions.</td></tr>
<tr><td>Scalar subquery</td><td>Exactly one value per outer row</td><td>An extra computed column, such as a count of payees. Must return at most one row.</td></tr>
<tr><td>CTE (<code>WITH</code>)</td><td>A named intermediate result</td><td>Multi-step questions; debugging one step at a time.</td></tr>
<tr><td>Window function (<code>OVER</code>)</td><td>A value for every row, computed over related rows</td><td>Rankings, "latest per group", previous row, running totals.</td></tr>
</tbody></table></div>

<h3>Worked example: Emma's busiest day, step by step</h3>
<p>Question: <em>"On which Toronto day(s) did account 1 have the most transactions?"</em> It needs three steps, and the CTE example below names each one:</p>
<ol>
<li><code>per_day</code>: count rows per Toronto day (a <code>GROUP BY</code> from lesson 3).</li>
<li><code>top</code>: the highest of those counts (<code>max</code> over the first step).</li>
<li>The final <code>SELECT</code> joins the two and keeps the days whose count equals the maximum. Using a join rather than <code>ORDER BY ... LIMIT 1</code> means ties are not hidden.</li>
</ol>
<p>To debug, select just the inner query of <code>per_day</code> in DBeaver and press <kbd>Ctrl</kbd>+<kbd>Enter</kbd>: it runs the selection only. On the seed data four days tie, with
3 transactions each.</p>

<h3>The NOT IN trap, explained</h3>
<p><code>x NOT IN (1, 2, NULL)</code> means <code>x &lt;&gt; 1 AND x &lt;&gt; 2 AND x &lt;&gt; NULL</code>. The last part is unknown, so the whole condition is never true and
the query returns nothing. Ice Bank has a real case: e-Transfer 105 goes to someone outside the bank, so its <code>recipient_customer_id</code> is <code>NULL</code>.
"Customers who never received an e-Transfer" with <code>NOT IN</code> returns <strong>0</strong>; the same question with <code>NOT EXISTS</code> returns the right answer
(12 customers in the seed data). The first example shows both.</p>

<h3>rank, dense_rank, row_number</h3>
<div class="table-wrap"><table>
<thead><tr><th>amount (DESC)</th><th><code>row_number()</code></th><th><code>rank()</code></th><th><code>dense_rank()</code></th></tr></thead>
<tbody>
<tr><td>1592.46</td><td>1</td><td>1</td><td>1</td></tr>
<tr><td>1592.46</td><td>2</td><td>1</td><td>1</td></tr>
<tr><td>900.00</td><td>3</td><td>3</td><td>2</td></tr>
</tbody></table></div>
<p><code>row_number()</code> never ties (give it a unique tie-breaker to make it deterministic), <code>rank()</code> ties and then skips, <code>dense_rank()</code> ties without gaps.
Filtering <code>rank() = 1</code> can therefore return several rows per group.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li><code>NOT IN</code> against a column that can be <code>NULL</code>: zero rows, no error. Use <code>NOT EXISTS</code>.</li>
<li>A scalar subquery that can return two rows: <em>more than one row returned by a subquery used as an expression</em>.</li>
<li>A window function in <code>WHERE</code>: <em>window functions are not allowed in WHERE</em>. Compute it in a CTE, then filter outside.</li>
<li>Forgetting <code>PARTITION BY</code>, so <code>row_number()</code> numbers the whole table instead of each account.</li>
<li>A correlated subquery that matches on <code>id</code> but not on <code>sandbox_id</code> (the same QA-only bug as in joins).</li>
</ul></div>`,
      examples: [
        {
          title: "EXISTS: customers who have a PENDING e-Transfer waiting",
          lang: "sql",
          code: `
SELECT c.id, c.first_name, c.last_name
FROM customers c
WHERE c.sandbox_id = 1
  AND EXISTS (
    SELECT 1
    FROM etransfers e
    WHERE e.sandbox_id = c.sandbox_id
      AND e.sender_customer_id = c.id
      AND e.status = 'PENDING'
  );`,
        },
        {
          title: "Scalar subqueries: one summary row per persona",
          lang: "sql",
          code: `
SELECT c.id, c.first_name,
       (SELECT count(*) FROM accounts a
         WHERE a.sandbox_id = c.sandbox_id AND a.customer_id = c.id) AS accounts,
       (SELECT count(*) FROM payees p
         WHERE p.sandbox_id = c.sandbox_id AND p.customer_id = c.id AND p.deleted_at IS NULL) AS payees,
       (SELECT count(*) FROM etransfer_contacts k
         WHERE k.sandbox_id = c.sandbox_id AND k.customer_id = c.id) AS contacts
FROM customers c
WHERE c.sandbox_id = 1 AND c.id <= 6
ORDER BY c.id;`,
        },
        {
          title: "Latest transaction per account for Emma (CTE + row_number)",
          lang: "sql",
          code: `
WITH ranked AS (
  SELECT t.account_id, t.id, t.created_at, t.type, t.amount, t.balance_after,
         row_number() OVER (PARTITION BY t.account_id ORDER BY t.created_at DESC, t.id DESC) AS rn
  FROM transactions t
  WHERE t.sandbox_id = 1
    AND t.account_id IN (1, 2, 3, 4)
)
SELECT account_id, id, created_at, type, amount, balance_after
FROM ranked
WHERE rn = 1
ORDER BY account_id;`,
        },
        {
          title: "Integrity check: does every balance_after follow from the previous row?",
          lang: "sql",
          code: `
WITH legs AS (
  SELECT t.account_id, t.id, t.posted_at, t.direction, t.amount, t.balance_after,
         lag(t.balance_after) OVER (PARTITION BY t.account_id ORDER BY t.posted_at, t.id) AS prev_balance
  FROM transactions t
  WHERE t.sandbox_id = 1
    AND t.balance_after IS NOT NULL
)
SELECT *
FROM legs
WHERE prev_balance IS NOT NULL
  AND balance_after <> prev_balance
                       + CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END
ORDER BY account_id, posted_at, id;`,
          note: "In the clean build this returns no rows. On QA with the data-integrity bugs switched on, it may not.",
        },
        {
          title: "Does each account's balance equal its latest balance_after?",
          lang: "sql",
          code: `
WITH latest AS (
  SELECT DISTINCT ON (t.account_id) t.account_id, t.balance_after
  FROM transactions t
  WHERE t.sandbox_id = 1
    AND t.balance_after IS NOT NULL
  ORDER BY t.account_id, t.posted_at DESC, t.id DESC
)
SELECT a.id, a.type, a.balance, l.balance_after
FROM accounts a
JOIN latest l ON l.account_id = a.id
WHERE a.sandbox_id = 1
  AND a.balance <> l.balance_after;`,
          note: "<code>DISTINCT ON</code> is a PostgreSQL shortcut for \"first row per group, according to ORDER BY\".",
        },
        {
          title: "NOT IN vs NOT EXISTS when the list contains a NULL",
          lang: "sql",
          code: `
SELECT
  (SELECT count(*) FROM customers c
    WHERE c.sandbox_id = 1
      AND c.id NOT IN (SELECT e.recipient_customer_id
                       FROM etransfers e WHERE e.sandbox_id = 1))      AS not_in_result,
  (SELECT count(*) FROM customers c
    WHERE c.sandbox_id = 1
      AND NOT EXISTS (SELECT 1 FROM etransfers e
                      WHERE e.sandbox_id = c.sandbox_id
                        AND e.recipient_customer_id = c.id))           AS not_exists_result;`,
          note: "Same question, two answers: <code>not_in_result</code> is 0 because one <code>recipient_customer_id</code> is <code>NULL</code>.",
        },
        {
          title: "Worked example: the busiest day(s) on Emma's chequing (CTE in three steps)",
          lang: "sql",
          code: `
WITH per_day AS (
  SELECT (created_at AT TIME ZONE 'America/Toronto')::date AS day,
         count(*) AS tx_count
  FROM transactions
  WHERE sandbox_id = 1
    AND account_id = 1
  GROUP BY 1
),
top AS (
  SELECT max(tx_count) AS most FROM per_day
)
SELECT p.day, p.tx_count
FROM per_day p
JOIN top t ON p.tx_count = t.most
ORDER BY p.day;`,
        },
        {
          title: "Running total with sum() OVER: Emma's October purchases",
          lang: "sql",
          code: `
SELECT id,
       created_at AT TIME ZONE 'America/Toronto' AS toronto_time,
       amount,
       sum(amount) OVER (ORDER BY created_at, id) AS running_total
FROM transactions
WHERE sandbox_id = 1
  AND account_id = 1
  AND type = 'PURCHASE'
  AND created_at >= TIMESTAMPTZ '2026-10-01 00:00 America/Toronto'
  AND created_at <  TIMESTAMPTZ '2026-11-01 00:00 America/Toronto'
ORDER BY created_at, id;`,
          note: "With <code>ORDER BY</code> inside <code>OVER</code>, <code>sum()</code> adds up every row from the first one to the current one. Unlike <code>GROUP BY</code>, every row stays in the result.",
        },
      ],
      exercises: [
        "Using <code>EXISTS</code>, list customers who have at least one payee for <em>Niagara Power Co</em>. Rewrite the same query with <code>IN</code> and with a <code>JOIN</code>; check all three return the same rows.",
        "Write a CTE that computes each customer's total POSTED card spending (<code>type = 'PURCHASE'</code>) in October 2026 (Toronto), then returns the top 5 customers with their names.",
        "Run the integrity check for the whole sandbox and the balance-vs-latest check. Make one transfer through the API as Emma and run both again. Save both queries in your framework repo; you will turn them into JDBC assertions in week 3.",
        "Use <code>lag()</code> to find, for account 1, the longest gap in days between two consecutive transactions in 2026.",
        "For each of the six personas (customers 1 to 6), find their single largest POSTED debit ever, with the account, amount and description. Write it first with <code>rank()</code> and then with <code>row_number()</code> (partition by customer). Explain why one persona returns many rows with <code>rank() = 1</code>, why one persona returns nothing at all, and how you would make the <code>row_number()</code> version return the same row every time.",
      ],
      quiz: [
        {
          q: `<code>WHERE c.id NOT IN (SELECT recipient_customer_id FROM etransfers ...)</code> returns 0 rows, but you know some customers never received anything. Why?`,
          options: [`NOT IN only works with numbers below 1,000,000`, `The subquery returns at least one NULL, which makes NOT IN unknown for every row`, `The subquery needs DISTINCT`, `NOT IN does not work across tables`],
          answer: 1,
          explain: `<code>x NOT IN (..., NULL)</code> contains <code>x &lt;&gt; NULL</code>, which is unknown, so no row passes. <code>NOT EXISTS</code> asks "is there a matching row?" and is not affected by NULLs.`,
        },
        {
          q: `You want only the latest transaction per account. Why can't you write <code>WHERE row_number() OVER (...) = 1</code>?`,
          options: [`row_number() only works with GROUP BY`, `row_number() starts at 0`, `It works, but it is slow`, `Window functions are computed after WHERE, so they are not allowed there; compute them in a CTE and filter outside`],
          answer: 3,
          explain: `Window functions run after filtering and grouping, near the end of the query. Put the window in a CTE or subquery, then filter <code>rn = 1</code> in the outer query.`,
        },
        {
          q: `Olivia pays the same rent amount every month. Which ranking returns exactly one "largest debit" row for her?`,
          options: [`<code>row_number() = 1</code> with a unique tie-breaker such as <code>id DESC</code>`, `<code>dense_rank() = 1</code>`, `<code>rank() = 1</code>`, `None of them can`],
          answer: 0,
          explain: `<code>rank()</code> and <code>dense_rank()</code> give every tied row rank 1. <code>row_number()</code> always numbers rows 1, 2, 3…; adding <code>id</code> to its ORDER BY makes the choice repeatable.`,
        },
        {
          q: `A scalar subquery <code>(SELECT a.id FROM accounts a WHERE a.customer_id = c.id)</code> fails for Emma. Why?`,
          options: [`Scalar subqueries cannot reference the outer query`, `<code>a.id</code> must be aggregated with sum()`, `Emma has four accounts, so it returns more than one row where only one value is allowed`, `It needs a LIMIT 0`],
          answer: 2,
          explain: `A scalar subquery must produce at most one row. Use an aggregate (<code>count(*)</code>, <code>max(a.id)</code>), a filter that guarantees one row, or a join instead.`,
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "dml-transactions",
      title: "INSERT, UPDATE, DELETE and transactions",
      summary: "Change data safely for test setup, and use transactions so mistakes can be undone.",
      body: `
<p>Most of the time you read the database. Sometimes a test needs data the API cannot easily create, or you want to put a row in an unusual state.
That is when you write SQL that changes data, always as <code>qa_writer</code>, always locally, and always inside a transaction you can roll back.</p>

<h3>The three statements</h3>
<ul>
<li><code>INSERT INTO table (col1, col2) VALUES (v1, v2)</code> adds a row. Name the columns; let defaults fill the rest. In Ice Bank, leave
<code>id</code> out: it defaults to the next value of <code>global_id_seq</code> (runtime rows get ids from 1,000,000 up). You <em>must</em> give
<code>sandbox_id</code> and <code>created_at</code>; use <code>app_now(1)</code> for the timestamp so it agrees with the sandbox clock.</li>
<li><code>UPDATE table SET col = value WHERE ...</code> changes rows. <strong>Run the same <code>WHERE</code> as a <code>SELECT</code> first</strong> and check the count.
An <code>UPDATE</code> without <code>WHERE</code> changes every row.</li>
<li><code>DELETE FROM table WHERE ...</code> removes rows. Same rule.</li>
</ul>
<p>Add <code>RETURNING *</code> (or a list of columns) to any of them to see exactly which rows changed, without a second query.</p>

<h3>Transactions</h3>
<p>A transaction groups statements so they succeed or fail together: <code>BEGIN;</code> … <code>COMMIT;</code> makes them permanent,
<code>ROLLBACK;</code> undoes everything since <code>BEGIN</code>. This is the "A" (atomicity) in ACID, and it is exactly what Ice Bank relies on when a
transfer writes two transaction rows and two balances: all of it, or none of it.</p>
<ul>
<li><strong>Isolation:</strong> other connections (including the app) do not see your uncommitted changes. If you change a nickname without committing, the
API still returns the old one.</li>
<li><strong>Locks:</strong> while your transaction is open, the rows you updated are locked. If you leave a DBeaver transaction open on account 1, Emma's
next transfer from account 1 will <em>hang</em> until you commit or roll back. If the app suddenly freezes, check DBeaver first.</li>
<li><strong>Errors abort the transaction:</strong> after any error, PostgreSQL ignores further statements ("current transaction is aborted") until you
<code>ROLLBACK</code>. Use <code>SAVEPOINT s1;</code> and <code>ROLLBACK TO SAVEPOINT s1;</code> to recover part-way.</li>
</ul>

<h3>Setup through the API or through SQL?</h3>
<p>Prefer the API for business actions: it applies the rules, writes the audit log and notifications, and keeps balances consistent. Use SQL for things the API cannot
reach quickly, or for reading state. Some things SQL is <em>not allowed</em> to do: the trigger <code>trg_transactions_immutable</code> blocks changing the amount
or account of any transaction and deleting <code>POSTED</code> ones. When you have made a mess, restore the seed with <code>npm run reset</code> or
<code>POST /api/v1/test/reset</code> (header <code>X-Sandbox-Key: ICEBANK-LOCAL-KEY</code>): same ids, same balances, clock back to the seed instant.</p>

<h3>Two connections, one row: what each side sees</h3>
<p>Run this in your head (then for real in the exercises). DBeaver's WRITER connection is in manual-commit mode; the app and your READER connection are other sessions.</p>
<div class="table-wrap"><table>
<thead><tr><th>Step</th><th>WRITER connection (qa_writer)</th><th>App / READER connection</th></tr></thead>
<tbody>
<tr><td>1</td><td><code>BEGIN;</code> (DBeaver does this for you in manual-commit mode)</td><td></td></tr>
<tr><td>2</td><td><code>UPDATE accounts SET nickname = 'Test' WHERE sandbox_id = 1 AND id = 2;</code> → <em>UPDATE 1</em>. Row 2 (Emma's savings) is now locked.</td><td></td></tr>
<tr><td>3</td><td>Sees <code>'Test'</code>.</td><td>Still sees the old value: uncommitted changes are invisible to everyone else.</td></tr>
<tr><td>4</td><td></td><td>Emma transfers money into savings. The transfer has to update row 2's balance, so it <strong>waits</strong>: the row is locked.</td></tr>
<tr><td>5</td><td><code>ROLLBACK;</code> (or <code>COMMIT;</code>)</td><td>The waiting statement continues. After COMMIT it sees <code>'Test'</code>; after ROLLBACK, the old value.</td></tr>
</tbody></table></div>

<h3>Worked example: the safe-change recipe</h3>
<p>Every data change for test setup follows the same five steps. Here it is for giving Noah's chequing account (id 9) a nickname:</p>
<ol>
<li><strong>Preview.</strong> <code>SELECT id, nickname FROM accounts WHERE sandbox_id = 1 AND id = 9;</code> Expect exactly 1 row. If you see 0 or 50, fix the <code>WHERE</code> now.</li>
<li><strong>Open a transaction.</strong> <code>BEGIN;</code></li>
<li><strong>Change, with the same WHERE, and look at the result.</strong> <code>UPDATE accounts SET nickname = 'Tutorial' WHERE sandbox_id = 1 AND id = 9 RETURNING id, nickname;</code>
The status line must say <em>UPDATE 1</em>.</li>
<li><strong>Check from outside.</strong> From the READER connection or the API, confirm nobody else sees the change yet.</li>
<li><strong>Decide.</strong> <code>COMMIT;</code> to keep it, <code>ROLLBACK;</code> to throw it away. Then check once more from outside.</li>
</ol>
<p>In auto-commit mode (DBeaver's default) step 2 does not happen: each statement is its own transaction and is permanent the moment it finishes. That is why the WRITER
connection should always be in manual-commit mode.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Running an <code>UPDATE</code> or <code>DELETE</code> without <code>WHERE</code>, or with a <code>WHERE</code> you never previewed.</li>
<li>Working in auto-commit mode and expecting <code>ROLLBACK</code> to save you. Nothing to roll back: it was already committed.</li>
<li>Leaving a transaction open and going for lunch. Your locks stay, and the app hangs on those rows.</li>
<li>Continuing after an error: <em>current transaction is aborted, commands ignored until end of transaction block</em>. Roll back (or to a savepoint) first.</li>
<li>Giving an <code>id</code> yourself in an <code>INSERT</code>: you can collide with a seeded id or with one the app will generate. Leave <code>id</code> out.</li>
<li>Using <code>now()</code> for <code>created_at</code>. Use <code>app_now(1)</code> so the row agrees with the sandbox clock that the business rules use.</li>
</ul></div>`,
      examples: [
        {
          title: "Insert an e-Transfer contact for Noah, look at it, then undo",
          lang: "sql",
          code: `
BEGIN;

INSERT INTO etransfer_contacts (sandbox_id, customer_id, name, email, created_at)
VALUES (1, 4, 'Tutorial Contact', 'tutorial.contact@example.com', app_now(1))
RETURNING id, customer_id, name, email, created_at;

SELECT id, name, email
FROM etransfer_contacts
WHERE sandbox_id = 1 AND customer_id = 4;

ROLLBACK;`,
          note: "Run it as <code>qa_writer</code>. Emails must be lower case: a CHECK constraint rejects anything else.",
        },
        {
          title: "Update safely: SELECT first, then UPDATE ... RETURNING",
          lang: "sql",
          code: `
-- 1. Check exactly which rows the WHERE matches
SELECT id, nickname FROM accounts WHERE sandbox_id = 1 AND id = 2;

-- 2. Change them, inside a transaction
BEGIN;
UPDATE accounts
SET nickname = 'Tutorial test'
WHERE sandbox_id = 1 AND id = 2
RETURNING id, nickname;

-- 3. Keep it with COMMIT, or undo it with ROLLBACK
ROLLBACK;`,
        },
        {
          title: "Try to rewrite history (the immutability trigger says no)",
          lang: "sql",
          code: `
BEGIN;

UPDATE transactions
SET amount = amount + 1
WHERE sandbox_id = 1 AND id = (
  SELECT max(id) FROM transactions WHERE sandbox_id = 1 AND account_id = 1 AND status = 'POSTED'
);
-- ERROR: IMMUTABLE_TRANSACTION: amount, direction and account of transaction ... cannot be changed

ROLLBACK;`,
        },
        {
          title: "Savepoints: several experiments in one transaction",
          lang: "sql",
          code: `
BEGIN;
SAVEPOINT before_test;

DELETE FROM transactions
WHERE sandbox_id = 1 AND account_id = 1 AND status = 'POSTED';
-- ERROR: IMMUTABLE_TRANSACTION: POSTED transaction ... cannot be deleted

ROLLBACK TO SAVEPOINT before_test;   -- the transaction is usable again
SELECT count(*) FROM transactions WHERE sandbox_id = 1 AND account_id = 1;

ROLLBACK;`,
        },
        {
          title: "JDBC: test setup in a transaction that is always rolled back",
          lang: "java",
          code: `
try (Connection con = DriverManager.getConnection(
        "jdbc:postgresql://localhost:5433/icebank", "qa_writer", "qa_writer")) {
    con.setAutoCommit(false);                       // BEGIN
    try (PreparedStatement ps = con.prepareStatement(
            "UPDATE accounts SET nickname = ? WHERE sandbox_id = ? AND id = ? RETURNING nickname")) {
        ps.setString(1, "Tutorial test");
        ps.setInt(2, 1);
        ps.setLong(3, 2L);
        try (ResultSet rs = ps.executeQuery()) {
            rs.next();
            assertEquals("Tutorial test", rs.getString("nickname"));
        }
    } finally {
        con.rollback();                             // ROLLBACK, even if the assertion fails
    }
}`,
        },
        {
          title: "Step 1 of every change: preview the rows with the exact same WHERE",
          lang: "sql",
          code: `
-- The UPDATE you are about to run:
--   UPDATE accounts SET nickname = 'Tutorial'
--   WHERE sandbox_id = 1 AND customer_id = 1 AND type = 'SAVINGS';
-- Its preview:
SELECT id, nickname
FROM accounts
WHERE sandbox_id = 1
  AND customer_id = 1
  AND type = 'SAVINGS';`,
          note: "One row (account 2, \"Rainy day\") means the UPDATE will change exactly one row. Copy the WHERE clause, never retype it.",
        },
        {
          title: "Who has a transaction open right now?",
          lang: "sql",
          code: `
SELECT pid, usename, state, xact_start, now() - xact_start AS open_for
FROM pg_stat_activity
WHERE datname = current_database()
  AND state LIKE 'idle in transaction%'
ORDER BY xact_start;`,
          note: "Run it as the same user that opened the transaction (your WRITER connection). PostgreSQL hides the state of other users' sessions from roles that are not administrators, so as <code>qa_reader</code> you only see your own.",
        },
        {
          title: "What has changed since the last reset? (runtime ids start at 1,000,000)",
          lang: "sql",
          code: `
SELECT 'transactions' AS table_name, count(*) FILTER (WHERE id >= 1000000) AS created_since_reset, count(*) AS all_rows
FROM transactions WHERE sandbox_id = 1
UNION ALL
SELECT 'transfers', count(*) FILTER (WHERE id >= 1000000), count(*) FROM transfers WHERE sandbox_id = 1
UNION ALL
SELECT 'etransfers', count(*) FILTER (WHERE id >= 1000000), count(*) FROM etransfers WHERE sandbox_id = 1
UNION ALL
SELECT 'audit_log', count(*) FILTER (WHERE id >= 1000000), count(*) FROM audit_log WHERE sandbox_id = 1;`,
          note: "A quick way to see whether your local data is still the seed, before you rely on seed values in an assertion.",
        },
      ],
      exercises: [
        "As <code>qa_writer</code> in manual-commit mode, insert a contact for Noah (customer 4). Before committing, query it from your <em>reader</em> connection and from <code>GET /api/v1/etransfer-contacts</code> signed in as Noah. Write down what each one sees. Then roll back.",
        "Change Emma's savings nickname inside a transaction. Check <code>GET /api/v1/accounts/2</code> before and after <code>COMMIT</code>. Then set it back to <code>Rainy day</code> and commit again.",
        "Try to (a) change the amount of a POSTED transaction, (b) delete a POSTED transaction, (c) change a POSTED transaction's status to <code>PENDING</code>. Record each error message, then roll back.",
        "Lock test: in the writer connection run <code>BEGIN; UPDATE accounts SET nickname = nickname WHERE sandbox_id = 1 AND id = 1;</code> and leave it open. Start a transfer from account 1 in the Ice Bank UI. Describe what happens, then <code>ROLLBACK</code> and watch the transfer finish (or time out).",
        "Repeat the lock test from Exercise 4, and while the WRITER transaction is still open run the \"who has a transaction open\" query in a <em>second</em> editor tab of the WRITER connection, then in the READER connection. Record the <code>state</code>, <code>xact_start</code> and <code>open_for</code> you see in each, and explain why the READER connection shows less.",
      ],
      quiz: [
        {
          q: `In manual-commit mode you run an UPDATE, see <em>UPDATE 1</em>, then close DBeaver without committing. What happens to the change?`,
          options: [`It is saved, because the UPDATE succeeded`, `It stays locked until someone else commits it`, `It is rolled back: an unfinished transaction never becomes permanent`, `It is saved only if auto-commit was on before`],
          answer: 2,
          explain: `Only COMMIT makes a change permanent. When a session ends with an open transaction, PostgreSQL rolls it back and releases its locks.`,
        },
        {
          q: `Inside a transaction, a statement fails with a CHECK violation. You then run a SELECT. What happens?`,
          options: [`The SELECT runs normally`, `The failed statement is retried`, `<em>current transaction is aborted, commands ignored until end of transaction block</em>`, `The transaction commits automatically`],
          answer: 2,
          explain: `After any error the whole transaction is unusable until you ROLLBACK (or ROLLBACK TO SAVEPOINT if you set one before the failing statement).`,
        },
        {
          q: `Emma's transfer in the UI hangs. In DBeaver you have an open WRITER transaction that updated account 1 ten minutes ago. What is going on?`,
          options: [`Your transaction holds a row lock on account 1, so the app's update of that row waits for you`, `The app is down`, `The transfer is waiting for the sandbox clock`, `qa_writer has blocked the app user`],
          answer: 0,
          explain: `Updated rows stay locked until the transaction ends. Any other session that wants to update the same row waits. COMMIT or ROLLBACK and the transfer continues.`,
        },
        {
          q: `Why add <code>RETURNING id, nickname</code> to an UPDATE?`,
          options: [`It is required for UPDATE to work`, `It undoes the change if the result is empty`, `It makes the change permanent`, `It shows exactly which rows changed and their new values, without a second query`],
          answer: 3,
          explain: `RETURNING turns the UPDATE into something you can inspect (and read in JDBC with <code>executeQuery</code>). It does not commit anything.`,
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "constraints",
      title: "Constraints",
      summary: "The rules the database enforces on its own, and how to test that they hold.",
      body: `
<p>Constraints are rules written into the schema. Even if the application code has a bug, the database refuses data that breaks them. That makes them a
second line of defence, and a great source of test ideas: for every constraint, ask "does the API return a clean error, or does it crash with a 500?"</p>

<h3>The kinds of constraint</h3>
<div class="table-wrap"><table>
<thead><tr><th>Kind</th><th>Ice Bank example</th><th>SQLSTATE when broken</th></tr></thead>
<tbody>
<tr><td><code>NOT NULL</code></td><td><code>transactions.description</code> must have a value</td><td><code>23502</code></td></tr>
<tr><td><code>PRIMARY KEY</code></td><td><code>(sandbox_id, id)</code> on every business table</td><td><code>23505</code></td></tr>
<tr><td><code>UNIQUE</code></td><td><code>ux_users_email</code>: one email per sandbox; <code>(sandbox_id, account_number)</code></td><td><code>23505</code></td></tr>
<tr><td><code>FOREIGN KEY</code></td><td><code>accounts.customer_id</code> must point to a real customer; <code>bill_payments.payee_id</code> is <code>ON DELETE RESTRICT</code></td><td><code>23503</code></td></tr>
<tr><td><code>CHECK</code></td><td><code>accounts_deposit_balance_check</code>: chequing and savings never below 0; <code>accounts_credit_limit_check</code>: credit balance ≥ −limit;
province in the 13 codes; postal code matches <code>A1A 1A1</code>; <code>customers_age_18_check</code></td><td><code>23514</code></td></tr>
<tr><td>Partial unique index</td><td><code>ux_disputes_one_open</code>: one <code>OPEN</code> dispute per transaction; <code>ux_payees_active</code>: no duplicate active payee</td><td><code>23505</code></td></tr>
</tbody></table></div>
<p>Errors raised by Ice Bank's own functions and triggers use SQLSTATE <code>P0001</code> with a message that starts with a code, such as
<code>INSUFFICIENT_FUNDS:</code> or <code>IMMUTABLE_TRANSACTION:</code>. In JDBC you read these with <code>SQLException.getSQLState()</code> and
<code>getMessage()</code>.</p>

<h3>From database error to API error</h3>
<p>The app translates database errors into RFC 7807 problems: a unique violation becomes <code>409</code> with <code>code: "DUPLICATE"</code>, a balance
check becomes <code>422 INSUFFICIENT_FUNDS</code>, other checks become <code>422 CONSTRAINT_VIOLATION</code>. Usually the app validates first and returns a
friendlier code (for example <code>409 PAYEE_EXISTS</code>), but the constraint is still there as a safety net. If you ever get a <code>500</code> instead,
you have found a bug.</p>

<h3>Seeing the constraints</h3>
<p>DBeaver shows them under each table's <em>Constraints</em> and <em>Indexes</em> folders, or you can ask the catalogue directly with
<code>pg_constraint</code> and <code>pg_indexes</code>. Partial unique indexes appear under indexes, not constraints, because they have a
<code>WHERE</code> clause.</p>
<p>To test a constraint, break it on purpose inside a transaction you roll back, using the <em>boundary</em> value (exactly 0, exactly the limit) and the
first invalid value (−0.01, limit + 0.01).</p>

<h3>Worked example: reading one CHECK constraint</h3>
<p>Here is <code>accounts_credit_limit_check</code> as the catalogue prints it:</p>
<p><code>CHECK ((type &lt;&gt; 'CREDIT') OR ((credit_limit IS NOT NULL) AND (balance &gt;= (- credit_limit))))</code></p>
<ol>
<li><code>type &lt;&gt; 'CREDIT' OR ...</code> is how SQL writes "<em>if</em> it is a credit card, <em>then</em> ...". For chequing, savings and loans the left side is true, so the rule
does not apply to them at all.</li>
<li><code>credit_limit IS NOT NULL</code>: a credit card must have a limit.</li>
<li><code>balance &gt;= -credit_limit</code>: the balance may go down to minus the limit and no further.</li>
</ol>
<p>Turn it into test values for Olivia's card (account 8, limit 5,000.00):</p>
<div class="table-wrap"><table>
<thead><tr><th>balance</th><th>Allowed?</th><th>Why it is a good test value</th></tr></thead>
<tbody>
<tr><td><code>-4999.99</code></td><td>Yes</td><td>Just inside the limit</td></tr>
<tr><td><code>-5000.00</code></td><td>Yes</td><td>Exactly on the boundary (<code>&gt;=</code>, so it is included)</td></tr>
<tr><td><code>-5000.01</code></td><td>No, 23514</td><td>The first invalid value</td></tr>
<tr><td><code>credit_limit = NULL</code></td><td>No, 23514</td><td>Breaks the second part of the rule</td></tr>
</tbody></table></div>
<p>Her balance in the seed data is −4,960.00, so the database would accept a further $40.00 of debits on the card and reject $40.01.</p>

<h3>A CHECK passes when the answer is "unknown"</h3>
<p>A CHECK rejects a row only when its condition is <strong>false</strong>. If a value is <code>NULL</code>, a comparison like <code>balance &gt;= 0</code> is <em>unknown</em>, and
unknown passes. That is why Ice Bank pairs CHECKs with <code>NOT NULL</code> (<code>balance</code> is <code>NOT NULL</code>), and why some rules spell the NULL case out
(<code>nickname IS NULL OR length(nickname) BETWEEN 1 AND 30</code>).</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Assuming a CHECK rejects <code>NULL</code>. It does not; only <code>NOT NULL</code> does.</li>
<li>Testing with a value far from the boundary (−100.00) instead of the first invalid value (−0.01). Off-by-one bugs live at the edge.</li>
<li>Asserting on the English error text. Assert the SQLSTATE (<code>23514</code>) and the constraint name; messages can change between versions.</li>
<li>Looking for <code>ux_disputes_one_open</code> under <em>Constraints</em>. Partial unique indexes are listed under <em>Indexes</em>.</li>
<li>Forgetting that a violation aborts the transaction: break the next constraint only after <code>ROLLBACK TO SAVEPOINT</code>.</li>
<li>Thinking "the database stopped it, so all is well" when the API answered <code>500</code>. The user deserved a clean <code>4xx</code> with a code; a 500 is a bug.</li>
</ul></div>`,
      examples: [
        {
          title: "List every constraint on accounts with its definition",
          lang: "sql",
          code: `
SELECT conname AS name,
       CASE contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
                    WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' END AS kind,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'accounts'::regclass
ORDER BY kind, name;`,
        },
        {
          title: "Partial unique indexes on disputes and payees",
          lang: "sql",
          code: `
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('disputes', 'payees', 'autodeposit_registrations')
ORDER BY tablename, indexname;`,
        },
        {
          title: "Break the chequing balance check (Noah's empty account 9), then roll back",
          lang: "sql",
          code: `
BEGIN;

UPDATE accounts
SET balance = balance - 0.01
WHERE sandbox_id = 1 AND id = 9;
-- ERROR: new row for relation "accounts" violates check constraint "accounts_deposit_balance_check"
-- SQLSTATE 23514

ROLLBACK;`,
        },
        {
          title: "Three violations in one transaction with savepoints",
          lang: "sql",
          code: `
BEGIN;

SAVEPOINT s1;
UPDATE customers SET postal_code = 'M5V2T6' WHERE sandbox_id = 1 AND id = 1;    -- no space
ROLLBACK TO SAVEPOINT s1;

SAVEPOINT s2;
UPDATE customers SET province = 'XX' WHERE sandbox_id = 1 AND id = 1;           -- not a province
ROLLBACK TO SAVEPOINT s2;

SAVEPOINT s3;
INSERT INTO payees (sandbox_id, customer_id, biller_id, nickname, account_number, created_at)
VALUES (1, 1, 1, 'Duplicate', '4410028731', app_now(1));                         -- Emma already has it
ROLLBACK TO SAVEPOINT s3;

ROLLBACK;`,
          note: "Run as <code>qa_writer</code>, one statement at a time, and read each error before rolling back to the savepoint.",
        },
        {
          title: "Catch the SQLSTATE in a JDBC test",
          lang: "java",
          code: `
SQLException e = assertThrows(SQLException.class, () -> {
    try (PreparedStatement ps = con.prepareStatement(
            "UPDATE accounts SET balance = balance - 0.01 WHERE sandbox_id = 1 AND id = 9")) {
        ps.executeUpdate();
    }
});
assertEquals("23514", e.getSQLState());
assertTrue(e.getMessage().contains("accounts_deposit_balance_check"));
con.rollback();`,
        },
        {
          title: "Every CHECK constraint in the schema, with its table",
          lang: "sql",
          code: `
SELECT conrelid::regclass         AS table_name,
       conname                    AS constraint_name,
       pg_get_constraintdef(oid)  AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND contype = 'c'
ORDER BY 1, 2;`,
          note: "A ready-made list of test ideas: each row is a rule the data must never break.",
        },
        {
          title: "How close is each credit card to its limit? (read-only boundary hunting)",
          lang: "sql",
          code: `
SELECT a.id, a.customer_id, a.balance, a.credit_limit,
       a.credit_limit + a.balance AS headroom
FROM accounts a
WHERE a.sandbox_id = 1
  AND a.type = 'CREDIT'
ORDER BY headroom, a.id
LIMIT 5;`,
        },
        {
          title: "Which foreign keys point at a table? (what would block a delete)",
          lang: "sql",
          code: `
SELECT conrelid::regclass        AS referencing_table,
       conname,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid = 'payees'::regclass;`,
          note: "The result shows <code>bill_payments ... REFERENCES payees ... ON DELETE RESTRICT</code>: a payee that still has bill payments cannot be deleted at the database level.",
        },
        {
          title: "NULL in a CHECK: unknown is not false",
          lang: "sql",
          code: `
SELECT (NULL::numeric >= 0)              AS condition_result,   -- NULL (unknown)
       (NULL::numeric >= 0) IS NOT FALSE AS check_would_pass;   -- true`,
        },
      ],
      exercises: [
        "List all CHECK constraints on <code>customers</code> and <code>accounts</code>. For each, write one boundary-valid value and one invalid value you would use in a test (for example a postal code that is valid, and one with a letter the pattern forbids).",
        "As <code>qa_writer</code>, break three different constraints in one transaction using savepoints (any three from the table). Record the SQLSTATE and constraint name for each, then roll back.",
        "Try adding Emma's existing Niagara Power payee again through the API: <code>POST /api/v1/payees</code> with <code>billerId</code> 1 and account number <code>4410028731</code>. Note the status and <code>code</code>. Which index in the database would stop it if the API check were missing?",
        "Find the index that allows only one <code>OPEN</code> dispute per transaction. Explain in two sentences why it has to be a partial index and could not be a plain <code>UNIQUE (sandbox_id, transaction_id)</code> constraint.",
        "Use the \"how close to the limit\" query to find the credit card with the least headroom. Work out the largest debit the database CHECK would still accept on it and the first amount it would reject. Then predict what <code>POST /api/v1/transfers</code> from that card should answer for each of those two amounts, using the transfer rules in the README (do not send them yet if you want to keep the seed balance).",
      ],
      quiz: [
        {
          q: `A table has <code>CHECK (amount &gt; 0)</code> but no NOT NULL on <code>amount</code>. What happens when you insert <code>amount = NULL</code>?`,
          options: [`It is rejected by the CHECK`, `It depends on the session time zone`, `PostgreSQL converts NULL to 0 and rejects it`, `It is accepted: <code>NULL &gt; 0</code> is unknown, and a CHECK only rejects false`],
          answer: 3,
          explain: `A CHECK fails only when its condition is false. Unknown passes. That is why money columns in Ice Bank are also <code>NOT NULL</code>.`,
        },
        {
          q: `Olivia's limit is 5,000.00. Which pair of balances is the best boundary test for <code>accounts_credit_limit_check</code>?`,
          options: [`<code>-1000.00</code> and <code>-9000.00</code>`, `<code>-5000.00</code> (allowed) and <code>-5000.01</code> (rejected)`, `<code>0.00</code> and <code>5000.00</code>`, `<code>-4999.00</code> and <code>-5001.00</code>`],
          answer: 1,
          explain: `The rule is <code>balance &gt;= -credit_limit</code>. The boundary itself must pass, and the very next cent must fail. Values far from the edge would not catch an off-by-one such as <code>&gt;</code> instead of <code>&gt;=</code>.`,
        },
        {
          q: `As <code>qa_writer</code> you <code>DELETE</code> a payee row that still has bill payments. What happens?`,
          options: [`The payee and its bill payments are deleted together`, `The DELETE fails with a foreign-key violation (23503), because <code>bill_payments</code> references payees with ON DELETE RESTRICT`, `The bill payments are left pointing at nothing`, `The payee is only marked as deleted`],
          answer: 1,
          explain: `RESTRICT means "refuse while children exist". (The API's own delete sets <code>deleted_at</code> instead of removing the row, and refuses a payee with scheduled payments with its own error code.)`,
        },
        {
          q: `Your JDBC test catches an SQLException with SQLState <code>23505</code>. Which kind of constraint was broken?`,
          options: [`A CHECK constraint`, `A foreign key`, `A NOT NULL constraint`, `A unique constraint, primary key or unique index`],
          answer: 3,
          explain: `23505 is <em>unique_violation</em>. CHECK is 23514, foreign key 23503, NOT NULL 23502. Ice Bank's own rule errors from functions and triggers use P0001.`,
        },
        {
          q: `Adding a duplicate payee through the API returns <code>500 Internal Server Error</code>, and the server log shows the unique-index violation. Is that acceptable?`,
          options: [`No: the data is safe, but the API should answer a 409 with a code; a 500 is always a bug`, `Yes, the database protected the data`, `Yes, 500 is the documented status for duplicates`, `Only on QA`],
          answer: 0,
          explain: `Constraints are the safety net, not the user interface. Ice Bank's contract maps duplicates to 409 (for example <code>PAYEE_EXISTS</code> or <code>DUPLICATE</code>). Any 500 should be reported with its X-Request-Id.`,
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "views-triggers-functions",
      title: "Views, triggers and functions",
      summary: "The database objects behind Ice Bank's summaries, audit trail and atomic transfers.",
      body: `
<p>Ice Bank keeps some logic inside the database itself. You test these objects over JDBC in week 3, so you need to know what each one promises.</p>

<h3>Views: saved queries you can SELECT from</h3>
<ul>
<li><code>v_account_summary</code>: one row per account with <code>balance</code>, <code>available_balance</code>, <code>pending_count</code> (pending transactions)
and <code>last_transaction_at</code>.</li>
<li><code>v_daily_etransfer_totals</code>: one row per sender per Toronto calendar day with <code>transfer_count</code> and <code>total_amount</code>, counting only
<code>PENDING</code> and <code>DEPOSITED</code> transfers. It is what the daily-limit check reads.</li>
</ul>
<p>A view stores no data of its own; it runs its query each time. See the definition with <code>pg_get_viewdef</code> or in DBeaver's <em>Source</em> tab. A view test
compares the view's answer with an independent query you wrote yourself (lesson 3 gave you one for e-Transfers).</p>

<h3>Triggers: code that runs automatically on a table</h3>
<ul>
<li><code>trg_transactions_audit</code> (AFTER INSERT OR UPDATE on <code>transactions</code>) writes an <code>audit_log</code> row for every new transaction
(<code>action = 'TRANSACTION_CREATED'</code>) and every status change (<code>'TRANSACTION_STATUS_CHANGED'</code>), with the details in <code>new_value</code> (JSONB)
and the acting user in <code>actor_user_id</code>.</li>
<li><code>trg_transactions_immutable</code> (BEFORE UPDATE OR DELETE) blocks changes to amount, direction or account, blocks deleting <code>POSTED</code> rows, and only
allows <code>POSTED → REVERSED</code>.</li>
</ul>
<p>The seeded history was loaded with auditing switched off, so <code>audit_log</code> only contains rows for things that happened since the last reset. That makes
"find the audit row for the action I just did" easy.</p>

<h3>Functions</h3>
<p><code>post_transfer(from_account, to_account, amount, reference, sandbox DEFAULT 1)</code> moves money atomically: one DEBIT and one CREDIT transaction sharing
<code>reference_id</code>, two balance updates, and one <code>TRANSFER_POSTED</code> audit row, or nothing at all. It returns the DEBIT transaction's id. When a rule
fails it raises SQLSTATE <code>P0001</code> with a message starting with <code>INVALID_AMOUNT</code>, <code>SAME_ACCOUNT</code>, <code>ACCOUNT_FROZEN</code>,
<code>ACCOUNT_CLOSED</code>, <code>ACCOUNT_NOT_FOUND</code>, <code>INVALID_SOURCE</code>, <code>INSUFFICIENT_FUNDS</code> or <code>OVERPAYMENT</code>.
The API's <code>POST /transfers</code> calls this function, then adds the <code>transfers</code> row and a notification.</p>
<p>Only <code>qa_writer</code> may execute it. From JDBC use a <code>CallableStatement</code> with the escape syntax <code>{? = call post_transfer(?, ?, ?, ?)}</code>.
<code>app_now(sandbox_id)</code> is the other function you will use all the time: the sandbox's virtual time.</p>
<p>Note that <code>post_transfer</code> checks money rules but not <em>ownership</em> (it would move money between two different customers). Ownership is the API's
job, which is why "can Emma move money out of Liam's account through the API?" is a security test, not a database test.</p>

<h3>One transfer, traced through the database objects</h3>
<pre role="img" aria-label="Diagram: POST /transfers calls post_transfer, which checks rules, locks both accounts, posts a debit and a credit (each insert fires the audit trigger), writes a TRANSFER_POSTED audit row and returns the debit id; the API then adds the transfers row and a notification" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 POST /api/v1/transfers   (Emma: account 1 → account 2, $12.00)
   │
   ▼
 post_transfer(1, 2, 12.00, 'TRF-…')
   ├─ checks: amount, same account, reference, frozen/closed, loan source, funds
   ├─ locks accounts 1 and 2 (in id order, so two transfers cannot deadlock)
   ├─ post_entry DEBIT  on 1 ─► INSERT transactions ─► trg_transactions_audit ─► audit_log TRANSACTION_CREATED
   ├─ post_entry CREDIT on 2 ─► INSERT transactions ─► trg_transactions_audit ─► audit_log TRANSACTION_CREATED
   ├─ INSERT audit_log TRANSFER_POSTED   (entity_type 'transfer', entity_id = the DEBIT transaction id)
   └─ RETURN the DEBIT transaction id
 then the API adds: one transfers row + one notification, in the same database transaction
</pre>

<h3>Worked example: testing a view with an independent query</h3>
<p>A view is only as correct as its SQL, so you test it against a query you wrote yourself from the base tables. The third example below does that for
<code>v_account_summary.pending_count</code>:</p>
<ol>
<li><code>FROM v_account_summary v WHERE v.sandbox_id = 1 AND v.customer_id IN (1, 6)</code>: the rows under test, here Emma's and Lucas's accounts.</li>
<li><code>v.pending_count</code>: what the view claims.</li>
<li>The scalar subquery counts <code>PENDING</code> rows in <code>transactions</code> for the same sandbox and account: your independent oracle. It does not reuse the view's SQL, so a
mistake in the view cannot hide in both.</li>
<li>Read the result: the two columns must be equal on every row. Turn it into a zero-rows check by adding <code>WHERE</code> the two differ, the same pattern as the health checks in lesson 9.</li>
</ol>
<p>Lucas's chequing account (12) is a good row to look at: its available balance is lower than its balance because of a held cheque, yet <code>pending_count</code> is 0. The hold lives
in <code>cheque_deposits</code>, not in a PENDING transaction. Knowing <em>why</em> a number is what it is matters as much as the number.</p>

<h3>What each object promises, and how you test it</h3>
<div class="table-wrap"><table>
<thead><tr><th>Object</th><th>Promise</th><th>How to observe it</th></tr></thead>
<tbody>
<tr><td><code>v_account_summary</code></td><td><code>pending_count</code> = number of PENDING rows; balances = the account row</td><td>Compare with your own <code>count(*)</code> and with <code>accounts</code></td></tr>
<tr><td><code>v_daily_etransfer_totals</code></td><td>Per sender per Toronto day, PENDING + DEPOSITED only</td><td><code>EXCEPT</code> against your own GROUP BY (exercise 4)</td></tr>
<tr><td><code>trg_transactions_audit</code></td><td>One audit row per insert and per status change</td><td>Count audit rows before and after an action</td></tr>
<tr><td><code>trg_transactions_immutable</code></td><td>Amount, direction, account never change; POSTED rows never deleted</td><td>Try it as qa_writer, roll back, read the P0001 message</td></tr>
<tr><td><code>post_transfer</code></td><td>All of the diagram above, or nothing</td><td>Call it in a rolled-back transaction; make it fail and check nothing was written</td></tr>
</tbody></table></div>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Expecting audit rows for the seeded history. It was loaded with auditing switched off; only actions since the last reset are audited.</li>
<li>Joining <code>TRANSFER_POSTED.entity_id</code> to <code>transfers.id</code>. It holds the debit transaction id.</li>
<li>Testing a view by comparing it with the API. The API may read that very view, so both would be wrong together. Compare with an independent query on the base tables.</li>
<li>Calling <code>post_transfer</code> as <code>qa_reader</code>: <em>permission denied for function post_transfer</em>. Only <code>qa_writer</code> may execute it.</li>
<li>Being surprised that a <code>ROLLBACK</code> after <code>post_transfer</code> also removed the audit rows. They were written in the same transaction; that is exactly the atomicity promise.</li>
</ul></div>`,
      examples: [
        {
          title: "Read the views",
          lang: "sql",
          code: `
SELECT account_id, type, balance, available_balance, pending_count, last_transaction_at
FROM v_account_summary
WHERE sandbox_id = 1 AND customer_id = 1
ORDER BY account_id;

SELECT day, transfer_count, total_amount
FROM v_daily_etransfer_totals
WHERE sandbox_id = 1 AND customer_id = 1
ORDER BY day DESC
LIMIT 5;

SELECT pg_get_viewdef('v_daily_etransfer_totals', true);`,
        },
        {
          title: "The triggers on transactions, and the latest audit rows",
          lang: "sql",
          code: `
SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'transactions'::regclass
  AND NOT tgisinternal;

SELECT id, created_at, actor_user_id, action, entity_type, entity_id, new_value
FROM audit_log
WHERE sandbox_id = 1
ORDER BY created_at DESC, id DESC
LIMIT 10;`,
        },
        {
          title: "Call post_transfer and inspect everything it wrote, then roll back (qa_writer)",
          lang: "sql",
          code: `
BEGIN;

SELECT post_transfer(1, 2, 25.00, 'TUTORIAL-0001') AS debit_tx_id;

SELECT id, account_id, direction, amount, balance_after, type, description
FROM transactions
WHERE sandbox_id = 1 AND reference_id = 'TUTORIAL-0001'
ORDER BY id;

SELECT action, entity_type, entity_id, old_value, new_value
FROM audit_log
WHERE sandbox_id = 1
  AND (new_value ->> 'reference' = 'TUTORIAL-0001' OR new_value ->> 'referenceId' = 'TUTORIAL-0001')
ORDER BY id;

ROLLBACK;`,
          note: "<code>-&gt;&gt;</code> reads a JSONB field as text. Expect two TRANSACTION_CREATED rows (from the trigger) and one TRANSFER_POSTED row (from the function).",
        },
        {
          title: "post_transfer from JDBC with CallableStatement",
          lang: "java",
          code: `
con.setAutoCommit(false);
try (CallableStatement cs = con.prepareCall("{? = call post_transfer(?, ?, ?, ?)}")) {
    cs.registerOutParameter(1, Types.BIGINT);
    cs.setLong(2, 1L);                              // from: Emma's chequing
    cs.setLong(3, 2L);                              // to:   Emma's savings
    cs.setBigDecimal(4, new BigDecimal("25.00"));   // money is BigDecimal, never double
    cs.setString(5, "JDBC-" + UUID.randomUUID());
    cs.execute();
    long debitTxId = cs.getLong(1);
    assertTrue(debitTxId > 0);
    // ...query both legs by reference_id and assert amounts and balance_after here...
} finally {
    con.rollback();
}`,
        },
        {
          title: "A rule failure, the way JDBC sees it",
          lang: "sql",
          code: `
BEGIN;
SELECT post_transfer(1, 1, 10.00, 'TUTORIAL-SAME');
-- ERROR: SAME_ACCOUNT: source and target accounts must differ   (SQLSTATE P0001)
ROLLBACK;`,
        },
        {
          title: "Ice Bank's own functions, and whether you may execute them",
          lang: "sql",
          code: `
SELECT p.proname                                 AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid)             AS returns,
       has_function_privilege(p.oid, 'EXECUTE')  AS i_can_execute
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND NOT EXISTS (SELECT 1 FROM pg_depend d          -- skip functions that belong to
                  WHERE d.objid = p.oid              -- an extension (pgcrypto)
                    AND d.deptype = 'e')
ORDER BY p.proname;`,
        },
        {
          title: "What has been audited since the reset, by action",
          lang: "sql",
          code: `
SELECT action, entity_type, count(*) AS how_many
FROM audit_log
WHERE sandbox_id = 1
GROUP BY action, entity_type
ORDER BY how_many DESC, action;`,
          note: "Right after a reset only a handful of rows exist (the seed's own events). Every API transfer adds two <code>TRANSACTION_CREATED</code> rows and one <code>TRANSFER_POSTED</code> row; sign-ins add <code>LOGIN</code> rows.",
        },
        {
          title: "Worked example: test a view against your own query (pending_count)",
          lang: "sql",
          code: `
SELECT v.account_id,
       v.pending_count,
       (SELECT count(*) FROM transactions t
         WHERE t.sandbox_id = v.sandbox_id
           AND t.account_id = v.account_id
           AND t.status = 'PENDING') AS my_count
FROM v_account_summary v
WHERE v.sandbox_id = 1
  AND v.customer_id IN (1, 6)
ORDER BY v.account_id;`,
          note: "The two columns must agree on every row.",
        },
      ],
      exercises: [
        "Sign in as Emma and move $5.00 from account 1 to account 2 with <code>POST /api/v1/transfers</code>. Using the <code>referenceId</code> from the response, find: the two <code>transactions</code> rows, the <code>transfers</code> row, and the audit rows. Check that <code>actor_user_id</code> is Emma's user id.",
        "As <code>qa_writer</code>, inside one rolled-back transaction (use savepoints), make <code>post_transfer</code> fail in five different ways: amount <code>0.001</code>, same account, frozen account 10, more than the available balance, and money out of the loan account 4. Record each message code.",
        "Compare <code>v_account_summary</code> for Emma with <code>GET /api/v1/accounts</code>: list every field that appears in both and confirm they match.",
        "Compare <code>v_daily_etransfer_totals</code> for the whole sandbox with your own GROUP BY query from lesson 3 using <code>EXCEPT</code> in both directions. Both directions should return no rows.",
        "Write a JUnit test that calls <code>post_transfer</code> through a <code>CallableStatement</code>, asserts the DEBIT and CREDIT legs (amounts, <code>balance_after</code>, shared <code>reference_id</code>), and always rolls back.",
        "Run the \"Ice Bank's own functions\" query as <code>qa_reader</code> and again as <code>qa_writer</code>, and tabulate <code>i_can_execute</code> for both users. Which functions can neither of them run? Which can only <code>qa_writer</code> run? Two functions show <code>true</code> for both users but still cannot be called with <code>SELECT name()</code>: which ones, what error do you get, and why?",
      ],
      quiz: [
        {
          q: `What does <code>v_account_summary</code> store on disk?`,
          options: [`A copy of every account, refreshed nightly`, `The last transaction of each account`, `Only the pending counts`, `Nothing: a view is a saved query that runs each time you select from it`],
          answer: 3,
          explain: `A plain view has no data of its own. Every SELECT runs its query against the base tables, so it is always current (and only as correct as its query).`,
        },
        {
          q: `Right after a reset you query <code>audit_log</code> for Emma's transactions from last month and find nothing. Is that a bug?`,
          options: [`No: the seeded history was loaded with auditing switched off; only actions since the reset are audited`, `Yes, the audit trigger is broken`, `Yes, qa_reader cannot see audit rows`, `No, audit rows are deleted after 30 days`],
          answer: 0,
          explain: `The seed sets <code>icebank.skip_audit</code> while it loads history, so the log starts (almost) empty. That makes "find the audit row for what I just did" easy.`,
        },
        {
          q: `You have the <code>TRANSFER_POSTED</code> audit row of a transfer. What is in its <code>entity_id</code>?`,
          options: [`The <code>transfers.id</code>`, `The user id of the actor`, `The DEBIT transaction id that <code>post_transfer</code> returns`, `The account id of the source`],
          answer: 2,
          explain: `<code>post_transfer</code> writes the audit row before the API creates the transfers row, so it records the id it has: the debit transaction id. Link to the transfer through <code>reference_id</code> instead.`,
        },
        {
          q: `<code>post_transfer</code> happily moves money from Liam's account to Emma's when called directly. Where does the "you can only move your own money" rule have to be tested?`,
          options: [`In the database, it is a constraint bug`, `In the UI only`, `In the API: ownership is checked by the endpoint, so it is an API security test`, `Nowhere, transfers between customers are allowed`],
          answer: 2,
          explain: `The function checks money rules, not who is asking. The API knows the signed-in customer and must refuse other customers' accounts (with 404).`,
        },
        {
          q: `As qa_writer you call <code>post_transfer</code> inside a transaction, see the two legs and three audit rows, then run <code>ROLLBACK</code>. What remains?`,
          options: [`Nothing: rows, balance changes and audit rows were all part of the same transaction`, `The transaction rows but not the balances`, `The audit rows, because triggers commit on their own`, `Only the TRANSFER_POSTED row`],
          answer: 0,
          explain: `Triggers and functions run inside the caller's transaction. Rolling it back removes everything they wrote, which is exactly the "all or nothing" promise.`,
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "toolkit",
      title: "The QA query toolkit",
      summary: "A set of ready-made queries for the checks you will repeat every week.",
      body: `
<p>Testers who are good with databases keep a personal file of queries they trust. This lesson gives you a starting set for Ice Bank. Save them in your
framework repo as <code>sql/toolkit.sql</code>, and turn the ones you use most into methods of a small JDBC utility class (for example
<code>DbChecks.latestTransactions(accountId, n)</code>).</p>

<h3>How to use a toolkit query in a test</h3>
<ol>
<li><strong>Before:</strong> read the state you will change (balance, count of rows, last id). Never assume the seed values; another test may have run first.</li>
<li><strong>Act:</strong> call the API.</li>
<li><strong>After:</strong> run the toolkit query again, scoped tightly (by <code>reference_id</code>, by the id from the <code>Location</code> header, or by
<code>id &gt; last_id_before</code>), and assert the difference.</li>
</ol>

<h3>What to check after common actions</h3>
<div class="table-wrap"><table>
<thead><tr><th>API action</th><th>Database evidence</th></tr></thead>
<tbody>
<tr><td><code>POST /transfers</code></td><td>2 <code>transactions</code> rows with the same <code>reference_id</code>, 1 <code>transfers</code> row, balances moved by the amount, audit rows</td></tr>
<tr><td><code>POST /etransfers</code></td><td><code>etransfers</code> row (<code>PENDING</code>, or <code>DEPOSITED</code> with autodeposit), a debit on the source account, an Ice Mail message to the recipient</td></tr>
<tr><td><code>POST /etransfers/{id}/cancel</code></td><td>status <code>CANCELLED</code>, a <code>REVERSAL</code> credit for the full amount, an audit row</td></tr>
<tr><td><code>POST /bill-payments</code></td><td><code>bill_payments</code> row with <code>posting_date</code> on a business day; a PENDING hold for pay-now</td></tr>
<tr><td>5 wrong passwords</td><td><code>users.status = 'LOCKED'</code>, <code>failed_login_count = 5</code>, <code>locked_until</code> 15 minutes after <code>app_now</code></td></tr>
</tbody></table></div>

<h3>Making queries reusable</h3>
<p>Write them with parameters (<code>?</code> in JDBC) for the sandbox id and the entity id, so the same method works on local (<code>1</code>) and QA
(your sandbox id). Keep them read-only so they can run as <code>qa_reader</code> on both environments.</p>

<h3>Worked example: before, act, after, for one $12.00 transfer</h3>
<pre role="img" aria-label="Diagram: take a snapshot, call the API, query rows newer than the snapshot, assert the differences" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
  BEFORE (SQL snapshot)  ─►  ACT (API call)  ─►  AFTER (SQL, scoped)  ─►  ASSERT (differences)
  max(id), balances           POST /transfers      id &gt; max_id_before        exactly 2 rows, ±12.00
</pre>
<ol>
<li><strong>Before.</strong> Run the snapshot query (first example below) and keep the values: <code>max_tx_id</code>, the two balances, <code>audit_rows</code>.
Right after a reset the balances are 5703.95 and 76178.63, but <em>always read them</em>; never type seed values into a test.</li>
<li><strong>Act.</strong> <code>POST /api/v1/transfers</code> from account 1 to account 2 for <code>"12.00"</code>. Keep <code>referenceId</code>, <code>debitTransactionId</code> and
<code>creditTransactionId</code> from the response.</li>
<li><strong>After.</strong> Query rows with <code>id &gt; max_tx_id</code> (or with the response's <code>referenceId</code>) and the balances again.</li>
<li><strong>Assert the differences</strong>, not absolute values:</li>
</ol>
<div class="table-wrap"><table>
<thead><tr><th>Check</th><th>Expected</th></tr></thead>
<tbody>
<tr><td>New transaction rows for this reference</td><td>Exactly 2: DEBIT 12.00 on account 1, CREDIT 12.00 on account 2</td></tr>
<tr><td>Chequing balance</td><td>before − 12.00, and equal to the DEBIT row's <code>balance_after</code></td></tr>
<tr><td>Savings balance</td><td>before + 12.00, and equal to the CREDIT row's <code>balance_after</code></td></tr>
<tr><td>Ids</td><td>The two row ids equal <code>debitTransactionId</code> / <code>creditTransactionId</code> from the response</td></tr>
<tr><td>Audit rows</td><td>before + 3 (two TRANSACTION_CREATED, one TRANSFER_POSTED)</td></tr>
</tbody></table></div>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Asserting seed values (<code>balance = 5703.95</code>). It passes once, then fails forever after the first transfer. Assert differences.</li>
<li>Scoping by "the newest row in the table". On QA, or with a second test running, the newest row may be somebody else's. Scope by <code>reference_id</code> or by the ids the API returned.</li>
<li>Comparing timestamps with your laptop's clock. The app writes <code>app_now()</code>, which can be days ahead. Compare with <code>app_now(sandbox)</code>.</li>
<li>Hard-coding <code>sandbox_id = 1</code> in Java. Make it a parameter from config so QA uses your sandbox.</li>
<li>Reading money with <code>getDouble()</code>. Use <code>getBigDecimal()</code> and <code>compareTo</code>.</li>
<li>Running the health checks once at the start. Run them at the end of a suite too: that is when they catch what your tests (or bugs) did.</li>
</ul></div>`,
      examples: [
        {
          title: "1. Everything about one money movement, by reference id",
          lang: "sql",
          code: `
SELECT t.id, t.account_id, a.type, t.direction, t.amount, t.balance_after, t.status, t.type AS tx_type, t.created_at
FROM transactions t
JOIN accounts a ON a.sandbox_id = t.sandbox_id AND a.id = t.account_id
WHERE t.sandbox_id = 1
  AND t.reference_id = 'TRF-REPLACE-ME'
ORDER BY t.id;`,
        },
        {
          title: "2. The newest rows created since a known id (after an API call)",
          lang: "sql",
          code: `
SELECT id, account_id, direction, amount, balance_after, status, type, reference_id
FROM transactions
WHERE sandbox_id = 1
  AND id > 1000000          -- replace with max(id) you read before the action
ORDER BY id;`,
        },
        {
          title: "3. Login and lockout state of a user",
          lang: "sql",
          code: `
SELECT u.id, u.email, u.status, u.failed_login_count, u.locked_until,
       app_now(u.sandbox_id) AS sandbox_now, u.last_login_at
FROM users u
WHERE u.sandbox_id = 1
  AND u.email = 'emma.tremblay@icebank.test';`,
        },
        {
          title: "4. Latest OTP and Ice Mail messages for an email",
          lang: "sql",
          code: `
SELECT o.id, o.purpose, o.attempts, o.expires_at, o.consumed_at, o.created_at
FROM otp_codes o
JOIN users u ON u.sandbox_id = o.sandbox_id AND u.id = o.user_id
WHERE o.sandbox_id = 1
  AND u.email = 'emma.tremblay@icebank.test'
ORDER BY o.created_at DESC
LIMIT 3;

SELECT id, kind, subject, otp_code, link, created_at
FROM inbox_messages
WHERE sandbox_id = 1
  AND to_email = 'emma.tremblay@icebank.test'
ORDER BY created_at DESC
LIMIT 5;`,
          note: "OTPs are stored hashed in <code>otp_codes</code>; the readable code is in the Ice Mail message, the same place <code>GET /api/v1/inbox</code> reads it from.",
        },
        {
          title: "5. e-Transfers of a customer with status and expiry",
          lang: "sql",
          code: `
SELECT id, recipient_email, amount, status, autodeposit, created_at, expires_at, cancelled_at, deposited_at
FROM etransfers
WHERE sandbox_id = 1
  AND sender_customer_id = 1
ORDER BY created_at DESC
LIMIT 10;`,
        },
        {
          title: "6. Upcoming scheduled bill payments (business-day check)",
          lang: "sql",
          code: `
SELECT bp.id, b.name AS biller, bp.amount, bp.requested_date, bp.posting_date,
       to_char(bp.posting_date, 'Dy') AS posting_weekday, bp.recurrence, bp.status
FROM bill_payments bp
JOIN payees p  ON p.sandbox_id = bp.sandbox_id AND p.id = bp.payee_id
JOIN billers b ON b.sandbox_id = p.sandbox_id AND b.id = p.biller_id
WHERE bp.sandbox_id = 1
  AND bp.customer_id = 1
  AND bp.status IN ('SCHEDULED', 'PENDING')
ORDER BY bp.posting_date
LIMIT 12;`,
        },
        {
          title: "7. Health checks that should always return zero rows",
          lang: "sql",
          code: `
-- Money movements with an odd number of legs (transfers must have exactly 2)
SELECT reference_id, count(*) AS legs
FROM transactions
WHERE sandbox_id = 1 AND type = 'TRANSFER'
GROUP BY reference_id
HAVING count(*) <> 2;

-- Chequing or savings below zero, credit cards beyond their limit
SELECT id, type, balance, credit_limit
FROM accounts
WHERE sandbox_id = 1
  AND ((type IN ('CHEQUING', 'SAVINGS') AND balance < 0)
    OR (type = 'CREDIT' AND balance < -credit_limit));

-- Scheduled payments pointing at deleted payees
SELECT bp.id, bp.payee_id
FROM bill_payments bp
JOIN payees p ON p.sandbox_id = bp.sandbox_id AND p.id = bp.payee_id
WHERE bp.sandbox_id = 1
  AND bp.status = 'SCHEDULED'
  AND p.deleted_at IS NOT NULL;`,
        },
        {
          title: "8. Audit trail for one entity",
          lang: "sql",
          code: `
SELECT created_at, actor_user_id, action, old_value, new_value
FROM audit_log
WHERE sandbox_id = 1
  AND entity_type = 'transaction'
  AND entity_id = 1000000          -- replace with the id you care about
ORDER BY created_at, id;`,
        },
        {
          title: "9. Snapshot before an action (one row you can keep in Java)",
          lang: "sql",
          code: `
SELECT (SELECT max(id) FROM transactions WHERE sandbox_id = 1)       AS max_tx_id,
       (SELECT balance FROM accounts WHERE sandbox_id = 1 AND id = 1) AS chequing_balance,
       (SELECT balance FROM accounts WHERE sandbox_id = 1 AND id = 2) AS savings_balance,
       (SELECT count(*) FROM audit_log WHERE sandbox_id = 1)          AS audit_rows,
       app_now(1)                                                      AS taken_at;`,
        },
        {
          title: "10. The rows an action created on two accounts (after the snapshot)",
          lang: "sql",
          code: `
SELECT t.id, t.account_id, t.direction, t.amount, t.balance_after, t.reference_id
FROM transactions t
WHERE t.sandbox_id = 1
  AND t.id > 1000000          -- replace with max_tx_id from the snapshot
  AND t.account_id IN (1, 2)
ORDER BY t.id;`,
        },
        {
          title: "11. A user's newest notifications",
          lang: "sql",
          code: `
SELECT id, type, title, created_at, read_at
FROM notifications
WHERE sandbox_id = 1
  AND user_id = 1          -- notifications belong to users, not customers
ORDER BY created_at DESC, id DESC
LIMIT 5;`,
          note: "Every sign-in and every money movement creates one. A transfer should add exactly one <code>MONEY_MOVEMENT</code> notification.",
        },
      ],
      exercises: [
        "Create <code>sql/toolkit.sql</code> in your framework repo with the queries above, each preceded by a one-line comment saying when to use it. Commit it on a branch (Tutorial 4).",
        "Cancel Emma's pending e-Transfer to Marc Dupont (or send and cancel a new $1.00 one) with <code>POST /api/v1/etransfers/{id}/cancel</code>. Use the toolkit to prove the status changed, a REVERSAL credit for the full amount exists and an audit row was written.",
        "Turn queries 1, 3 and 7 into Java methods of a <code>DbChecks</code> class that take the sandbox id and the value as parameters and return simple objects or lists. Call them from one test.",
        "Run the health checks against QA with your own sandbox id as <code>qa_reader</code> (when the instructor has bug packs enabled). Report any rows you get as a bug, with the query as evidence.",
        "Run the snapshot query (9), make a $1.00 transfer from account 1 to account 2 through the API, then write <em>one</em> query that returns a single row of differences: number of new transaction rows for the response's <code>referenceId</code>, change in each balance, and change in the audit-row count. Write down the values you expect before you run it.",
      ],
      quiz: [
        {
          q: `Your test transfers $12.00 and then checks <code>balance = 5691.95</code> on account 1. Why is that a weak assertion?`,
          options: [`5691.95 is the wrong number`, `Balances should be compared as text`, `It only holds when the test starts from the exact seed balance; assert "before − 12.00" instead`, `It is fine as long as you reset before every test`],
          answer: 2,
          explain: `Any earlier transfer, by you or another test, changes the starting balance. Read the balance before acting and assert the difference, so the test is independent of history.`,
        },
        {
          q: `After a <code>POST /transfers</code>, which is the most reliable way to find the rows it created?`,
          options: [`Rows with the <code>reference_id</code> (or the transaction ids) from the API response`, `Rows created in the last minute by your laptop's clock`, `<code>ORDER BY id DESC LIMIT 2</code>`, `Rows with amount 12.00`],
          answer: 0,
          explain: `The response tells you exactly which rows are yours. "Newest" or "same amount" can match someone else's activity, especially on a shared QA server.`,
        },
        {
          q: `Why should toolkit queries be written to run as <code>qa_reader</code> with the sandbox id as a parameter?`,
          options: [`qa_reader is faster`, `To avoid the audit trigger`, `Because sandbox_id is always 1`, `So the same method works locally (sandbox 1) and on QA (your sandbox), where there is no writer user`],
          answer: 3,
          explain: `QA only gives you <code>qa_reader</code>, and your data lives in your own sandbox id there. Read-only, parameterised queries are portable between environments.`,
        },
        {
          q: `The health check "transfers with an odd number of legs" returns one row. What should you do?`,
          options: [`Re-run until it returns zero`, `Treat it as a bug candidate: report the reference id, the query and its result as evidence`, `Delete the extra row`, `Ignore it, health checks are informational`],
          answer: 1,
          explain: `These queries return zero rows when the data is consistent. A row means money moved with only one side recorded (or with an extra one): exactly the kind of bug a database check exists to catch.`,
        },
      ],
    },
  ],
});
