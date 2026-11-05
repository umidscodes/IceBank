package com.icebank.ui.pages;

import com.icebank.config.Config;
import com.icebank.ui.DriverFactory;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

/**
 * Shared helpers for page objects. Every element is found through {@code data-testid}
 * (the full list is in docs/LOCATORS.md of the Ice Bank repo), and every lookup waits explicitly.
 */
public abstract class BasePage {

    protected final WebDriver driver;
    protected final WebDriverWait wait;

    protected BasePage(WebDriver driver) {
        this.driver = driver;
        this.wait = DriverFactory.waitFor(driver);
    }

    /** {@code [data-testid="login-email-input"]}. */
    public static By testId(String id) {
        return By.cssSelector("[data-testid=\"" + id + "\"]");
    }

    /** Opens a path of the web app, e.g. {@code "/login"}. */
    protected void openPath(String path) {
        driver.get(Config.baseUrl() + path);
    }

    /** Waits until the element is visible and returns it. */
    protected WebElement visible(By locator) {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    /** Waits until the element is visible and enabled, then clicks it. */
    protected void click(By locator) {
        wait.until(ExpectedConditions.elementToBeClickable(locator)).click();
    }

    /** Waits for the field, clears it and types {@code text}. */
    protected void type(By locator, String text) {
        WebElement field = visible(locator);
        field.clear();
        field.sendKeys(text);
    }

    /** Visible text of an element, after waiting for it. */
    protected String text(By locator) {
        return visible(locator).getText().trim();
    }

    /** Waits until the browser URL contains {@code fragment}, e.g. {@code "/dashboard"}. */
    protected void waitForUrlContains(String fragment) {
        wait.until(ExpectedConditions.urlContains(fragment));
    }
}
