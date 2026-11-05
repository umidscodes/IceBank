package com.icebank.tests.api;

import com.icebank.api.AuthClient;
import com.icebank.api.Specs;
import com.icebank.model.Problem;
import com.icebank.model.Tokens;
import com.icebank.support.Personas;
import io.qameta.allure.Feature;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

@Tag("api")
@Feature("Sign-in")
@DisplayName("Sign-in (password + one-time code)")
class AuthApiTest {

    @Test
    @DisplayName("Emma signs in with password and the OTP from Ice Mail and gets bearer tokens")
    void signInWithOtpReturnsTokens() {
        Tokens tokens = AuthClient.signIn(Personas.EMMA);

        assertThat(tokens.tokenType()).isEqualTo("Bearer");
        assertThat(tokens.accessToken()).isNotBlank();
        assertThat(tokens.refreshToken()).isNotBlank();
        assertThat(tokens.expiresIn()).isEqualTo(900); // 15 minutes

        // The token works: /me says who we are.
        given().spec(Specs.withToken(tokens.accessToken()))
                .when().get("/me")
                .then()
                .statusCode(200)
                .body("email", equalTo(Personas.EMMA))
                .body("customerId", equalTo((int) Personas.EMMA_CUSTOMER_ID));
    }

    @Test
    @DisplayName("A wrong password is 401 INVALID_CREDENTIALS with attemptsRemaining")
    void wrongPasswordIsRejected() {
        // Sophie, not Emma: a failed login counts toward a lockout (5 failures lock the user).
        String email = Personas.SOPHIE;
        try {
            Response response = AuthClient.retryIfRateLimited(() -> AuthClient.login(email, "Wrong#Password1"));

            response.then()
                    .statusCode(401)
                    .contentType("application/problem+json");
            Problem problem = response.as(Problem.class);
            assertThat(problem.code()).isEqualTo("INVALID_CREDENTIALS");
            assertThat(problem.status()).isEqualTo(401);
            assertThat(problem.detail()).isEqualTo("Invalid email or password.");
            assertThat(problem.instance()).isEqualTo("/api/v1/auth/login");
            assertThat(problem.attemptsRemaining()).isEqualTo(4);
        } finally {
            // Clean up: a correct password resets the failed-login counter, so the test can run again and again.
            AuthClient.retryIfRateLimited(() -> AuthClient.login(email, Personas.password())).then().statusCode(200);
        }
    }

    @Test
    @DisplayName("A protected endpoint without a token is 401 UNAUTHORIZED")
    void noTokenIsRejected() {
        given().spec(Specs.base())
                .when().get("/accounts")
                .then()
                .statusCode(401)
                .body("code", equalTo("UNAUTHORIZED"));
    }
}
