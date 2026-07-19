import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const USERSCRIPT_PATH = resolve("../userscript/dist/penguin-translator.user.js");
const PAGE_URL = "http://127.0.0.1:4173/userscript-csp/";

test("userscript WebKit fixture survives strict CSP, partial failure, settings update, retry, and reinjection", async ({
  page,
}) => {
  const bundle = await readFile(USERSCRIPT_PATH, "utf8");
  await page.addInitScript({
    content: `
      const penguinStorage = new Map([
        ["penguin.apiEndpoint", "http://127.0.0.1:8001/v1/translate-page"],
        ["penguin.localApiToken", "runtime-only-token"],
        ["penguin.targetLanguage", "zh-Hant"]
      ]);
      Reflect.set(globalThis, "__penguinGmStorage", penguinStorage);
      Reflect.set(globalThis, "__penguinGmCalls", 0);
      Reflect.set(globalThis, "GM", {
        addStyle: async (css) => { Reflect.set(globalThis, "__penguinAddedStyle", css); },
        deleteValue: async (key) => { penguinStorage.delete(key); },
        getValue: async (key, fallback) => penguinStorage.has(key) ? penguinStorage.get(key) : fallback,
        setValue: async (key, value) => { penguinStorage.set(key, value); },
        xmlHttpRequest: async (details) => {
          const request = JSON.parse(details.data);
          Reflect.set(globalThis, "__penguinLastGmRequest", { request, headers: details.headers });
          Reflect.set(globalThis, "__penguinGmCalls", Reflect.get(globalThis, "__penguinGmCalls") + 1);
          const successfulImages = request.images.slice(0, Math.max(0, request.images.length - 1));
          const results = successfulImages.map((image, index) => ({
            request_id: request.request_id,
            client_image_id: image.client_image_id,
            image_id: String(index + 1).padStart(64, "a"),
            image_width: image.rendered_width,
            image_height: image.rendered_height,
            regions: index === 0 ? [{
              region_id: "userscript-region-1",
              polygon: [[20, 20], [150, 20], [150, 100], [20, 100]],
              source_text: "테스트",
              translated_text: "測試譯文",
              orientation: "horizontal",
              detection_confidence: 1,
              recognition_confidence: 1
            }] : [],
            warnings: []
          }));
          const failedImage = request.images.at(-1);
          const failures = failedImage
            ? [{ client_image_id: failedImage.client_image_id, code: "IMAGE_FETCH_FAILED" }]
            : [];
          return {
            status: 200,
            responseText: JSON.stringify({
              request_id: request.request_id,
              results,
              failures,
              progress: {
                total: request.images.length,
                completed: request.images.length,
                successful: results.length,
                failed: failures.length
              },
              warnings: [],
              timing: {
                total_ms: 1250,
                fetch_ms: 100,
                ocr_ms: 500,
                gemini_ms: 600,
                queue_wait_ms: 0,
                cold_start_ms: 0,
                gemini_calls: 1,
                ocr_cache_hits: 0,
                warm_execution: true
              }
            })
          };
        }
      });
      Reflect.set(globalThis, "__installPenguinUserscript", () => {
        ${bundle}
      });
      document.addEventListener("DOMContentLoaded", () => {
        Reflect.get(globalThis, "__installPenguinUserscript")();
      }, { once: true });
    `,
  });
  await page.route(PAGE_URL, async (route) => {
    const images = Array.from(
      { length: 3 },
      (_, index) =>
        `<img id="page-${index}" src="/m1-test-page/assets/korean-dialogue.png?userscript=${index}" width="400" height="600" alt="Self-created fixture ${index}">`,
    ).join("");
    await route.fulfill({
      contentType: "text/html",
      headers: {
        "Content-Security-Policy":
          "default-src 'none'; img-src http:; script-src 'none'; style-src 'none'",
      },
      body: `<!doctype html><html><body>${images}</body></html>`,
    });
  });
  await page.goto(PAGE_URL);

  const shell = page.locator("#penguin-translator-userscript-shell");
  await expect(shell).toHaveCount(1);
  await shell.locator('button[data-action="translate"]').click();
  await expect(shell.locator("output.status")).toHaveText("完成 2 / 3");
  const firstRequest = await page.evaluate(() => Reflect.get(globalThis, "__penguinLastGmRequest"));
  expect(Array.isArray(firstRequest.request.images)).toBe(true);
  expect(firstRequest.request.images).toHaveLength(3);
  expect(firstRequest.headers.Authorization).toBe("Bearer runtime-only-token");
  await expect(page.locator("#penguin-translator-control-host")).toHaveCount(1);
  await expect(page.locator("[data-penguin-translator-region]")).toHaveCount(1);

  await shell.locator('button[data-action="settings"]').click();
  await shell.locator('input[data-field="endpoint"]').fill("https://api.example.test");
  await shell.locator('input[data-field="token"]').fill("updated-runtime-value");
  await shell.locator('button[data-action="save-settings"]').click();
  await expect(shell.locator("output.status")).toContainText("設定已保存");
  const stored = await page.evaluate(() => {
    const values = Reflect.get(globalThis, "__penguinGmStorage") as Map<string, unknown>;
    return {
      endpoint: values.get("penguin.apiEndpoint"),
      token: values.get("penguin.localApiToken"),
      tokenAttribute: document
        .getElementById("penguin-translator-userscript-shell")
        ?.shadowRoot?.querySelector('input[data-field="token"]')
        ?.getAttribute("value"),
    };
  });
  expect(stored).toEqual({
    endpoint: "https://api.example.test/v1/translate-page",
    token: "updated-runtime-value",
    tokenAttribute: null,
  });
  await shell.locator('button[data-action="settings"]').click();
  await expect(shell.locator('input[data-field="token"]')).toHaveValue("");
  await expect(shell.locator('input[data-field="token"]')).toHaveAttribute(
    "placeholder",
    "已設定；留空以保留",
  );
  await shell.locator('button[data-action="cancel-settings"]').click();

  await page
    .locator("#penguin-translator-control-host")
    .getByRole("button", { name: "重試失敗圖片" })
    .click();
  await shell.locator('button[data-action="translate"]').click();
  await expect.poll(() => page.evaluate(() => Reflect.get(globalThis, "__penguinGmCalls"))).toBe(2);
  const retryCount = await page.evaluate(
    () => Reflect.get(globalThis, "__penguinLastGmRequest").request.images.length,
  );
  expect(retryCount).toBe(1);

  await page.evaluate(() => Reflect.get(globalThis, "__installPenguinUserscript")());
  await expect(shell).toHaveCount(1);
  await expect(page.locator("#penguin-translator-control-host")).toHaveCount(1);
  expect(await page.evaluate(() => typeof Reflect.get(globalThis, "__penguinAddedStyle"))).toBe(
    "string",
  );
});
