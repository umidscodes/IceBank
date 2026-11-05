package com.icebank.model;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Body of {@code POST /api/v1/transfers}.
 *
 * <p>{@code amount} is a String on purpose: the API takes money as a decimal string ("250.00"), and a
 * String lets a negative test send values a BigDecimal would normalise, such as "10.005" or "1e2".
 * A null memo is left out of the JSON.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record TransferRequest(long fromAccountId, long toAccountId, String amount, String memo) {
}
