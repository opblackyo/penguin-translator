import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("extractor bundle completes with visible HTTP images", async ({ page }) => {
  await page.setContent(
    '<img id="page" src="https://example.com/page.jpg" width="400" height="600">',
  );
  await page.locator("#page").evaluate((element) => {
    Object.defineProperties(element, {
      naturalWidth: { value: 800 },
      naturalHeight: { value: 1200 },
      currentSrc: { value: "https://example.com/page.jpg" },
    });
    element.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 399.5,
      bottom: 600.25,
      width: 399.5,
      height: 600.25,
      toJSON: () => ({}),
    });
  });
  await page.evaluate(() => {
    Object.assign(window, {
      __PENGUIN_TRANSLATOR_DEBUG__: true,
      completion: (value: unknown) => {
        Object.assign(window, { penguinResult: value });
      },
    });
  });
  await page.addScriptTag({ path: resolve("dist/extractor.iife.js") });
  await page.waitForFunction(() => typeof Reflect.get(window, "penguinResult") === "string");

  const serialized = await page.evaluate(() => Reflect.get(window, "penguinResult"));
  const result = JSON.parse(serialized);
  expect(result.images).toHaveLength(1);
  expect(result.images[0].client_image_id).toMatch(/^penguin-image-/);
  expect(result.images[0].rendered_width).toBe(400);
  expect(result.images[0].rendered_height).toBe(600);
  expect(result.images[0]).not.toHaveProperty("natural_width");
  expect(result.images[0]).not.toHaveProperty("natural_height");
  expect(result.debug).toMatchObject({ total_images: 1, accepted_images: 1, rejected: [] });
  expect(await page.locator("#page").getAttribute("data-penguin-translator-image-id")).toBe(
    result.images[0].client_image_id,
  );
});

test("extractor bundle completes within its budget under expensive continuous scrolling", async ({
  page,
}) => {
  await page.setContent(`
    <style>body { margin: 0; min-height: 100000px; }</style>
    <img id="base-page" src="https://example.com/base.jpg" width="400" height="600">
  `);
  await page.evaluate(() => {
    let inserted = 0;
    addEventListener(
      "scroll",
      () => {
        const started = performance.now();
        while (performance.now() - started < 260) {
          // Simulate an expensive synchronous real-site scroll handler.
        }
        inserted += 1;
        const image = document.createElement("img");
        image.src = `https://example.com/continuous-${inserted}.jpg`;
        image.width = 400;
        image.height = 600;
        document.body.append(image);
      },
      { passive: true },
    );
    const penguinStartedAt = performance.now();
    Object.assign(window, {
      completion: (value: unknown) => {
        Reflect.set(window, "penguinResult", value);
        Reflect.set(window, "penguinElapsed", performance.now() - penguinStartedAt);
      },
    });
  });

  await page.addScriptTag({ path: resolve("dist/extractor.iife.js") });
  await page.waitForFunction(() => typeof Reflect.get(window, "penguinResult") === "string", null, {
    timeout: 5_000,
  });

  const state = await page.evaluate(() => ({
    elapsed: Reflect.get(window, "penguinElapsed"),
    result: JSON.parse(Reflect.get(window, "penguinResult")),
  }));
  expect(state.elapsed).toBeLessThan(3_000);
  expect(state.result.images.length).toBeGreaterThan(0);
});

test("renderer bundle mounts a Shadow DOM panel and survives DOM image insertion", async ({
  page,
}) => {
  await page.setContent(
    '<img id="page" src="https://example.com/page.jpg" width="400" height="600">',
  );
  await page.locator("#page").evaluate((element) => {
    Object.defineProperties(element, {
      naturalWidth: { value: 800 },
      naturalHeight: { value: 1200 },
      currentSrc: { value: "https://example.com/page.jpg" },
    });
  });
  await page.evaluate(() => {
    Object.assign(window, {
      completion: (value: unknown) => Reflect.set(window, "penguinResult", value),
    });
  });
  await page.addScriptTag({ path: resolve("dist/extractor.iife.js") });
  await page.waitForFunction(() => typeof Reflect.get(window, "penguinResult") === "string");
  const extracted = await page.evaluate(() => JSON.parse(Reflect.get(window, "penguinResult")));
  const clientImageId = extracted.images[0].client_image_id;

  await page.evaluate((id) => {
    const inserted = document.createElement("img");
    inserted.id = "inserted";
    document.body.prepend(inserted);
    Object.assign(window, {
      shortcutInput: {
        results: [
          {
            request_id: "123e4567-e89b-12d3-a456-426614174000",
            client_image_id: id,
            image_id: "a".repeat(64),
            image_width: 800,
            image_height: 1200,
            regions: [
              {
                region_id: "region-1",
                polygon: [
                  [100, 200],
                  [300, 200],
                  [300, 600],
                  [100, 600],
                ],
                source_text: "テスト",
                translated_text: "測試譯文",
                orientation: "vertical",
                detection_confidence: 1,
                recognition_confidence: 1,
              },
            ],
            warnings: [],
          },
        ],
      },
      completion: (value: unknown) => Reflect.set(window, "penguinRenderResult", value),
    });
  }, clientImageId);
  await page.addScriptTag({ path: resolve("dist/renderer.iife.js") });

  const state = await page.evaluate(() => {
    const panel = document.getElementById("penguin-translator-control-host");
    return {
      completion: Reflect.get(window, "penguinRenderResult"),
      panelText: panel?.shadowRoot?.textContent,
      panelCount: document.querySelectorAll("#penguin-translator-control-host").length,
      regionCount: document.querySelectorAll("[data-penguin-translator-region]").length,
    };
  });
  expect(state.completion).toMatchObject({ ok: true, rendered_regions: 1, warnings: [] });
  expect(state.panelText).toContain("企鵝翻譯機");
  expect(state.panelCount).toBe(1);
  expect(state.regionCount).toBe(1);

  const firstPanelScreenshot = await page
    .locator("#penguin-translator-control-host")
    .screenshot({ animations: "disabled" });
  await page.addScriptTag({ path: resolve("dist/renderer.iife.js") });
  const panel = page.locator("#penguin-translator-control-host");
  await expect(panel).toHaveCount(1);
  const repeatedPanelScreenshot = await panel.screenshot({ animations: "disabled" });
  expect(repeatedPanelScreenshot.equals(firstPanelScreenshot)).toBe(true);
});

