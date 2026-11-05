package com.icebank.tests.api;

import com.icebank.api.AccountsClient;
import com.icebank.model.Account;
import com.icebank.model.Account.AccountType;
import com.icebank.model.Problem;
import com.icebank.support.Personas;
import io.qameta.allure.Feature;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

@Tag("api")
@Feature("Accounts")
@DisplayName("Accounts")
class AccountsApiTest {

    private final AccountsClient accounts = new AccountsClient();

    @Test
    @DisplayName("Emma has her four seeded accounts: chequing, savings, credit card and loan")
    void emmaHasFourAccounts() {
        List<Account> list = accounts.listAccounts(Personas.EMMA);

        // Ids, types and numbers are fixed by the seed. Balances are not asserted: other tests move money.
        assertThat(list)
                .extracting(Account::id, Account::type, Account::accountNumber)
                .containsExactly(
                        tuple(1L, AccountType.CHEQUING, "999-10045-1007919"),
                        tuple(2L, AccountType.SAVINGS, "999-20012-1015838"),
                        tuple(3L, AccountType.CREDIT, "999-30077-1023757"),
                        tuple(4L, AccountType.LOAN, "999-10021-1031676"));
        assertThat(list).allSatisfy(a -> {
            assertThat(a.currency()).isEqualTo("CAD");
            assertThat(a.isOpen()).isTrue();
        });
    }

    @Test
    @DisplayName("Another customer's account is 404 NOT_FOUND, not 403")
    void anotherCustomersAccountIsNotFound() {
        Response response = accounts.get(Personas.EMMA, Personas.LIAM_CHEQUING);

        response.then().statusCode(404).contentType("application/problem+json");
        Problem problem = response.as(Problem.class);
        assertThat(problem.code()).isEqualTo("NOT_FOUND");
        assertThat(problem.detail()).isEqualTo("Account not found.");
    }

    @ParameterizedTest(name = "account {0} matches schemas/account.json")
    @ValueSource(longs = {1, 2, 3, 4})
    @DisplayName("Each of Emma's accounts matches the Account JSON schema")
    void accountMatchesSchema(long accountId) {
        accounts.get(Personas.EMMA, accountId)
                .then()
                .statusCode(200)
                .body(matchesJsonSchemaInClasspath("schemas/account.json"));
    }

    @Test
    @DisplayName("Credit card: available credit = credit limit + balance (BigDecimal, to the cent)")
    void creditCardAvailableCreditIsLimitPlusBalance() {
        Account card = accounts.account(Personas.EMMA, Personas.EMMA_CREDIT);

        assertThat(card.type()).isEqualTo(AccountType.CREDIT);
        assertThat(card.creditLimit()).isEqualByComparingTo("5000.00");
        assertThat(card.availableCredit()).isEqualByComparingTo(card.creditLimit().add(card.balance()));
    }
}
