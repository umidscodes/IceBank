import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry";
import "../api/all";

let cached: unknown = null;

export function openApiDocument() {
  if (cached) return cached;
  const gen = new OpenApiGeneratorV3(registry.definitions);
  cached = gen.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Ice Bank API",
      version: "1.0.0",
      description:
        "Ice Bank is a fictional Canadian bank built for practising software testing.\n\n" +
        "**Conventions**: JSON only, camelCase; money as decimal strings with 2 places (\"1250.00\"); dates ISO 8601 with offset; " +
        "errors are RFC 7807 `application/problem+json` with a machine-readable `code`; every response has `X-Request-Id`.\n\n" +
        "**Sign in**: POST /auth/login -> read the OTP from Ice Mail (GET /inbox with X-Sandbox-Key and ?email=) -> POST /auth/mfa/verify -> " +
        "use `Authorization: Bearer <accessToken>`.\n\n" +
        "**Seeded password**: IceBank#2026 for every persona (emma.tremblay@icebank.test, teller@icebank.test, ...). **Local sandbox key**: ICEBANK-LOCAL-KEY.",
    },
    servers: [{ url: "/", description: "This server" }],
    tags: [
      { name: "Auth" }, { name: "Profile" }, { name: "Accounts" }, { name: "Transfers" }, { name: "Interac e-Transfer" },
      { name: "Bill payments" }, { name: "Deposits" }, { name: "Cards" }, { name: "Loans" }, { name: "Disputes" },
      { name: "Notifications" }, { name: "Ice Mail" }, { name: "Admin" }, { name: "Test support" },
    ],
  });
  return cached;
}
