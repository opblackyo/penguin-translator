import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/extension-e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 30_000,
});
