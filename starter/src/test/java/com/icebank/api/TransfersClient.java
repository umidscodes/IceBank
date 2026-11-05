package com.icebank.api;

import com.icebank.model.Transfer;
import com.icebank.model.TransferRequest;
import com.icebank.support.TestData;
import io.qameta.allure.Step;
import io.restassured.response.Response;

import java.math.BigDecimal;
import java.util.UUID;

import static io.restassured.RestAssured.given;

/**
 * {@code /transfers}: moving money between the signed-in customer's own accounts.
 *
 * <p>Money-moving POSTs need an {@code Idempotency-Key} header. Same key + same body replays the first response
 * (with {@code Idempotent-Replayed: true}); same key + a different body is 409. The simple {@code create} methods
 * generate a fresh key for you; pass your own key to test replays.
 */
public class TransfersClient {

    public static final String IDEMPOTENCY_KEY = "Idempotency-Key";
    public static final String IDEMPOTENT_REPLAYED = "Idempotent-Replayed";

    /** A new random Idempotency-Key value. */
    public static String newIdempotencyKey() {
        return UUID.randomUUID().toString();
    }

    /** Transfer with a fresh Idempotency-Key. {@code amount} is a string so you can send "10.005" in a negative test. */
    public Response create(String email, long fromAccountId, long toAccountId, String amount) {
        return create(email, new TransferRequest(fromAccountId, toAccountId, amount, null), newIdempotencyKey());
    }

    /** Transfer with a fresh Idempotency-Key. */
    public Response create(String email, long fromAccountId, long toAccountId, BigDecimal amount) {
        return create(email, fromAccountId, toAccountId, TestData.moneyString(amount));
    }

    /**
     * {@code POST /transfers} with your own Idempotency-Key. Pass {@code null} as the key to send the request
     * without the header (expect 400 {@code IDEMPOTENCY_KEY_REQUIRED}).
     */
    @Step("Transfer {request.amount} from account {request.fromAccountId} to {request.toAccountId} as {email}")
    public Response create(String email, TransferRequest request, String idempotencyKey) {
        var spec = given().spec(Specs.as(email)).body(request);
        if (idempotencyKey != null) {
            spec.header(IDEMPOTENCY_KEY, idempotencyKey);
        }
        return spec.when().post("/transfers");
    }

    /** {@code GET /transfers/{id}}. */
    public Response get(String email, long transferId) {
        return given().spec(Specs.as(email)).pathParam("id", transferId).when().get("/transfers/{id}");
    }

    /** {@code GET /transfers?page=&size=}: newest first. */
    public Response list(String email, int page, int size) {
        return given().spec(Specs.as(email)).queryParam("page", page).queryParam("size", size).when().get("/transfers");
    }

    /** Transfer that must succeed (201): returns the created transfer. */
    public Transfer transfer(String email, long fromAccountId, long toAccountId, BigDecimal amount) {
        return create(email, fromAccountId, toAccountId, amount).then().statusCode(201).extract().as(Transfer.class);
    }
}
