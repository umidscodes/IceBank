/**
 * Generates the Postman collection + environment in postman/.
 *   node scripts/postman/build.mjs
 * Edit this file (not the JSON) when endpoints change.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const OUT = path.resolve(import.meta.dirname, "../../postman");

// ---- helpers --------------------------------------------------------------------------------------
const id = (s) => crypto.createHash("md5").update(s).digest("hex").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
const script = (type, lines) => ({ listen: type, script: { type: "text/javascript", exec: lines } });
const expect = (...codes) => `pm.test("status is ${codes.join(" or ")}", () => pm.expect(pm.response.code).to.be.oneOf([${codes.join(", ")}]));`;

function url(raw) {
  const [p, q] = raw.split("?");
  const u = { raw: `{{baseUrl}}${raw}`, host: ["{{baseUrl}}"], path: p.split("/").filter(Boolean) };
  if (q) u.query = q.split("&").map((kv) => { const [key, value = ""] = kv.split("="); return { key, value }; });
  return u;
}

/**
 * req(name, method, path, { body, tests, desc, headers, auth, form, idem, sandbox })
 *  - auth: undefined = inherit (bearer {{accessToken}} from the collection/folder), "none" = no auth
 */
function req(name, method, p, o = {}) {
  const header = [...(o.headers ?? [])];
  if (o.body !== undefined) header.push({ key: "Content-Type", value: "application/json" });
  if (o.idem) header.push({ key: "Idempotency-Key", value: "{{$guid}}", description: "Required on money-moving POSTs. A fresh value on every send." });
  if (o.sandbox) header.push({ key: "X-Sandbox-Key", value: "{{sandboxKey}}" });
  const request = { method, header, url: url(p), description: o.desc ?? "" };
  if (o.body !== undefined) request.body = { mode: "raw", raw: JSON.stringify(o.body, null, 2).replace(/"(\{\{(?:accountId|savingsAccountId|cardId|loanId)\}\})"/g, "$1"), options: { raw: { language: "json" } } };
  if (o.form) request.body = { mode: "formdata", formdata: o.form };
  if (o.auth === "none") request.auth = { type: "noauth" };
  const item = { id: id(name + p), name, request, response: [] };
  const tests = o.tests ?? [expect(method === "POST" ? 201 : 200)];
  item.event = [script("test", tests)];
  return item;
}
const folder = (name, description, item, extra = {}) => ({ id: id("folder" + name), name, description, item, ...extra });

// ---- collection -------------------------------------------------------------------------------------
const signIn = (prefix, emailVar, passwordVar, tokenVar, refreshVar) => [
  req(`${prefix}1. Log in (email + password)`, "POST", "/auth/login", {
    auth: "none", body: { email: `{{${emailVar}}}`, password: `{{${passwordVar}}}` },
    desc: "Step 1 of 3. Checks the password and sends a 6-digit code to Ice Mail. Saves `mfaToken`.",
    tests: [expect(200), `pm.environment.set("mfaToken", pm.response.json().mfaToken);`],
  }),
  req(`${prefix}2. Read the code from Ice Mail`, "GET", `/inbox?email={{${emailVar}}}&kind=OTP&size=1`, {
    auth: "none", sandbox: true,
    desc: "Step 2 of 3. Reads the newest one-time code with the sandbox key, the way an automated test does. Saves `otpCode`.",
    tests: [expect(200), `const m = pm.response.json().content[0];`, `pm.test("an OTP message exists", () => pm.expect(m && m.otpCode).to.match(/^\\d{6}$/));`, `pm.environment.set("otpCode", m.otpCode);`],
  }),
  req(`${prefix}3. Verify the code (get tokens)`, "POST", "/auth/mfa/verify", {
    auth: "none", body: { mfaToken: "{{mfaToken}}", code: "{{otpCode}}" },
    desc: `Step 3 of 3. Returns a 15-minute access token and a 7-day refresh token. Saves them as \`${tokenVar}\` and \`${refreshVar}\`.`,
    tests: [expect(200), `const t = pm.response.json();`, `pm.environment.set("${tokenVar}", t.accessToken);`, `pm.environment.set("${refreshVar}", t.refreshToken);`],
  }),
];

