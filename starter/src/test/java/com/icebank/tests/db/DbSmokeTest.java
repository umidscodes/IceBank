package com.icebank.tests.db;

import com.icebank.config.Config;
import com.icebank.db.Db;
import com.icebank.support.Personas;
import com.icebank.support.TestData;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

@Tag("db")
@Feature("Database")
@DisplayName("Database smoke checks (JDBC)")
class DbSmokeTest {

    private final Db reader = Db.reader();

    @Test
    @DisplayName("qa_reader reads Emma's four accounts, with balances as BigDecimal")
    void readerSeesEmmasAccounts() {
        List<Map<String, Object>> rows = reader.queryList(
                "SELECT id, type, balance, status FROM accounts WHERE sandbox_id = ? AND customer_id = ? ORDER BY id",
                Config.sandboxId(), Personas.EMMA_CUSTOMER_ID);

        assertThat(rows).extracting(r -> r.get("type")).containsExactly("CHEQUING", "SAVINGS", "CREDIT", "LOAN");
        assertThat(rows).allSatisfy(r -> assertThat(r.get("balance")).isInstanceOf(BigDecimal.class));
    }

    @Test
    @DisplayName("scalar() returns a typed single value")
    void scalarReturnsTypedValue() {
        Long count = reader.scalar(Long.class,
                "SELECT count(*) FROM accounts WHERE sandbox_id = ? AND customer_id = ?", Config.sandboxId(), Personas.EMMA_CUSTOMER_ID);
        assertThat(count).isEqualTo(4L);
    }

    @Test
    @DisplayName("qa_reader is read-only: an UPDATE is refused with SQLSTATE 42501")
    void readerCannotWrite() {
        assertThatThrownBy(() -> reader.update(
                "UPDATE accounts SET nickname = 'hacked' WHERE sandbox_id = ? AND id = ?", Config.sandboxId(), Personas.EMMA_CHEQUING))
                .isInstanceOf(SQLException.class)
                .satisfies(e -> assertThat(((SQLException) e).getSQLState()).isEqualTo("42501")); // insufficient_privilege
    }

    @Test
    @Tag("writer")
    @DisplayName("CHECK constraint: a chequing balance cannot go below zero (rolled back, nothing is kept)")
    void chequingBalanceCannotBeNegative() {
        assumeTrue(Config.hasDbWriter(), "needs qa_writer (local only)");

        // Noah's chequing (account 9). The UPDATE runs inside a transaction that is always rolled back.
        assertThatThrownBy(() -> Db.writer().inRolledBackTransaction(c -> {
            try (PreparedStatement ps = c.prepareStatement(
                    "UPDATE accounts SET balance = -0.01, available_balance = -0.01 WHERE sandbox_id = ? AND id = ?")) {
                ps.setInt(1, Config.sandboxId());
                ps.setLong(2, 9L);
                return ps.executeUpdate();
            }
        }))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("accounts_deposit_balance_check")
                .satisfies(e -> assertThat(((SQLException) e).getSQLState()).isEqualTo("23514")); // check_violation
    }

    @Test
    @Tag("writer")
    @DisplayName("post_transfer refuses the same account as source and target (SQLSTATE P0001, SAME_ACCOUNT)")
    void postTransferRejectsSameAccount() {
        assumeTrue(Config.hasDbWriter(), "needs qa_writer (local only)");
        long chequing = sophiesAccount("CHEQUING");

        assertThatThrownBy(() -> Db.writer().callPostTransfer(chequing, chequing, TestData.money("1.00"), TestData.unique("STARTER")))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("SAME_ACCOUNT:")
                .satisfies(e -> assertThat(((SQLException) e).getSQLState()).isEqualTo("P0001"));
    }

    @Test
    @Tag("writer")
    @DisplayName("post_transfer writes two legs atomically; after a rollback none are left")
    void postTransferWritesTwoLegsAtomically() throws SQLException {
        assumeTrue(Config.hasDbWriter(), "needs qa_writer (local only)");
        long chequing = sophiesAccount("CHEQUING");
        long savings = sophiesAccount("SAVINGS");
        String reference = TestData.unique("STARTER");
        String legsSql = "SELECT id, account_id, direction, amount FROM transactions WHERE sandbox_id = ? AND reference_id = ? ORDER BY id";

        List<Map<String, Object>> legsInside = Db.writer().inRolledBackTransaction(c -> {
            long debitId = Db.callPostTransfer(c, chequing, savings, TestData.money("0.01"), reference);
            try (PreparedStatement ps = c.prepareStatement(legsSql)) {
                ps.setInt(1, Config.sandboxId());
                ps.setString(2, reference);
                List<Map<String, Object>> legs = Db.readRows(ps.executeQuery());
                assertThat(legs).extracting(r -> r.get("id")).contains(debitId);
                return legs;
            }
        });

        assertThat(legsInside).extracting(r -> r.get("direction")).containsExactlyInAnyOrder("DEBIT", "CREDIT");
        assertThat(reader.queryList(legsSql, Config.sandboxId(), reference)).isEmpty(); // rolled back: nothing kept
    }

    private long sophiesAccount(String type) {
        return reader.scalar(Long.class, "SELECT id FROM accounts WHERE sandbox_id = ? AND customer_id = ? AND type = ? ORDER BY id LIMIT 1",
                Config.sandboxId(), Personas.SOPHIE_CUSTOMER_ID, type);
    }
}
