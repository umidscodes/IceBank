package com.icebank.ui;

import com.icebank.config.Config;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeDriverService;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.time.Duration;
import java.util.Arrays;

/**
 * Creates Chrome sessions for UI tests.
 *
 * <p><strong>Which chromedriver?</strong> By default Selenium Manager (built into Selenium 4) finds or downloads a
 * driver that matches your Chrome; it needs internet the first time. To use a driver you installed yourself:
 * <ul>
 *   <li>{@code -Dwebdriver.chrome.driver=/path/to/chromedriver} (Selenium reads this system property), or</li>
 *   <li>environment variable {@code CHROMEDRIVER=/path/to/chromedriver}.</li>
 * </ul>
 * Optional: {@code CHROME_BINARY} (or {@code -DchromeBinary=...}) picks the Chrome executable, and
 * {@code -DchromeArgs=--no-sandbox,--lang=en-CA} adds browser arguments.
 *
 * <p><strong>Waits:</strong> the implicit wait is 0 on purpose. Mixing implicit and explicit waits makes timings
 * unpredictable, so every wait is explicit: {@link #waitFor(WebDriver)} and the helpers in {@code BasePage}.
 */
public final class DriverFactory {

    private static final Logger log = LoggerFactory.getLogger(DriverFactory.class);

    private DriverFactory() {
    }

    /** A new Chrome session (headless when {@code headless=true} or {@code -Dheadless=true}). Call {@code quit()} when done. */
    public static WebDriver create() {
        ChromeOptions options = new ChromeOptions();
        if (Config.headless()) {
            options.addArguments("--headless=new");
        }
        options.addArguments("--window-size=1366,900", "--lang=en-CA", "--disable-search-engine-choice-screen");
        String extra = Config.getOrDefault("chromeArgs", "");
        if (!extra.isBlank()) {
            options.addArguments(Arrays.stream(extra.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
        }
        String binary = firstNonBlank(System.getProperty("chromeBinary"), System.getenv("CHROME_BINARY"));
        if (binary != null) {
            options.setBinary(binary);
        }

        String driverPath = firstNonBlank(System.getProperty(ChromeDriverService.CHROME_DRIVER_EXE_PROPERTY), System.getenv("CHROMEDRIVER"));
        WebDriver driver;
        if (driverPath != null) {
            log.info("Starting Chrome (headless={}) with chromedriver {}", Config.headless(), driverPath);
            ChromeDriverService service = new ChromeDriverService.Builder().usingDriverExecutable(new File(driverPath)).build();
            driver = new ChromeDriver(service, options);
        } else {
            log.info("Starting Chrome (headless={}), driver from Selenium Manager", Config.headless());
            driver = new ChromeDriver(options);
        }
        driver.manage().timeouts().implicitlyWait(Duration.ZERO);
        driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(30));
        return driver;
    }

    /** An explicit wait with the configured timeout ({@code uiTimeoutSeconds}). */
    public static WebDriverWait waitFor(WebDriver driver) {
        return waitFor(driver, Config.uiTimeout());
    }

    /** An explicit wait with your own timeout, e.g. for the 1-3 s "Processing" state of a transfer. */
    public static WebDriverWait waitFor(WebDriver driver, Duration timeout) {
        return new WebDriverWait(driver, timeout);
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }
}
