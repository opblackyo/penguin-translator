import { resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";

test("Edge Manifest V3 bundle loads unpacked and stores options locally", async () => {
  const extensionPath = resolve("../edge-extension/dist");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await expect(page.getByRole("heading", { name: /企鵝翻譯機/ })).toBeVisible();
    await expect(page.locator("#api-endpoint")).toHaveValue("");
    await expect(page.locator("#local-token")).toHaveAttribute("type", "password");
    await page.evaluate(async () => {
      const extensionChrome = Reflect.get(globalThis, "chrome") as {
        storage: { local: { set(value: object): Promise<void> } };
      };
      await extensionChrome.storage.local.set({
        apiEndpoint: "http://localhost.invalid",
        localApiToken: "test-only-value",
        targetLanguage: "zh-Hant",
      });
    });
    const stored = await page.evaluate(() => {
      const extensionChrome = Reflect.get(globalThis, "chrome") as {
        storage: { local: { get(value: null): Promise<Record<string, unknown>> } };
      };
      return extensionChrome.storage.local.get(null);
    });
    expect(stored).toMatchObject({
      apiEndpoint: "http://localhost.invalid",
      localApiToken: "test-only-value",
      targetLanguage: "zh-Hant",
    });
  } finally {
    await context.close();
  }
});
