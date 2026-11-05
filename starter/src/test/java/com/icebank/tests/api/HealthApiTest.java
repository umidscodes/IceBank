package com.icebank.tests.api;

import com.icebank.api.Specs;
import com.icebank.api.TestSupportClient;
import com.icebank.config.Config;
import io.qameta.allure.Feature;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.notNullValue;

@Tag("api")
@Feature("Test support")
@DisplayName("Health and sandbox clock")
class HealthApiTest {

    @Test
    @DisplayName("Health check says the app and the database are UP")
    void healthIsUp() {
        TestSupportClient.health()
                .then()
                .statusCode(200)
                .contentType(ContentType.JSON)
                .body("status", equalTo("UP"))
                .body("database", equalTo("UP"))
                .body("version", notNullValue());
    }

    @Test
    @DisplayName("The X-Request-Id we send is echoed back")
    void requestIdIsEchoed() {
        String requestId = "starter-" + UUID.randomUUID();
        given().spec(Specs.base())
                .header("X-Request-Id", requestId)
                .when().get("/test/health")
                .then()
                .statusCode(200)
                .header("X-Request-Id", equalTo(requestId));
    }

    @Test
    @DisplayName("The sandbox clock can be read with the sandbox key (read-only, safe to run anytime)")
    void clockIsReadableWithSandboxKey() {
        TestSupportClient.clock()
                .then()
                .statusCode(200)
                .body("sandboxId", equalTo(Config.sandboxId()))
                .body("today", matchesPattern("\\d{4}-\\d{2}-\\d{2}"))
                .body("now", matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}[+-]\\d{2}:\\d{2}"));
    }

    @Test
    @DisplayName("The sandbox clock without the key is 401 SANDBOX_KEY_REQUIRED")
    void clockWithoutKeyIsRejected() {
        given().spec(Specs.base())
                .when().get("/test/clock")
                .then()
                .statusCode(401)
                .contentType("application/problem+json")
                .body("code", equalTo("SANDBOX_KEY_REQUIRED"));
    }
}
