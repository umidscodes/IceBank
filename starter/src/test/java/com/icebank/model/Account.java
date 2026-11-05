package com.icebank.model;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * An account as returned by {@code GET /api/v1/accounts} and {@code GET /api/v1/accounts/{id}}.
 *
 * <p>Money is {@link BigDecimal}, never {@code double}: the API sends {@code "5703.95"} as a string and
 * Jackson turns it into an exact decimal. Compare money with {@code isEqualByComparingTo} (AssertJ) or
 * {@code compareTo}, because {@code new BigDecimal("1.0").equals(new BigDecimal("1.00"))} is false.
 * Credit card and loan balances are negative when money is owed.
 */
public record Account(
        long id,
        String accountNumber,
        AccountType type,
        String displayName,
        String nickname,
        String currency,
        BigDecimal balance,
        BigDecimal availableBalance,
        String status,
        BigDecimal creditLimit,
        BigDecimal availableCredit,
        BigDecimal minimumPayment,
        BigDecimal interestRate,
        OffsetDateTime openedAt) {

    public enum AccountType { CHEQUING, SAVINGS, CREDIT, LOAN }

    public boolean isOpen() {
        return "OPEN".equals(status);
    }
}
