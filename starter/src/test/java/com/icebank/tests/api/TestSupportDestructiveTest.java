package com.icebank.tests.api;

import com.icebank.api.TestSupportClient;
import com.icebank.config.Config;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.startsWith;

/**
 * Reset and clock examples. Tagged {@code destructive}: they wipe the sandbox and move its clock, so the default
 * {@code mvn test} skips them. Each test stands alone and leaves the sandbox at the seed state (the clock test
 * resets in a {@code finally}). Run them only against a sandbox that is yours alone:
 * <pre>mvn test -Dgroups=destructive -DexcludedGroups=</pre>
 * (PowerShell: {@code mvn test "-Dgroups=destructive" "-DexcludedGroups="}).
 */
@Tag("api")
@Tag("destructive")
@Feature("Test support")
@DisplayName("Sandbox reset and clock (destructive)")
class TestSupportDestructiveTest {

    @Test
    @DisplayName("Reset restores the seed and sets the clock to Mon 2026-11-02 09:00 Toronto")
    void resetRestoresSeed() {
        TestSupportClient.reset()
                .then()
                .statusCode(200)
                .body("sandboxId", equalTo(Config.sandboxId()))
                .body("clock.today", equalTo("2026-11-02"))
                .body("clock.now", startsWith("2026-11-02T09:0"))
                .body("customers", greaterThanOrEqualTo(50));
    }

    @Test
    @DisplayName("The clock moves forward by advanceMinutes (and a reset puts it back)")
    void clockMovesForward() {
        long before = TestSupportClient.clock().then().statusCode(200).extract().<Number>path("offsetSeconds").longValue();
        try {
            long after = TestSupportClient.advanceMinutes(16)
                    .then()
                    .statusCode(200)
                    .body("dueWork", notNullValue())
                    .extract().<Number>path("offsetSeconds").longValue();

            assertThat(after - before).isBetween(16 * 60L - 5, 16 * 60L + 5);
        } finally {
            // The clock never moves backwards on its own: only a reset brings it back to the seed instant.
            TestSupportClient.reset().then().statusCode(200);
        }
    }
}
