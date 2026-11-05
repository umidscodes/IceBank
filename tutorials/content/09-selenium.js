/* Tutorial 9: Selenium against Ice Bank. Java examples: Selenium 4, JUnit 5, AssertJ, Allure, built on the starter project's DriverFactory, DriverExtension and page objects. */
(window.ICEBANK = window.ICEBANK || { tutorials: [] }).tutorials.push({
  id: "selenium",
  number: 9,
  title: "Selenium against Ice Bank",
  summary: "Apply your Selenium skills to a realistic bank: page objects on the starter, test-id locators, waits for async work, API-assisted setup, wizards, widgets, files, tabs, frames, dialogs, a dynamic table and a page with no test ids.",
  intro: `
<p>You already know Selenium: locators, waits, page objects, JUnit. This tutorial is about applying it to an application that was built to be hard in
realistic ways. Ice Bank has every classic UI-automation problem in the place a real bank would have it: a "Processing" state on transfers, toasts that
vanish after 4 seconds, a 4-step registration wizard, an autocomplete that shows stale results while it searches, a custom date picker, cheque uploads,
CSV and PDF downloads, Ice Mail in a new tab, a calculator in an iframe, a native <code>confirm()</code>, hover menus, a sortable and paginated table,
a session-timeout modal and a "Classic view" with no test ids at all.</p>
<p>Every lesson builds on the <strong>starter project</strong> (<code>starter/</code> in the Ice Bank repo): <code>DriverFactory</code>, <code>DriverExtension</code>,
<code>BasePage</code>, <code>LoginPage</code>, <code>OtpPage</code>, <code>DashboardPage</code> and <code>LoginUiTest</code>. The page objects and tests in the
examples are meant to be added to that project; they were run headless against a local Ice Bank (Chrome, Selenium 4.52, JUnit 5) and passed.</p>
<div class="callout rule"><p><strong>Test data rules for every lesson.</strong> Tests that change data (transfers, payees, deposits, e-Transfers, Classic view) use a
<strong>new customer they register themselves</strong> through the API. Emma is used read-only (her history, statements and table). Never change a persona's
password, email, Classic view setting or card state, and never call <code>/test/reset</code> or move the clock from a UI test: other people share the sandbox.</p></div>
<div class="callout"><p><strong>Running the examples.</strong> From the <code>starter</code> folder: <code>mvn test -Dtest=TransferUiTest</code> (with a window) or
<code>mvn test -Dtest=TransferUiTest -Dheadless=true</code>. All UI tests: <code>mvn test -Dgroups=ui</code>. In PowerShell quote each flag:
<code>mvn test "-Dgroups=ui" "-Dheadless=true"</code>.</p></div>`,
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "page-objects",
      title: "Page objects and the top navigation",
      summary: "Grow the starter's page objects into a set that covers Ice Bank, with components for what every page shares.",
      body: `
<p>The starter already shows the pattern you will repeat for every page: <code>LoginPage.open().signIn(email, password)</code> returns an
<code>OtpPage</code>, and <code>OtpPage.enterCode(code)</code> returns a loaded <code>DashboardPage</code>. Each class knows its own locators (private
<code>By</code> constants built with <code>testId(...)</code>), waits inside its methods, and returns the page the user lands on. Tests read like the
user's journey and contain only steps and assertions.</p>

<h3>The rules this project uses</h3>
<ul>
<li><strong>One class per page</strong> (<code>TransferPage</code>, <code>PayeesPage</code>, <code>AccountPage</code>), plus <strong>components</strong> for parts that
appear on many pages: the top navigation, the toasts, the user menu, the session-timeout modal.</li>
<li><strong>Methods are user actions or things a user can read</strong>: <code>fill(...)</code>, <code>confirm()</code>, <code>reference()</code>,
<code>rows()</code>. They return <code>this</code>, the next page, or plain values (<code>String</code>, records). Not <code>WebElement</code>s, except in rare
helper cases.</li>
<li><strong>No assertions in page objects.</strong> A page object that asserts hides the expected value from the test and makes negative tests impossible.
It may <em>wait</em> for its own state (that is not an assertion, it is synchronisation).</li>
<li><strong>Every page has a "loaded" check</strong> (<code>waitUntilLoaded()</code>): a URL fragment and an element that only appears when the data has
arrived. Ice Bank navigates client-side (Next.js), so a click returns <em>before</em> the new page is there.</li>
<li><strong>Locators are private constants</strong>, built on the <code>data-testid</code> contract (next lesson). Tests never contain locators.</li>
</ul>

<h3>Helpers worth adding to <code>BasePage</code></h3>
<p>The starter's <code>BasePage</code> has <code>visible</code>, <code>click</code>, <code>type</code>, <code>text</code> and <code>waitForUrlContains</code>.
The pages in this tutorial also need a native select, a hover, "wait until gone", a wait with its own timeout and a safe way to replace text in a field
that React controls (lesson 6 explains why <code>clear()</code> is not enough there). Add them once, in the base class.</p>

<h3>Worked example: the top navigation</h3>
<p>The signed-in header has four menus (Accounts, Move money, Pay bills, Loans) whose links only show while the menu is open. They open on CSS
<code>:hover</code> and also on keyboard focus (<code>:focus-within</code>). A <code>TopNav</code> component hides how: the test says
<code>nav.go(Menu.MOVE_MONEY, "nav-link-transfer")</code>.</p>
<p>Hovering uses the Actions API: <code>new Actions(driver).moveToElement(button).perform()</code>. In a normal (headed) Chrome that opens the menu.
In <strong>headless</strong> Chrome on a machine without a mouse, Chrome reports that there is no hover-capable pointer, and Ice Bank's CSS (Tailwind) only
applies hover styles when there is one, so the menu stays closed. You can see it in the console: <code>matchMedia('(hover: hover)').matches</code> is
<code>false</code> in that headless browser. <code>TopNav.open()</code> therefore hovers first and, if the dropdown does not appear within a second,
clicks the button: focus opens the same menu, which is exactly what a keyboard user does. Both paths end with the same visible link.</p>
<pre role="img" aria-label="Diagram: test calls TopNav.go, which hovers the menu button, falls back to focus, waits for the dropdown and clicks the link" style="background:#F5F9FC;border:1px solid #DCE6EF;border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:0.82rem;line-height:1.45;margin:0 0 16px">
 test:    nav.go(Menu.MOVE_MONEY, "nav-link-transfer")
 TopNav:  hover(nav-menu-move-money) ──> dropdown visible within 1 s? ──yes──> click(nav-link-transfer)
                                               │ no (headless: no hover)
                                               └──> click(nav-menu-move-money) = focus ──> dropdown visible
 test:    new TransferPage(driver).waitUntilLoaded()      (the click returns before the page is there)
</pre>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Asserting right after a navigation click: <code>assertThat(driver.getCurrentUrl()).endsWith("/bills/payees")</code> fails, because the URL changes a
moment later. Wait for the destination page (<code>new PayeesPage(driver).waitUntilLoaded()</code>), then assert.</li>
<li>Clicking a menu link without opening the menu: <code>ElementNotInteractableException</code>, the link exists in the DOM but is hidden.</li>
<li>Using JavaScript (<code>arguments[0].click()</code>) to click hidden links. It "works" and proves nothing about what a user can do.</li>
<li>Page objects that return <code>WebElement</code> so the test can "just click it": the locator and the waiting leak into every test.</li>
<li>One huge <code>BankPage</code> with 200 methods. Split by page; share through components.</li>
</ul></div>`,
      examples: [
        {
          title: "BasePage: helpers added for this tutorial",
          lang: "java",
          code: `
/** A native {@code <select>}, after waiting for it. */
protected Select select(By locator) {
    return new Select(visible(locator));
}

/** Moves the mouse over an element (opens CSS :hover menus). */
protected void hover(By locator) {
    new Actions(driver).moveToElement(visible(locator)).perform();
}

/** Waits until the element is gone or hidden. */
protected void waitUntilGone(By locator) {
    wait.until(ExpectedConditions.invisibilityOfElementLocated(locator));
}

/**
 * Replaces the text of a field that may already hold text. clear() empties the DOM value without telling
 * React, so React puts the old text back and the next sendKeys appends to it. Backspaces are real key
 * presses, so the page's onChange sees every change.
 */
protected void replaceText(By locator, String text) {
    WebElement field = visible(locator);
    String current = field.getDomProperty("value");
    field.sendKeys(Keys.END);
    if (current != null && !current.isEmpty()) {
        field.sendKeys(Keys.BACK_SPACE.toString().repeat(current.length()));
    }
    field.sendKeys(text);
}

/** A wait with its own timeout, for things slower or faster than the default. */
protected WebDriverWait waitFor(Duration timeout) {
    return new WebDriverWait(driver, timeout);
}`,
          note: "Add these below the starter's helpers. Imports: <code>org.openqa.selenium.Keys</code>, <code>interactions.Actions</code>, <code>support.ui.Select</code>, <code>java.time.Duration</code>.",
        },
        {
          title: "TopNav component (ui/components/TopNav.java)",
          lang: "java",
          code: `
package com.icebank.ui.components;

import com.icebank.ui.pages.BasePage;
import io.qameta.allure.Step;
import org.openqa.selenium.By;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;

import java.time.Duration;
import java.util.List;

/**
 * The top navigation of every signed-in page. "Accounts", "Move money", "Pay bills" and "Loans" open their links
 * on CSS :hover, so the link is not visible (and not clickable) until the mouse is over the menu button.
 */
public class TopNav extends BasePage {

    public enum Menu {
        ACCOUNTS("nav-menu-accounts"), MOVE_MONEY("nav-menu-move-money"), BILLS("nav-menu-bills"), LOANS("nav-menu-loans");

        final String testId;

        Menu(String testId) {
            this.testId = testId;
        }
    }

    public TopNav(WebDriver driver) {
        super(driver);
    }

    /** Hovers {@code menu}, waits for the dropdown, clicks the link {@code linkTestId} (e.g. "nav-link-transfer"). */
    @Step("Navigate: {menu} > {linkTestId}")
    public void go(Menu menu, String linkTestId) {
        open(menu);
        click(testId(linkTestId));
    }

    /** The texts of the links in a menu, read while it is open. */
    public List<String> linkTexts(Menu menu) {
        return open(menu).findElements(By.cssSelector("[role='menuitem']")).stream().map(e -> e.getText().trim()).toList();
    }

    /**
     * Opens a menu and returns its dropdown. First the mouse way (hover). If the dropdown does not show within a
     * second, the keyboard way: focusing the button opens it too (CSS :focus-within). Headless Chrome on a machine
     * without a mouse reports "no hover-capable pointer", and the app only applies :hover styles when there is one.
     */
    public WebElement open(Menu menu) {
        By button = testId(menu.testId);
        By dropdown = testId(menu.testId + "-dropdown");
        hover(button);
        if (!shownWithin(dropdown, Duration.ofSeconds(1))) {
            click(button);
        }
        return visible(dropdown);
    }

    private boolean shownWithin(By locator, Duration timeout) {
        try {
            waitFor(timeout).until(ExpectedConditions.visibilityOfElementLocated(locator));
            return true;
        } catch (TimeoutException e) {
            return false;
        }
    }
}`,
        },
        {
          title: "A test that uses it",
          lang: "java",
          code: `
@Test
@DisplayName("The Move money menu lists the five money pages and opens the transfer page")
void moveMoneyMenu(WebDriver driver) {
    UiSession.signIn(driver, customer.email());
    TopNav nav = new TopNav(driver);

    assertThat(nav.linkTexts(Menu.MOVE_MONEY)).containsExactly(
            "Transfer between my accounts", "Send Interac e-Transfer", "Received e-Transfers", "e-Transfer contacts", "Autodeposit");
    nav.go(Menu.BILLS, "nav-link-bills-payees");
    new PayeesPage(driver).waitUntilLoaded();          // wait for the destination, then assert
    assertThat(driver.getCurrentUrl()).endsWith("/bills/payees");
}`,
          note: "<code>UiSession.signIn</code> signs the browser in through the API (lesson 4). <code>PayeesPage.waitUntilLoaded()</code> waits for the URL and the add-payee form.",
        },
      ],
      exercises: [
        "Add the <code>BasePage</code> helpers and <code>TopNav</code> to your project. Write one parameterized test that opens each of the four menus and checks the exact link texts, in order.",
        "Write a <code>TransferPage</code> page object (form, review, confirm, confirmation) whose public methods return <code>this</code>, the next page or plain values, with no assertions inside. Use it in a test that moves 1.00 between two accounts of a new customer.",
        "Write a <code>UserMenu</code> component (the name at the top right, Profile, API (Swagger), Sign out). Test that signing out from it lands on <code>/login?signedOut=1</code> and shows the notice \"You have signed out. See you soon!\".",
        "Pick <code>DashboardPage.waitUntilLoaded()</code> and <code>OtpPage.waitUntilOpen()</code> in the starter. For each, write down what it waits for and which test step would fail (and how) if the wait were removed.",
      ],
      quiz: [
        {
          q: "A page object method <code>confirm()</code> clicks Confirm on the transfer page. What should it return?",
          options: [
            "<code>this</code> (or a confirmation object), after waiting until the confirmation or the error is shown",
            "<code>void</code>; the test checks the result itself",
            "The confirmation <code>WebElement</code>, so the test can read it",
            "<code>true</code> if the transfer worked",
          ],
          answer: 0,
          explain: "Return something the test can keep using, and wait for the end state inside. Whether it worked is the test's assertion, not the page object's.",
        },
        {
          q: "Your hover-menu test passes in a normal Chrome window and fails with <code>headless=true</code> on the same laptop. The most likely reason in Ice Bank is:",
          options: [
            "Headless Chrome cannot run JavaScript",
            "The window is too small in headless mode",
            "Headless Chrome reports no hover-capable pointer, so the app's :hover styles never apply",
            "Actions is not supported in headless mode",
          ],
          answer: 2,
          explain: "<code>matchMedia('(hover: hover)')</code> is false there and Tailwind only applies hover styles when it is true. The menu also opens on focus, which works everywhere.",
        },
        {
          q: "Where does the check \"the confirmation shows $1.00\" belong?",
          options: [
            "In <code>TransferPage.confirm()</code>",
            "In <code>BasePage</code>, so every page can use it",
            "In a JUnit extension",
            "In the test, using a value the page object returns",
          ],
          answer: 3,
          explain: "Page objects expose state (<code>confirmedAmount()</code>); tests decide what is expected.",
        },
        {
          q: "After <code>nav.go(Menu.BILLS, \"nav-link-bills-payees\")</code> the next line reads the URL and sometimes sees /dashboard. Fix?",
          options: [
            "<code>Thread.sleep(1000)</code> after the click",
            "Wait for the destination page's own element and URL before reading anything",
            "Use <code>driver.navigate().refresh()</code>",
            "Set an implicit wait of 10 seconds",
          ],
          answer: 1,
          explain: "Ice Bank navigates client-side; the click returns immediately. Wait for the page you expect, by something only that page has.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "locators",
      title: "Locator strategy: the data-testid contract",
      summary: "Use the test ids as a contract, build dynamic ids from API data, scope inside rows, and know when CSS or XPath is the right tool.",
      links: [
        {
          label: "Open the dashboard",
          href: "http://localhost:3000/dashboard",
        },
      ],
      body: `
<p>Ice Bank gives every interactive element and every value a test reads a <code>data-testid</code> in kebab-case: <code>transfer-amount-input</code>,
<code>account-balance-chequing</code>, <code>toast-success</code>. The full list, grouped by page, is in <code>docs/LOCATORS.md</code> in the Ice Bank repo
(generated from the source). Treat it as a <strong>contract</strong> between developers and testers: the layout, the classes and the texts may change, the
test ids do not, unless the contract changes too.</p>

<h3>The order to reach for locators</h3>
<div class="table-wrap"><table>
<thead><tr><th>Choice</th><th>Example</th><th>Use when</th></tr></thead>
<tbody>
<tr><td>1. Test id</td><td><code>[data-testid='transfer-review-button']</code></td><td>Always, when there is one. The starter's <code>testId("...")</code> builds it.</td></tr>
<tr><td>2. Dynamic test id</td><td><code>account-card-</code> + id, <code>transaction-row-</code> + id, <code>date-picker-day-2026-11-07</code></td><td>One element per record. Take the id from the API or the test's own data, never from screen position.</td></tr>
<tr><td>3. Scoped search</td><td><code>card.findElement(testId("account-name-" + id))</code></td><td>The same test id repeats in every row (<code>transaction-amount</code>, <code>payee-nickname</code>): find the row first, then search inside it.</td></tr>
<tr><td>4. Prefix match</td><td><code>[data-testid^='transaction-row-']</code></td><td>"All rows", "how many cards".</td></tr>
<tr><td>5. Semantic HTML</td><td><code>label[for='amount']</code>, <code>[role='option']</code>, <code>[aria-sort]</code></td><td>Accessibility attributes are stable and also tell you the state (lesson 11).</td></tr>
<tr><td>6. XPath by text or structure</td><td><code>//th[normalize-space()='Details']</code></td><td>No test ids at all (Classic view, lesson 12), or you must go <em>up</em> the tree (<code>ancestor::</code>).</td></tr>
</tbody></table></div>

<h3>CSS or XPath?</h3>
<p>CSS is shorter and fast, and covers attributes, descendants and prefixes. XPath can do three things CSS cannot: match visible <strong>text</strong>
(<code>normalize-space()='Pay'</code>), walk <strong>up</strong> (<code>ancestor::th</code>), and pick elements by what they <strong>contain</strong>
(<code>//tr[td[1]//b[.='Hydro']]</code>). Use CSS by default and XPath when you need one of those. Check both in DevTools first, with
<code>$$("css")</code> and <code>$x("xpath")</code> (Tutorial 3).</p>

<h3>Worked example: one account card</h3>
<p>The dashboard has a card per account: <code>account-card-{id}</code>, and inside it <code>account-name-{id}</code> and a balance. The balance id uses the
account <em>type</em> (<code>account-balance-chequing</code>, <code>account-balance-chequing-2</code> for a second chequing), which is what
<code>DashboardPage.balanceText("chequing")</code> reads. The test below takes the id from the customer it registered, finds the card, and searches
inside it. It also shows that a CSS and an XPath locator can point at the very same node: Selenium's <code>WebElement.equals</code> compares element
references.</p>

<div class="callout"><p><strong>Two Ice Bank details that bite.</strong> (1) Account names on screen are <em>nickname + last 4 digits</em> ("Rainy day 5838",
"Chequing 7919"), so match names with <code>starts-with</code>, or better, by id. (2) Some texts are visually hidden for screen readers (the
autocomplete's status line). <code>getText()</code> returns only <em>visible</em> text; read <code>getDomProperty("textContent")</code> for those.</p></div>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Tailwind classes as locators: <code>By.className("text-2xl")</code> matches every big number on the page and breaks on the next restyle.</li>
<li>Position-based paths: <code>//main/div[2]/section[1]//p[2]</code> or <code>tr:nth-child(3)</code>. Data and layout move; ids do not.</li>
<li>Texts that contain live data: <code>selectByVisibleText("Chequing 7919 - $5,703.95")</code> breaks as soon as the balance changes. Select by value (the account id).</li>
<li>Searching the whole page inside a row loop: <code>driver.findElement(testId("transaction-amount"))</code> always returns the <em>first</em> row's amount. Use <code>row.findElement(...)</code>.</li>
<li>Testing for absence with <code>findElement</code> and a try/catch. Use <code>findElements(...).isEmpty()</code>, or a wait for invisibility.</li>
</ul></div>`,
      examples: [
        {
          title: "Dynamic ids, scoping, CSS and XPath for the same node",
          lang: "java",
          code: `
@Test
@DisplayName("Locators: a dynamic test id, scoping inside a card, and the same element by CSS and XPath")
void dashboardLocators(WebDriver driver) {
    DashboardPage dashboard = UiSession.signIn(driver, customer.email());
    long id = customer.chequingId();

    WebElement card = driver.findElement(testId("account-card-" + id));                  // id from the API, not from the screen
    String name = card.findElement(testId("account-name-" + id)).getText();               // search INSIDE the card
    assertThat(name).startsWith("Chequing ");
    assertThat(dashboard.balanceText("chequing")).isEqualTo("$0.00");

    WebElement byCss = driver.findElement(By.cssSelector("[data-testid='account-card-" + id + "'] [data-testid='account-balance-chequing']"));
    WebElement byXpath = driver.findElement(By.xpath("//*[@data-testid='account-card-" + id + "']//*[@data-testid='account-balance-chequing']"));
    assertThat(byCss).isEqualTo(byXpath);                                                  // the same DOM node
    assertThat(driver.findElements(By.cssSelector("[data-testid^='account-card-']"))).hasSize(1);
}`,
        },
        {
          title: "CSS and XPath side by side (all checked on Ice Bank pages)",
          lang: "text",
          code: `
What you want                              CSS                                                  XPath
one element by test id                     [data-testid='transfer-amount-input']                 //*[@data-testid='transfer-amount-input']
inside a container                         [data-testid='transfer-form'] button[type='submit']  //*[@data-testid='transfer-form']//button[@type='submit']
every row of the transactions table        [data-testid^='transaction-row-']                     //*[starts-with(@data-testid,'transaction-row-')]
a label by its for attribute / by its text label[for='amount']                                    //label[normalize-space()='Amount (CAD)']
the header cell of a sort button           (not possible: CSS cannot go up)                      //*[@data-testid='transactions-sort-amount']/ancestor::th
a card that CONTAINS a given name          (no text matching in CSS)                             //*[starts-with(@data-testid,'account-card-')][.//*[starts-with(normalize-space(),'Rainy day ')]]`,
        },
        {
          title: "Reading hidden text and attributes",
          lang: "java",
          code: `
/**
 * Types a search and waits until the results for THIS text are in. The list keeps showing the previous
 * results while a new search runs (250 ms debounce + the request), so waiting for "any option" is not enough.
 */
public List<String> search(String text) {
    replaceText(SEARCH, text);
    // The status line is visually hidden (sr-only, for screen readers): getText() returns only VISIBLE text,
    // so read the DOM property textContent instead.
    wait.until(d -> {
        String status = d.findElement(STATUS).getDomProperty("textContent");
        return status != null && status.endsWith("found. Use the up and down arrows to choose.")
                || "No billers match your search.".equals(status);
    });
    return driver.findElements(OPTION).stream()
            .map(o -> o.findElement(testId("biller-option-name")).getText().trim()).toList();
}`,
          note: "From the autocomplete page object (lesson 6). The status line is <code>sr-only</code>: visually hidden, so <code>getText()</code> is empty and <code>textContent</code> is the way to read it.",
        },
      ],
      exercises: [
        "On <code>/transfer</code>, write both a CSS and an XPath locator for: the From select, the To select, the amount field, the Review button, the amount label (by its text) and the memo field (by id). Check each in DevTools with <code>$$</code> and <code>$x</code>, then in a test that asserts each pair finds exactly one and the same element.",
        "Add <code>DashboardPage.accountIds()</code> that returns the ids of all account cards (from the <code>account-card-</code> prefix). Test that for Emma it equals the ids from <code>GET /accounts</code> (read-only).",
        "Without using an account id, write one XPath that finds the balance on the card whose name starts with \"Rainy day\" (Emma's savings), and assert it equals the API balance formatted with <code>TestData.uiMoney</code>.",
        "Explain in two sentences each why <code>By.className(\"text-2xl\")</code>, <code>//main/div[2]/section[1]//p[2]</code> and <code>selectByVisibleText(\"Chequing 7919 - $5,703.95\")</code> are poor locators for Ice Bank, and give the replacement.",
      ],
      quiz: [
        {
          q: "Every row of the transactions table has a cell <code>data-testid=\"transaction-amount\"</code>. How do you read the amount of transaction 123456?",
          options: [
            "<code>driver.findElement(testId(\"transaction-amount\"))</code>",
            "<code>driver.findElements(testId(\"transaction-amount\")).get(123456)</code>",
            "Find <code>transaction-row-123456</code>, then <code>row.findElement(testId(\"transaction-amount\"))</code>",
            "XPath <code>(//td)[123456]</code>",
          ],
          answer: 2,
          explain: "The row id is unique; inside the row the cell test id is unique. Scope, then search.",
        },
        {
          q: "Which can XPath do that CSS cannot?",
          options: [
            "Match an element by its visible text and walk up to an ancestor",
            "Match an attribute prefix",
            "Select descendants",
            "Select by id",
          ],
          answer: 0,
          explain: "Text matching (<code>normalize-space()</code>) and axes like <code>ancestor::</code> are XPath-only.",
        },
        {
          q: "<code>element.getText()</code> returns an empty string for the autocomplete status line, but DevTools shows text in it. Why?",
          options: [
            "The element is stale",
            "The text is in a shadow DOM",
            "Chrome blocks reading aria-live regions",
            "getText() returns only text that is visible to a user; the status is visually hidden (sr-only)",
          ],
          answer: 3,
          explain: "Use <code>getDomProperty(\"textContent\")</code> for text that is intentionally hidden from sight.",
        },
        {
          q: "Where should the id in <code>account-card-{id}</code> come from in a test?",
          options: [
            "From the order of the cards on screen",
            "From the API or from the data the test created",
            "From a constant you copied from the screen once",
            "From the Classic view",
          ],
          answer: 1,
          explain: "Ids from the API are the truth and do not depend on layout or order.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "waits",
      title: "Explicit waits for async work",
      summary: "Wait for the end state of Ice Bank's slow steps: data that arrives after the page, the 1 to 3 s Processing state, and toasts that vanish after 4 s.",
      body: `
<p>The starter sets the implicit wait to <strong>0</strong> and every wait is explicit (<code>DriverFactory.waitFor(driver)</code>, the helpers in
<code>BasePage</code>). That is deliberate: implicit and explicit waits multiply in surprising ways, and an implicit wait hides <em>which</em> condition a
test needs. In Ice Bank you meet four kinds of asynchronous work:</p>
<div class="table-wrap"><table>
<thead><tr><th>What</th><th>Where</th><th>Wait for</th></tr></thead>
<tbody>
<tr><td>Data after the page shell</td><td>Every signed-in page: "Loading your banking…", then the content</td><td>An element that only exists with the data, e.g. <code>dashboard-deposit-accounts</code></td></tr>
<tr><td>Client-side navigation</td><td>Menu and link clicks</td><td>The new page's URL and its own element</td></tr>
<tr><td>Deliberate "Processing" state</td><td>Transfer and e-Transfer confirm: a spinner card for <strong>1 to 3 seconds</strong> (random)</td><td>The confirmation <em>or</em> the error, never "the spinner"</td></tr>
<tr><td>Toasts</td><td>Top right after most actions: <code>toast-success</code>, <code>toast-error</code>, gone after <strong>4 seconds</strong></td><td>The toast with the text you expect; read it straight away</td></tr>
</tbody></table></div>

<h3>Wait for the end state, not the middle</h3>
<p>After a click on Confirm, the page goes form → review → <code>transfer-processing</code> → <code>transfer-confirmation</code> (or back to the form with
<code>transfer-error</code>). Waiting for the spinner to <em>appear</em> is a race: on a fast machine it can come and go between two polls. Waiting for
the spinner to <em>disappear</em> passes at once if it has not appeared yet. The reliable wait is for the state that ends the story:
<code>ExpectedConditions.or(visibilityOf(confirmation), visibilityOf(error))</code>, with a timeout comfortably above 3 seconds plus the network.
Then the test asserts which of the two it got.</p>

<h3>Toasts: read fast, match the text</h3>
<p>A toast is in the DOM for 4 seconds. Two consequences. First, read it immediately after the action, before any slow step. Second, toasts
<strong>stack</strong>: when you send an e-Transfer and then cancel it within 4 seconds, the "sent" toast is still there when the "cancelled" toast
arrives, so "the first success toast" is the wrong one. Wait for a toast with the exact message you expect. If you need to prove that toasts go away,
wait for invisibility with a timeout a bit above 4 seconds.</p>

<h3>Writing your own conditions</h3>
<p><code>wait.until(...)</code> takes any function of the driver that returns a non-null, non-false value. Use lambdas for Ice Bank-specific states
("the table's first row id changed", "the countdown went down by 2"). When elements are being re-rendered while you poll, a found element can vanish
before you read it (<code>StaleElementReferenceException</code>): add <code>.ignoring(StaleElementReferenceException.class)</code> to that wait (lesson 11).</p>

<h3>Worked example: a transfer through the Processing state</h3>
<p><code>TransferPage.confirm()</code> clicks and waits up to 15 seconds for either end state. The test registers its own customer, gives them 100.00 through
a cheque deposit (API), opens a savings account (API), and moves 1.00 in the browser. It checks the confirmation, reads the toast at once, waits for the
toast to go, and finally checks the balance through the API. A second test proves the Processing state really exists by waiting for it to appear and
then disappear, which is fine <em>as a test of the state itself</em> with a short, specific timeout.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li><code>Thread.sleep(3000)</code> "because Processing takes up to 3 s": slow on every run, and still flaky when the server is slow.</li>
<li>Reading the toast after an API call or a page change: it is gone (4 s), and the failure looks random.</li>
<li><code>findElement</code> right after an action that triggers a server call (for example the payee error appears only after the API answered). Use the
waiting helpers (<code>text(...)</code>, <code>visible(...)</code>) for anything that appears later.</li>
<li>One global 60-second timeout "to be safe": every real failure now takes a minute. Keep the default (<code>uiTimeoutSeconds=10</code>) and give the few
slow steps their own timeout.</li>
<li>Waiting for the spinner instead of the outcome.</li>
</ul></div>`,
      examples: [
        {
          title: "TransferPage (ui/pages/TransferPage.java)",
          lang: "java",
          code: `
import java.time.Duration;

/** {@code /transfer}: form, review, a 1 to 3 s "Processing" state, then the confirmation. */
public class TransferPage extends BasePage {

    private static final By FORM = testId("transfer-form");
    private static final By FROM = testId("transfer-from-select");
    private static final By TO = testId("transfer-to-select");
    private static final By AMOUNT = testId("transfer-amount-input");
    private static final By MEMO = testId("transfer-memo-input");
    private static final By REVIEW_BUTTON = testId("transfer-review-button");
    private static final By REVIEW = testId("transfer-review");
    private static final By CONFIRM_BUTTON = testId("transfer-confirm-button");
    private static final By PROCESSING = testId("transfer-processing");
    private static final By CONFIRMATION = testId("transfer-confirmation");
    private static final By ERROR = testId("transfer-error");

    public TransferPage(WebDriver driver) {
        super(driver);
    }

    public TransferPage open() {
        openPath("/transfer");
        return waitUntilLoaded();
    }

    public TransferPage waitUntilLoaded() {
        visible(FORM);
        return this;
    }

    /** Fills the form and goes to the review step. Accounts are chosen by id (the option value), never by label. */
    @Step("Fill in a transfer of {amount} from {fromAccountId} to {toAccountId}")
    public TransferPage fill(long fromAccountId, long toAccountId, String amount, String memo) {
        select(FROM).selectByValue(String.valueOf(fromAccountId));
        select(TO).selectByValue(String.valueOf(toAccountId));
        type(AMOUNT, amount);
        if (memo != null) {
            type(MEMO, memo);
        }
        click(REVIEW_BUTTON);
        visible(REVIEW);
        return this;
    }

    public String reviewAmount() {
        return text(testId("transfer-review-amount"));
    }

    /** Clicks Confirm and waits through "Processing" until the confirmation is shown. */
    @Step("Confirm the transfer")
    public TransferPage confirm() {
        click(CONFIRM_BUTTON);
        waitFor(Duration.ofSeconds(15)).until(ExpectedConditions.or(
                ExpectedConditions.visibilityOfElementLocated(CONFIRMATION),
                ExpectedConditions.visibilityOfElementLocated(ERROR)));
        return this;
    }

    /** True while the spinner card is on screen. */
    public boolean isProcessing() {
        return !driver.findElements(PROCESSING).isEmpty();
    }

    public boolean succeeded() {
        return !driver.findElements(CONFIRMATION).isEmpty();
    }

    public String confirmedAmount() {
        return text(testId("transfer-confirmation-amount"));
    }

    public String reference() {
        return text(testId("transfer-confirmation-reference"));
    }

    public String errorText() {
        return text(ERROR);
    }
}`,
        },
        {
          title: "Toasts component",
          lang: "java",
          code: `
import java.time.Duration;

/** Toasts in the top right corner. They disappear 4 seconds after they appear. */
public class Toasts extends BasePage {

    private static final By SUCCESS = testId("toast-success");
    private static final By ERROR = testId("toast-error");

    public Toasts(WebDriver driver) {
        super(driver);
    }

    /** Waits for a success toast and returns its message. Read it at once: it is gone 4 s later. */
    public String successMessage() {
        return visible(SUCCESS).findElement(testId("toast-message")).getText().trim();
    }

    /**
     * Waits for a success toast with exactly this text. Toasts stack: an older toast (for example "e-Transfer sent")
     * can still be on screen when the next action shows its own, so "the first success toast" may be the wrong one.
     */
    public void waitForSuccess(String message) {
        wait.until(d -> d.findElements(SUCCESS).stream()
                .anyMatch(t -> t.findElement(testId("toast-message")).getText().trim().equals(message)));
    }

    public String errorMessage() {
        return visible(ERROR).findElement(testId("toast-message")).getText().trim();
    }

    /** Waits until no success toast is left (at most 4 s plus a margin). */
    public void waitUntilSuccessGone() {
        waitFor(Duration.ofSeconds(6)).until(d -> d.findElements(SUCCESS).isEmpty());
    }
}`,
        },
        {
          title: "TransferUiTest: the end state, the toast, the API check",
          lang: "java",
          code: `
package com.icebank.tests.ui;

import com.icebank.api.AccountsClient;
import com.icebank.support.NewCustomer;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.DriverFactory;
import com.icebank.ui.UiSession;
import com.icebank.ui.components.Toasts;
import com.icebank.ui.components.TopNav;
import com.icebank.ui.pages.TransferPage;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;

import java.math.BigDecimal;
import java.time.Duration;

import static com.icebank.ui.pages.BasePage.testId;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("ui")
@Feature("Transfers")
@ExtendWith(DriverExtension.class)
@DisplayName("Transfers in the browser")
class TransferUiTest {

    private static NewCustomer customer;
    private static long savingsId;
    private final AccountsClient accounts = new AccountsClient();

    @BeforeAll
    static void createCustomerWithMoney() {
        customer = NewCustomer.register("sel.tut");
        savingsId = customer.openSavings("UI tests");
        customer.depositCheque(customer.chequingId(), "100.00");     // 100.00 is available at once
    }

    @Test
    @DisplayName("A 1.00 transfer goes through Processing, shows a toast and moves the money")
    void transferThroughProcessingState(WebDriver driver) {
        BigDecimal chequingBefore = accounts.account(customer.email(), customer.chequingId()).balance();
        UiSession.signIn(driver, customer.email());
        new TopNav(driver).go(TopNav.Menu.MOVE_MONEY, "nav-link-transfer");

        TransferPage transfer = new TransferPage(driver).waitUntilLoaded()
                .fill(customer.chequingId(), savingsId, "1.00", "lesson 3");
        assertThat(transfer.reviewAmount()).isEqualTo("$1.00");
        transfer.confirm();

        assertThat(transfer.succeeded()).as("confirmation shown").isTrue();
        assertThat(transfer.confirmedAmount()).isEqualTo("$1.00");
        Toasts toasts = new Toasts(driver);
        assertThat(toasts.successMessage()).isEqualTo("Transfer of $1.00 completed.");
        toasts.waitUntilSuccessGone();

        BigDecimal chequingAfter = accounts.account(customer.email(), customer.chequingId()).balance();
        assertThat(chequingAfter).isEqualByComparingTo(chequingBefore.subtract(new BigDecimal("1.00")));
    }

    @Test
    @DisplayName("The Processing state is really shown, then replaced by the confirmation")
    void processingStateAppearsAndDisappears(WebDriver driver) {
        UiSession.signIn(driver, customer.email());
        TransferPage transfer = new TransferPage(driver).open().fill(customer.chequingId(), savingsId, "0.50", null);
        driver.findElement(testId("transfer-confirm-button")).click();

        var wait = DriverFactory.waitFor(driver, Duration.ofSeconds(5));
        wait.until(ExpectedConditions.visibilityOfElementLocated(testId("transfer-processing")));
        wait.until(ExpectedConditions.invisibilityOfElementLocated(testId("transfer-processing")));
        assertThat(transfer.succeeded()).isTrue();
    }
}`,
        },
      ],
      exercises: [
        "Measure the Processing state: in one test, do five 0.10 transfers and record, for each, the time from the spinner card appearing to the confirmation appearing (poll every 50 ms). Assert each is between about 1 and 3 seconds and print the list.",
        "Transfer more than the available balance from your new customer's chequing account. Assert the page goes back to the form, shows <code>transfer-error</code>, and that the error toast has the same text.",
        "Prove the 4-second rule: measure how long a success toast stays visible after a transfer and assert it is between 3.5 and 5 seconds. Explain why your measurement can be slightly under 4 s.",
        "List every <code>Thread.sleep</code> in your own UI tests (from earlier Selenium practice). Replace each with an explicit wait and write next to it the exact condition it now waits for.",
      ],
      quiz: [
        {
          q: "After clicking Confirm on /transfer, which wait is the most reliable?",
          options: [
            "Wait until <code>transfer-processing</code> is visible",
            "Wait until <code>transfer-confirmation</code> or <code>transfer-error</code> is visible",
            "Wait until <code>transfer-processing</code> is invisible",
            "Sleep 3 seconds",
          ],
          answer: 1,
          explain: "The end state is unambiguous. The spinner can be missed, and \"invisible\" is already true before it appears.",
        },
        {
          q: "You send an e-Transfer and cancel it 2 seconds later. <code>toasts.successMessage()</code> returns \"e-Transfer of $5.00 sent to Friend Tester.\" Why?",
          options: [
            "The cancel failed",
            "Toasts are cached by the browser",
            "The page did not reload",
            "Toasts stack, and the first success toast is still the earlier one",
          ],
          answer: 3,
          explain: "Wait for the toast with the message you expect.",
        },
        {
          q: "Why does the starter set the implicit wait to 0?",
          options: [
            "Mixing implicit and explicit waits makes timings unpredictable, and explicit waits name the condition",
            "Implicit waits do not work in Chrome",
            "It makes tests faster on QA only",
            "Selenium 4 removed implicit waits",
          ],
          answer: 0,
          explain: "Explicit waits say what you are waiting for; implicit ones apply to every lookup, including the ones meant to find nothing.",
        },
        {
          q: "A toast lives 4 seconds. Which timeout is sensible for \"wait until the success toast is gone\"?",
          options: [
            "1 second",
            "60 seconds",
            "About 6 seconds",
            "No wait: check immediately",
          ],
          answer: 2,
          explain: "A little above the known lifetime: long enough to pass, short enough to fail fast if it never goes.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "signin",
      title: "Sign-in: the form, the OTP from the API, and the API shortcut",
      summary: "Test the login screens through the browser with the code from Ice Mail's API, and let every other test start signed in through the API.",
      body: `
<p>Ice Bank's sign-in has two steps: email and password, then a 6-digit code "emailed" to Ice Mail (valid 5 minutes, 3 attempts). The starter's
<code>LoginUiTest</code> shows the browser way: type the email and password, read the code with <code>InboxClient.latestOtp(email)</code> (the inbox API with
the <code>X-Sandbox-Key</code> header), type it on the OTP page.</p>

<h3>Two kinds of UI tests, two ways to sign in</h3>
<ul>
<li><strong>Tests about the login screens</strong> (wrong password, wrong code, the notices on <code>/login</code>) go through the form. That is what they test.</li>
<li><strong>Every other UI test</strong> should not. It signs in through the API and gives the browser the session cookies. The web UI keeps its tokens in
two httpOnly cookies, <code>ib_at</code> (access, 15 minutes) and <code>ib_rt</code> (refresh, 7 days), which <code>POST /auth/mfa/verify</code> also returns
in its JSON. WebDriver can add httpOnly cookies, but only for the origin of the page that is open, so open any Ice Bank page first.</li>
</ul>
<p>This is the standard "API for setup, UI for the behaviour under test" approach. It is faster (a sign-in through the browser costs about 3 seconds, the
API about 0.2), it removes two pages that could fail for reasons unrelated to the test, and it lets each test create exactly the data it needs.</p>

<h3>Setting up data through the API</h3>
<p>UI tests that move money need money, and they must not use Emma's. <code>NewCustomer.register(prefix)</code> calls <code>POST /auth/register</code>
with a unique email (<code>prefix.&lt;8 hex&gt;@icebank.test</code>), the persona password (so <code>AuthClient</code> and <code>Specs.as(email)</code> work
unchanged), SIN <code>193 746 286</code> and postal code <code>M5J 2T3</code>. A new customer has one chequing account at $0.00, so
<code>depositCheque(accountId, "100.00")</code> uploads the sample cheque images through the API: the first $100 of a cheque is available at once.
<code>openSavings(nickname)</code> adds a second account for transfers.</p>
<div class="callout"><p><strong>The login rate limit.</strong> <code>/auth/register</code>, <code>/auth/login</code>, <code>/auth/mfa/verify</code> and
<code>/auth/refresh</code> share one limit: <strong>10 calls per minute per IP</strong>. One API sign-in is 2 calls; registering is 1. Create one customer per
test class (<code>@BeforeAll</code>), not per test, and wrap the calls in <code>AuthClient.retryIfRateLimited</code>, which waits for the
<code>Retry-After</code> the server sends.</p></div>

<h3>Worked example</h3>
<p><code>UiSession.signIn(driver, email)</code> does the API login without the token cache (so a test that signs out in the browser does not break its own
API calls), opens <code>/login</code>, adds the two cookies and opens <code>/dashboard</code>. <code>SignInUiTest</code> then shows all three cases: the
form with the code from the API, a wrong code, and the API shortcut.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Reading the OTP before the login was submitted: you get the <em>previous</em> code (or none) and verify says the code is incorrect.</li>
<li><code>addCookie</code> before any Ice Bank page is open: <code>InvalidCookieDomainException</code>.</li>
<li>Injecting only <code>ib_at</code>: everything works for 15 minutes, then the first refresh fails and the app sends you to the login page.</li>
<li>Using the cached <code>AuthClient</code> token for the browser and then testing sign-out: the server ends that session and every later API call of the
same run gets 401.</li>
<li>Write tests as Emma "because she has data": they change what other people and other tests see.</li>
<li>Typing a wrong password five times while experimenting with a persona: the user is locked for 15 minutes for everyone. Use your own customer.</li>
</ul></div>`,
      examples: [
        {
          title: "UiSession: API sign-in, then the browser's cookies",
          lang: "java",
          code: `
package com.icebank.ui;

import com.icebank.api.AuthClient;
import com.icebank.api.InboxClient;
import com.icebank.config.Config;
import com.icebank.ui.pages.DashboardPage;
import io.qameta.allure.Step;
import io.restassured.response.Response;
import org.openqa.selenium.Cookie;
import org.openqa.selenium.WebDriver;

/**
 * Signs the browser in without typing: the API does the two-step login and the browser gets the same httpOnly
 * cookies ({@code ib_at}, {@code ib_rt}) the login page would have set. Use it for every UI test that is NOT about
 * the login screen. The browser gets its own session, separate from the token cache of {@code AuthClient}, so
 * signing out in the browser does not break the API calls of the same test.
 */
public final class UiSession {

    private UiSession() {
    }

    /** Signs in through the API and opens the (modern) dashboard. */
    public static DashboardPage signIn(WebDriver driver, String email) {
        addSessionCookies(driver, email);
        driver.get(Config.baseUrl() + "/dashboard");
        return new DashboardPage(driver).waitUntilLoaded();
    }

    /** Signs in through the API and gives the browser the session cookies; opens no page after that. */
    @Step("Sign the browser in as {email} through the API")
    public static void addSessionCookies(WebDriver driver, String email) {
        String mfaToken = AuthClient.retryIfRateLimited(() -> AuthClient.login(email, Config.personaPassword()))
                .then().statusCode(200).extract().path("mfaToken");
        String code = InboxClient.latestOtp(email);
        Response verify = AuthClient.retryIfRateLimited(() -> AuthClient.verifyMfa(mfaToken, code));
        verify.then().statusCode(200);

        driver.get(Config.baseUrl() + "/login");            // cookies can only be set for the page's own origin
        driver.manage().addCookie(cookie("ib_at", verify.path("accessToken")));
        driver.manage().addCookie(cookie("ib_rt", verify.path("refreshToken")));
    }

    private static Cookie cookie(String name, String value) {
        return new Cookie.Builder(name, value).path("/").isHttpOnly(true).sameSite("Lax").build();
    }
}`,
        },
        {
          title: "NewCustomer: register, open savings, deposit a cheque (all API)",
          lang: "java",
          code: `
package com.icebank.support;

import com.icebank.api.AuthClient;
import com.icebank.api.Specs;
import com.icebank.api.TransfersClient;
import com.icebank.config.Config;
import io.qameta.allure.Step;
import io.restassured.response.Response;

import java.io.File;
import java.net.URISyntaxException;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;

/**
 * A throwaway customer registered through the API, for UI tests that move money. Nobody else depends on them,
 * so a test can transfer, pay bills and deposit cheques without touching Emma's data.
 * The password is the persona password, so {@code AuthClient} and {@code Specs.as(email)} work unchanged.
 */
public record NewCustomer(String email, String firstName, long customerId, long chequingId) {

    /** Registers {@code <prefix>.<8 hex>@icebank.test}, born 1990-05-14, Toronto. One call to the login rate bucket. */
    @Step("Register a new customer")
    public static NewCustomer register(String prefix) {
        String email = prefix + "." + UUID.randomUUID().toString().substring(0, 8) + Config.emailSuffix() + "@icebank.test";
        Map<String, Object> body = Map.ofEntries(
                Map.entry("firstName", "Uma"), Map.entry("lastName", "Tester"),
                Map.entry("dateOfBirth", "1990-05-14"), Map.entry("email", email),
                Map.entry("phone", "(416) 555-0199"), Map.entry("addressLine1", "200 Bay Street"),
                Map.entry("city", "Toronto"), Map.entry("province", "ON"), Map.entry("postalCode", "M5J 2T3"),
                Map.entry("sin", "193 746 286"), Map.entry("password", Config.personaPassword()));
        // register shares the 10-per-minute login limit: wait for Retry-After like AuthClient does
        Response r = AuthClient.retryIfRateLimited(() -> given().spec(Specs.base()).body(body).when().post("/auth/register"));
        r.then().statusCode(201);
        return new NewCustomer(email, "Uma", r.jsonPath().getLong("customerId"), r.jsonPath().getLong("accounts[0].id"));
    }

    /** {@code POST /accounts}: opens a savings account and returns its id. */
    @Step("Open a savings account {nickname}")
    public long openSavings(String nickname) {
        return given().spec(Specs.as(email)).body(Map.of("type", "SAVINGS", "nickname", nickname))
                .when().post("/accounts")
                .then().statusCode(201).extract().jsonPath().getLong("id");
    }

    /** Deposits a cheque through the API. Up to 100.00 is available at once, so this is how a new customer gets money. */
    @Step("Deposit a cheque of {amount} into account {accountId}")
    public void depositCheque(long accountId, String amount) {
        given().spec(Specs.as(email))
                .contentType("multipart/form-data")
                .header(TransfersClient.IDEMPOTENCY_KEY, TransfersClient.newIdempotencyKey())
                .multiPart("accountId", String.valueOf(accountId))
                .multiPart("amount", amount)
                .multiPart("frontImage", resource("cheques/sample-cheque-front.png"), "image/png")
                .multiPart("backImage", resource("cheques/sample-cheque-back.png"), "image/png")
                .when().post("/deposits/cheque")
                .then().statusCode(201);
    }

    /** A file from src/test/resources as an absolute {@link File} (what a file input and REST Assured need). */
    public static File resource(String path) {
        try {
            return new File(NewCustomer.class.getClassLoader().getResource(path).toURI());
        } catch (URISyntaxException | NullPointerException e) {
            throw new IllegalStateException("Missing test resource " + path, e);
        }
    }
}`,
          note: "Copy <code>postman/sample-cheque-front.png</code> and <code>-back.png</code> from the Ice Bank repo into <code>src/test/resources/cheques/</code>.",
        },
        {
          title: "SignInUiTest: the form, a wrong code, and the shortcut",
          lang: "java",
          code: `
package com.icebank.tests.ui;

import com.icebank.api.InboxClient;
import com.icebank.support.NewCustomer;
import com.icebank.support.Personas;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.UiSession;
import com.icebank.ui.pages.DashboardPage;
import com.icebank.ui.pages.LoginPage;
import com.icebank.ui.pages.OtpPage;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("ui")
@Feature("Sign-in")
@ExtendWith(DriverExtension.class)
@DisplayName("Sign-in: through the form and through the API")
class SignInUiTest {

    private static NewCustomer customer;

    @BeforeAll
    static void newCustomer() {
        customer = NewCustomer.register("sel.tut");          // API setup: no clicking through the wizard here
    }

    @Test
    @DisplayName("The login form with the code read from Ice Mail through the API")
    void signInThroughTheForm(WebDriver driver) {
        OtpPage otp = new LoginPage(driver).open().signIn(customer.email(), Personas.password());
        String code = InboxClient.latestOtp(customer.email());
        DashboardPage dashboard = otp.enterCode(code);
        assertThat(dashboard.greeting()).isEqualTo("Good day, Uma");
    }

    @Test
    @DisplayName("A wrong code shows an error and keeps the user on the code page")
    void wrongCode(WebDriver driver) {
        OtpPage otp = new LoginPage(driver).open().signIn(customer.email(), Personas.password());
        String right = InboxClient.latestOtp(customer.email());
        String wrong = right.equals("000000") ? "111111" : "000000";
        otp.submitCode(wrong);
        assertThat(otp.errorText()).startsWith("The code is incorrect.");
        assertThat(driver.getCurrentUrl()).contains("/login/verify");
    }

    @Test
    @DisplayName("Signed in through the API: the browser starts on the dashboard")
    void signInThroughTheApi(WebDriver driver) {
        DashboardPage dashboard = UiSession.signIn(driver, customer.email());
        assertThat(dashboard.greeting()).isEqualTo("Good day, Uma");
        assertThat(dashboard.showsAccount(customer.chequingId())).isTrue();
    }
}`,
        },
      ],
      exercises: [
        "Register a customer and deposit 40.00 for them through the API. Then sign in through the <em>form</em> (code from <code>InboxClient</code>) and assert the dashboard's chequing balance equals <code>TestData.uiMoney</code> of the API balance.",
        "Negative test on your own customer: a wrong password shows \"Invalid email or password.\" and stays on <code>/login</code>. Afterwards sign in correctly in the same test, and explain why that last step matters.",
        "Prove the API shortcut gives a real session: after <code>UiSession.signIn</code>, open <code>/profile</code> and assert <code>profile-email</code> shows the customer's email.",
        "Count the calls to the login rate bucket (register, login, verify, refresh) that one of your UI test classes makes. If it is more than 10, restructure it so it stays under 10 per minute.",
      ],
      quiz: [
        {
          q: "Which UI tests should type the password into the login form?",
          options: [
            "Only tests about the sign-in screens themselves",
            "All of them, it is more realistic",
            "None; always use cookies",
            "Only tests that run on QA",
          ],
          answer: 0,
          explain: "The rest sign in through the API: faster, fewer unrelated failures, and the login screens are still tested by their own tests.",
        },
        {
          q: "<code>driver.manage().addCookie(...)</code> throws <code>InvalidCookieDomainException</code>. The likely cause:",
          options: [
            "The cookie is httpOnly",
            "The token has expired",
            "No Ice Bank page is open yet, so the browser has no matching origin",
            "Chrome blocks cookies in headless mode",
          ],
          answer: 2,
          explain: "Open any page of the app first (UiSession opens /login), then add the cookies.",
        },
        {
          q: "Why does <code>NewCustomer</code> deposit a cheque of 100.00 through the API?",
          options: [
            "Deposits are the only API that works without a token",
            "To test the deposit page",
            "To unlock the savings account",
            "A new customer has $0.00 and the first $100 of a cheque is available at once, so tests can move money that is theirs",
          ],
          answer: 3,
          explain: "Tests create their own money instead of borrowing a persona's.",
        },
        {
          q: "What shares the 10-per-minute login limit?",
          options: [
            "Only POST /auth/login",
            "Register, login, MFA verify and refresh",
            "Every API call",
            "Only the browser's login page",
          ],
          answer: 1,
          explain: "Plan for it: one customer per class, API sign-in counts 2, and retry on 429 with Retry-After.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "wizard",
      title: "The registration wizard",
      summary: "Drive a 4-step form with per-step validation, Back and Edit, a native date input and formatting fields, then prove the result through the API.",
      links: [
        {
          label: "Open /register",
          href: "http://localhost:3000/register",
        },
      ],
      body: `
<p><code>/register</code> is a wizard: <strong>1 Personal info</strong>, <strong>2 Address</strong>, <strong>3 Security</strong>, <strong>4 Review</strong>.
Only one step's form is in the DOM at a time (<code>register-step-1-form</code> … <code>register-step-4-form</code>). The progress bar has one item per step,
<code>register-step-1</code> … <code>register-step-4</code>, each with <code>data-state="current" | "complete" | "upcoming"</code>: an attribute meant for
exactly this kind of check.</p>

<h3>How the wizard behaves</h3>
<ul>
<li><strong>Next</strong> validates the current step in the browser (same rules as the server). Errors appear under the fields
(<code>register-postal-code-error</code> …) and the step stays.</li>
<li><strong>Back</strong> keeps everything you typed. <strong>Edit</strong> on the review step jumps to that step.</li>
<li>Some fields <strong>change what you type</strong>: the phone becomes <code>(416) 555-0199</code> while you type digits; the postal code is upper-cased and
gets its space when the field loses focus; the SIN is shown masked on the review (<code>*** *** 286</code>).</li>
<li><strong>Open my account</strong> sends <code>POST /auth/register</code>. On success the browser goes to <code>/login?registered=1</code>; on a server error the
wizard shows an alert (<code>register-error</code>) and, for field errors, jumps to the step that owns the field.</li>
</ul>

<h3>The date of birth: a native date input</h3>
<p><code>&lt;input type="date"&gt;</code> looks simple and is not: what <code>sendKeys</code> must type depends on the browser's locale (with
<code>--lang=en-CA</code> it is year-month-day, in en-US month/day/year), and the segments jump on their own. Since this field is not what the test is
about, set its value directly through the element's native value setter and fire an <code>input</code> event. React picks that up exactly as if the user
had typed. (A plain <code>element.value = ...</code> in JavaScript is <em>not</em> enough: React does not notice it.)</p>

<h3>Worked example</h3>
<p><code>RegisterPage</code> has one method per step plus <code>next(expectedStep)</code>, which clicks and waits for the following step to be current.
The first test walks all four steps, checks the formatting and the review, submits, and then <strong>signs the new customer in through the API</strong> and
reads <code>GET /me</code>: the screen saying "Your account is ready" is not proof that the right data was stored. The second test checks a validation
error and that Back keeps step 1's values.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Reusing an email: the second run gets <code>409 EMAIL_TAKEN</code>. Generate a unique email per run.</li>
<li>Clicking Next and immediately typing into step 2: the step 1 form is replaced, so elements found before the click are stale. Wait for the step.</li>
<li>Asserting only the review step. The review shows what the browser holds; the server may store something else.</li>
<li>Typing a date with <code>sendKeys</code> in one locale and running the suite on a laptop with another.</li>
<li>Expecting the phone field to contain exactly what you typed: it reformats. Assert the formatted value, or type it already formatted.</li>
</ul></div>`,
      examples: [
        {
          title: "RegisterPage (ui/pages/RegisterPage.java)",
          lang: "java",
          code: `
/** {@code /register}: a 4-step wizard. Each step validates before Next moves on; Back keeps what you typed. */
public class RegisterPage extends BasePage {

    private static final By NEXT = testId("register-next-button");
    private static final By BACK = testId("register-back-button");
    private static final By SUBMIT = testId("register-submit-button");
    private static final By STEP_TITLE = testId("register-step-title");

    public RegisterPage(WebDriver driver) {
        super(driver);
    }

    public RegisterPage open() {
        openPath("/register");
        return waitForStep(1);
    }

    /** Waits until step {@code n} is current: its form is shown and the indicator says "current". */
    public RegisterPage waitForStep(int n) {
        visible(testId("register-step-" + n + "-form"));
        wait.until(d -> "current".equals(d.findElement(testId("register-step-" + n)).getAttribute("data-state")));
        return this;
    }

    /** "current", "complete" or "upcoming" for the step indicator {@code n}. */
    public String stepState(int n) {
        return visible(testId("register-step-" + n)).getAttribute("data-state");
    }

    public String stepTitle() {
        return text(STEP_TITLE);
    }

    @Step("Step 1: personal info for {email}")
    public RegisterPage personalInfo(String first, String last, String dateOfBirth, String phoneDigits, String email, String sin) {
        type(testId("register-first-name-input"), first);
        type(testId("register-last-name-input"), last);
        setDate(testId("register-date-of-birth-input"), dateOfBirth);
        type(testId("register-phone-input"), phoneDigits);      // the page formats it as (###) ###-####
        type(testId("register-email-input"), email);
        type(testId("register-sin-input"), sin);
        return this;
    }

    @Step("Step 2: address")
    public RegisterPage address(String line1, String city, String provinceCode, String postalCode) {
        type(testId("register-address-line1-input"), line1);
        type(testId("register-city-input"), city);
        select(testId("register-province-select")).selectByValue(provinceCode);
        type(testId("register-postal-code-input"), postalCode);
        return this;
    }

    @Step("Step 3: password and terms")
    public RegisterPage security(String password) {
        type(testId("register-password-input"), password);
        type(testId("register-confirm-password-input"), password);
        WebElement terms = visible(testId("register-terms-checkbox"));
        if (!terms.isSelected()) {
            terms.click();
        }
        return this;
    }

    /** Clicks Next and waits for the following step. Use only when the step is valid. */
    public RegisterPage next(int expectedStep) {
        click(NEXT);
        return waitForStep(expectedStep);
    }

    /** Clicks Next on a step you expect to fail validation; stays on the same step. */
    public RegisterPage nextExpectingErrors() {
        click(NEXT);
        return this;
    }

    public RegisterPage back(int expectedStep) {
        click(BACK);
        return waitForStep(expectedStep);
    }

    /** The error under a field, e.g. fieldError("register-postal-code") for register-postal-code-error. */
    public String fieldError(String fieldPrefix) {
        return text(testId(fieldPrefix + "-error"));
    }

    public String value(String inputTestId) {
        return visible(testId(inputTestId)).getAttribute("value");
    }

    /** A value on the review step, e.g. review("email") for register-review-email. */
    public String review(String key) {
        return text(testId("register-review-" + key));
    }

    @Step("Open the account")
    public LoginPage submit() {
        click(SUBMIT);
        waitForUrlContains("/login?registered=1");
        return new LoginPage(driver);
    }

    /**
     * A native {@code <input type="date">}: what you type with sendKeys depends on the browser's locale (yyyy-mm-dd
     * in en-CA, mm/dd/yyyy in en-US). Setting the value through the element's native setter and firing "input"
     * works everywhere and still goes through React's onChange.
     */
    private void setDate(By locator, String isoDate) {
        WebElement input = visible(locator);
        ((JavascriptExecutor) driver).executeScript(
                "const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;"
                        + "setter.call(arguments[0], arguments[1]);"
                        + "arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", input, isoDate);
    }
}`,
        },
        {
          title: "RegisterUiTest",
          lang: "java",
          code: `
package com.icebank.tests.ui;

import com.icebank.api.Specs;
import com.icebank.support.Personas;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.pages.RegisterPage;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;

import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("ui")
@Feature("Registration")
@ExtendWith(DriverExtension.class)
@DisplayName("Registration wizard")
class RegisterUiTest {

    private static String newEmail() {
        return "sel.tut." + UUID.randomUUID().toString().substring(0, 8) + "@icebank.test";
    }

    @Test
    @DisplayName("All four steps, the review, and the new customer can sign in")
    void registerThroughAllSteps(WebDriver driver) {
        String email = newEmail();
        RegisterPage wizard = new RegisterPage(driver).open()
                .personalInfo("Uma", "Wizard", "1990-05-14", "4165550199", email, "193 746 286");
        assertThat(wizard.value("register-phone-input")).isEqualTo("(416) 555-0199");    // formatted while typing

        wizard.next(2);
        assertThat(wizard.stepState(1)).isEqualTo("complete");
        wizard.address("200 Bay Street", "Toronto", "ON", "m5j2t3").next(3)
                .security(Personas.password()).next(4);

        assertThat(wizard.stepTitle()).isEqualTo("Step 4 of 4: Review");
        assertThat(wizard.review("name")).isEqualTo("Uma Wizard");
        assertThat(wizard.review("email")).isEqualTo(email);
        assertThat(wizard.review("sin")).isEqualTo("*** *** 286");
        assertThat(wizard.review("province")).isEqualTo("Ontario (ON)");
        assertThat(wizard.review("postal-code")).isEqualTo("M5J 2T3");

        wizard.submit();
        // The real proof is not the screen: the API signs the new customer in and shows the data we typed.
        given().spec(Specs.as(email)).when().get("/me").then().statusCode(200)
                .body("firstName", org.hamcrest.Matchers.equalTo("Uma"))
                .body("address.postalCode", org.hamcrest.Matchers.equalTo("M5J 2T3"));
    }

    @Test
    @DisplayName("A bad postal code keeps the wizard on step 2, and Back keeps step 1's values")
    void validationAndBack(WebDriver driver) {
        String email = newEmail();
        RegisterPage wizard = new RegisterPage(driver).open()
                .personalInfo("Uma", "Wizard", "1990-05-14", "4165550199", email, "193 746 286")
                .next(2)
                .address("200 Bay Street", "Toronto", "ON", "12345")
                .nextExpectingErrors();

        assertThat(wizard.fieldError("register-postal-code")).isEqualTo("Enter a Canadian postal code in the format A1A 1A1.");
        assertThat(wizard.stepState(2)).isEqualTo("current");

        wizard.back(1);
        assertThat(wizard.value("register-email-input")).isEqualTo(email);
        assertThat(wizard.value("register-date-of-birth-input")).isEqualTo("1990-05-14");
    }
}`,
        },
      ],
      exercises: [
        "Duplicate email: register a customer through the API, then go through the wizard with the same email and submit. Record exactly what the user sees (which step, which alert, which field errors) and what happens when they click Edit for step 1. Is that good UX? Write it up as you would a bug report if you think not.",
        "Underage: read the sandbox date from <code>GET /test/clock</code> (read only) and enter a date of birth exactly 17 years before it. Assert the step 1 error \"You must be at least 18 years old to open an account.\" and that step 1 is still current.",
        "Edit from review: go to step 4, click Edit for step 2, change the city to Iceport, go forward again and assert the review shows Iceport and step 1 is still \"complete\".",
        "Write a parameterized test with at least five postal codes the wizard must refuse on step 2 (think about the letters Canada never uses, the first letters W and Z, missing characters and other separators). Explain why <code>m5j2t3</code> is <em>not</em> one of them.",
      ],
      quiz: [
        {
          q: "What is the most robust way to know that step 2 is the current step?",
          options: [
            "The step title text",
            "The URL contains /register/2",
            "<code>register-step-2</code> has <code>data-state=\"current\"</code> and <code>register-step-2-form</code> is visible",
            "The Back button is enabled",
          ],
          answer: 2,
          explain: "The state attribute and the step's form are both made for tests. The URL does not change between steps.",
        },
        {
          q: "Why does RegisterPage set the date of birth through JavaScript instead of <code>sendKeys</code>?",
          options: [
            "A native date input expects locale-dependent keystrokes; setting the value via the native setter plus an input event works everywhere and React still sees it",
            "sendKeys does not work on inputs",
            "To make the test faster",
            "Because the field is disabled",
          ],
          answer: 0,
          explain: "It is not the behaviour under test, so set it in the most reliable way that still goes through the app's handlers.",
        },
        {
          q: "After submitting, the browser shows \"Your account is ready.\" What is the best final check?",
          options: [
            "That notice text",
            "Check the URL",
            "Take a screenshot",
            "Sign the new customer in through the API and compare <code>GET /me</code> with what was typed",
          ],
          answer: 3,
          explain: "The server's stored data is the result; the notice is only a message.",
        },
        {
          q: "You type <code>m5j2t3</code> as the postal code and click Next. What does the review show?",
          options: [
            "m5j2t3",
            "M5J 2T3",
            "M5J2T3",
            "An error",
          ],
          answer: 1,
          explain: "The field upper-cases while you type and adds the space when it loses focus.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "selects-autocomplete",
      title: "Native selects and the biller autocomplete",
      summary: "Choose from real <code>&lt;select&gt;</code> elements by value, and drive a custom ARIA combobox that searches as you type and can show stale results.",
      links: [
        {
          label: "Open /bills/payees",
          href: "http://localhost:3000/bills/payees",
        },
      ],
      body: `
<h3>Native selects</h3>
<p>Account choosers (<code>transfer-from-select</code>, <code>bill-from-select</code>, <code>deposit-account-select</code>), the province and the filters
are plain <code>&lt;select&gt;</code> elements, so Selenium's <code>Select</code> class works and fires the <code>change</code> event React listens to.
Choose by <strong>value</strong>: the option value is the account id, while the label carries live data ("Select test 2610 - $0.00": nickname, last four
digits and the available balance). Reading the label is fine for an assertion; selecting by it is fragile.</p>

<h3>The biller autocomplete</h3>
<p>Adding a payee starts with <strong>Biller</strong>, a custom combobox (<code>role="combobox"</code>, <code>role="listbox"</code>, <code>role="option"</code>):</p>
<ul>
<li>Typing calls <code>GET /billers?q=…</code> after a <strong>250 ms pause</strong> (debounce). Results come back sorted by name.</li>
<li>While a new search runs, the list still shows the <strong>previous results</strong>. If you type "ice" and then "icetel", there is a moment where the
list says "City of Iceport Property Tax, City of Iceport Water, IceTel Mobile, Iceport Transit Pass" even though you typed "icetel".</li>
<li>A visually hidden status line (<code>biller-search-status</code>) says "Searching…", "1 biller found. Use the up and down arrows to choose." or "No billers
match your search." It is <code>sr-only</code>, so read it with <code>textContent</code>.</li>
<li>When results arrive, the first option is highlighted; ArrowDown/ArrowUp move it (the input's <code>aria-activedescendant</code> names the option); Enter
picks; Escape closes; clicking an option picks it. Picking shows <code>selected-biller</code> and enables the account number field, whose help text now shows
the biller's format.</li>
</ul>
<p>So the page object must wait for <strong>the results of the text it typed</strong> (the status line says "found" or "No billers match"), and then pick the
option by its name, not "the first one".</p>

<h3>Why <code>clear()</code> is not enough here</h3>
<p>The starter's <code>type()</code> calls <code>clear()</code> and then <code>sendKeys</code>. On an empty field that is fine. On the autocomplete after a
first search it is not: <code>clear()</code> empties the DOM value without a key press, the field loses focus, the component re-renders and React writes
its own state ("ice") back, and the new text is appended: "iceicetel", no results. <code>replaceText()</code> in <code>BasePage</code> presses End and
Backspace instead, real key presses the component sees.</p>

<h3>Worked example</h3>
<p>The test searches "ice" and checks the four names in order, then searches "icetel", picks IceTel Mobile, checks the format hint, adds the payee with a
nickname, reads the toast, finds the new row by nickname and confirms through <code>GET /payees</code>. A second test uses the keyboard. A third shows a
native select by value.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Waiting for "any option" and clicking the first: on a fast machine that is the previous search's first result.</li>
<li><code>Thread.sleep(300)</code> for the debounce. The API time is not part of the 250 ms.</li>
<li>Clicking an option after the field lost focus: the list closes 150 ms after blur, and the option is gone.</li>
<li><code>selectByVisibleText</code> with a balance in it.</li>
<li>Expecting <code>accept="image/png,image/jpeg"</code>, <code>maxlength</code> or <code>disabled</code> to be "tested" by Selenium automatically; check them yourself.</li>
</ul></div>`,
      examples: [
        {
          title: "PayeesPage with the autocomplete",
          lang: "java",
          code: `
import java.util.List;

/** {@code /bills/payees}: the payee list and the "Add a payee" form with the biller autocomplete. */
public class PayeesPage extends BasePage {

    private static final By SEARCH = testId("biller-search-input");
    private static final By LISTBOX = testId("biller-listbox");
    private static final By STATUS = testId("biller-search-status");
    private static final By OPTION = By.cssSelector("[data-testid='biller-listbox'] [role='option']");

    public PayeesPage(WebDriver driver) {
        super(driver);
    }

    public PayeesPage open() {
        openPath("/bills/payees");
        return waitUntilLoaded();
    }

    /** After a click that leads here (the app navigates client-side: the click returns before the page changes). */
    public PayeesPage waitUntilLoaded() {
        waitForUrlContains("/bills/payees");
        visible(testId("add-payee-form"));
        return this;
    }

    /**
     * Types a search and waits until the results for THIS text are in. The list keeps showing the previous
     * results while a new search runs (250 ms debounce + the request), so waiting for "any option" is not enough.
     */
    public List<String> search(String text) {
        replaceText(SEARCH, text);
        // The status line is visually hidden (sr-only, for screen readers): getText() returns only VISIBLE text,
        // so read the DOM property textContent instead.
        wait.until(d -> {
            String status = d.findElement(STATUS).getDomProperty("textContent");
            return status != null && status.endsWith("found. Use the up and down arrows to choose.")
                    || "No billers match your search.".equals(status);
        });
        return driver.findElements(OPTION).stream()
                .map(o -> o.findElement(testId("biller-option-name")).getText().trim()).toList();
    }

    /** Searches, then clicks the option whose name is exactly {@code billerName}. */
    @Step("Choose biller {billerName}")
    public PayeesPage chooseBiller(String search, String billerName) {
        search(search);
        WebElement option = visible(LISTBOX).findElements(OPTION).stream()
                .filter(o -> o.findElement(testId("biller-option-name")).getText().trim().equals(billerName))
                .findFirst().orElseThrow(() -> new AssertionError("No biller option '" + billerName + "'"));
        option.click();
        waitUntilGone(LISTBOX);
        return this;
    }

    /** The keyboard way: type, ArrowDown to the option, Enter. */
    public PayeesPage chooseBillerWithKeyboard(String search, int arrowDowns) {
        search(search);
        WebElement input = visible(SEARCH);
        for (int i = 0; i < arrowDowns; i++) {
            input.sendKeys(Keys.ARROW_DOWN);
        }
        input.sendKeys(Keys.ENTER);
        waitUntilGone(LISTBOX);
        return this;
    }

    /** The id of the highlighted option (the input's aria-activedescendant), or null. */
    public String activeOptionId() {
        return visible(SEARCH).getAttribute("aria-activedescendant");
    }

    public String selectedBiller() {
        return text(testId("selected-biller-name"));
    }

    /** The field error under the account number (appears after the API answered). */
    public String accountNumberError() {
        return text(testId("payee-account-number-error"));
    }

    public String accountNumberHelp() {
        return text(By.id("accountNumber-help"));
    }

    @Step("Add the payee with account number {accountNumber}")
    public PayeesPage addPayee(String accountNumber, String nickname) {
        type(testId("payee-account-number-input"), accountNumber);
        if (nickname != null) {
            type(testId("payee-nickname-input"), nickname);
        }
        click(testId("add-payee-button"));
        return this;
    }

    /** The row of the payee with this nickname, once the table shows it. */
    public WebElement rowWithNickname(String nickname) {
        return wait.until(d -> d.findElements(By.cssSelector("[data-testid^='payee-row-']")).stream()
                .filter(r -> r.findElement(testId("payee-nickname")).getText().trim().equals(nickname))
                .findFirst().orElse(null));
    }
}`,
        },
        {
          title: "Native select and autocomplete tests",
          lang: "java",
          code: `
@Test
@DisplayName("A native select: options by value, the chosen option, and what the labels contain")
void nativeSelect(WebDriver driver) {
    UiSession.signIn(driver, customer.email());
    new TransferPage(driver).open();
    Select from = new Select(driver.findElement(testId("transfer-from-select")));

    assertThat(from.isMultiple()).isFalse();
    List<String> values = from.getOptions().stream().map(o -> o.getAttribute("value")).toList();
    assertThat(values).containsExactly("", String.valueOf(customer.chequingId()), String.valueOf(savingsId));
    assertThat(from.getFirstSelectedOption().getText()).isEqualTo("Choose an account");

    from.selectByValue(String.valueOf(savingsId));
    // The label carries the live balance ("Select test - $0.00"): fine to read, fragile to select by.
    assertThat(from.getFirstSelectedOption().getText()).matches("Select test \\\\d{4} - \\\\$0\\\\.00");
}

@Test
@DisplayName("Search, wait for the right results, click an option and add the payee")
void addPayeeWithAutocomplete(WebDriver driver) {
    UiSession.signIn(driver, customer.email());
    PayeesPage payees = new PayeesPage(driver).open();

    assertThat(payees.search("ice")).containsExactly(
            "City of Iceport Property Tax", "City of Iceport Water", "IceTel Mobile", "Iceport Transit Pass");
    payees.chooseBiller("icetel", "IceTel Mobile");
    assertThat(payees.selectedBiller()).isEqualTo("IceTel Mobile");
    assertThat(payees.accountNumberHelp()).isEqualTo("Format: IT followed by 8 digits, e.g. IT20456789");

    payees.addPayee("IT12345678", "Phone UI");
    assertThat(new Toasts(driver).successMessage()).isEqualTo("IceTel Mobile added to your payees.");
    WebElement row = payees.rowWithNickname("Phone UI");
    assertThat(row.findElement(testId("payee-account-number")).getText()).isEqualTo("IT12345678");

    List<String> apiNicknames = given().spec(Specs.as(customer.email())).when().get("/payees")
            .then().statusCode(200).extract().jsonPath().getList("nickname");
    assertThat(apiNicknames).contains("Phone UI");
}

@Test
@DisplayName("The keyboard way: ArrowDown moves the highlight, Enter picks")
void keyboardSelection(WebDriver driver) {
    UiSession.signIn(driver, customer.email());
    PayeesPage payees = new PayeesPage(driver).open();
    payees.chooseBillerWithKeyboard("ice", 1);              // first result is highlighted, one ArrowDown = second
    assertThat(payees.selectedBiller()).isEqualTo("City of Iceport Water");
}`,
        },
      ],
      exercises: [
        "On step 2 of the wizard, assert the province select has 14 options (a placeholder plus the 13 provinces and territories), that the placeholder reads \"Choose…\", and that <code>selectByVisibleText(\"Quebec (QC)\")</code> stores the value <code>QC</code>.",
        "Search for a biller that does not exist. Assert the page object returns no names and the list shows \"No billers match your search.\"",
        "Search \"ice\", press Escape, and assert the list closes, no biller is selected and the account number field is still disabled.",
        "Create a payee through the API, then change its nickname in the edit modal (<code>payee-edit-…</code>). Wait for the toast \"Payee updated.\" and confirm the new nickname in the table and through the API.",
        "In your own words, explain why a test that types \"ice\", then \"icetel\", and clicks the first option as soon as one is visible can add the wrong payee, and how <code>PayeesPage.search</code> prevents it.",
      ],
      quiz: [
        {
          q: "The From select's option label is \"Select test 2610 - $0.00\". What should a transfer test select by?",
          options: [
            "The visible text",
            "The value, which is the account id",
            "The index",
            "The first option",
          ],
          answer: 1,
          explain: "Labels carry live balances and last-4 digits; the id comes from your test data.",
        },
        {
          q: "Why can the biller list show results that do not match what you just typed?",
          options: [
            "The API ignores the query",
            "React caches all billers",
            "The listbox is rendered twice",
            "The list keeps the previous results while the new debounced search runs",
          ],
          answer: 3,
          explain: "Wait for the status of the current search before choosing.",
        },
        {
          q: "After <code>clear()</code> and <code>sendKeys(\"icetel\")</code> the field contains \"iceicetel\". The cause is:",
          options: [
            "clear() changed the DOM without a key event, the component re-rendered and React restored its old state",
            "sendKeys appends by design",
            "The field has maxlength",
            "Chrome autocomplete",
          ],
          answer: 0,
          explain: "Use real key presses (End + Backspace) for fields that already hold text in a React component.",
        },
        {
          q: "Which attribute tells you which option the keyboard highlight is on?",
          options: [
            "<code>aria-selected</code> on the input",
            "<code>data-active</code> on the list",
            "<code>aria-activedescendant</code> on the input",
            "<code>tabindex</code>",
          ],
          answer: 2,
          explain: "The combobox keeps focus in the input and points at the active option by id.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "date-picker",
      title: "The custom date picker",
      summary: "Schedule bill payments by typing or by clicking the calendar, with dates from the sandbox clock and checks on the posting date.",
      links: [
        {
          label: "Open /bills",
          href: "http://localhost:3000/bills",
        },
      ],
      body: `
<p>The payment date on <code>/bills</code> is a custom widget (test id prefix <code>date-picker</code>; the optional end date of a recurring payment uses
<code>end-date-picker</code>):</p>
<ul>
<li><code>date-picker-input</code>: a text field that accepts <code>YYYY-MM-DD</code>. Empty means "pay today".</li>
<li><code>date-picker-toggle</code> opens <code>date-picker-calendar</code> with <code>date-picker-month-label</code> ("November 2026"),
<code>date-picker-prev-month</code>, <code>date-picker-next-month</code> and one button per day, <code>date-picker-day-2026-11-07</code>.</li>
<li>Days before the earliest date are <strong>disabled</strong> buttons; "previous month" is disabled on the first allowed month.</li>
<li>Keyboard: arrows move a day or a week, PageUp/PageDown a month, Home/End the week, Enter or Space picks, Escape closes.</li>
</ul>

<h3>Type, or click?</h3>
<p>Most tests that need a date should <strong>type</strong> it: it is fast and the input is a supported way in. Keep <strong>one or two tests for the
calendar itself</strong> (navigation, disabled days, keyboard). That gives you coverage of the widget without making every payment test depend on it.</p>

<h3>Which "today"?</h3>
<p>Every business date in Ice Bank comes from the <strong>sandbox clock</strong>, not from your computer: tests and the instructor can move it forward, and it
uses Toronto time. Read it with <code>GET /api/v1/test/clock</code> (with the sandbox key; reading is harmless) and compute dates from its
<code>today</code>. <code>LocalDate.now()</code> on a laptop in another time zone, or on a sandbox whose clock was moved, picks the wrong day.</p>

<h3>The business rule behind it</h3>
<p>A scheduled payment posts on its date, or on the <strong>next business day</strong> if that date is a weekend or a holiday (the holiday list is in the
Ice Bank README and on the page). The confirmation shows both dates. Assert them from the <code>data-iso</code> attributes the page puts on those values
(<code>2026-11-09</code>), not from the formatted text ("Nov 9, 2026"), which depends on the locale.</p>

<h3>Worked example</h3>
<p>The test registers a customer and creates a payee through the API, reads the sandbox date, picks the first Saturday at least two days ahead in the
calendar (paging months if needed), reviews and confirms, and checks that the payment date is that Saturday and the posting date the following Monday.
The second test checks that yesterday is disabled and today is not.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li><code>LocalDate.now()</code> for business dates.</li>
<li>Clicking <code>date-picker-day-…</code> without opening the calendar, or for a day in another month without paging to it.</li>
<li>A fixed date in the test ("2026-11-14"): it is in the past next month. Compute it from the clock.</li>
<li>Comparing "Nov 9, 2026" strings built with Java formatting: locale and abbreviation rules differ. Use <code>data-iso</code>.</li>
<li>Picking a Saturday whose Monday is a holiday and expecting Monday. Check the holiday list, or compute the expected day with the rule.</li>
</ul></div>`,
      examples: [
        {
          title: "PayBillPage with the date picker",
          lang: "java",
          code: `
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** {@code /bills}: pay now or schedule, with the custom date picker (test id prefix "date-picker"). */
public class PayBillPage extends BasePage {

    private static final String PICKER = "date-picker";
    private static final DateTimeFormatter MONTH_LABEL = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH);

    public PayBillPage(WebDriver driver) {
        super(driver);
    }

    public PayBillPage open() {
        openPath("/bills");
        visible(testId("bill-payment-form"));
        return this;
    }

    public PayBillPage payee(long payeeId) {
        select(testId("bill-payee-select")).selectByValue(String.valueOf(payeeId));
        return this;
    }

    public PayBillPage from(long accountId) {
        select(testId("bill-from-select")).selectByValue(String.valueOf(accountId));
        return this;
    }

    public PayBillPage amount(String amount) {
        type(testId("bill-amount-input"), amount);
        return this;
    }

    /** The quick way: type YYYY-MM-DD into the picker's text input. */
    public PayBillPage typeDate(LocalDate date) {
        type(testId(PICKER + "-input"), date.toString());
        return this;
    }

    /** The user's way: open the calendar, page to the right month, click the day. */
    @Step("Pick {date} in the calendar")
    public PayBillPage pickDate(LocalDate date) {
        click(testId(PICKER + "-toggle"));
        visible(testId(PICKER + "-calendar"));
        String wanted = YearMonth.from(date).atDay(1).format(MONTH_LABEL);
        for (int i = 0; i < 13 && !text(testId(PICKER + "-month-label")).equals(wanted); i++) {
            click(testId(PICKER + "-next-month"));
        }
        click(testId(PICKER + "-day-" + date));
        waitUntilGone(testId(PICKER + "-calendar"));
        return this;
    }

    /** Opens the calendar and tells whether a day button is disabled (before the earliest date). */
    public boolean isDayDisabled(LocalDate date) {
        click(testId(PICKER + "-toggle"));
        boolean disabled = !visible(testId(PICKER + "-day-" + date)).isEnabled();
        click(testId(PICKER + "-close"));
        return disabled;
    }

    public String dateValue() {
        return visible(testId(PICKER + "-input")).getAttribute("value");
    }

    public String dateSummary() {
        return text(testId("bill-date-summary"));
    }

    public PayBillPage review() {
        click(testId("bill-review-button"));
        visible(testId("bill-review"));
        return this;
    }

    @Step("Confirm the bill payment")
    public PayBillPage confirm() {
        click(testId("bill-confirm-button"));
        visible(testId("bill-confirmation"));
        return this;
    }

    public String successMessage() {
        return text(testId("bill-success-message"));
    }

    /** The posting date as ISO text, read from the data-iso attribute (the visible text is "Nov 9, 2026"). */
    public String postingDateIso() {
        return visible(testId("bill-confirmation-posting-date")).findElement(By.cssSelector("[data-iso]")).getAttribute("data-iso");
    }

    public String paymentDateIso() {
        return visible(testId("bill-confirmation-payment-date")).findElement(By.cssSelector("[data-iso]")).getAttribute("data-iso");
    }
}`,
        },
        {
          title: "BillDateUiTest",
          lang: "java",
          code: `
package com.icebank.tests.ui;

import com.icebank.api.Specs;
import com.icebank.api.TestSupportClient;
import com.icebank.support.NewCustomer;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.UiSession;
import com.icebank.ui.pages.PayBillPage;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("ui")
@Feature("Bill payments")
@ExtendWith(DriverExtension.class)
@DisplayName("Scheduling a bill with the date picker")
class BillDateUiTest {

    private static NewCustomer customer;
    private static long payeeId;

    @BeforeAll
    static void customerWithPayee() {
        customer = NewCustomer.register("sel.tut");
        payeeId = given().spec(Specs.as(customer.email()))
                .body(Map.of("billerId", 2, "accountNumber", "IT20456789", "nickname", "Phone"))
                .when().post("/payees").then().statusCode(201).extract().jsonPath().getLong("id");
    }

    /** "Today" is the sandbox's date, not your computer's: tests and people can move the sandbox clock. */
    private static LocalDate sandboxToday() {
        return LocalDate.parse(TestSupportClient.clock().then().statusCode(200).extract().path("today"));
    }

    @Test
    @DisplayName("A payment picked for a Saturday posts on the next Monday")
    void saturdayPostsOnMonday(WebDriver driver) {
        LocalDate saturday = sandboxToday().plusDays(2).with(TemporalAdjusters.next(DayOfWeek.SATURDAY));
        LocalDate monday = saturday.plusDays(2);

        UiSession.signIn(driver, customer.email());
        PayBillPage bill = new PayBillPage(driver).open()
                .payee(payeeId).from(customer.chequingId()).amount("1.00")
                .pickDate(saturday);
        assertThat(bill.dateValue()).isEqualTo(saturday.toString());
        assertThat(bill.dateSummary()).startsWith("Scheduled for ");

        bill.review().confirm();
        assertThat(bill.successMessage()).isEqualTo("Payment scheduled");
        assertThat(bill.paymentDateIso()).isEqualTo(saturday.toString());
        assertThat(bill.postingDateIso()).isEqualTo(monday.toString());   // pick a Saturday with no holiday on the Monday
    }

    @Test
    @DisplayName("Days before today are disabled in the calendar")
    void pastDaysDisabled(WebDriver driver) {
        LocalDate today = sandboxToday();
        UiSession.signIn(driver, customer.email());
        PayBillPage bill = new PayBillPage(driver).open();
        LocalDate yesterday = today.minusDays(1);
        Assumptions.assumeTrue(yesterday.getMonth() == today.getMonth(), "the calendar opens on today's month");
        assertThat(bill.isDayDisabled(yesterday)).isTrue();
        assertThat(bill.isDayDisabled(today)).isFalse();
    }
}`,
        },
      ],
      exercises: [
        "Keyboard only: open the calendar, wait until today's day button has focus, press PageDown, wait for the next month's label, press Enter, and assert the input holds the same day one month later.",
        "Type <code>2026/11/20</code> into the date field and click Review. Assert the error under the date picker and that the review step did not open.",
        "Schedule a <em>monthly</em> payment starting 3 days after the sandbox date with an end date two months after the start. Assert the confirmation's payment date and the dates in the \"Upcoming payments\" table. How many rows does that table have, and why?",
        "Schedule a one-time payment on a weekday holiday after the sandbox date (for example Remembrance Day, 11 November) and assert the posting date. Skip the test with an assumption when the sandbox date is already past it.",
      ],
      quiz: [
        {
          q: "Where should a test get \"today\" from in Ice Bank?",
          options: [
            "<code>GET /test/clock</code> (the sandbox's date, Toronto)",
            "<code>LocalDate.now()</code>",
            "The browser's clock",
            "The date picker's month label",
          ],
          answer: 0,
          explain: "The sandbox clock is what the app uses for every business rule.",
        },
        {
          q: "Which assertion on the posting date is the most robust?",
          options: [
            "The visible text equals \"Nov 9, 2026\"",
            "The text contains \"9\"",
            "The <code>data-iso</code> attribute equals the expected ISO date",
            "A screenshot comparison",
          ],
          answer: 2,
          explain: "ISO dates do not depend on locale or formatting.",
        },
        {
          q: "A payment is scheduled for a Saturday that is not near a holiday. When does it post?",
          options: [
            "Saturday",
            "Friday before",
            "It is rejected",
            "Monday after",
          ],
          answer: 3,
          explain: "Next business day.",
        },
        {
          q: "Why keep only a few tests that click through the calendar?",
          options: [
            "The calendar is not accessible",
            "Typing the date is a supported, faster way in; the calendar tests cover the widget, the rest cover payments",
            "Clicking days is not possible in Selenium",
            "The calendar is only for admins",
          ],
          answer: 1,
          explain: "Test each thing once, in the cheapest reliable way.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "files",
      title: "File upload and download verification",
      summary: "Upload cheque images through a file input, and verify CSV and PDF downloads either from the download folder or with the browser's cookies.",
      links: [
        {
          label: "Open /deposit",
          href: "http://localhost:3000/deposit",
        },
      ],
      body: `
<h3>Upload: <code>sendKeys</code> the absolute path</h3>
<p>The cheque deposit form has two file inputs, <code>deposit-front-input</code> and <code>deposit-back-input</code>. Selenium never opens the operating
system's file dialog: you call <code>sendKeys(file.getAbsolutePath())</code> on the <code>&lt;input type="file"&gt;</code> itself, and the browser treats it as
chosen. The path is a path on the machine that runs the <em>browser</em>; on a Selenium Grid add <code>((RemoteWebDriver) driver).setFileDetector(new
LocalFileDetector())</code> so the file is sent along. Keep test files in <code>src/test/resources</code> and turn them into a <code>File</code> through the
class loader, so the test works from any working directory.</p>
<p>The page checks the file in the browser (type or name must be JPG/PNG, at most 5 MB, not empty) and shows the chosen name and size
(<code>deposit-front-file-name</code>). The <code>accept</code> attribute only filters the dialog; <code>sendKeys</code> ignores it, so you can and should
try wrong files. The server checks the <strong>content</strong> again: a text file named <code>.png</code> passes the browser check and is refused by the
server.</p>

<h3>Download: two ways to verify</h3>
<ol>
<li><strong>Let Chrome save it.</strong> Set Chrome preferences <code>download.default_directory</code> and <code>download.prompt_for_download=false</code>,
click the link, and wait until a finished file is in the folder (Chrome writes <code>name.crdownload</code> first and renames it). This proves the link
works for a user. Use a fresh folder per test class.</li>
<li><strong>Fetch it with the browser's session.</strong> Read the link's <code>href</code>, take the <code>ib_at</code> cookie from WebDriver (it can see
httpOnly cookies) and call the URL with REST Assured. You get the status, the headers (<code>Content-Type</code>, <code>Content-Disposition</code>) and the
bytes, with no file system. This is the better way to check <em>content</em>.</li>
</ol>
<p>What to check: the CSV header line (<code>id,createdAt,postedAt,description,type,direction,amount,balanceAfter,status,referenceId</code>), the rows you
expect, and that the filters you applied on screen are in the file. For a PDF: <code>application/pdf</code>, the first bytes <code>%PDF-</code>, the file
name (<code>icebank-statement-7919-2026-10.pdf</code>); to read its text you would add a PDF library such as Apache PDFBox.</p>

<h3>Worked example</h3>
<p><code>FilesUiTest</code> uploads both sample cheque images for a new customer, checks the result card and finds the reference through
<code>GET /deposits</code>; tries a text file and reads the browser-side error; downloads the CSV by clicking into a per-class folder; and fetches it again
with the cookies to check the headers. <code>DriverFactory</code> got one optional setting for the download folder.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Relative paths in <code>sendKeys</code> ("src/test/resources/…"): they depend on where the test was started.</li>
<li>Clicking the file input: it opens a native dialog Selenium cannot control.</li>
<li>Reading the download folder as soon as the click returns: the file is not there yet, or is still <code>.crdownload</code>.</li>
<li>One shared download folder for all tests: you read another test's file.</li>
<li>Only checking that "a file appeared". Open it and check the content.</li>
</ul></div>`,
      examples: [
        {
          title: "DriverFactory: an optional download folder",
          lang: "java",
          code: `
// Tutorial 9, lesson 8: save downloads to a known folder without asking (-DdownloadDir=target/downloads)
String downloadDir = Config.getOrDefault("downloadDir", "");
if (!downloadDir.isBlank()) {
    options.setExperimentalOption("prefs", java.util.Map.of(
            "download.default_directory", new File(downloadDir).getAbsolutePath(),
            "download.prompt_for_download", false));
}`,
          note: "Add inside <code>create()</code>, before the binary lookup. A test class sets <code>System.setProperty(\"downloadDir\", ...)</code> in <code>@BeforeAll</code>; <code>Config</code> reads system properties first.",
        },
        {
          title: "DepositPage",
          lang: "java",
          code: `
import java.io.File;

/** {@code /deposit}: cheque deposit with two file inputs (front and back image). */
public class DepositPage extends BasePage {

    public DepositPage(WebDriver driver) {
        super(driver);
    }

    public DepositPage open() {
        openPath("/deposit");
        visible(testId("deposit-form"));
        return this;
    }

    /**
     * Fills the form. A file input takes the ABSOLUTE path of a file on the machine that runs the browser:
     * sendKeys(path) is the whole upload, no click and no OS dialog.
     */
    @Step("Fill in a cheque deposit of {amount}")
    public DepositPage fill(long accountId, String amount, File front, File back) {
        select(testId("deposit-account-select")).selectByValue(String.valueOf(accountId));
        type(testId("deposit-amount-input"), amount);
        driver.findElement(testId("deposit-front-input")).sendKeys(front.getAbsolutePath());
        driver.findElement(testId("deposit-back-input")).sendKeys(back.getAbsolutePath());
        return this;
    }

    /** What the page shows after a file was chosen, e.g. "sample-cheque-front.png". */
    public String fileName(String side) {
        return text(testId("deposit-" + side + "-file-name"));
    }

    public String fileError(String side) {
        return text(testId("deposit-" + side + "-error"));
    }

    @Step("Submit the deposit")
    public DepositPage submit() {
        click(testId("deposit-submit-button"));
        return this;
    }

    public DepositPage waitForResult() {
        visible(testId("deposit-result"));
        return this;
    }

    public String resultAmount() {
        return text(testId("deposit-result-amount"));
    }

    public String resultImmediate() {
        return text(testId("deposit-result-immediate"));
    }

    public String resultStatus() {
        return text(testId("deposit-result-status"));
    }

    public String resultReference() {
        return text(testId("deposit-result-reference"));
    }

    public By submitButton() {
        return testId("deposit-submit-button");
    }
}`,
        },
        {
          title: "FilesUiTest: upload, wrong file, two kinds of download check",
          lang: "java",
          code: `
package com.icebank.tests.ui;

import com.icebank.api.Specs;
import com.icebank.support.NewCustomer;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.DriverFactory;
import com.icebank.ui.UiSession;
import com.icebank.ui.pages.AccountPage;
import com.icebank.ui.pages.DepositPage;
import io.qameta.allure.Feature;
import io.restassured.response.Response;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static com.icebank.ui.pages.BasePage.testId;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("ui")
@Feature("Cheque deposit and downloads")
@ExtendWith(DriverExtension.class)
@DisplayName("File upload and download")
class FilesUiTest {

    private static NewCustomer customer;
    private static Path downloads;

    @BeforeAll
    static void setUp() throws IOException {
        customer = NewCustomer.register("sel.tut");
        downloads = Files.createDirectories(Path.of("target", "downloads", UUID.randomUUID().toString()));
        System.setProperty("downloadDir", downloads.toString());     // read by DriverFactory for every new Chrome
    }

    @Test
    @DisplayName("Upload the front and back of a cheque and see the deposit")
    void uploadCheque(WebDriver driver) {
        UiSession.signIn(driver, customer.email());
        DepositPage deposit = new DepositPage(driver).open().fill(customer.chequingId(), "25.00",
                NewCustomer.resource("cheques/sample-cheque-front.png"), NewCustomer.resource("cheques/sample-cheque-back.png"));
        assertThat(deposit.fileName("front")).isEqualTo("sample-cheque-front.png");

        deposit.submit().waitForResult();
        assertThat(deposit.resultAmount()).isEqualTo("$25.00");
        assertThat(deposit.resultImmediate()).isEqualTo("$25.00");                     // the first $100 is available at once
        String reference = deposit.resultReference();

        List<String> refs = given().spec(Specs.as(customer.email())).when().get("/deposits")
                .then().statusCode(200).extract().jsonPath().getList("content.referenceId");
        assertThat(refs).contains(reference);
    }

    @Test
    @DisplayName("A text file is refused before anything is sent")
    void wrongFileType(WebDriver driver) {
        UiSession.signIn(driver, customer.email());
        DepositPage deposit = new DepositPage(driver).open().fill(customer.chequingId(), "10.00",
                NewCustomer.resource("cheques/not-a-cheque.txt"), NewCustomer.resource("cheques/sample-cheque-back.png"));
        assertThat(deposit.fileError("front")).isEqualTo("The image must be a JPG or PNG file.");
    }

    @Test
    @DisplayName("Download the CSV by clicking, then check the saved file")
    void downloadCsvByClicking(WebDriver driver) throws IOException {
        customer.depositCheque(customer.chequingId(), "12.34");
        UiSession.signIn(driver, customer.email());
        new AccountPage(driver).open(customer.chequingId());
        driver.findElement(testId("transactions-download-csv")).click();

        // Chrome writes "name.csv.crdownload" first and renames it when done: wait for a finished .csv.
        Path csv = DriverFactory.waitFor(driver, Duration.ofSeconds(15)).until(d -> {
            try (var files = Files.list(downloads)) {
                return files.filter(f -> f.toString().endsWith(".csv")).findFirst().orElse(null);
            } catch (IOException e) {
                return null;
            }
        });
        List<String> lines = Files.readAllLines(csv);
        assertThat(csv.getFileName().toString()).matches("icebank-\\\\d{4}-transactions\\\\.csv");
        assertThat(lines.get(0)).isEqualTo("id,createdAt,postedAt,description,type,direction,amount,balanceAfter,status,referenceId");
        assertThat(lines).anyMatch(l -> l.contains(",Mobile cheque deposit,CHEQUE_DEPOSIT,CREDIT,12.34,"));
    }

    @Test
    @DisplayName("Or download it with the browser's cookies through REST Assured, and check headers too")
    void downloadCsvWithBrowserCookies(WebDriver driver) {
        UiSession.signIn(driver, customer.email());
        new AccountPage(driver).open(customer.chequingId());
        String href = driver.findElement(testId("transactions-download-csv")).getAttribute("href");   // absolute URL
        String token = driver.manage().getCookieNamed("ib_at").getValue();                          // WebDriver sees httpOnly cookies

        Response csv = given().cookie("ib_at", token).when().get(href);
        assertThat(csv.statusCode()).isEqualTo(200);
        assertThat(csv.contentType()).startsWith("text/csv");
        assertThat(csv.header("Content-Disposition")).contains("attachment").contains(".csv");
    }
}`,
        },
      ],
      exercises: [
        "Write a small text file to a JUnit <code>@TempDir</code> under the name <code>cheque-front.png</code> and upload it as the front. Show that the browser does not complain, then submit and assert the server's message under the front image and the page alert.",
        "Deposit a 150.00 cheque in the browser. Assert \"Available now\" $100.00, \"On hold\" $50.00, status PENDING and that the hold note is shown.",
        "Filter the account page by type \"Cheque deposit\" and download the CSV with the browser's cookies. Assert the link carries the filter and every data row has type <code>CHEQUE_DEPOSIT</code>. (Hint: if every row already is a cheque deposit, what will \"wait until the table changes\" do?)",
        "As Emma (read-only), download her newest statement by <em>clicking</em> Download on <code>/statements</code> into a download folder. Assert the file name pattern and that the file starts with <code>%PDF-</code>.",
      ],
      quiz: [
        {
          q: "How does Selenium upload a file?",
          options: [
            "Click the input and type the path into the OS dialog",
            "Drag and drop with Actions",
            "<code>sendKeys</code> the absolute path to the <code>input type=\"file\"</code>",
            "Base64 in a hidden field",
          ],
          answer: 2,
          explain: "No dialog is involved. On a Grid, add a LocalFileDetector.",
        },
        {
          q: "You renamed a .txt file to .png. What happens on the deposit page?",
          options: [
            "The browser accepts it (name check) and the server refuses it (content check)",
            "The browser refuses it",
            "Both accept it",
            "Chrome crashes",
          ],
          answer: 0,
          explain: "The server sniffs the content: test both layers.",
        },
        {
          q: "Chrome is downloading <code>statement.pdf</code>. What is in the folder while it is still downloading?",
          options: [
            "statement.pdf, partly written",
            "Nothing",
            "A .tmp file in the project folder",
            "statement.pdf.crdownload",
          ],
          answer: 3,
          explain: "Wait for the final name.",
        },
        {
          q: "Why fetch the CSV with REST Assured and the browser's <code>ib_at</code> cookie?",
          options: [
            "Selenium cannot click links",
            "It gives you status, headers and content without depending on the file system, using the same session as the browser",
            "The CSV is only available through the API",
            "It avoids the rate limit",
          ],
          answer: 1,
          explain: "Use clicking to prove the link works, and the HTTP check to verify what it returns.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "windows-frames",
      title: "Tabs, windows and the loan calculator iframe",
      summary: "Follow Ice Mail and statement PDFs into new tabs and come back, and work inside the loan calculator's iframe.",
      links: [
        {
          label: "Open /loans",
          href: "http://localhost:3000/loans",
        },
      ],
      body: `
<h3>New tabs</h3>
<p>Ice Mail (<code>nav-link-icemail</code>, and "Open Ice Mail" on the OTP page), the Swagger link in the user menu and "View PDF" on statements open with
<code>target="_blank"</code>. The driver does <strong>not</strong> follow: after the click it still controls the old tab. The pattern:</p>
<ol>
<li>Remember the current handle: <code>String bank = driver.getWindowHandle()</code>.</li>
<li>Click, then <code>wait.until(ExpectedConditions.numberOfWindowsToBe(2))</code>.</li>
<li>Switch to the handle that is not <code>bank</code>, wait for something on the new page (a URL, an element).</li>
<li>Do the work, <code>driver.close()</code> (closes the <em>current</em> tab only), and <code>driver.switchTo().window(bank)</code>.</li>
</ol>
<p><code>driver.switchTo().newWindow(WindowType.TAB)</code> opens <em>and switches to</em> a blank tab, useful when you want to open a page yourself (for
example Ice Mail at <code>/mail?email=…</code>). <code>quit()</code> ends the whole browser and is the extension's job, not the test's.</p>

<h3>The iframe</h3>
<p>The loan calculator on <code>/loans</code> is a separate page (<code>/loan-calculator</code>) inside <code>&lt;iframe data-testid="loan-calculator-iframe"&gt;</code>.
From the top document, its fields do not exist: <code>findElements(testId("calc-amount-input"))</code> is empty. Switch in with
<code>wait.until(ExpectedConditions.frameToBeAvailableAndSwitchToIt(locator))</code>, work, and switch out with
<code>driver.switchTo().defaultContent()</code>. Elements found inside the frame cannot be used after you leave it. A page object for the frame makes the
switching explicit: <code>loans.calculator()</code> switches in and returns the calculator; <code>calc.leave()</code> switches back and returns the Loans page.</p>
<p>The calculator uses the formula from the README: payment = P·r / (1 − (1 + r)<sup>−n</sup>) with r = 8.99% / 12, rounded to the cent. Total interest is
<em>not</em> simply payment × n − P: the schedule rounds each row and the last row absorbs the leftover cents, which is why $15,000 over 48 months shows a
monthly payment of $373.20 and a total interest of $2,913.88.</p>

<h3>Worked example</h3>
<p>The first test signs in the way a person does: password, then "Open Ice Mail" in a new tab, open the newest OTP message, read the code, close the
tab, switch back, type the code. The second follows "View PDF" for Emma's newest statement into its tab and then downloads the PDF with the session. The
third works the calculator in the iframe, including a validation error, and leaves the frame.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Assuming the driver switched to the new tab after the click.</li>
<li>Picking the new tab with <code>new ArrayList&lt;&gt;(getWindowHandles()).get(1)</code>: the set has no guaranteed order. Pick the handle that is not the old one.</li>
<li><code>driver.close()</code> and then any command without switching: <code>NoSuchWindowException</code>, the driver points at a closed tab.</li>
<li>Searching for frame content from the top document, or for the page's content while still in the frame.</li>
<li>Switching into a frame by index (<code>frame(0)</code>): adding an ad or a chat widget changes the index.</li>
</ul></div>`,
      examples: [
        {
          title: "Window handling: the code from the Ice Mail tab",
          lang: "java",
          code: `
@Test
@DisplayName("Sign in like a user: read the code in the Ice Mail tab, come back, type it")
void codeFromIceMailTab(WebDriver driver) {
    OtpPage otp = new LoginPage(driver).open().signIn(customer.email(), Personas.password());
    String bankTab = driver.getWindowHandle();
    WebDriverWait wait = DriverFactory.waitFor(driver);

    driver.findElement(testId("otp-open-icemail-link")).click();                  // target="_blank"
    wait.until(ExpectedConditions.numberOfWindowsToBe(2));
    String mailTab = driver.getWindowHandles().stream().filter(h -> !h.equals(bankTab)).findFirst().orElseThrow();
    driver.switchTo().window(mailTab);

    wait.until(ExpectedConditions.elementToBeClickable(By.cssSelector("[data-testid^='icemail-message-'][data-kind='OTP']"))).click();
    String code = wait.until(ExpectedConditions.visibilityOfElementLocated(testId("icemail-otp-code"))).getText().trim();
    driver.close();                                                                 // closes the CURRENT tab only
    driver.switchTo().window(bankTab);                                              // the driver does not switch back by itself

    DashboardPage dashboard = otp.enterCode(code);
    assertThat(dashboard.greeting()).isEqualTo("Good day, Uma");
}`,
        },
        {
          title: "The statement PDF tab",
          lang: "java",
          code: `
@Test
@DisplayName("View PDF opens the statement in a new tab; Download returns a real PDF")
void statementPdf(WebDriver driver) {
    UiSession.signIn(driver, Personas.EMMA);                                        // read-only: statements are Emma's history
    StatementsPage statements = new StatementsPage(driver).open(Personas.EMMA_CHEQUING);
    String month = statements.months().get(0);                                      // newest month first
    String bankTab = driver.getWindowHandle();

    statements.viewPdfLink(month).click();
    WebDriverWait wait = DriverFactory.waitFor(driver);
    wait.until(ExpectedConditions.numberOfWindowsToBe(2));
    Set<String> handles = driver.getWindowHandles();
    handles.remove(bankTab);
    driver.switchTo().window(handles.iterator().next());
    wait.until(ExpectedConditions.urlContains("/statements/" + month + ".pdf"));
    assertThat(driver.getCurrentUrl()).endsWith("?inline=1");
    driver.close();
    driver.switchTo().window(bankTab);

    String token = driver.manage().getCookieNamed("ib_at").getValue();
    Response pdf = given().cookie("ib_at", token).when().get(statements.downloadLink(month).getAttribute("href"));
    assertThat(pdf.statusCode()).isEqualTo(200);
    assertThat(pdf.contentType()).isEqualTo("application/pdf");
    assertThat(new String(pdf.asByteArray(), 0, 5)).isEqualTo("%PDF-");
}`,
        },
        {
          title: "LoansPage with a page object for the iframe",
          lang: "java",
          code: `
/** {@code /loans}: the customer's loans and the loan calculator, which lives in an iframe. */
public class LoansPage extends BasePage {

    public LoansPage(WebDriver driver) {
        super(driver);
    }

    public LoansPage open() {
        openPath("/loans");
        visible(testId("loan-calculator-section"));
        return this;
    }

    /** Switches the driver INTO the iframe and returns the calculator. Call {@link LoanCalculator#leave()} afterwards. */
    @Step("Switch into the loan calculator iframe")
    public LoanCalculator calculator() {
        wait.until(ExpectedConditions.frameToBeAvailableAndSwitchToIt(testId("loan-calculator-iframe")));
        return new LoanCalculator(driver);
    }

    /** The page inside the iframe. Its locators only work while the driver is switched into the frame. */
    public static class LoanCalculator extends BasePage {

        LoanCalculator(WebDriver driver) {
            super(driver);
            visible(testId("calc-form"));
        }

        @Step("Calculate {amount} over {months} months")
        public LoanCalculator calculate(String amount, int months) {
            type(testId("calc-amount-input"), amount);
            type(testId("calc-term-input"), String.valueOf(months));
            click(testId("calc-calculate-button"));
            return this;
        }

        /** "$373.20" once the result is shown (it shows "-" before the first calculation). */
        public String monthlyPayment() {
            wait.until(d -> d.findElement(testId("calc-monthly-payment")).getText().startsWith("$"));
            return text(testId("calc-monthly-payment"));
        }

        public String totalInterest() {
            return text(testId("calc-total-interest"));
        }

        public String amountError() {
            return text(testId("calc-amount-error"));
        }

        /** Back to the Loans page (the top-level document). */
        public LoansPage leave() {
            driver.switchTo().defaultContent();
            return new LoansPage(driver);
        }
    }
}`,
        },
        {
          title: "The calculator test",
          lang: "java",
          code: `
@Test
@DisplayName("The calculator in the iframe: switch in, calculate, switch back out")
void loanCalculatorIframe(WebDriver driver) {
    UiSession.signIn(driver, customer.email());
    LoansPage loans = new LoansPage(driver).open();
    assertThat(driver.findElements(testId("calc-amount-input"))).as("not visible from the top document").isEmpty();

    LoansPage.LoanCalculator calc = loans.calculator();
    assertThat(calc.calculate("15000.00", 48).monthlyPayment()).isEqualTo("$373.20");
    assertThat(calc.totalInterest()).isEqualTo("$2,913.88");
    calc.calculate("500", 48);
    assertThat(calc.amountError()).isEqualTo("Enter an amount from $1,000.00 to $50,000.00.");

    calc.leave();
    assertThat(driver.findElement(testId("page-title")).getText()).isEqualTo("My loans");
}`,
        },
      ],
      exercises: [
        "On the OTP page, open Ice Mail yourself with <code>driver.switchTo().newWindow(WindowType.TAB)</code> and <code>/mail?email=…</code>, read the newest code, close the tab, switch back and finish the sign-in.",
        "Use the user menu's \"API (Swagger)\" link. Assert a second tab opens on <code>/swagger</code> with the <code>swagger-ui</code> element, close it and assert you are back on the dashboard.",
        "Parameterize the calculator test over at least four amount/term pairs (include the limits $1,000/12 and $50,000/60). Compute the expected payment in the test with <code>BigDecimal</code> from the README formula and compare with the iframe.",
        "Explain what happens, and which exception you get, if a test calls <code>calc.leave()</code> and then <code>calc.calculate(...)</code> again. How does the page object design make that mistake visible?",
      ],
      quiz: [
        {
          q: "After clicking a <code>target=\"_blank\"</code> link, which window does the driver control?",
          options: [
            "The new tab",
            "The original tab, until you switch",
            "Both",
            "None until you call refresh",
          ],
          answer: 1,
          explain: "Always switch explicitly, and back again when you are done.",
        },
        {
          q: "Which wait fits switching into the loan calculator?",
          options: [
            "<code>visibilityOfElementLocated(calc-amount-input)</code>",
            "<code>numberOfWindowsToBe(2)</code>",
            "<code>alertIsPresent()</code>",
            "<code>frameToBeAvailableAndSwitchToIt(loan-calculator-iframe)</code>",
          ],
          answer: 3,
          explain: "It waits for the frame and switches in one step.",
        },
        {
          q: "<code>driver.close()</code> on the Ice Mail tab, then <code>driver.findElement(...)</code> with no switch. Result?",
          options: [
            "NoSuchWindowException",
            "It searches the bank tab",
            "The browser quits",
            "It reopens Ice Mail",
          ],
          answer: 0,
          explain: "The driver still points at the closed tab.",
        },
        {
          q: "$15,000 over 48 months at 8.99%: why is total interest $2,913.88 and not 48 × $373.20 − $15,000 = $2,913.60?",
          options: [
            "A display bug",
            "Interest is compounded daily",
            "The last schedule row absorbs the rounding of the other rows",
            "The calculator adds a fee",
          ],
          answer: 2,
          explain: "The README says so: each row is rounded and the last one takes the leftover cents.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "dialogs",
      title: "Browser alerts and the session-timeout modal",
      summary: "Accept and dismiss the native confirm() when cancelling an e-Transfer, and test the idle-timeout modal without waiting 9 minutes.",
      links: [
        {
          label: "Open /etransfer",
          href: "http://localhost:3000/etransfer",
        },
      ],
      body: `
<h3>A native dialog: <code>confirm()</code></h3>
<p>Cancelling a pending e-Transfer in the "Sent e-Transfers" table (<code>sent-etransfer-cancel-{id}</code>) asks with the browser's own
<code>window.confirm("Cancel this e-Transfer of $5.00 to Friend Tester?")</code>. It is not part of the page: no locator finds it and a screenshot does not
show it. WebDriver handles it through <code>switchTo().alert()</code>:</p>
<ul>
<li><code>wait.until(ExpectedConditions.alertIsPresent())</code> returns the <code>Alert</code>.</li>
<li><code>getText()</code> reads the message; <code>accept()</code> is OK (cancel the transfer), <code>dismiss()</code> is Cancel (keep it).</li>
<li>While the dialog is open the page is blocked. Any other command fails with <code>UnhandledAlertException</code>. Chrome's default
<code>unhandledPromptBehavior</code> is "dismiss and notify": it dismisses the dialog <em>and</em> throws, so the action you meant to confirm silently did not
happen. You can change the default with <code>ChromeOptions.setUnhandledPromptBehaviour(...)</code>, but a test should handle its dialogs explicitly.</li>
</ul>

<h3>A custom modal: the session timeout</h3>
<p>After <strong>9 minutes</strong> without mouse, keyboard or scroll activity a modal appears (<code>session-timeout-modal</code>, title
"Are you still there?", <code>session-timeout-countdown</code>), and at <strong>10 minutes</strong> the app signs out and opens
<code>/login?timeout=1</code> with the notice "You were signed out because you were inactive for 10 minutes." "Stay signed in" refreshes the session
(<code>POST /auth/refresh</code>) and closes the modal; "Sign out" signs out. This modal <em>is</em> in the DOM: normal locators and waits.</p>
<p>Nobody waits 9 minutes in a test. The app reads two localStorage keys every second, <code>icebank-idle-warning-seconds</code> and
<code>icebank-idle-logout-seconds</code>, made for testers. Set them with <code>JavascriptExecutor</code> on any signed-in page (no reload needed), for
example 5 and 60 seconds. Two details: activity resets the idle timer only while the modal is not shown, and a Selenium script call is not "activity", but
an Actions mouse move is.</p>

<h3>Worked example</h3>
<p>The e-Transfer test sends 5.00 to an address that is nobody's, clicks Cancel, reads the dialog text, dismisses (status stays PENDING), clicks Cancel again
and accepts, waits for the "cancelled" toast (not the "sent" one, which is still showing) and the CANCELLED status, and checks through the API that the
balance is back. The modal tests shorten the limits, wait for the modal, press Stay, and in a second test let the session run out.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Looking for the confirm dialog with a locator, or taking a screenshot to "see" it.</li>
<li>Clicking Cancel and continuing as if the dialog were not there: the default behaviour dismisses it, the transfer stays pending, and the error
appears one line later.</li>
<li>Forgetting that localStorage belongs to the browser profile: the starter's <code>DriverExtension</code> starts a fresh Chrome per test, so the short
limits do not leak into other tests. A shared driver would carry them over.</li>
<li>Waiting for the modal with the default 10-second timeout when the warning is set to 10 seconds: give the wait the warning time plus a margin.</li>
<li>Sending an e-Transfer to a persona's email in a write test: it lands in their received list.</li>
</ul></div>`,
      examples: [
        {
          title: "SentETransfers: Cancel returns the Alert",
          lang: "java",
          code: `
/** The "Sent e-Transfers" table on /etransfer. Cancel asks with the browser's own confirm() dialog. */
public class SentETransfers extends BasePage {

    public SentETransfers(WebDriver driver) {
        super(driver);
    }

    /** The row with this reference, once the table shows it. */
    public WebElement row(String reference) {
        return wait.until(d -> d.findElements(By.cssSelector("[data-testid^='sent-etransfer-row-']")).stream()
                .filter(r -> r.findElement(testId("sent-etransfer-reference")).getText().trim().equals(reference))
                .findFirst().orElse(null));
    }

    public long idOf(String reference) {
        return Long.parseLong(row(reference).getAttribute("data-testid").substring("sent-etransfer-row-".length()));
    }

    public String status(String reference) {
        return row(reference).findElement(testId("sent-etransfer-status")).getText().trim();
    }

    /** Clicks Cancel and returns the native dialog. The page is blocked until you accept() or dismiss() it. */
    @Step("Click Cancel on e-Transfer {reference}")
    public Alert clickCancel(String reference) {
        click(testId("sent-etransfer-cancel-" + idOf(reference)));
        return wait.until(ExpectedConditions.alertIsPresent());
    }

    /** Waits until the row shows {@code status} (the table reloads after the cancel call). */
    public void waitForStatus(String reference, String status) {
        wait.until(d -> status.equals(status(reference)));
    }
}`,
        },
        {
          title: "SessionTimeoutModal",
          lang: "java",
          code: `
import java.time.Duration;

/**
 * The "Are you still there?" modal: shown after 9 minutes without mouse or keyboard activity, sign-out at 10.
 * For tests, shorten both with localStorage keys the app reads every second.
 */
public class SessionTimeoutModal extends BasePage {

    private static final By MODAL = testId("session-timeout-modal");

    public SessionTimeoutModal(WebDriver driver) {
        super(driver);
    }

    /** Sets the idle limits for this browser (any signed-in page). Takes effect within a second, no reload needed. */
    public static void shortenIdleLimits(WebDriver driver, int warningSeconds, int logoutSeconds) {
        ((JavascriptExecutor) driver).executeScript(
                "localStorage.setItem('icebank-idle-warning-seconds', arguments[0]);"
                        + "localStorage.setItem('icebank-idle-logout-seconds', arguments[1]);",
                String.valueOf(warningSeconds), String.valueOf(logoutSeconds));
    }

    /** Waits for the modal. {@code atMost} must be longer than the warning time. */
    public SessionTimeoutModal waitUntilShown(Duration atMost) {
        waitFor(atMost).until(ExpectedConditions.visibilityOfElementLocated(MODAL));
        return this;
    }

    public int secondsLeft() {
        return Integer.parseInt(text(testId("session-timeout-countdown")));
    }

    public String title() {
        return text(testId("session-timeout-modal-title"));
    }

    public void staySignedIn() {
        click(testId("session-timeout-stay-button"));
        waitUntilGone(MODAL);
    }

    public void signOut() {
        click(testId("session-timeout-signout-button"));
    }

    public boolean isShown() {
        return !driver.findElements(MODAL).isEmpty();
    }
}`,
        },
        {
          title: "DialogsUiTest",
          lang: "java",
          code: `
package com.icebank.tests.ui;

import com.icebank.api.AccountsClient;
import com.icebank.support.NewCustomer;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.DriverFactory;
import com.icebank.ui.UiSession;
import com.icebank.ui.components.Toasts;
import com.icebank.ui.pages.ETransferPage;
import com.icebank.ui.pages.SentETransfers;
import com.icebank.ui.pages.SessionTimeoutModal;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.Alert;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.UUID;

import static com.icebank.ui.pages.BasePage.testId;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("ui")
@Feature("Dialogs")
@ExtendWith(DriverExtension.class)
@DisplayName("The native confirm() and the session-timeout modal")
class DialogsUiTest {

    private static NewCustomer customer;
    private final AccountsClient accounts = new AccountsClient();

    @BeforeAll
    static void customerWithMoney() {
        customer = NewCustomer.register("sel.tut");
        customer.depositCheque(customer.chequingId(), "100.00");
    }

    @Test
    @DisplayName("Cancel an e-Transfer: dismiss keeps it, accept cancels it and refunds")
    void cancelETransferWithConfirm(WebDriver driver) {
        BigDecimal before = accounts.account(customer.email(), customer.chequingId()).balance();
        UiSession.signIn(driver, customer.email());
        String friend = "friend." + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        ETransferPage page = new ETransferPage(driver).open()
                .send(customer.chequingId(), "Friend Tester", friend, "5.00", "Our first pet's name?", "Biscuit");
        String reference = page.confirmationReference();
        SentETransfers sent = page.sent();
        assertThat(sent.status(reference)).isEqualTo("PENDING");

        Alert alert = sent.clickCancel(reference);
        assertThat(alert.getText()).isEqualTo("Cancel this e-Transfer of $5.00 to Friend Tester?");
        alert.dismiss();                                                        // "Cancel" in the dialog = keep the transfer
        assertThat(sent.status(reference)).isEqualTo("PENDING");

        sent.clickCancel(reference).accept();                                   // "OK" = cancel the transfer
        new Toasts(driver).waitForSuccess("e-Transfer to Friend Tester cancelled. $5.00 was returned to your account.");
        sent.waitForStatus(reference, "CANCELLED");
        assertThat(accounts.account(customer.email(), customer.chequingId()).balance()).isEqualByComparingTo(before);
    }

    @Test
    @DisplayName("The timeout modal appears after the (shortened) idle time, and Stay signed in closes it")
    void staySignedIn(WebDriver driver) {
        UiSession.signIn(driver, customer.email());
        SessionTimeoutModal.shortenIdleLimits(driver, 5, 60);
        SessionTimeoutModal modal = new SessionTimeoutModal(driver).waitUntilShown(Duration.ofSeconds(15));

        assertThat(modal.title()).isEqualTo("Are you still there?");
        assertThat(modal.secondsLeft()).isBetween(1, 60);
        modal.staySignedIn();
        assertThat(modal.isShown()).isFalse();
        assertThat(driver.getCurrentUrl()).endsWith("/dashboard");
    }

    @Test
    @DisplayName("Doing nothing signs the user out and the login page says why")
    void idleSignOut(WebDriver driver) {
        UiSession.signIn(driver, customer.email());
        SessionTimeoutModal.shortenIdleLimits(driver, 3, 8);
        DriverFactory.waitFor(driver, Duration.ofSeconds(20)).until(ExpectedConditions.urlContains("/login?timeout=1"));
        assertThat(DriverFactory.waitFor(driver).until(ExpectedConditions.visibilityOfElementLocated(testId("login-notice"))).getText())
                .isEqualTo("You were signed out because you were inactive for 10 minutes.");
    }
}`,
        },
      ],
      exercises: [
        "With short idle limits, wait for the modal and click \"Sign out\". Assert the URL is <code>/login?signedOut=1</code> and the notice reads \"You have signed out. See you soon!\".",
        "Assert the countdown really counts down: read it, then wait (with a lambda condition) until it is at least 2 lower.",
        "Set a 6-second warning. For 12 seconds, move the mouse a few pixels with Actions every 2 seconds and assert the modal never appears; then stop and assert it appears. Explain why <code>executeScript</code> would not have kept the session alive.",
        "Show what happens when a test forgets the dialog: click Cancel on a pending e-Transfer, then click another button without handling the alert. Assert the exception type and the transfer's status afterwards, and explain both.",
      ],
      quiz: [
        {
          q: "How do you read the text of the confirm() dialog?",
          options: [
            "<code>wait.until(alertIsPresent()).getText()</code>",
            "<code>driver.findElement(By.tagName(\"dialog\")).getText()</code>",
            "From the page source",
            "From a screenshot",
          ],
          answer: 0,
          explain: "Native dialogs live outside the DOM.",
        },
        {
          q: "In the e-Transfer confirm dialog, which method keeps the transfer?",
          options: [
            "<code>accept()</code>",
            "<code>sendKeys(\"no\")</code>",
            "<code>dismiss()</code>",
            "<code>close()</code>",
          ],
          answer: 2,
          explain: "dismiss() is the dialog's Cancel button: \"do not cancel the transfer\".",
        },
        {
          q: "How do you test the timeout modal without waiting 9 minutes?",
          options: [
            "Move the sandbox clock",
            "Delete the ib_at cookie",
            "Call /auth/logout",
            "Set <code>icebank-idle-warning-seconds</code> and <code>icebank-idle-logout-seconds</code> in localStorage",
          ],
          answer: 3,
          explain: "The app reads them every second. The sandbox clock is for business dates and is shared.",
        },
        {
          q: "Chrome's default unhandledPromptBehavior is \"dismiss and notify\". What does that mean for a test that ignores an open confirm()?",
          options: [
            "The dialog is accepted",
            "The dialog is dismissed and the next command throws UnhandledAlertException",
            "Nothing; the dialog stays open",
            "The browser closes",
          ],
          answer: 1,
          explain: "The action you wanted did not happen, and you find out one command later.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "dynamic-table",
      title: "The transactions table: sort, filter, paginate",
      summary: "Read a re-rendering table safely and verify every sort, filter and page against the API, which the UI calls with the same parameters.",
      links: [
        {
          label: "Open Emma's chequing",
          href: "http://localhost:3000/accounts/1",
        },
      ],
      body: `
<p><code>/accounts/{id}</code> has the richest table in Ice Bank (<code>transactions-table</code>): one row per transaction
(<code>transaction-row-{id}</code> with cells <code>transaction-date</code>, <code>-description</code>, <code>-type</code>, <code>-status</code>,
<code>-amount</code>, <code>-balance</code>), sort buttons in four headers (<code>transactions-sort-createdAt</code>, <code>-description</code>,
<code>-type</code>, <code>-amount</code>), a filter form (dates, type, min/max amount, text), a page-size select (10, 20, 50, 100) and pagination
(<code>transactions-pagination-summary</code> "Page 1 of 17 · 334 results", <code>-prev</code>, <code>-next</code>).</p>
<p>Every change calls <code>GET /accounts/{id}/transactions?page=…&amp;size=…&amp;sort=field,dir&amp;…filters</code> and replaces the rows. The
header's <code>aria-sort</code> says the current order ("ascending", "descending", "none"). The first click on Date or Amount sorts descending, on
Description or Type ascending; a second click reverses.</p>

<h3>The oracle is the API</h3>
<p>Do not re-implement sorting in Java and compare with the screen ("is this list sorted by amount?"): ties, signs and the description's second line
make that harder than it looks and it tests your code, not the app. Instead, ask the API for the same page with the same parameters and compare
<strong>row ids</strong>, in order. Then check how a few values are shown: an amount is <code>-</code> or <code>+</code> by direction plus
<code>TestData.uiMoney(amount)</code>.</p>

<h3>Reading a table that re-renders</h3>
<p>When you click a header, the old rows stay until the new data arrives, then React replaces them. Two problems follow. If you read too early, you read the
<em>old</em> rows. If you read during the swap, an element you just found is gone (<code>StaleElementReferenceException</code>). <code>AccountPage</code>
solves both: before an action it records a fingerprint of the table (summary text, first and last row id, row count); after the action it waits until the
fingerprint is different, ignoring stale-element errors while it polls; and it reads rows into plain <code>Row</code> records at once, so tests never
hold <code>WebElement</code>s from a table.</p>
<p>The fingerprint has one limit: if an action does not change the table (filtering by a type that every row already has), it waits until the timeout.
For such cases wait for another signal that the action happened, for example the CSV link's <code>href</code>, which carries the active filters.</p>

<h3>Worked example</h3>
<p>Four read-only tests on Emma's chequing: the first page equals the API's first 20 rows with matching amounts and summary; sorting by amount
descending then ascending equals <code>sort=amount,desc</code> and <code>amount,asc</code>; a type plus text filter gives the API's count and only matching
rows; 10 rows per page and page 2 equal the API's page 1.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>Asserting a fixed count ("334 results"): it is true after a reset and false after someone moves money. Compare with the API in the same test.</li>
<li>Reading <code>getText()</code> of the description cell and comparing with the API: the cell has the reference on a second line.</li>
<li>Keeping a list of row <code>WebElement</code>s across a sort click: all stale.</li>
<li>Re-implementing the sort in Java on the displayed strings: formatting, signs and ties make the oracle your own code. Ask the API.</li>
<li>Using Emma for a test that changes the table (a transfer, a deposit): it changes what every other reader sees.</li>
</ul></div>`,
      examples: [
        {
          title: "AccountPage: rows as records, waits for the table to change",
          lang: "java",
          code: `
import java.util.List;

/**
 * {@code /accounts/{id}}: balance cards and the transactions table (sortable, filterable, paginated).
 * Every action reloads the table through the API, so each method waits for the table to change.
 */
public class AccountPage extends BasePage {

    private static final By ROWS = By.cssSelector("[data-testid='transactions-table'] tbody tr[data-testid^='transaction-row-']");
    private static final By SUMMARY = testId("transactions-pagination-summary");

    public AccountPage(WebDriver driver) {
        super(driver);
    }

    public AccountPage open(long accountId) {
        openPath("/accounts/" + accountId);
        visible(testId("transactions-table"));
        visible(SUMMARY);
        return this;
    }

    /** One table row, read into plain values. */
    public record Row(long id, String date, String description, String type, String status, String amount, String balance) {
    }

    public List<Row> rows() {
        return driver.findElements(ROWS).stream().map(AccountPage::toRow).toList();
    }

    private static Row toRow(WebElement tr) {
        return new Row(
                Long.parseLong(tr.getAttribute("data-testid").substring("transaction-row-".length())),
                tr.findElement(testId("transaction-date")).getText().trim(),
                // the description cell also holds the reference on a second line: keep the first line only
                tr.findElement(testId("transaction-description")).getText().trim().split("\\n")[0],
                tr.findElement(testId("transaction-type")).getText().trim(),
                tr.findElement(testId("transaction-status")).getText().trim(),
                tr.findElement(testId("transaction-amount")).getText().trim(),
                tr.findElement(testId("transaction-balance")).getText().trim());
    }

    /** "Page 1 of 17 · 334 results". */
    public String summary() {
        return text(SUMMARY);
    }

    /** Clicks a column header ("createdAt", "amount", "description", "type") and waits for the new order. */
    @Step("Sort by {field}")
    public AccountPage sortBy(String field) {
        return changeTable(() -> click(testId("transactions-sort-" + field)));
    }

    /** "ascending", "descending" or "none", from the header's aria-sort attribute. */
    public String sortState(String field) {
        return visible(testId("transactions-sort-" + field)).findElement(By.xpath("./ancestor::th")).getAttribute("aria-sort");
    }

    @Step("Filter: type {type}, text {search}")
    public AccountPage filter(String type, String search) {
        if (type != null) {
            select(testId("filter-type-select")).selectByValue(type);
        }
        if (search != null) {
            type(testId("filter-search-input"), search);
        }
        return changeTable(() -> click(testId("filter-apply-button")));
    }

    public AccountPage pageSize(int size) {
        return changeTable(() -> select(testId("transactions-page-size")).selectByValue(String.valueOf(size)));
    }

    public AccountPage nextPage() {
        return changeTable(() -> click(testId("transactions-pagination-next")));
    }

    public boolean hasNextPage() {
        return visible(testId("transactions-pagination-next")).isEnabled();
    }

    /**
     * Runs an action that reloads the table and waits until the table really changed: the summary text or the
     * first row id is different. Without this, the next read can see the OLD rows (the table is replaced in place).
     */
    private AccountPage changeTable(Runnable action) {
        String before = fingerprint();
        action.run();
        // While React swaps the rows, an element found a moment ago can vanish before we read it: that is a
        // StaleElementReferenceException, and here it only means "not finished yet, look again".
        DriverFactory.waitFor(driver).ignoring(StaleElementReferenceException.class).until(d -> !fingerprint().equals(before));
        return this;
    }

    private String fingerprint() {
        List<WebElement> rows = driver.findElements(ROWS);
        String first = rows.isEmpty() ? "none" : rows.get(0).getAttribute("data-testid");
        String last = rows.isEmpty() ? "none" : rows.get(rows.size() - 1).getAttribute("data-testid");
        return driver.findElement(SUMMARY).getText() + "|" + first + "|" + last + "|" + rows.size();
    }
}`,
        },
        {
          title: "TransactionsTableUiTest: the UI against the API",
          lang: "java",
          code: `
package com.icebank.tests.ui;

import com.icebank.api.AccountsClient;
import com.icebank.model.Page;
import com.icebank.model.Transaction;
import com.icebank.support.Personas;
import com.icebank.support.TestData;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.UiSession;
import com.icebank.ui.pages.AccountPage;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Emma's chequing history, read only. The API is the oracle: the UI must show what the API returns. */
@Tag("ui")
@Feature("Account history")
@ExtendWith(DriverExtension.class)
@DisplayName("The transactions table against the API")
class TransactionsTableUiTest {

    private static final long ACCOUNT = Personas.EMMA_CHEQUING;
    private final AccountsClient accounts = new AccountsClient();

    private Page<Transaction> api(Map<String, ?> query) {
        return accounts.transactionPage(Personas.EMMA, ACCOUNT, query);
    }

    private static List<Long> ids(List<AccountPage.Row> rows) {
        return rows.stream().map(AccountPage.Row::id).toList();
    }

    private static List<Long> apiIds(Page<Transaction> page) {
        return page.content().stream().map(Transaction::id).toList();
    }

    @Test
    @DisplayName("The first page shows the API's first 20 rows, newest first, with the same amounts")
    void firstPageMatchesApi(WebDriver driver) {
        UiSession.signIn(driver, Personas.EMMA);
        AccountPage page = new AccountPage(driver).open(ACCOUNT);
        Page<Transaction> expected = api(Map.of("page", 0, "size", 20, "sort", "createdAt,desc"));

        List<AccountPage.Row> rows = page.rows();
        assertThat(ids(rows)).isEqualTo(apiIds(expected));
        assertThat(page.summary()).isEqualTo("Page 1 of " + expected.totalPages() + " · " + expected.totalElements() + " results");
        for (int i = 0; i < rows.size(); i++) {
            Transaction t = expected.content().get(i);
            String sign = "DEBIT".equals(t.direction()) ? "-" : "+";
            assertThat(rows.get(i).amount()).as("row %d", t.id()).isEqualTo(sign + TestData.uiMoney(t.amount()));
        }
    }

    @Test
    @DisplayName("Sorting by amount: first click descending, second ascending, both equal to the API")
    void sortByAmount(WebDriver driver) {
        UiSession.signIn(driver, Personas.EMMA);
        AccountPage page = new AccountPage(driver).open(ACCOUNT).sortBy("amount");
        assertThat(page.sortState("amount")).isEqualTo("descending");
        assertThat(ids(page.rows())).isEqualTo(apiIds(api(Map.of("page", 0, "size", 20, "sort", "amount,desc"))));

        page.sortBy("amount");
        assertThat(page.sortState("amount")).isEqualTo("ascending");
        assertThat(ids(page.rows())).isEqualTo(apiIds(api(Map.of("page", 0, "size", 20, "sort", "amount,asc"))));
    }

    @Test
    @DisplayName("Filtering by type and text: the count and every row match")
    void filterTypeAndText(WebDriver driver) {
        UiSession.signIn(driver, Personas.EMMA);
        AccountPage page = new AccountPage(driver).open(ACCOUNT).filter("PURCHASE", "coffee");
        Page<Transaction> expected = api(Map.of("type", "PURCHASE", "q", "coffee", "size", 20));

        assertThat(page.summary()).endsWith("· " + expected.totalElements() + " results");
        assertThat(page.rows()).isNotEmpty().allSatisfy(r -> {
            assertThat(r.type()).isEqualTo("Purchase");
            assertThat(r.description()).containsIgnoringCase("coffee");
        });
    }

    @Test
    @DisplayName("10 rows per page, then page 2 equals the API's page 1")
    void pagination(WebDriver driver) {
        UiSession.signIn(driver, Personas.EMMA);
        AccountPage page = new AccountPage(driver).open(ACCOUNT).pageSize(10);
        assertThat(page.rows()).hasSize(10);

        page.nextPage();
        assertThat(page.summary()).startsWith("Page 2 of ");
        assertThat(ids(page.rows())).isEqualTo(apiIds(api(Map.of("page", 1, "size", 10, "sort", "createdAt,desc"))));
    }
}`,
        },
      ],
      exercises: [
        "Sort by Description. Assert the header says ascending after one click and that the rows equal the API's <code>sort=description,asc</code> page.",
        "Take the Toronto date of Emma's newest transaction from the API and filter From = To = that date (set the date inputs the way <code>RegisterPage</code> sets the date of birth). Assert the summary and the row count equal the API's <code>from</code>/<code>to</code> result. What does that tell you about the date range?",
        "Set 100 rows per page and walk all pages with Next, collecting ids. Assert the number of ids equals the API's <code>totalElements</code> and that there are no duplicates.",
        "Search for a text no transaction has. Assert the empty state \"No transactions match these filters.\" and the summary \"No results\".",
      ],
      quiz: [
        {
          q: "What is the best oracle for \"the table sorted by amount, descending, page 1\"?",
          options: [
            "Sort the displayed amounts in Java",
            "A screenshot from last week",
            "<code>GET /accounts/{id}/transactions?sort=amount,desc&amp;size=20</code>, compared by row id",
            "The Classic view",
          ],
          answer: 2,
          explain: "Same parameters, same data, compared by identity.",
        },
        {
          q: "Right after clicking a sort header, your test reads the old order. Why?",
          options: [
            "The rows are replaced only when the new data arrives; you read before that",
            "The click did not register",
            "aria-sort is wrong",
            "The API is cached",
          ],
          answer: 0,
          explain: "Wait for the table to change, then read.",
        },
        {
          q: "Where does StaleElementReferenceException come from in this table?",
          options: [
            "The test ran too slowly",
            "The element is in an iframe",
            "The id is wrong",
            "The element was found, then React replaced it before you used it",
          ],
          answer: 3,
          explain: "Ignore it in the waiting condition and read rows into plain values.",
        },
        {
          q: "Which attribute tells you the current sort without reading arrows?",
          options: [
            "<code>data-sort</code> on the table",
            "<code>aria-sort</code> on the header cell",
            "<code>class=\"sorted\"</code>",
            "The URL",
          ],
          answer: 1,
          explain: "ascending, descending or none.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "classic-view",
      title: "Classic view: hard mode without test ids",
      summary: "Write robust CSS and XPath for an old-style layout with nested tables and ids that change on every load.",
      body: `
<p>Profile → <strong>Classic view</strong> switches the dashboard, the account history and the payees page to an old online-banking layout. It has
<strong>no <code>data-testid</code></strong>, <strong>generated ids that change on every load</strong> (<code>c4k9x2_history_517</code>), and
<strong>nested tables</strong> (the details cell of each history row is itself a table). It is there so you practise what you do on most real
applications: find a stable anchor in what the user sees.</p>
<div class="callout rule"><p><strong>Classic view is a per-user setting.</strong> Turn it on only for a customer your test registered
(<code>PATCH /me {"classicView": true}</code>), never for Emma or another persona.</p></div>

<h3>Stable anchors in Classic view</h3>
<ul>
<li><strong>Header texts.</strong> The history table is "the table whose first row has a header cell Details":
<code>//table[tbody/tr[1]/th[normalize-space()='Details']]</code>.</li>
<li><strong>Structure, one level at a time.</strong> Data rows are the <em>direct</em> rows of that table's <code>tbody</code> that have cells:
<code>…/tbody/tr[td]</code>. Inside a row, <code>./td</code> gives only that row's own cells; <code>.//td</code> would also return the nested table's
cells.</li>
<li><strong>Column by header, not by number.</strong> Count the header cells before "Balance"
(<code>th[normalize-space()='Balance']/preceding-sibling::th</code>) and use that position, so a new column does not shift your data.</li>
<li><strong>Button labels and link texts.</strong> <code>input[type='button'][value='Next &gt;']</code>, <code>//a[normalize-space()='Pay']</code>.</li>
<li><strong>Visible texts with fixed parts.</strong> <code>starts-with(normalize-space(), 'Account History - ')</code>, "Page 1 of 2".</li>
</ul>
<p>Never use the generated ids, the inline styles (<code>background: #13315C</code>) or absolute paths. The first test below proves the ids are useless by
loading the page twice.</p>

<h3>Worked example</h3>
<p>The customer gets three cheque deposits (API) and Classic view on (API). The history page object reads rows into records from the table it found by its
header, the test compares them with the API (description, credit, balance), and a second page object finds a balance on the classic dashboard by
the account name in the nested table and the column by its header.</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li><code>.//td</code> inside a row: the nested table's cells shift every index.</li>
<li><code>//table[3]</code> or <code>(//table)[3]</code>: depends on how many tables come before it.</li>
<li>Copying the id DevTools shows: it is different on the next load.</li>
<li><code>contains(., 'Balance')</code> on a whole table: the text of every descendant counts, so many elements match.</li>
<li>Leaving Classic view on for a shared user.</li>
</ul></div>`,
      examples: [
        {
          title: "ClassicHistoryPage: anchors on headers and structure",
          lang: "java",
          code: `
import java.util.List;

/**
 * {@code /accounts/{id}} in Classic view: no data-testid, ids that change on every load, nested tables.
 * The locators anchor on what is stable for a user: the header texts, the table structure and the button labels.
 */
public class ClassicHistoryPage extends BasePage {

    /** The table whose first row has a "Details" header cell: the history table. */
    private static final By HISTORY = By.xpath("//table[tbody/tr[1]/th[normalize-space()='Details']]");
    /** Data rows: direct children of that table's tbody, skipping the header row. */
    private static final By ROWS = By.xpath("//table[tbody/tr[1]/th[normalize-space()='Details']]/tbody/tr[td]");
    private static final By NEXT = By.cssSelector("input[type='button'][value='Next >']");
    private static final By PAGE_LABEL = By.xpath("//td[starts-with(normalize-space(), 'Page ') and contains(., ' of ')]");

    public ClassicHistoryPage(WebDriver driver) {
        super(driver);
    }

    public ClassicHistoryPage open(long accountId) {
        openPath("/accounts/" + accountId);
        visible(HISTORY);
        return this;
    }

    public String title() {
        return text(By.xpath("//td[starts-with(normalize-space(), 'Account History - ')]"));
    }

    public record Row(String date, String details, String debit, String credit, String balance) {
    }

    public List<Row> rows() {
        return driver.findElements(ROWS).stream().map(tr -> {
            List<WebElement> cells = tr.findElements(By.xpath("./td"));          // only this row's own cells
            String details = cells.get(1).findElement(By.xpath(".//tr[1]/td")).getText().trim();   // nested table, line 1
            return new Row(cells.get(0).getText().trim(), details, cells.get(2).getText().trim(),
                    cells.get(3).getText().trim(), cells.get(4).getText().trim());
        }).toList();
    }

    /** "Page 1 of 1". */
    public String pageLabel() {
        return text(PAGE_LABEL);
    }

    public boolean hasNextPage() {
        return visible(NEXT).isEnabled();
    }

    /** The generated id of the history table. It changes on every page load: never use it in a locator. */
    public String historyTableId() {
        return visible(HISTORY).getAttribute("id");
    }
}`,
        },
        {
          title: "ClassicDashboardPage: the column found by its header",
          lang: "java",
          code: `
/** {@code /dashboard} in Classic view: "Account Summary", one row per account, nested tables, random ids. */
public class ClassicDashboardPage extends BasePage {

    private static final By SUMMARY = By.xpath("//table[tbody/tr[1]/th[normalize-space()='Account'] and tbody/tr[1]/th[normalize-space()='Balance']]");

    public ClassicDashboardPage(WebDriver driver) {
        super(driver);
    }

    public ClassicDashboardPage open() {
        openPath("/dashboard");
        visible(SUMMARY);
        return this;
    }

    /**
     * The balance cell of the account whose name (bold, inside a nested table in column 1) is {@code displayName}.
     * Column positions come from the header row, not from a hard-coded td[4].
     */
    public String balanceOf(String displayName) {
        int column = visible(SUMMARY).findElements(By.xpath("./tbody/tr[1]/th[normalize-space()='Balance']/preceding-sibling::th")).size() + 1;
        return text(By.xpath("//table[tbody/tr[1]/th[normalize-space()='Balance']]/tbody/tr[td[1]//b[normalize-space()='"
                + displayName + "']]/td[" + column + "]"));
    }
}`,
        },
        {
          title: "ClassicViewUiTest",
          lang: "java",
          code: `
package com.icebank.tests.ui;

import com.icebank.api.AccountsClient;
import com.icebank.api.Specs;
import com.icebank.model.Transaction;
import com.icebank.support.NewCustomer;
import com.icebank.support.TestData;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.UiSession;
import com.icebank.ui.pages.ClassicDashboardPage;
import com.icebank.ui.pages.ClassicHistoryPage;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;

import java.util.List;
import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

/** Classic view is a per-user setting, so these tests turn it on for their OWN new customer, never for a persona. */
@Tag("ui")
@Feature("Classic view")
@ExtendWith(DriverExtension.class)
@DisplayName("Classic view: locators without test ids")
class ClassicViewUiTest {

    private static NewCustomer customer;
    private final AccountsClient accounts = new AccountsClient();

    @BeforeAll
    static void classicCustomerWithHistory() {
        customer = NewCustomer.register("sel.tut");
        for (String amount : List.of("10.00", "20.00", "30.00")) {
            customer.depositCheque(customer.chequingId(), amount);
        }
        given().spec(Specs.as(customer.email())).body(Map.of("classicView", true))
                .when().patch("/me").then().statusCode(200);
    }

    @Test
    @DisplayName("The history table shows the API's rows, found by header text and structure")
    void historyMatchesApi(WebDriver driver) {
        UiSession.addSessionCookies(driver, customer.email());
        ClassicHistoryPage history = new ClassicHistoryPage(driver).open(customer.chequingId());
        List<Transaction> expected = accounts.transactionPage(customer.email(), customer.chequingId(), Map.of("size", 25)).content();

        List<ClassicHistoryPage.Row> rows = history.rows();
        assertThat(rows).hasSize(expected.size()).hasSize(3);
        for (int i = 0; i < rows.size(); i++) {
            assertThat(rows.get(i).details()).isEqualTo(expected.get(i).description());
            assertThat(rows.get(i).credit()).isEqualTo(TestData.uiMoney(expected.get(i).amount()));
            assertThat(rows.get(i).debit()).isEmpty();
        }
        assertThat(rows.get(0).balance()).isEqualTo("$60.00");
        assertThat(history.pageLabel()).isEqualTo("Page 1 of 1");
        assertThat(history.title()).startsWith("Account History - ");
    }

    @Test
    @DisplayName("Generated ids change on every load, so they cannot be locators")
    void idsChangeOnEveryLoad(WebDriver driver) {
        UiSession.addSessionCookies(driver, customer.email());
        String first = new ClassicHistoryPage(driver).open(customer.chequingId()).historyTableId();
        String second = new ClassicHistoryPage(driver).open(customer.chequingId()).historyTableId();
        assertThat(first).isNotEqualTo(second).matches("c[a-z0-9]+_history_\\\\d+");
    }

    @Test
    @DisplayName("The classic dashboard: a balance found by the account name, column found by its header")
    void classicDashboardBalance(WebDriver driver) {
        UiSession.addSessionCookies(driver, customer.email());
        String name = accounts.account(customer.email(), customer.chequingId()).displayName();
        assertThat(new ClassicDashboardPage(driver).open().balanceOf(name)).isEqualTo("$60.00");
    }
}`,
        },
      ],
      exercises: [
        "Classic payees: create a payee through the API for a Classic-view customer and, on <code>/bills/payees</code>, find the payees table by its header texts, the row by the bold biller name, and the account number by the column named \"Account #\". Also assert the row's Pay link points to <code>/bills?payee=…</code>.",
        "Classic pagination: give a new customer 26 small cheque deposits through the API (the classic history shows 25 per page). Assert \"Page 1 of 2\", 25 rows, then Next &gt; and \"Page 2 of 2\" with one row and a disabled Next.",
        "Try to write the history-row locator in CSS only. Which parts are impossible, and why? (Think of text matching and \"has a header cell named Details\".)",
        "Turn Classic view on and off through the Profile toggle in the browser (<code>classic-view-toggle</code>) for your own customer. Wait for each toast and check <code>GET /me</code> after each change.",
      ],
      quiz: [
        {
          q: "Why is <code>By.id(\"c4k9x2_history_517\")</code> useless?",
          options: [
            "Ids are slow",
            "The id is generated again on every load",
            "It is too long",
            "Classic view has no ids",
          ],
          answer: 1,
          explain: "Anchor on what the user sees: headers, labels, structure.",
        },
        {
          q: "Inside a classic history row, why <code>./td</code> and not <code>.//td</code>?",
          options: [
            "./td is faster",
            "They are the same",
            ".//td is not valid XPath",
            ".//td also returns the cells of the nested details table, so positions shift",
          ],
          answer: 3,
          explain: "Stay on the row's own children.",
        },
        {
          q: "Which is the most robust way to find the Balance column?",
          options: [
            "Count the header cells before the one named Balance",
            "Always td[4]",
            "The cell with a right-aligned style",
            "The last td",
          ],
          answer: 0,
          explain: "If a column is added, the header still tells you where Balance is.",
        },
        {
          q: "Whose Classic view setting may a test change?",
          options: [
            "Emma's, she is the happy path",
            "Any persona, if it is switched back afterwards",
            "Only a customer the test registered itself",
            "The teller's",
          ],
          answer: 2,
          explain: "It is a per-user setting other people rely on.",
        },
      ],
    },
    // ------------------------------------------------------------------------------------------
    {
      id: "reliability",
      title: "Screenshots, flakiness, headless runs and QA",
      summary: "Make UI results explain themselves in Allure, find and fix flaky tests, run headless the same as headed, and run the suite on QA.",
      body: `
<h3>Evidence in the report</h3>
<p>The starter's <code>DriverExtension</code> already attaches the URL, a screenshot and the page source when a UI test fails. Add evidence where a reader
needs to <em>see</em> a passing step too: a screenshot of the confirmation card, of a filtered table. <code>Screenshots.attach(driver, name)</code> takes the
window; <code>Screenshots.attach(element, name)</code> takes one element, which is smaller and easier to read. Put them inside a step
(<code>@Step</code> methods or <code>Allure.step("…", () -&gt; …)</code>) so the picture appears where it belongs. Run with <code>mvn test</code> then
<code>mvn allure:serve</code>.</p>

<h3>Flakiness: the Ice Bank catalogue</h3>
<p>Every item below came up while writing this tutorial's examples. Each looks "random" until you know the cause:</p>
<div class="table-wrap"><table>
<thead><tr><th>Symptom</th><th>Cause</th><th>Fix</th></tr></thead>
<tbody>
<tr><td>Menu link not interactable, headless only</td><td>No hover-capable pointer in headless Chrome</td><td>Hover, then focus (lesson 1)</td></tr>
<tr><td>Wrong URL right after a click</td><td>Client-side navigation</td><td>Wait for the destination page</td></tr>
<tr><td>Field contains old + new text</td><td><code>clear()</code> on a React-controlled field that re-renders</td><td><code>replaceText</code> with key presses</td></tr>
<tr><td>Wrong toast text</td><td>Toasts stack for 4 s</td><td>Wait for the expected message</td></tr>
<tr><td>Stale element in a table</td><td>Rows replaced during your read</td><td>Ignore stale in the wait; read into records</td></tr>
<tr><td>Wrong autocomplete option</td><td>Previous results shown while searching</td><td>Wait for this query's status</td></tr>
<tr><td>Error text "not found"</td><td>It appears only after the API answers</td><td>Waiting getters, never bare <code>findElement</code></td></tr>
<tr><td>Wrong date, only on some days</td><td><code>LocalDate.now()</code> instead of the sandbox clock</td><td><code>GET /test/clock</code></td></tr>
<tr><td>Balance or count differs</td><td>Shared data changed by someone else</td><td>Own customer for writes; compare with the API</td></tr>
<tr><td>429 on sign-in, in full runs only</td><td>10 per minute login limit</td><td>One customer per class; retry with Retry-After</td></tr>
</tbody></table></div>
<p>To investigate: run the one test 10 times (a loop in the shell), read the failure's screenshot and page source, check the order (the project runs tests in
<strong>random order</strong>; fix the seed with <code>-Djunit.jupiter.execution.order.random.seed=42</code> to repeat one order exactly), and run headed
to watch. Surefire can rerun failures (<code>-Dsurefire.rerunFailingTestsCount=1</code>),
but treat a test that passes only on the second try as a bug to fix, and say so in the report.</p>

<h3>Headless and headed</h3>
<p><code>-Dheadless=true</code> starts Chrome with <code>--headless=new</code> and the same <code>--window-size=1366,900</code>, so layouts match. The
differences that remain are the ones you saw: no hover pointer, no visible window for native dialogs (they still work through the Alert API), and in
Docker or CI as root you need <code>-DchromeArgs=--no-sandbox,--disable-dev-shm-usage</code>. Run the full UI suite both ways before you call it done.</p>

<h3>Running on QA</h3>
<p><code>mvn test -Denv=qa -Dgroups=ui</code> runs the same tests against the hosted QA build, with your sandbox's values from
<code>qa.local.properties</code> or environment variables (starter README, section 3). Persona emails get your suffix automatically
(<code>Personas.email</code>); <code>NewCustomer</code> applies it too. On QA: do not reset (you share nothing, but your own sandbox's data is your
evidence), expect slower pages (free hosting tiers), raise <code>uiTimeoutSeconds</code> for QA only if you must, and keep the sandbox key out of Git.
The QA build has planted bugs switched on by the instructor: a UI test that is green locally and red on QA is a finding. Report it with the Allure
evidence (screenshot, page source, the API response), not with "the test failed".</p>

<div class="callout warn"><p><strong>Common mistakes</strong></p>
<ul>
<li>A screenshot of the whole page when the point is one card.</li>
<li>"Fixing" flakiness with longer sleeps or a global retry, without knowing the cause.</li>
<li>Only ever running headed on your own laptop, then the CI (headless) run fails on day one.</li>
<li>Publishing Allure reports from QA runs: they contain request and response bodies.</li>
<li>Treating every red QA test as a broken test instead of first asking "is this the app?"</li>
</ul></div>`,
      examples: [
        {
          title: "Screenshots helper",
          lang: "java",
          code: `
package com.icebank.ui;

import io.qameta.allure.Allure;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

import java.io.ByteArrayInputStream;

/** Screenshots as Allure attachments, for the moments a reader of the report needs to SEE (not only on failure). */
public final class Screenshots {

    private Screenshots() {
    }

    /** The whole browser window, attached to the current step or test. */
    public static void attach(WebDriver driver, String name) {
        byte[] png = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
        Allure.addAttachment(name, "image/png", new ByteArrayInputStream(png), "png");
    }

    /** Just one element, e.g. the confirmation card: smaller and easier to read than a full page. */
    public static void attach(WebElement element, String name) {
        byte[] png = element.getScreenshotAs(OutputType.BYTES);
        Allure.addAttachment(name, "image/png", new ByteArrayInputStream(png), "png");
    }
}`,
        },
        {
          title: "Screenshots inside steps",
          lang: "java",
          code: `
package com.icebank.tests.ui;

import com.icebank.support.NewCustomer;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.Screenshots;
import com.icebank.ui.UiSession;
import com.icebank.ui.pages.DashboardPage;
import io.qameta.allure.Allure;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.WebDriver;

import static com.icebank.ui.pages.BasePage.testId;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("ui")
@Feature("Reporting")
@ExtendWith(DriverExtension.class)
@DisplayName("Screenshots and steps in the Allure report")
class ReportingUiTest {

    private static NewCustomer customer;

    @BeforeAll
    static void newCustomer() {
        customer = NewCustomer.register("sel.tut");
    }

    @Test
    @DisplayName("The dashboard of a new customer, with a screenshot in each step")
    void dashboardWithScreenshots(WebDriver driver) {
        DashboardPage dashboard = Allure.step("Sign in through the API", () -> UiSession.signIn(driver, customer.email()));
        Allure.step("Check the window size the run used", () -> {
            Dimension size = driver.manage().window().getSize();
            assertThat(size.getWidth()).isEqualTo(1366);                    // --window-size from DriverFactory, headed or headless
            Screenshots.attach(driver, "Dashboard");
        });
        Allure.step("Check the chequing card", () -> {
            assertThat(dashboard.balanceText("chequing")).isEqualTo("$0.00");
            Screenshots.attach(driver.findElement(testId("account-card-" + customer.chequingId())), "Chequing card");
        });
    }
}`,
        },
        {
          title: "Commands for reliability work",
          lang: "bash",
          code: `
# one test, ten times, headless; stop at the first failure
for i in $(seq 1 10); do mvn -q test -Dtest="TransferUiTest" -Dheadless=true || break; done

# the whole UI suite, headless, then the report
mvn test -Dgroups=ui -Dheadless=true
mvn allure:serve

# the same "random" order on every run, to reproduce an order-dependent failure
mvn test -Dgroups=ui -Djunit.jupiter.execution.order.random.seed=42

# in Docker or CI as root
mvn test -Dgroups=ui -Dheadless=true -DchromeArgs=--no-sandbox,--disable-dev-shm-usage

# against QA (values from qa.local.properties or ICEBANK_* environment variables)
mvn test -Denv=qa -Dgroups=ui -Dheadless=true`,
        },
      ],
      exercises: [
        "Break one of your UI tests on purpose (a wrong expected text). Run it, open <code>mvn allure:serve</code> and find the screenshot, the URL and the page source. Then fix the test.",
        "Run the full UI suite three times headless and once headed. Record duration and failures per run in a small table. Investigate any failure that is not in all four runs and write down its root cause using the catalogue in this lesson.",
        "Add an element screenshot of the transfer confirmation card inside an Allure step to your transfer test, so the report shows it on a passing run too.",
        "Run your UI suite on QA against your own sandbox. For every test that is red on QA but green locally, write a short bug report with the Allure evidence. Do not change the test to make it pass.",
      ],
      quiz: [
        {
          q: "A UI test fails about one run in ten. What is the first thing to do?",
          options: [
            "Reproduce it (run it in a loop), read the failure evidence and find the cause",
            "Add <code>-Dsurefire.rerunFailingTestsCount=2</code>",
            "Increase every timeout to 60 s",
            "Delete the test",
          ],
          answer: 0,
          explain: "Retries hide causes; most Ice Bank flakiness has a specific, fixable cause.",
        },
        {
          q: "Which flags make headless runs look like headed ones in this project?",
          options: [
            "None are needed",
            "<code>--disable-gpu</code> only",
            "<code>--headless=new</code> with the same <code>--window-size=1366,900</code> (set by DriverFactory)",
            "<code>--start-maximized</code>",
          ],
          answer: 2,
          explain: "Same window size, same layout. Hover remains a known difference.",
        },
        {
          q: "Your test is green locally and red on QA. What is it most likely to be?",
          options: [
            "A broken test",
            "A network glitch",
            "A Selenium bug",
            "A planted QA bug, until shown otherwise; report it with evidence",
          ],
          answer: 3,
          explain: "That is what QA is for. Check the evidence, then report.",
        },
        {
          q: "Why take an element screenshot instead of a full-page one for the confirmation?",
          options: [
            "Full-page screenshots are not supported",
            "It shows exactly the evidence the step is about, small and readable",
            "It is required by Allure",
            "It is faster to compare pixels",
          ],
          answer: 1,
          explain: "Make the report easy to read for someone who did not write the test.",
        },
      ],
    },
  ],
});
