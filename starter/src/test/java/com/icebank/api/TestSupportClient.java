package com.icebank.api;

import io.qameta.allure.Step;
import io.restassured.response.Response;

import java.util.Map;

import static io.restassured.RestAssured.given;

/**
 * Ice Bank's test-support endpoints. All but {@link #health()} need {@code X-Sandbox-Key}.
 *
 * <p><strong>Careful:</strong> {@link #reset()} wipes your whole sandbox back to the seed, and the clock calls move the
 * sandbox date forward for everyone using that sandbox (it never moves back without a reset). Tests that call them
 * must carry {@code @Tag("destructive")} so the default run skips them.
 */
public final class TestSupportClient {

    private TestSupportClient() {
    }

    /** {@code GET /test/health}: {@code {status: "UP", database: "UP", build, version, time}}. No key needed. */
    public static Response health() {
        return given().spec(Specs.base()).when().get("/test/health");
    }

    /** {@code GET /test/clock}: {@code {sandboxId, now, today, offsetSeconds, offsetDays}}. Read-only, safe. */
    public static Response clock() {
        return given().spec(Specs.sandbox()).when().get("/test/clock");
    }

    /** {@code POST /test/reset}: restores the seed data and sets the clock to Mon 2026-11-02 09:00 Toronto. Destructive. */
    @Step("Reset the sandbox to its seed state")
    public static Response reset() {
        Response response = given().spec(Specs.sandbox()).when().post("/test/reset");
        AuthClient.clearCache(); // a reset deletes every session, so cached tokens are dead
        return response;
    }

    /** {@code POST /test/clock {"advanceDays": n}}. Due work (scheduled payments, interest, ...) runs before the response. Destructive. */
    @Step("Move the sandbox clock forward {days} day(s)")
    public static Response advanceDays(int days) {
        return setClock(Map.of("advanceDays", days));
    }

    /** {@code POST /test/clock {"advanceMinutes": n}}. Destructive. */
    @Step("Move the sandbox clock forward {minutes} minute(s)")
    public static Response advanceMinutes(int minutes) {
        return setClock(Map.of("advanceMinutes", minutes));
    }

    /** {@code POST /test/clock} with exactly one of {@code advanceDays}, {@code advanceMinutes}, {@code date}, {@code dateTime}. Destructive. */
    public static Response setClock(Map<String, ?> body) {
        return given().spec(Specs.sandbox()).body(body).when().post("/test/clock");
    }
}
