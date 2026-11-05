package com.icebank.model;

import java.time.OffsetDateTime;

/**
 * One Ice Mail message from {@code GET /api/v1/inbox}. {@code otpCode} is set for OTP messages,
 * {@code link} for password-reset and e-Transfer messages.
 */
public record InboxMessage(
        long id,
        String to,
        String from,
        String kind,
        String subject,
        String body,
        String otpCode,
        String link,
        OffsetDateTime createdAt,
        boolean read) {
}
