package com.icebank.api;

import io.restassured.filter.Filter;
import io.restassured.filter.FilterContext;
import io.restassured.response.Response;
import io.restassured.specification.FilterableRequestSpecification;
import io.restassured.specification.FilterableResponseSpecification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Logs one INFO line per API call through SLF4J:
 * <pre>POST http://localhost:3000/api/v1/transfers -> 201 in 41 ms, X-Request-Id=5c0e9a1f-...</pre>
 * Error bodies (status 400 and up) are logged at DEBUG, which goes to {@code target/logs/tests.log}.
 * Headers are never logged here, so tokens and the sandbox key stay out of the log.
 */
public class ApiLogFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(ApiLogFilter.class);

    @Override
    public Response filter(FilterableRequestSpecification request, FilterableResponseSpecification responseSpec, FilterContext ctx) {
        long start = System.nanoTime();
        Response response = ctx.next(request, responseSpec);
        long ms = (System.nanoTime() - start) / 1_000_000;
        log.info("{} {} -> {} in {} ms, X-Request-Id={}", request.getMethod(), request.getURI(), response.statusCode(), ms,
                response.header(RequestIdFilter.HEADER));
        if (response.statusCode() >= 400) {
            log.debug("Response body: {}", response.asString());
        }
        return response;
    }
}
