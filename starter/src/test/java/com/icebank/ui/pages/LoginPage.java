package com.icebank.ui.pages;

import io.qameta.allure.Step;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/** {@code /login}: step 1 of sign-in (email and password). */
public class LoginPage extends BasePage {

    private static final By FORM = testId("login-form");
    private static final By EMAIL = testId("login-email-input");
    private static final By PASSWORD = testId("login-password-input");
    private static final By SUBMIT = testId("login-submit-button");
    private static final By ERROR = testId("login-error");

    public LoginPage(WebDriver driver) {
        super(driver);
    }

    @Step("Open the login page")
    public LoginPage open() {
        openPath("/login");
        visible(FORM);
        return this;
    }

    /** Fills in email and password and submits. Use when the password is right: returns the OTP page. */
    @Step("Sign in with email {email}")
    public OtpPage signIn(String email, String password) {
        submit(email, password);
        return new OtpPage(driver).waitUntilOpen();
    }

    /** Fills in and submits without expecting success (for negative tests). */
    public LoginPage submit(String email, String password) {
        type(EMAIL, email);
        type(PASSWORD, password);
        click(SUBMIT);
        return this;
    }

    /** The error message shown under the form, e.g. "Invalid email or password." */
    public String errorText() {
        return text(ERROR);
    }
}
