package com.icebank.db;

import com.icebank.config.Config;
import io.qameta.allure.Allure;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * A small JDBC helper for checking (and, as {@code qa_writer}, setting up) data in the Ice Bank database.
 *
 * <pre>
 * Db db = Db.reader();
 * List&lt;Map&lt;String, Object&gt;&gt; legs = db.queryList(
 *     "SELECT account_id, direction, amount FROM transactions WHERE sandbox_id = ? AND reference_id = ?",
 *     Config.sandboxId(), ref);
 * BigDecimal balance = db.scalar(BigDecimal.class, "SELECT balance FROM accounts WHERE sandbox_id = ? AND id = ?", 1, 1L);
 * </pre>
 *
 * <ul>
 *   <li>Always use {@code ?} parameters, never string concatenation (SQL injection, quoting bugs).</li>
 *   <li>Money ({@code NUMERIC}) comes back as {@link BigDecimal}, never double. {@code timestamptz} comes back as
 *       {@link OffsetDateTime}, {@code date} as {@link LocalDate}. Row maps use the column labels as keys.</li>
 *   <li>Every business table has {@code sandbox_id}: always filter on it ({@link Config#sandboxId()}).</li>
 *   <li>Each call opens and closes its own connection (simple and safe; fast enough for tests).</li>
 *   <li>Each query is an Allure step with the SQL, parameters and result attached as evidence.</li>
 * </ul>
 */
public final class Db {

    private static final Logger log = LoggerFactory.getLogger(Db.class);

    private final String url;
    private final String user;
    private final String password;

    /** A piece of JDBC work on an open connection, for {@link #inRolledBackTransaction}. */
    @FunctionalInterface
    public interface SqlWork<T> {
        T apply(Connection connection) throws SQLException;
    }

    private Db(String url, String user, String password) {
        this.url = url;
        this.user = user;
        this.password = password;
    }

    /** Read-only access as {@code qa_reader} (works on local and QA). */
    public static Db reader() {
        return new Db(Config.jdbcUrl(), Config.dbUser(), Config.dbPassword());
    }

    /**
     * Read-write access as {@code qa_writer}. Only configured locally: guard tests with
     * {@code assumeTrue(Config.hasDbWriter())} so they are skipped (not failed) on QA.
     */
    public static Db writer() {
        String writer = Config.dbWriterUser()
                .orElseThrow(() -> new IllegalStateException("No dbWriterUser configured for env '" + Config.env() + "'"));
        return new Db(Config.jdbcUrl(), writer, Config.dbWriterPassword());
    }

    /** The database user this instance connects as. */
    public String user() {
        return user;
    }

    /** A new connection. Close it (try-with-resources) when done. */
    public Connection connect() throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }

    // ---- queries ---------------------------------------------------------------------------------

    /** All rows of a query, each as a column-label -> value map (insertion ordered). */
    public List<Map<String, Object>> queryList(String sql, Object... params) {
        return Allure.step("SQL (" + user + "): " + oneLine(sql), () -> {
            try (Connection c = connect(); PreparedStatement ps = prepare(c, sql, params); ResultSet rs = ps.executeQuery()) {
                List<Map<String, Object>> rows = readRows(rs);
                attach(sql, params, rows);
                return rows;
            }
        });
    }

    /** Exactly one row. Throws {@link AssertionError} for zero or several rows (a test expectation failed). */
    public Map<String, Object> queryOne(String sql, Object... params) {
        List<Map<String, Object>> rows = queryList(sql, params);
        if (rows.size() != 1) {
            throw new AssertionError("Expected exactly 1 row but got " + rows.size() + " for: " + oneLine(sql));
        }
        return rows.get(0);
    }

    /**
     * The first column of the single row, converted by the driver to {@code type}
     * (BigDecimal, Long, Integer, String, Boolean, OffsetDateTime, LocalDate, ...). Null if the value is SQL NULL.
     */
    public <T> T scalar(Class<T> type, String sql, Object... params) {
        return Allure.step("SQL (" + user + "): " + oneLine(sql), () -> {
            try (Connection c = connect(); PreparedStatement ps = prepare(c, sql, params); ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new AssertionError("Expected 1 row but got none for: " + oneLine(sql));
                }
                T value = rs.getObject(1, type);
                if (rs.next()) {
                    throw new AssertionError("Expected 1 row but got several for: " + oneLine(sql));
                }
                Allure.addAttachment("SQL result", "text/plain", sql + "\nparams: " + Arrays.asList(params) + "\n\n" + value);
                return value;
            }
        });
    }

    /** INSERT / UPDATE / DELETE: returns the number of rows changed (needs {@link #writer()}). */
    public int update(String sql, Object... params) {
        return Allure.step("SQL update (" + user + "): " + oneLine(sql), () -> {
            try (Connection c = connect(); PreparedStatement ps = prepare(c, sql, params)) {
                int n = ps.executeUpdate();
                Allure.addAttachment("SQL update", "text/plain", sql + "\nparams: " + Arrays.asList(params) + "\n\nrows changed: " + n);
                return n;
            }
        });
    }

    /**
     * Calls {@code post_transfer(from_account, to_account, amount, reference)} through a {@link CallableStatement}:
     * {@code {? = call post_transfer(?, ?, ?, ?)}}. Moves money atomically (two transaction rows sharing
     * {@code reference_id}, two balance updates, one TRANSFER_POSTED audit row) and returns the DEBIT transaction id.
     *
     * <p>Needs {@link #writer()} ({@code qa_reader} may not execute it). The 4-argument form uses the function's
     * default sandbox 1, which is the local sandbox. Business errors are {@link SQLException}s with SQLSTATE
     * {@code P0001} and a message starting with the code, e.g. {@code SAME_ACCOUNT: ...}, {@code INSUFFICIENT_FUNDS: ...}.
     */
    public long callPostTransfer(long fromAccountId, long toAccountId, BigDecimal amount, String reference) throws SQLException {
        try (Connection c = connect()) {
            return callPostTransfer(c, fromAccountId, toAccountId, amount, reference);
        }
    }

    /** Same as {@link #callPostTransfer(long, long, BigDecimal, String)} on a connection you manage (e.g. one you roll back). */
    public static long callPostTransfer(Connection connection, long fromAccountId, long toAccountId, BigDecimal amount, String reference)
            throws SQLException {
        try (CallableStatement cs = connection.prepareCall("{? = call post_transfer(?, ?, ?, ?)}")) {
            cs.registerOutParameter(1, Types.BIGINT);
            cs.setLong(2, fromAccountId);
            cs.setLong(3, toAccountId);
            cs.setBigDecimal(4, amount);
            cs.setString(5, reference);
            cs.execute();
            long debitId = cs.getLong(1);
            log.info("post_transfer({}, {}, {}, {}) -> debit transaction {}", fromAccountId, toAccountId, amount, reference, debitId);
            return debitId;
        }
    }

    /**
     * Runs {@code work} in a transaction that is always rolled back, so nothing it writes is kept. Handy to show
     * that a constraint or trigger rejects a change, or to try {@code post_transfer} without moving real money.
     */
    public <T> T inRolledBackTransaction(SqlWork<T> work) throws SQLException {
        try (Connection c = connect()) {
            c.setAutoCommit(false);
            try {
                return work.apply(c);
            } finally {
                c.rollback();
            }
        }
    }

    /** Reads every row of a result set you got yourself (used by {@link #queryList}). */
    public static List<Map<String, Object>> readRows(ResultSet rs) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        List<Map<String, Object>> rows = new ArrayList<>();
        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= md.getColumnCount(); i++) {
                row.put(md.getColumnLabel(i), readValue(rs, i, md.getColumnTypeName(i)));
            }
            rows.add(row);
        }
        return rows;
    }

    // ---- internals -------------------------------------------------------------------------------

    private static Object readValue(ResultSet rs, int i, String typeName) throws SQLException {
        Object raw = rs.getObject(i);
        if (raw == null) {
            return null;
        }
        return switch (typeName) {
            case "timestamptz" -> rs.getObject(i, OffsetDateTime.class);
            case "date" -> rs.getObject(i, LocalDate.class);
            default -> raw; // numeric -> BigDecimal, int8 -> Long, int4 -> Integer, text -> String, bool -> Boolean
        };
    }

    private static PreparedStatement prepare(Connection c, String sql, Object... params) throws SQLException {
        PreparedStatement ps = c.prepareStatement(sql);
        for (int i = 0; i < params.length; i++) {
            ps.setObject(i + 1, params[i]);
        }
        return ps;
    }

    private static void attach(String sql, Object[] params, List<Map<String, Object>> rows) {
        String body = sql + "\nparams: " + Arrays.asList(params) + "\n\n" + rows.size() + " row(s)\n"
                + rows.stream().map(Object::toString).collect(Collectors.joining("\n"));
        Allure.addAttachment("SQL result", "text/plain", body);
        log.debug("SQL {} {} -> {} row(s)", oneLine(sql), Arrays.asList(params), rows.size());
    }

    private static String oneLine(String sql) {
        String s = sql.replaceAll("\\s+", " ").trim();
        return s.length() > 120 ? s.substring(0, 117) + "..." : s;
    }
}
