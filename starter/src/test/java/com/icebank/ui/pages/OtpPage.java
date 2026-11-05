package com.icebank.ui.pages;

import io.qameta.allure.Step;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/** {@code /login/verify}: step 2 of sign-in (the 6-digit code from Ice Mail). */
public class OtpPage extends BasePage {

    private static final By FORM = testId("otp-form");
    private static final By EMAIL = testId("otp-email");
    private static final By CODE = testId("otp-code-input");
    private static final By SUBMIT = testId("otp-submit-button");
    private static final By ERROR = testId("otp-error");

    public OtpPage(WebDriver driver) {
        super(driver);
    }

    /** Waits until the browser is on the OTP page. */
    public OtpPage waitUntilOpen() {
        waitForUrlContains("/login/verify");
        visible(FORM);
        return this;
    }

    /** The email the page says the code was sent to. */
    public String shownEmail() {
        return text(EMAIL);
    }

    /** Types the code and submits. Use with the right code: returns the loaded dashboard. */
    @Step("Enter the one-time code")
    public DashboardPage enterCode(String code) {
        submitCode(code);
        return new DashboardPage(driver).waitUntilLoaded();
    }

    /** Types the code and submits without expecting success (for negative tests). */
    public OtpPage submitCode(String code) {
        type(CODE, code);
        click(SUBMIT);
        return this;
    }

    /** The error shown for a wrong or expired code. */
    public String errorText() {
        return text(ERROR);
    }
}
