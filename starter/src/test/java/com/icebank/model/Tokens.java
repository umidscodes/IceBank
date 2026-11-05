package com.icebank.model;

/**
 * Response of {@code POST /api/v1/auth/mfa/verify} (and {@code /auth/refresh}).
 *
 * @param accessToken  send as {@code Authorization: Bearer <accessToken>}; valid 15 minutes
 * @param refreshToken valid 7 days, single use (it rotates)
 * @param expiresIn    seconds until the access token expires (900)
 */
public record Tokens(String accessToken, String refreshToken, String tokenType, int expiresIn) {
}