test("renderer bundle completes error and missing-image paths without drawing elsewhere", async ({
  page,
}) => {
  await page.setContent('<img id="other" src="https://example.com/other.jpg">');
  await page.evaluate(() => {
    Object.assign(window, {
      shortcutInput: { invalid: true },
      completion: (value: unknown) => Reflect.set(window, "penguinRenderResult", value),
    });
  });
  await page.addScriptTag({ path: resolve("dist/renderer.iife.js") });
  expect(await page.evaluate(() => Reflect.get(window, "penguinRenderResult"))).toMatchObject({
    ok: false,
  });

  await page.evaluate(() => {
    Object.assign(window, {
      shortcutInput: {
        results: [
          {
            request_id: "123e4567-e89b-12d3-a456-426614174000",
            client_image_id: "penguin-image-missing",
            image_id: "a".repeat(64),
            image_width: 800,
            image_height: 1200,
            regions: [
              {
                region_id: "region-1",
                polygon: [
                  [0, 0],
                  [100, 0],
                  [100, 100],
                  [0, 100],
                ],
                source_text: "",
                translated_text: "must not render",
                orientation: "horizontal",
                detection_confidence: 1,
                recognition_confidence: 1,
              },
            ],
            warnings: [],
          },
        ],
      },
    });
  });
  await page.addScriptTag({ path: resolve("dist/renderer.iife.js") });
  const missing = await page.evaluate(() => Reflect.get(window, "penguinRenderResult"));
  expect(missing).toMatchObject({
    ok: true,
    rendered_regions: 0,
    warnings: ["IMAGE_NOT_FOUND:penguin-image-missing"],
  });
  await expect(page.locator("[data-penguin-translator-region]")).toHaveCount(0);
});

test("desktop harness extracts fixtures, calls the page API, and renders overlays", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:8000/v1/translate-page", async (route) => {
    const cors = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
      "Access-Control-Allow-Headers": "authorization,content-type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const request = route.request().postDataJSON() as {
      request_id: string;
      images: Array<{
        client_image_id: string;
        rendered_width: number;
        rendered_height: number;
      }>;
    };
    const results = request.images.map((image, index) => ({
      request_id: request.request_id,
      client_image_id: image.client_image_id,
      image_id: index.toString(16).padStart(64, "0"),
      image_width: image.rendered_width,
      image_height: image.rendered_height,
      regions: [
        {
          region_id: `harness-${index}`,
          polygon: [
            [10, 10],
            [100, 10],
            [100, 80],
            [10, 80],
          ],
          source_text: "테스트",
          translated_text: "測試譯文",
          orientation: "horizontal",
          background_style: "opaque",
          detection_confidence: 1,
          recognition_confidence: 1,
        },
      ],
      warnings: [],
      timing: null,
    }));
    await route.fulfill({
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: request.request_id,
        results,
        failures: [],
        progress: {
          total: results.length,
          completed: results.length,
          successful: results.length,
          failed: 0,
        },
        warnings: [],
        timing: {
          total_ms: 12,
          fetch_ms: 3,
          ocr_ms: 4,
          gemini_ms: 5,
          queue_wait_ms: 0,
          cold_start_ms: 0,
          gemini_calls: 1,
          ocr_cache_hits: 0,
          warm_execution: true,
        },
      }),
    });
  });
  await page.goto("http://127.0.0.1:4173/dev-harness/");
  await page.locator("#fixture").selectOption("/test-page/");
  await page.getByRole("button", { name: "1. Run extractor" }).click();
  await expect(page.locator("#status")).toContainText("Extractor complete: 3 images");
  await expect(page.locator("#extraction-output")).toContainText('"image_count": 3');
  await page.locator("#api-token").fill("playwright-only-token");
  await page.getByRole("button", { name: "2. Translate page" }).click();
  await expect(page.locator("#status")).toContainText("3 successful, 0 failed, Gemini 1");
  await expect(page.locator("#translation-output")).toContainText('"total_ms": 12');
  await page.getByRole("button", { name: "3. Render overlays" }).click();
  await expect(page.locator("#status")).toContainText('"ok":true');
  await expect(
    page.frameLocator("#fixture-frame").locator("[data-penguin-translator-region]"),
  ).toHaveCount(3);
});
