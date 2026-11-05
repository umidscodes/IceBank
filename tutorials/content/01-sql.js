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
Keep the URL, user and password in your environment config (Tutorial 6), never hard-coded in a test.</p>`,
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
      ],
      exercises: [
        "Create the <em>Ice Bank local (reader)</em> connection as <code>qa_reader</code>, mark it read-only, and run the first-queries example. Write down the PostgreSQL version, the default time zone DBeaver's session used, and the value of <code>app_now(1)</code>.",
        "In the navigator, count how many tables, views and functions the <code>public</code> schema has. Open the ER diagram for <code>accounts</code> and list every table that has a foreign key pointing to it.",
        "As <code>qa_reader</code>, try <code>UPDATE accounts SET nickname = 'x' WHERE sandbox_id = 1 AND id = 2;</code>. Record the exact error message and say which layer stopped you: DBeaver's read-only setting or PostgreSQL's permissions (turn the read-only tick off for a moment to find out).",
        "Create the <em>Ice Bank local (WRITER)</em> connection as <code>qa_writer</code> with a different colour and manual commit. Take a screenshot showing both connections side by side so you can tell them apart at a glance.",
        "Run the Java example from your own project (or a JUnit test) and print the number of customers in sandbox 1. Then change the password to a wrong one and note the exception class and SQLState you get.",
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
<code>LIMIT 20 OFFSET 40</code> skips 40 rows and returns the next 20, which is exactly API page 2 (<code>?page=2&amp;size=20</code>, pages start at 0).</p>`,
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
      ],
      exercises: [
        "List Olivia Singh's accounts (customer 3) with balance and credit limit. From the numbers alone, work out how much more she can spend on her card, then check it against <code>availableCredit</code> in <code>GET /api/v1/accounts</code> signed in as Olivia.",
        "Find the 5 largest <code>PURCHASE</code> debits ever on account 1. Then call <code>GET /api/v1/accounts/1/transactions?type=PURCHASE&amp;sort=amount,desc&amp;size=5</code> as Emma and confirm the API returns the same ids in the same order.",
        "Count the rows on account 1 dated 1 to 31 October 2026 (Toronto) with the half-open range pattern. Compare with <code>totalElements</code> from <code>GET /api/v1/accounts/1/transactions?from=2026-10-01&amp;to=2026-10-31</code>. Then deliberately use <code>created_at &lt;= '2026-10-31'</code> and explain why the count changes.",
        "Find every user whose status is not <code>ACTIVE</code> and every account whose status is not <code>OPEN</code>. Match each row to a persona from the quick reference on the home page.",
        "Show that <code>WHERE nickname = NULL</code> returns no rows from <code>accounts</code> while <code>WHERE nickname IS NULL</code> returns many. Write one sentence on why a test that compares with <code>= NULL</code> would always pass or always fail.",
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
<code>rs.getBigDecimal()</code> returns <code>null</code>.</p>`,
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
      ],
      exercises: [
        "Write three queries that count customers, accounts and transactions in sandbox 1. Then write one query that returns the number of accounts and the total balance for each account <code>type</code>. Explain why the CREDIT and LOAN totals are negative.",
        "For 2026 only, find the Toronto month in which Emma spent the most from account 1 (sum of POSTED debits). Show the month and the amount.",
        "Run the \"remaining allowance\" query for Emma. Sign in as Emma and send an e-Transfer for exactly <em>remaining today + $0.01</em> (from account 1 to <code>liam.chen@icebank.test</code>, with a security question). Confirm the API answers 422 and note the <code>code</code>. Do not send the exact amount unless you are happy to use up the allowance.",
        "Count how many transactions on account 1 have <code>balance_after</code> filled in versus all rows, in one query, using <code>count(*)</code> and <code>count(balance_after)</code>. What would a difference between them mean?",
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
<code>id</code>, <code>status</code> and <code>created_at</code>, unprefixed names are ambiguous and PostgreSQL refuses the query.</p>`,
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
      ],
      exercises: [
        "Write a query that returns, for every persona (customers 1 to 6), their email, number of accounts and total balance. You will need a join and a GROUP BY.",
        "List Emma's debit and credit cards with <code>last4</code>, card status and the account number and type each card is attached to. Compare with <code>GET /api/v1/cards</code>.",
        "Write an anti-join that finds bill payments whose payee row does not exist, and another that finds transfers (<code>type = 'TRANSFER'</code>) that have a DEBIT leg but no CREDIT leg. Both should return no rows in the clean build; keep them, they are bug detectors for QA.",
        "Take the first example and remove <code>u.sandbox_id = c.sandbox_id AND</code> from the join. Run it locally and note that nothing changes. In two sentences, explain what would happen on QA and why that makes this mistake dangerous.",
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
while the API response for the transfer still looks fine. Only a query that compares each row with its neighbour catches it.</p></div>`,
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
      ],
      exercises: [
        "Using <code>EXISTS</code>, list customers who have at least one payee for <em>Niagara Power Co</em>. Rewrite the same query with <code>IN</code> and with a <code>JOIN</code>; check all three return the same rows.",
        "Write a CTE that computes each customer's total POSTED card spending (<code>type = 'PURCHASE'</code>) in October 2026 (Toronto), then returns the top 5 customers with their names.",
        "Run the integrity check for the whole sandbox and the balance-vs-latest check. Make one transfer through the API as Emma and run both again. Save both queries in your framework repo; you will turn them into JDBC assertions in week 3.",
        "Use <code>lag()</code> to find, for account 1, the longest gap in days between two consecutive transactions in 2026.",
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
<code>POST /api/v1/test/reset</code> (header <code>X-Sandbox-Key: ICEBANK-LOCAL-KEY</code>): same ids, same balances, clock back to the seed instant.</p>`,
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
      ],
      exercises: [
        "As <code>qa_writer</code> in manual-commit mode, insert a contact for Noah (customer 4). Before committing, query it from your <em>reader</em> connection and from <code>GET /api/v1/etransfer-contacts</code> signed in as Noah. Write down what each one sees. Then roll back.",
        "Change Emma's savings nickname inside a transaction. Check <code>GET /api/v1/accounts/2</code> before and after <code>COMMIT</code>. Then set it back to <code>Rainy day</code> and commit again.",
        "Try to (a) change the amount of a POSTED transaction, (b) delete a POSTED transaction, (c) change a POSTED transaction's status to <code>PENDING</code>. Record each error message, then roll back.",
        "Lock test: in the writer connection run <code>BEGIN; UPDATE accounts SET nickname = nickname WHERE sandbox_id = 1 AND id = 1;</code> and leave it open. Start a transfer from account 1 in the Ice Bank UI. Describe what happens, then <code>ROLLBACK</code> and watch the transfer finish (or time out).",
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
first invalid value (−0.01, limit + 0.01).</p>`,
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
      ],
      exercises: [
        "List all CHECK constraints on <code>customers</code> and <code>accounts</code>. For each, write one boundary-valid value and one invalid value you would use in a test (for example a postal code that is valid, and one with a letter the pattern forbids).",
        "As <code>qa_writer</code>, break three different constraints in one transaction using savepoints (any three from the table). Record the SQLSTATE and constraint name for each, then roll back.",
        "Try adding Emma's existing Niagara Power payee again through the API: <code>POST /api/v1/payees</code> with <code>billerId</code> 1 and account number <code>4410028731</code>. Note the status and <code>code</code>. Which index in the database would stop it if the API check were missing?",
        "Find the index that allows only one <code>OPEN</code> dispute per transaction. Explain in two sentences why it has to be a partial index and could not be a plain <code>UNIQUE (sandbox_id, transaction_id)</code> constraint.",
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
job, which is why "can Emma move money out of Liam's account through the API?" is a security test, not a database test.</p>`,
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
      ],
      exercises: [
        "Sign in as Emma and move $5.00 from account 1 to account 2 with <code>POST /api/v1/transfers</code>. Using the <code>referenceId</code> from the response, find: the two <code>transactions</code> rows, the <code>transfers</code> row, and the audit rows. Check that <code>actor_user_id</code> is Emma's user id.",
        "As <code>qa_writer</code>, inside one rolled-back transaction (use savepoints), make <code>post_transfer</code> fail in five different ways: amount <code>0.001</code>, same account, frozen account 10, more than the available balance, and money out of the loan account 4. Record each message code.",
        "Compare <code>v_account_summary</code> for Emma with <code>GET /api/v1/accounts</code>: list every field that appears in both and confirm they match.",
        "Compare <code>v_daily_etransfer_totals</code> for the whole sandbox with your own GROUP BY query from lesson 3 using <code>EXCEPT</code> in both directions. Both directions should return no rows.",
        "Write a JUnit test that calls <code>post_transfer</code> through a <code>CallableStatement</code>, asserts the DEBIT and CREDIT legs (amounts, <code>balance_after</code>, shared <code>reference_id</code>), and always rolls back.",
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
(your sandbox id). Keep them read-only so they can run as <code>qa_reader</code> on both environments.</p>`,
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
      ],
      exercises: [
        "Create <code>sql/toolkit.sql</code> in your framework repo with the queries above, each preceded by a one-line comment saying when to use it. Commit it on a branch (Tutorial 4).",
        "Cancel Emma's pending e-Transfer to Marc Dupont (or send and cancel a new $1.00 one) with <code>POST /api/v1/etransfers/{id}/cancel</code>. Use the toolkit to prove the status changed, a REVERSAL credit for the full amount exists and an audit row was written.",
        "Turn queries 1, 3 and 7 into Java methods of a <code>DbChecks</code> class that take the sandbox id and the value as parameters and return simple objects or lists. Call them from one test.",
        "Run the health checks against QA with your own sandbox id as <code>qa_reader</code> (when the instructor has bug packs enabled). Report any rows you get as a bug, with the query as evidence.",
      ],
    },
  ],
});
