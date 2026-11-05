package com.icebank.ui.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/** {@code /dashboard}: the customer's accounts after sign-in. */
public class DashboardPage extends BasePage {

    private static final By GREETING = testId("dashboard-greeting");
    private static final By DEPOSIT_ACCOUNTS = testId("dashboard-deposit-accounts");
    private static final By NET_TOTAL = testId("dashboard-net-total");

    public DashboardPage(WebDriver driver) {
        super(driver);
    }

    /** Waits until the URL is /dashboard and the accounts have loaded (they arrive after the page shell). */
    public DashboardPage waitUntilLoaded() {
        waitForUrlContains("/dashboard");
        visible(DEPOSIT_ACCOUNTS);
        return this;
    }

    /** The heading, e.g. "Good day, Emma". */
    public String greeting() {
        return text(GREETING);
    }

    /**
     * The balance shown on an account card, as text such as "$5,703.95". {@code balanceKey} is the account type in
     * lower case: {@code "chequing"} for {@code account-balance-chequing}, {@code "chequing-2"} for a second chequing.
     */
    public String balanceText(String balanceKey) {
        return text(testId("account-balance-" + balanceKey));
    }

    /** "Net total (CAD)": deposit balances minus amounts owing. */
    public String netTotalText() {
        return text(NET_TOTAL);
    }

    /** Whether the card for account {@code accountId} is shown. */
    public boolean showsAccount(long accountId) {
        return !driver.findElements(testId("account-card-" + accountId)).isEmpty();
    }
}
