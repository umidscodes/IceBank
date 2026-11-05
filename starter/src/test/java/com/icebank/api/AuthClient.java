package com.icebank.api;

import com.icebank.config.Config;
import com.icebank.model.Tokens;
import io.qameta.allure.Step;
import io.restassured.response.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static io.restassured.RestAssured.given;

/**
 * Signs personas in through Ice Bank's two-step login and hands out access tokens.
 *
 * <p>The flow ({@link #signIn(String, String)}):
 * <ol>
 *   <li>{@code POST /auth/login {email, password}} returns an {@code mfaToken}; a 6-digit code is mailed to Ice Mail.</li>
 *   <li>{@code GET /inbox?email=...&kind=OTP&size=1} with {@code X-Sandbox-Key} returns the code ({@link InboxClient#latestOtp}).</li>
 *   <li>{@code POST /auth/mfa/verify {mfaToken, code}} returns {@code accessToken} (15 min) and {@code refreshToken} (7 days).</li>
 * </ol>
 *
 * <p>Sign-in endpoints allow only 10 calls per minute per IP, so {@link #accessToken(String)} caches one token per
 * email for the whole test run and signs in again only shortly before it expires. Use it for everything except
 * tests about the login itself.
 */
public final class AuthClient {

    private static final Logger log = LoggerFactory.getLogger(AuthClient.class);
    private static final Map<String, CachedToken> CACHE = new ConcurrentHashMap<>();
    private static final int MAX_RATE_LIMIT_RETRIES = 2;

    private record CachedToken(Tokens tokens, Instant expiresAt) {
    }

    private AuthClient() {
    }

    // ---- raw calls: return the Response so tests can assert on status codes and problems ---------

    /** Step 1: {@code POST /auth/login}. 200 with {@code mfaToken}, or 401 {@code INVALID_CREDENTIALS} / {@code ACCOUNT_LOCKED}. */
    public static Response login(String email, String password) {
        return given().spec(Specs.base())
                .body(Map.of("email", email, "password", password))
                .when().post("/auth/login");
    }

    /** Step 3: {@code POST /auth/mfa/verify}. 200 with tokens, or 401 {@code OTP_INVALID} / {@code OTP_EXPIRED} / ... */
    public static Response verifyMfa(String mfaToken, String code) {
        return given().spec(Specs.base())
                .body(Map.of("mfaToken", mfaToken, "code", code))
                .when().post("/auth/mfa/verify");
    }

    /** {@code POST /auth/refresh}: a new token pair. The old refresh token stops working. */
    public static Response refresh(String refreshToken) {
        return given().spec(Specs.base())
                .body(Map.of("refreshToken", refreshToken))
                .when().post("/auth/refresh");
    }

    /** {@code POST /auth/logout}: ends the session of this access token (204). */
    public static Response logout(String accessToken) {
        return given().spec(Specs.withToken(accessToken)).when().post("/auth/logout");
    }

    // ---- the full flow ---------------------------------------------------------------------------

    /** Signs in with the persona password. See {@link #signIn(String, String)}. */
    public static Tokens signIn(String email) {
        return signIn(email, Config.personaPassword());
    }

    /**
     * Full sign-in: password, OTP from Ice Mail, verify. Always signs in afresh (no cache) and then stores
     * the new tokens in the cache. Fails with an AssertionError if a step does not return 200.
     */
    @Step("Sign in as {email} (password + OTP from Ice Mail)")
    public static Tokens signIn(String email, String password) {
        // If someone else signs the same user in at the same moment, the newest OTP in the inbox may be
        // theirs (verify says OTP_INVALID). Starting over once fixes that rare race.
        for (int attempt = 1; ; attempt++) {
            String mfaToken = retryIfRateLimited(() -> login(email, password))
                    .then().statusCode(200)
                    .extract().path("mfaToken");
            String code = InboxClient.latestOtp(email);
            Response verify = retryIfRateLimited(() -> verifyMfa(mfaToken, code));
            if (verify.statusCode() == 401 && "OTP_INVALID".equals(verify.path("code")) && attempt < 2) {
                log.warn("OTP for {} was not ours (concurrent sign-in?), starting over", email);
                continue;
            }
            Tokens tokens = verify.then().statusCode(200).extract().as(Tokens.class);
            CACHE.put(key(email), new CachedToken(tokens, Instant.now().plusSeconds(tokens.expiresIn())));
            log.info("Signed in as {} (env={})", email, Config.env());
            return tokens;
        }
    }

    /**
     * A valid access token for {@code email}, signing in only when there is no cached token or it expires
     * within a minute. Thread-safe.
     */
    public static String accessToken(String email) {
        CachedToken cached = CACHE.get(key(email));
        if (cached == null || Instant.now().isAfter(cached.expiresAt().minusSeconds(60))) {
            synchronized (AuthClient.class) {
                cached = CACHE.get(key(email));
                if (cached == null || Instant.now().isAfter(cached.expiresAt().minusSeconds(60))) {
                    signIn(email);
                    cached = CACHE.get(key(email));
                }
            }
        }
        return cached.tokens().accessToken();
    }

    /** Forget all cached tokens (for example after a sandbox reset, which deletes every session). */
    public static void clearCache() {
        CACHE.clear();
    }

    // ---- rate limit ------------------------------------------------------------------------------

    /**
     * Repeats a sign-in call when Ice Bank answers 429 (more than 10 sign-in calls a minute from this machine).
     * This is the only place in the project that waits for a fixed time, and only because the server says
     * exactly how long in its {@code Retry-After} header. UI and test code use explicit waits instead.
     * Public so a test can wrap its own raw {@link #login} call: {@code retryIfRateLimited(() -> login(email, "wrong"))}.
     */
    public static Response retryIfRateLimited(Supplier<Response> call) {
        Response response = call.get();
        for (int i = 0; i < MAX_RATE_LIMIT_RETRIES && response.statusCode() == 429; i++) {
            long seconds = Math.min(60, Long.parseLong(response.header("Retry-After") == null ? "5" : response.header("Retry-After")));
            log.warn("Sign-in rate limit reached (429), waiting {} s as Retry-After asks", seconds);
            try {
                TimeUnit.SECONDS.sleep(seconds);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return response;
            }
            response = call.get();
        }
        return response;
    }

    private static String key(String email) {
        return email.trim().toLowerCase();
    }
}
