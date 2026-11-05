package com.icebank.api;

import com.icebank.model.Account;
import com.icebank.model.Page;
import com.icebank.model.Transaction;
import io.qameta.allure.Step;
import io.restassured.common.mapper.TypeRef;
import io.restassured.response.Response;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;

/**
 * {@code /accounts} for a signed-in customer. Methods take the persona's email and use its cached token.
 *
 * <p>Raw methods return the {@link Response} so the test decides what to assert (status, problem, schema).
 * The typed helpers ({@link #listAccounts}, {@link #account}, {@link #transactionPage}) expect 200 and return records.
 * Clients never assert business results: that is the test's job.
 */
public class AccountsClient {

    /** {@code GET /accounts}: the customer's accounts, ordered by id. */
    @Step("List accounts of {email}")
    public Response list(String email) {
        return given().spec(Specs.as(email)).when().get("/accounts");
    }

    /** {@code GET /accounts/{id}}. Another customer's account is 404, exactly like a missing one. */
    @Step("Get account {accountId} as {email}")
    public Response get(String email, long accountId) {
        return given().spec(Specs.as(email)).pathParam("id", accountId).when().get("/accounts/{id}");
    }

    /**
     * {@code GET /accounts/{id}/transactions} with optional filters and paging, e.g.
     * {@code Map.of("type", "TRANSFER", "size", 5, "sort", "createdAt,desc")}.
     */
    @Step("Search transactions of account {accountId} as {email}")
    public Response transactions(String email, long accountId, Map<String, ?> query) {
        return given().spec(Specs.as(email)).pathParam("id", accountId).queryParams(query)
                .when().get("/accounts/{id}/transactions");
    }

    // ---- typed helpers (expect 200) --------------------------------------------------------------

    public List<Account> listAccounts(String email) {
        return Arrays.asList(list(email).then().statusCode(200).extract().as(Account[].class));
    }

    public Account account(String email, long accountId) {
        return get(email, accountId).then().statusCode(200).extract().as(Account.class);
    }

    /** The customer's first account of a type, e.g. {@code firstOfType(SOPHIE, CHEQUING)}. */
    public Account firstOfType(String email, Account.AccountType type) {
        return listAccounts(email).stream().filter(a -> a.type() == type).findFirst()
                .orElseThrow(() -> new IllegalStateException(email + " has no " + type + " account"));
    }

    public Page<Transaction> transactionPage(String email, long accountId, Map<String, ?> query) {
        return transactions(email, accountId, query).then().statusCode(200).extract().as(new TypeRef<Page<Transaction>>() {
        });
    }
}
