package com.icebank.api;

import com.icebank.config.Config;
import com.icebank.support.Json;
import io.qameta.allure.restassured.AllureRestAssured;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.config.LogConfig;
import io.restassured.config.ObjectMapperConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;

/**
 * Shared REST Assured request specifications. Tests and clients start every call from one of these,
 * so the base URL, JSON settings, logging, Allure attachments and X-Request-Id are set in one place.
 *
 * <pre>
 * given().spec(Specs.base()).when().get("/test/health")            // no auth
 * given().spec(Specs.as(Personas.EMMA)).when().get("/accounts")    // Bearer token for Emma (cached)
 * given().spec(Specs.sandbox()).when().get("/test/clock")          // X-Sandbox-Key
 * </pre>
 *
 * Paths are relative to {@code /api/v1}.
 */
public final class Specs {

    public static final String API_BASE_PATH = "/api/v1";
    public static final String SANDBOX_KEY_HEADER = "X-Sandbox-Key";

    private Specs() {
    }

    /**
     * REST Assured settings: our Jackson mapper (BigDecimal money, java.time dates), and masking of
     * secrets in REST Assured's own logs and in the Allure attachments.
     */
    public static RestAssuredConfig config() {
        return RestAssuredConfig.config()
                .objectMapperConfig(ObjectMapperConfig.objectMapperConfig().jackson2ObjectMapperFactory((type, charset) -> Json.MAPPER))
                .logConfig(LogConfig.logConfig()
                        .blacklistHeader("Authorization", SANDBOX_KEY_HEADER, "Cookie", "Set-Cookie")
                        .enableLoggingOfRequestAndResponseIfValidationFails());
    }

    /** No authentication. JSON in and out, logging, Allure, X-Request-Id. */
    public static RequestSpecification base() {
        return new RequestSpecBuilder()
                .setBaseUri(Config.baseUrl())
                .setBasePath(API_BASE_PATH)
                .setConfig(config())
                .setContentType(ContentType.JSON)
                .setAccept(ContentType.JSON)
                .addFilter(new RequestIdFilter())
                .addFilter(new ApiLogFilter())
                .addFilter(new AllureRestAssured())
                .build();
    }

    /** Signed in as {@code email} (a persona): adds {@code Authorization: Bearer ...} from {@link AuthClient#accessToken}. */
    public static RequestSpecification as(String email) {
        return withToken(AuthClient.accessToken(email));
    }

    /** Signed in with an access token you already have. */
    public static RequestSpecification withToken(String accessToken) {
        return new RequestSpecBuilder()
                .addRequestSpecification(base())
                .addHeader("Authorization", "Bearer " + accessToken)
                .build();
    }

    /** With the {@code X-Sandbox-Key} header: test-support endpoints and the Ice Mail inbox API. */
    public static RequestSpecification sandbox() {
        return new RequestSpecBuilder()
                .addRequestSpecification(base())
                .addHeader(SANDBOX_KEY_HEADER, Config.sandboxKey())
                .build();
    }
}
