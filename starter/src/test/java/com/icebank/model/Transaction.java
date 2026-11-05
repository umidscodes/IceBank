package com.icebank.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * One row of {@code GET /api/v1/accounts/{id}/transactions}. {@code amount} is always positive;
 * {@code direction} (DEBIT or CREDIT) says which way the money moved. {@code balanceAfter} is null while PENDING.
 */
public record Transaction(
        long id,
        long accountId,
        String direction,
        BigDecimal amount,
        BigDecimal balanceAfter,
        String status,
        String type,
        String description,
        String referenceId,
        OffsetDateTime createdAt,
        OffsetDateTime postedAt) {
}
