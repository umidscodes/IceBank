package com.icebank.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** Response of {@code POST /api/v1/transfers} and {@code GET /api/v1/transfers/{id}}. */
public record Transfer(
        long id,
        long fromAccountId,
        long toAccountId,
        BigDecimal amount,
        String memo,
        String status,
        String referenceId,
        Long debitTransactionId,
        Long creditTransactionId,
        OffsetDateTime createdAt) {
}