const collection = {
  info: {
    _postman_id: id("icebank-collection"),
    name: "Ice Bank API",
    description: [
      "Requests for every area of the Ice Bank API (local build).",
      "",
      "**Start here:** select the **Ice Bank - local** environment, then send the three requests in **1. Sign in** in order.",
      "They save `accessToken`, and every other request uses it automatically (collection Authorization = Bearer `{{accessToken}}`).",
      "",
      "- Access tokens last 15 minutes: send **Refresh tokens** (or sign in again).",
      "- **Admin (teller)** has its own sign-in requests and uses `{{adminToken}}`.",
      "- **0. Test support → Reset** restores the seed data (and ends every session, so sign in again afterwards).",
      "- Money-moving POSTs send `Idempotency-Key: {{$guid}}`, a new value each time. Set a fixed value to try a replay.",
      "",
      "Run the whole collection with the Collection Runner (or `npx newman run`) for a quick smoke test.",
    ].join("\n"),
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }] },
  item: [
    folder("0. Test support", "Health, reset and the sandbox clock. These use the `X-Sandbox-Key` header, not a token.", [
      req("Health", "GET", "/test/health", { auth: "none" }),
      req("Reset sandbox to seed data", "POST", "/test/reset", { auth: "none", sandbox: true, tests: [expect(200)],
        desc: "Deletes everything in your sandbox and re-seeds it: same ids, same balances, clock back to 2026-11-02 09:00 Toronto." }),
      req("Read the clock", "GET", "/test/clock", { auth: "none", sandbox: true }),
    ]),
    folder("1. Sign in", "Send these three in order. Change `email` in the environment to sign in as another persona (password is always IceBank#2026).",
      [...signIn("", "email", "password", "accessToken", "refreshToken"),
        req("Refresh tokens", "POST", "/auth/refresh", { auth: "none", body: { refreshToken: "{{refreshToken}}" },
          desc: "Swaps the refresh token for new tokens. The old refresh token stops working (rotation).",
          tests: [expect(200), `const t = pm.response.json();`, `pm.environment.set("accessToken", t.accessToken);`, `pm.environment.set("refreshToken", t.refreshToken);`] }),
      ]),
    folder("2. Profile", "", [
      req("Get my profile", "GET", "/me"),
      req("Update phone", "PATCH", "/me", { body: { phone: "(416) 555-0142" } }),
    ]),
    folder("3. Accounts and transactions", "", [
      req("List my accounts", "GET", "/accounts", { tests: [expect(200), `pm.test("Emma has 4 accounts after a reset", () => pm.expect(pm.response.json().length).to.be.at.least(1));`] }),
      req("Get one account", "GET", "/accounts/{{accountId}}"),
      req("Another customer's account (expect 404)", "GET", "/accounts/7", { tests: [expect(404)], desc: "Account 7 belongs to Olivia. Ice Bank answers 404, not 403, so ids cannot be probed." }),
      req("Search transactions", "GET", "/accounts/{{accountId}}/transactions?from=2026-10-01&to=2026-10-31&type=PURCHASE&page=0&size=20&sort=amount,desc"),
      req("Export transactions as CSV", "GET", "/accounts/{{accountId}}/transactions.csv?from=2026-10-01"),
      req("List statements", "GET", "/accounts/{{accountId}}/statements"),
      req("Download October statement (PDF)", "GET", "/accounts/{{accountId}}/statements/2026-10.pdf"),
      req("Open a savings account", "POST", "/accounts", { body: { type: "SAVINGS", nickname: "Vacation" } }),
    ]),
    folder("4. Transfers", "", [
      req("Transfer chequing to savings", "POST", "/transfers", { idem: true, body: { fromAccountId: "{{accountId}}", toAccountId: "{{savingsAccountId}}", amount: "25.00", memo: "Postman test" },
        tests: [expect(201), `pm.environment.set("transferId", pm.response.json().id);`] }),
      req("Transfer with 3 decimals (expect 400)", "POST", "/transfers", { idem: true, body: { fromAccountId: "{{accountId}}", toAccountId: "{{savingsAccountId}}", amount: "10.005" }, tests: [expect(400)] }),
      req("Get the transfer", "GET", "/transfers/{{transferId}}"),
      req("List my transfers", "GET", "/transfers?page=0&size=10"),
    ]),
    folder("5. Interac e-Transfer", "", [
      req("Send an e-Transfer", "POST", "/etransfers", { idem: true,
        body: { fromAccountId: "{{accountId}}", recipientName: "Liam Chen", recipientEmail: "liam.chen@icebank.test", amount: "20.00", message: "Lunch", securityQuestion: "Where did we meet?", securityAnswer: "Ottawa" },
        tests: [expect(201), `pm.environment.set("etransferId", pm.response.json().id);`] }),
      req("Cancel it (full refund)", "POST", "/etransfers/{{etransferId}}/cancel", { idem: true, tests: [expect(200)] }),
      req("Sent e-Transfers", "GET", "/etransfers?direction=sent"),
      req("Received e-Transfers", "GET", "/etransfers?direction=received"),
      req("List contacts", "GET", "/etransfer-contacts"),
      req("Autodeposit setting", "GET", "/etransfers/autodeposit"),
    ]),
    folder("6. Bill payments", "", [
      req("Search billers", "GET", "/billers?q=power"),
      req("List payees", "GET", "/payees"),
      req("Schedule a bill payment", "POST", "/bill-payments", { idem: true, body: { payeeId: 1, fromAccountId: "{{accountId}}", amount: "45.00", paymentDate: "2026-11-07" },
        desc: "2026-11-07 is a Saturday, so postingDate comes back as Monday 2026-11-09.", tests: [expect(201), `pm.environment.set("billPaymentId", pm.response.json().id);`] }),
      req("Cancel that payment", "DELETE", "/bill-payments/{{billPaymentId}}", { tests: [expect(204)] }),
      req("List bill payments", "GET", "/bill-payments?status=SCHEDULED"),
    ]),
    folder("7. Cheque deposit", "", [
      req("Deposit a cheque (multipart)", "POST", "/deposits/cheque", { idem: true,
        form: [
          { key: "accountId", value: "{{accountId}}", type: "text" },
          { key: "amount", value: "250.00", type: "text" },
          { key: "frontImage", type: "file", src: "sample-cheque-front.png" },
          { key: "backImage", type: "file", src: "sample-cheque-back.png" },
        ],
        desc: "If Postman shows the files as missing, click each file field and pick `sample-cheque-front.png` / `sample-cheque-back.png` from the repo's postman folder.",
        tests: [expect(201)] }),
      req("List my deposits", "GET", "/deposits"),
    ]),
    folder("8. Cards, loans, disputes, notifications", "", [
      req("List cards", "GET", "/cards"),
      req("Lock debit card", "POST", "/cards/{{cardId}}/lock", { tests: [expect(200, 409)] }),
      req("Unlock debit card", "POST", "/cards/{{cardId}}/unlock", { tests: [expect(200, 409)] }),
      req("Set daily POS limit", "PATCH", "/cards/{{cardId}}/limits", { body: { dailyPosLimit: "2500.00" }, tests: [expect(200)] }),
      req("Apply for a loan", "POST", "/loans/applications", {
        body: { amount: "10000.00", termMonths: 36, purpose: "Car purchase", annualIncome: "60000.00", monthlyDebtPayments: "1000.00", disbursementAccountId: "{{accountId}}" },
        desc: "DTI = (1000 + 317.95) / 5000 = 26.36% -> APPROVED." }),
      req("My loans", "GET", "/loans", { tests: [expect(200), `const l = pm.response.json(); if (l.length) pm.environment.set("loanId", l[0].id);`] }),
      req("Loan schedule", "GET", "/loans/{{loanId}}/schedule"),
      req("My disputes", "GET", "/disputes"),
      req("Unread notifications", "GET", "/notifications?unread=true"),
    ]),
    folder("9. Ice Mail", "", [
      req("My inbox (signed in)", "GET", "/inbox?size=10"),
      req("Any inbox with the sandbox key", "GET", "/inbox?email=liam.chen@icebank.test", { auth: "none", sandbox: true }),
    ]),
    folder("10. Admin (teller)", "Sign in as the teller first; these requests use `{{adminToken}}`.", [
      ...signIn("Teller ", "adminEmail", "password", "adminToken", "adminRefreshToken"),
      req("Search customers", "GET", "/admin/customers?q=tremblay"),
      req("Customer detail", "GET", "/admin/customers/1"),
      req("Pending cheque deposits", "GET", "/admin/deposits?status=PENDING"),
      req("Loans in manual review", "GET", "/admin/loans?status=MANUAL_REVIEW"),
      req("Audit log", "GET", "/admin/audit-log?size=20"),
      req("Customer token on admin endpoint (expect 403)", "GET", "/admin/customers", {
        tests: [expect(403)], desc: "Uses the customer's token on purpose.",
      }),
    ], { auth: { type: "bearer", bearer: [{ key: "token", value: "{{adminToken}}", type: "string" }] } }),
    folder("11. Clock (run last)", "Moving the clock posts scheduled payments, pays interest and expires e-Transfers. Use Reset to go back.", [
      req("Advance the clock 30 days", "POST", "/test/clock", { auth: "none", sandbox: true, body: { advanceDays: 30 }, tests: [expect(200)] }),
    ]),
  ],
};
// The 403 check must use the customer token even though it lives in the admin folder.
const admin = collection.item.find((f) => f.name.startsWith("10."));
admin.item.at(-1).request.auth = { type: "bearer", bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }] };

const environment = {
  id: id("icebank-local-env"),
  name: "Ice Bank - local",
  values: [
    ["baseUrl", "http://localhost:3000/api/v1"], ["sandboxKey", "ICEBANK-LOCAL-KEY"],
    ["email", "emma.tremblay@icebank.test"], ["password", "IceBank#2026"], ["adminEmail", "teller@icebank.test"],
    ["accountId", "1"], ["savingsAccountId", "2"], ["cardId", "1"], ["loanId", "1"],
    ["accessToken", ""], ["refreshToken", ""], ["adminToken", ""], ["adminRefreshToken", ""], ["mfaToken", ""], ["otpCode", ""],
    ["transferId", ""], ["etransferId", ""], ["billPaymentId", ""],
  ].map(([key, value]) => ({ key, value, type: /token|password/i.test(key) ? "secret" : "default", enabled: true })),
  _postman_variable_scope: "environment",
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "IceBank.postman_collection.json"), JSON.stringify(collection, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, "IceBank-local.postman_environment.json"), JSON.stringify(environment, null, 2) + "\n");
console.log(`Wrote ${collection.item.reduce((n, f) => n + f.item.length, 0)} requests to postman/`);
