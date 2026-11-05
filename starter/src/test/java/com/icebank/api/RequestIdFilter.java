package com.icebank.api;

import io.restassured.filter.Filter;
import io.restassured.filter.FilterContext;
import io.restassured.response.Response;
import io.restassured.specification.FilterableRequestSpecification;
import io.restassured.specification.FilterableResponseSpecification;

import java.util.UUID;

/**
 * Adds an {@code X-Request-Id: <uuid>} header to every request that does not already have one.
 * Ice Bank echoes it back and writes it to its own log, so one id links a failed test to the server's log line.
 */
public class RequestIdFilter implements Filter {

    public static final String HEADER = "X-Request-Id";

    @Override
    public Response filter(FilterableRequestSpecification request, FilterableResponseSpecification response, FilterContext ctx) {
        if (!request.getHeaders().hasHeaderWithName(HEADER)) {
            request.header(HEADER, UUID.randomUUID().toString());
        }
        return ctx.next(request, response);
    }
}
