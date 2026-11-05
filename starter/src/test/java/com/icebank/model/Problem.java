package com.icebank.model;

import java.util.List;

/**
 * An RFC 7807 error body ({@code application/problem+json}). Every Ice Bank error looks like this.
 *
 * <pre>{"type":"https://icebank.test/problems/invalid-credentials","title":"Unauthorized","status":401,
 *  "detail":"Invalid email or password.","instance":"/api/v1/auth/login","code":"INVALID_CREDENTIALS",
 *  "attemptsRemaining":4}</pre>
 *
 * @param code              machine-readable error, e.g. {@code VALIDATION_FAILED}, {@code INSUFFICIENT_FUNDS}: assert on this
 * @param errors            field errors, only for {@code VALIDATION_FAILED}
 * @param attemptsRemaining only for wrong passwords and wrong OTP codes
 */
public record Problem(
        String type,
        String title,
        int status,
        String detail,
        String instance,
        String code,
        List<FieldError> errors,
        Integer attemptsRemaining) {

    /** One invalid field: {@code {"field":"amount","message":"must have at most 2 decimal places"}}. */
    public record FieldError(String field, String message) {
    }
}
