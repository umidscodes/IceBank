package com.icebank.tests.api;

import com.icebank.api.AccountsClient;
import com.icebank.api.TransfersClient;
import com.icebank.config.Config;
import com.icebank.db.Db;
import com.icebank.model.Account;
import com.icebank.model.Account.AccountType;
import com.icebank.model.Transfer;
import com.icebank.model.TransferRequest;
import com.icebank.support.Personas;
import com.icebank.support.TestData;
import io.qameta.allure.Feature;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.matchesPattern;

/**
 * Transfers move real money, so these tests use Sophie (a background customer), move tiny amounts and always
 * transfer the money back. Balances are read before the test, never assumed.
 */
@Tag("api")
@Tag("db")
@Feature("Transfers")
@DisplayName("Transfers between own accounts")
class TransfersApiTest {

    private static final String LEGS_SQL = """
            SELECT account_id, direction, amount, status, type
              FROM transactions
             WHERE sandbox_id = ? AND reference_id = ?
             ORDER BY direction DESC""";   // DEBIT before CREDIT
    private static final String BALANCE_SQL = "SELECT balance FROM accounts WHERE sandbox_id = ? AND id = ?";

    private final AccountsClient accounts = new AccountsClient();
    private final TransfersClient transfers = new TransfersClient();
    private final Db db = Db.reader();
    private final String sophie = Personas.SOPHIE;

    private long chequing;
    private long savings;

    @BeforeEach
    void findSophiesAccounts() {
        List<Account> list = accounts.listAccounts(sophie);
        chequing = idOfFirst(list, AccountType.CHEQUING);
        savings = idOfFirst(list, AccountType.SAVINGS);
    }

    @Test
    @DisplayName("A $1.00 transfer posts a DEBIT and a CREDIT leg; transferring it back restores both balances")
    void transferPostsTwoLegsAndReverseRestoresBalances() {
        BigDecimal amount = TestData.money("1.00");
        BigDecimal chequingBefore = balance(chequing);
        BigDecimal savingsBefore = balance(savings);

        Response response = transfers.create(sophie, chequing, savings, amount);
        response.then()
                .statusCode(201)
                .header("Location", matchesPattern(".*/api/v1/transfers/\\d+"))
                .body("amount", equalTo("1.00"))
                .body("status", equalTo("COMPLETED"));
        Transfer transfer = response.as(Transfer.class);

        // The API response proves the contract; the rows prove the behaviour.
        List<Map<String, Object>> legs = db.queryList(LEGS_SQL, Config.sandboxId(), transfer.referenceId());
        assertThat(legs).hasSize(2);
        assertThat(legs.get(0))
                .containsEntry("account_id", chequing)
                .containsEntry("direction", "DEBIT")
                .containsEntry("status", "POSTED")
                .containsEntry("type", "TRANSFER");
        assertThat(legs.get(1))
                .containsEntry("account_id", savings)
                .containsEntry("direction", "CREDIT")
                .containsEntry("status", "POSTED");
        assertThat(legs).allSatisfy(leg -> assertThat((BigDecimal) leg.get("amount")).isEqualByComparingTo(amount));
        assertThat(balance(chequing)).isEqualByComparingTo(chequingBefore.subtract(amount));

        // Put the money back so the test is repeatable and leaves Sophie's balances as they were.
        transfers.transfer(sophie, savings, chequing, amount);
        assertThat(balance(chequing)).isEqualByComparingTo(chequingBefore);
        assertThat(balance(savings)).isEqualByComparingTo(savingsBefore);
    }

    @Test
    @DisplayName("Same Idempotency-Key + same body replays the first transfer; a different body is 409")
    void idempotentReplayDoesNotMoveMoneyTwice() {
        String key = TransfersClient.newIdempotencyKey();
        TransferRequest request = new TransferRequest(chequing, savings, "0.01", "starter idempotency check");

        Response first = transfers.create(sophie, request, key);
        first.then().statusCode(201);
        Transfer original = first.as(Transfer.class);
        try {
            Response replay = transfers.create(sophie, request, key);
            replay.then()
                    .statusCode(201)
                    .header(TransfersClient.IDEMPOTENT_REPLAYED, "true");
            assertThat(replay.as(Transfer.class).id()).isEqualTo(original.id());

            // Only one transfer happened: still exactly two legs for its reference.
            List<Map<String, Object>> legs = db.queryList(LEGS_SQL, Config.sandboxId(), original.referenceId());
            assertThat(legs).hasSize(2);

            transfers.create(sophie, new TransferRequest(chequing, savings, "0.02", "starter idempotency check"), key)
                    .then()
                    .statusCode(409)
                    .body("code", equalTo("IDEMPOTENCY_KEY_REUSED"));
        } finally {
            transfers.transfer(sophie, savings, chequing, original.amount()); // undo the one real transfer
        }
    }

    @Test
    @DisplayName("An amount with 3 decimals is rejected (400), never rounded")
    void threeDecimalAmountIsRejected() {
        transfers.create(sophie, chequing, savings, "1.005")
                .then()
                .statusCode(400)
                .body("code", equalTo("VALIDATION_FAILED"))
                .body("errors[0].field", equalTo("amount"))
                .body("errors[0].message", equalTo("must have at most 2 decimal places"));
    }

    private static long idOfFirst(List<Account> list, AccountType type) {
        return list.stream().filter(a -> a.type() == type).findFirst().orElseThrow().id();
    }

    private BigDecimal balance(long accountId) {
        return db.scalar(BigDecimal.class, BALANCE_SQL, Config.sandboxId(), accountId);
    }
}
