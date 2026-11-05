import { defineConfig } from "vitest/config";
import path from "node:path";

const port = process.env.DB_PORT ?? "5433";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
    env: {
      DATABASE_URL: `postgres://icebank_app:icebank_app@localhost:${port}/icebank_test`,
      ICEBANK_TEST_ADMIN_URL: `postgres://postgres:postgres@localhost:${port}/icebank_test`,
      PERF_MODE: "true",
      ICEBANK_QUIET_LOGS: "true",
    },
  },
});
