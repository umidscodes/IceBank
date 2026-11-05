package com.icebank.ui;

import io.qameta.allure.Allure;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.AfterTestExecutionCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.ParameterContext;
import org.junit.jupiter.api.extension.ParameterResolver;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

/**
 * JUnit 5 extension for UI tests: a fresh Chrome per test, passed in as a parameter, with a screenshot,
 * the URL and the page source attached to the Allure report when the test fails. Chrome is always closed.
 *
 * <pre>
 * &#64;ExtendWith(DriverExtension.class)
 * class LoginUiTest {
 *     &#64;Test
 *     void signIn(WebDriver driver) { ... }
 * }
 * </pre>
 */
public class DriverExtension implements BeforeEachCallback, AfterTestExecutionCallback, AfterEachCallback, ParameterResolver {

    private static final ExtensionContext.Namespace NS = ExtensionContext.Namespace.create(DriverExtension.class);
    private static final String KEY = "driver";

    @Override
    public void beforeEach(ExtensionContext context) {
        context.getStore(NS).put(KEY, DriverFactory.create());
    }

    @Override
    public void afterTestExecution(ExtensionContext context) {
        WebDriver driver = driver(context);
        if (driver != null && context.getExecutionException().isPresent()) {
            try {
                Allure.addAttachment("URL at failure", "text/plain", String.valueOf(driver.getCurrentUrl()));
                byte[] png = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
                Allure.addAttachment("Screenshot at failure", "image/png", new ByteArrayInputStream(png), "png");
                Allure.addAttachment("Page source at failure", "text/html",
                        new ByteArrayInputStream(driver.getPageSource().getBytes(StandardCharsets.UTF_8)), "html");
            } catch (RuntimeException e) {
                Allure.addAttachment("Could not capture the browser", "text/plain", e.toString());
            }
        }
    }

    @Override
    public void afterEach(ExtensionContext context) {
        WebDriver driver = context.getStore(NS).remove(KEY, WebDriver.class);
        if (driver != null) {
            driver.quit();
        }
    }

    @Override
    public boolean supportsParameter(ParameterContext parameterContext, ExtensionContext extensionContext) {
        return parameterContext.getParameter().getType() == WebDriver.class;
    }

    @Override
    public Object resolveParameter(ParameterContext parameterContext, ExtensionContext extensionContext) {
        return driver(extensionContext);
    }

    private static WebDriver driver(ExtensionContext context) {
        return context.getStore(NS).get(KEY, WebDriver.class);
    }
}
