package com.icebank.config;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.Properties;

/**
 * Typed access to the environment the tests run against.
 *
 * <p>Pick the environment with {@code -Denv=local} (default) or {@code -Denv=qa}. The values come from
 * {@code src/test/resources/config/{env}.properties}. Each key can be overridden, highest priority first:
 * <ol>
 *   <li>a system property with the same name: {@code -DbaseUrl=http://127.0.0.1:3000}</li>
 *   <li>an environment variable {@code ICEBANK_} + the key in UPPER_SNAKE_CASE:
 *       {@code sandboxKey} is read from {@code ICEBANK_SANDBOX_KEY}</li>
 *   <li>a git-ignored {@code config/{env}.local.properties} file (put your QA secrets here)</li>
 *   <li>{@code config/{env}.properties}</li>
 * </ol>
 *
 * <p>Fail fast: a missing key, or a value still containing {@code CHANGE_ME}, throws a clear
 * {@link IllegalStateException} on first use instead of a confusing failure later.
 */
public final class Config {

    private static final String PLACEHOLDER = "CHANGE_ME";
    private static final String ENV = System.getProperty("env", "local").trim().toLowerCase(Locale.ROOT);
    private static final Properties FILE = load("config/" + ENV + ".properties", true);
    private static final Properties LOCAL_FILE = load("config/" + ENV + ".local.properties", false);

    private Config() {
    }

    // ---- typed values ----------------------------------------------------------------------------

    /** {@code local} or {@code qa}. */
    public static String env() {
        return ENV;
    }

    public static boolean isLocal() {
        return "local".equals(ENV);
    }

    /** Web app root, e.g. {@code http://localhost:3000}. The REST API is under {@code /api/v1}. */
    public static String baseUrl() {
        return stripTrailingSlash(get("baseUrl"));
    }

    public static int sandboxId() {
        return Integer.parseInt(get("sandboxId"));
    }

    /** Header value for {@code X-Sandbox-Key}. Secret on QA. */
    public static String sandboxKey() {
        return get("sandboxKey");
    }

    /** {@code ""} locally, e.g. {@code "+s3"} on QA. */
    public static String emailSuffix() {
        return getOrDefault("emailSuffix", "");
    }

    /** The password every seeded persona uses. */
    public static String personaPassword() {
        return get("personaPassword");
    }

    public static String jdbcUrl() {
        return get("jdbcUrl");
    }

    /** Read-only database user ({@code qa_reader}). */
    public static String dbUser() {
        return get("dbUser");
    }

    public static String dbPassword() {
        return get("dbPassword");
    }

    /** Read-write database user ({@code qa_writer}); empty when the environment has none (QA). */
    public static Optional<String> dbWriterUser() {
        return Optional.of(getOrDefault("dbWriterUser", "")).filter(s -> !s.isBlank());
    }

    public static String dbWriterPassword() {
        return getOrDefault("dbWriterPassword", "");
    }

    /** True when a writer user is configured, i.e. tests that need {@code qa_writer} can run. */
    public static boolean hasDbWriter() {
        return dbWriterUser().isPresent();
    }

    /** Run Chrome without a window. {@code -Dheadless=true} overrides the file. */
    public static boolean headless() {
        return Boolean.parseBoolean(getOrDefault("headless", "false"));
    }

    /** How long explicit waits in the page objects wait. */
    public static Duration uiTimeout() {
        return Duration.ofSeconds(Long.parseLong(getOrDefault("uiTimeoutSeconds", "10")));
    }

    // ---- generic access --------------------------------------------------------------------------

    /** The value for {@code key}, after overrides. Throws if it is missing or still a placeholder. */
    public static String get(String key) {
        String value = lookup(key);
        if (value == null) {
            throw new IllegalStateException("Config key '" + key + "' is missing for env '" + ENV
                    + "'. Add it to src/test/resources/config/" + ENV + ".properties or set " + envVarName(key) + ".");
        }
        if (value.contains(PLACEHOLDER)) {
            throw new IllegalStateException("Config key '" + key + "' for env '" + ENV + "' is still a placeholder (" + value
                    + "). Put the real value in src/test/resources/config/" + ENV + ".local.properties or set "
                    + envVarName(key) + ". See starter/README.md, section Environments.");
        }
        return value.trim();
    }

    /** Like {@link #get(String)}, but returns {@code fallback} when the key is not set at all. */
    public static String getOrDefault(String key, String fallback) {
        return lookup(key) == null ? fallback : get(key);
    }

    /** {@code sandboxKey} -> {@code ICEBANK_SANDBOX_KEY}. */
    public static String envVarName(String key) {
        return "ICEBANK_" + key.replaceAll("([a-z0-9])([A-Z])", "$1_$2").replace('.', '_').toUpperCase(Locale.ROOT);
    }

    // ---- internals -------------------------------------------------------------------------------

    private static String lookup(String key) {
        String sys = System.getProperty(key);
        if (sys != null) {
            return sys;
        }
        String envVar = System.getenv(envVarName(key));
        if (envVar != null) {
            return envVar;
        }
        String local = LOCAL_FILE.getProperty(key);
        if (local != null) {
            return local;
        }
        return FILE.getProperty(key);
    }

    private static Properties load(String resource, boolean required) {
        Properties p = new Properties();
        try (InputStream in = Config.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                if (required) {
                    throw new IllegalStateException("Missing " + resource + " on the classpath. Valid values for -Denv are the file names in "
                            + "src/test/resources/config (local, qa).");
                }
                return p;
            }
            p.load(in);
            return p;
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + resource, e);
        }
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
