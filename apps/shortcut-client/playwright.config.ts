import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: "list",
  use: {
    ...devices["iPhone 13"],
    browserName: "webkit",
  },
});
