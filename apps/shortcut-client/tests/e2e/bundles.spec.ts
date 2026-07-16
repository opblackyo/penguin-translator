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

  await page.addScriptTag({ path: resolve("dist/renderer.iife.js") });
  await expect(page.locator("#penguin-translator-control-host")).toHaveCount(1);
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
