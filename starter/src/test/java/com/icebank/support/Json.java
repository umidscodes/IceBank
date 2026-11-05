package com.icebank.support;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * The one Jackson {@link ObjectMapper} used everywhere (REST Assured uses it too, see {@code Specs}).
 *
 * <ul>
 *   <li>{@link JavaTimeModule}: reads {@code "2026-11-04T21:15:00-05:00"} into {@code OffsetDateTime}.</li>
 *   <li>Money: {@code "1250.00"} becomes a {@code BigDecimal} with scale 2; doubles are never involved.</li>
 *   <li>Unknown fields are ignored, so a new field in the API does not break every test.
 *       Contract checks belong in JSON schema tests (see {@code AccountsApiTest}).</li>
 * </ul>
 */
public final class Json {

    public static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(DeserializationFeature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private Json() {
    }
}
