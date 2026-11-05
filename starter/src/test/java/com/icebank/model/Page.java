package com.icebank.model;

import java.util.List;

/**
 * Every paginated Ice Bank list: {@code {content, page, size, totalElements, totalPages}}.
 *
 * <p>Read one with REST Assured's {@code TypeRef}, for example
 * {@code response.as(new TypeRef<Page<Transaction>>() {})}, or use {@code AccountsClient.transactionPage(...)}.
 *
 * @param page zero-based page number
 */
public record Page<T>(List<T> content, int page, int size, long totalElements, int totalPages) {
}
