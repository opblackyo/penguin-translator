import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

interface ExtractedImage {
  client_image_id: string;
  source_kind: "url";
  source: string;
  rendered_width: number;
  rendered_height: number;
}

interface ExtractionResult {
  page_url: string;
  images: ExtractedImage[];
  shortcut_payload: string;
  payload_version: string;
  warnings?: string[];
}

const API_URL = "http://127.0.0.1:8001/v1/translate-image";
const SHORTCUT_API_URL = "http://127.0.0.1:8001/v1/shortcut/translate-page";
const TEST_PAGE_URL = "http://127.0.0.1:4173/test-page/";
const M1_TEST_PAGE_URL = "http://127.0.0.1:4173/m1-test-page/";
const M2_TEST_PAGE_URL = "http://127.0.0.1:4173/m2-test-page/";

async function runExtractor(page: Page, url = TEST_PAGE_URL): Promise<ExtractionResult> {
  await page.goto(url);
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  await page.evaluate(() => {
    Reflect.set(window, "completion", (value: unknown) => {
      Reflect.set(window, "penguinExtraction", value);
    });
  });
  await page.addScriptTag({ path: resolve("dist/extractor.iife.js") });
  await page.waitForFunction(
    () => typeof Reflect.get(window, "penguinExtraction") === "string",
    null,
    {
      timeout: 15_000,
    },
  );

  const serialized = await page.evaluate(() => Reflect.get(window, "penguinExtraction"));
  if (typeof serialized !== "string") {
    throw new Error("Extractor production bundle did not return serialized JSON.");
  }
  return JSON.parse(serialized) as ExtractionResult;
}

test("debug mode reports the real test page candidates and rejection reasons", async ({ page }) => {
  const extraction = (await runExtractor(
    page,
    `${TEST_PAGE_URL}?penguin-debug=1`,
  )) as ExtractionResult & {
    debug: {
      document_ready_state: string;
      total_images: number;
      accepted_images: number;
      rejected: Array<{ id: string | null; reasons: string[] }>;
    };
  };

  expect(extraction.debug).toMatchObject({
    document_ready_state: "complete",
    total_images: 4,
    accepted_images: 3,
  });
  expect(extraction.debug.rejected).toEqual([
    expect.objectContaining({
      id: "small-image",
      reasons: [
        "NATURAL_WIDTH_BELOW_MINIMUM",
        "NATURAL_HEIGHT_BELOW_MINIMUM",
        "RENDERED_WIDTH_BELOW_MINIMUM",
        "RENDERED_HEIGHT_BELOW_MINIMUM",
      ],
    }),
  ]);
});

test("extractor accepts all four self-created M1 PNG fixtures in the mobile viewport", async ({
  page,
}) => {
  const extraction = (await runExtractor(
    page,
    `${M1_TEST_PAGE_URL}?penguin-debug=1`,
  )) as ExtractionResult & {
    debug: { total_images: number; accepted_images: number; rejected: unknown[] };
  };

  expect(extraction.images).toHaveLength(4);
  expect(extraction.images.every((image) => image.source.endsWith(".png"))).toBe(true);
  expect(extraction.debug).toMatchObject({
    total_images: 4,
    accepted_images: 4,
    rejected: [],
  });
});

test("M2 extractor scans a long lazy page and excludes duplicates and generic assets", async ({
  page,
}) => {
  const extraction = (await runExtractor(
    page,
    `${M2_TEST_PAGE_URL}?penguin-debug=1`,
  )) as ExtractionResult & {
    debug: {
      total_images: number;
      accepted_images: number;
      rejected: Array<{ id: string | null; reasons: string[] }>;
    };
  };

  expect(extraction.images.length).toBeGreaterThanOrEqual(3);
  expect(extraction.images.some((image) => image.source.includes("?chapter=alpha"))).toBe(true);
  expect(extraction.images.some((image) => image.source.includes("?lazy=true"))).toBe(true);
  expect(extraction.debug.total_images).toBeGreaterThanOrEqual(6);
  expect(extraction.debug.accepted_images).toBe(extraction.images.length);
  expect(extraction.debug.rejected).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "duplicate-page", reasons: ["DUPLICATE_SOURCE"] }),
      expect.objectContaining({
        id: expect.stringMatching(/avatar|banner/),
        reasons: expect.arrayContaining(["GENERIC_UI_ASSET_HINT"]),
      }),
    ]),
  );
});

function requestBody(extraction: ExtractionResult, image: ExtractedImage, index: number) {
  return {
    request_id: `00000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
    page_url: extraction.page_url,
    image,
    source_language: "ja",
    target_language: "zh-Hant",
    reading_order: "rtl",
  };
}

async function runRenderer(page: Page, results: unknown[]) {
  await page.evaluate((rendererResults) => {
    Object.assign(window, {
      shortcutInput: { results: rendererResults },
      completion: (value: unknown) => Reflect.set(window, "penguinRendering", value),
    });
  }, results);
  await page.addScriptTag({ path: resolve("dist/renderer.iife.js") });
  return page.evaluate(() => Reflect.get(window, "penguinRendering"));
}

test("production bundles complete extractor to live FastAPI to renderer round trip", async ({
  page,
  request,
}) => {
  const extraction = await runExtractor(page);
  expect(extraction.page_url).toBe(TEST_PAGE_URL);
  expect(extraction.images.length).toBeGreaterThanOrEqual(3);

  const pageImageIds = await page.evaluate(() => ({
    one: document.getElementById("page-one")?.getAttribute("data-penguin-translator-image-id"),
    two: document.getElementById("page-two")?.getAttribute("data-penguin-translator-image-id"),
    scroll: document
      .getElementById("scroll-page")
      ?.getAttribute("data-penguin-translator-image-id"),
    small: document.getElementById("small-image")?.getAttribute("data-penguin-translator-image-id"),
  }));
  expect(pageImageIds.one).toMatch(/^penguin-image-/);
  expect(pageImageIds.two).toMatch(/^penguin-image-/);
  expect(pageImageIds.scroll).toMatch(/^penguin-image-/);
  expect(pageImageIds.small).toBeNull();

  const results: unknown[] = [];
  for (const [index, image] of extraction.images.entries()) {
    const response = await request.post(API_URL, {
      headers: { Authorization: "Bearer playwright-local-token" },
      data: requestBody(extraction, image, index),
    });
    expect(response.status()).toBe(200);
    results.push(await response.json());
  }

  const rendering = await runRenderer(page, results);
  expect(rendering).toMatchObject({
    ok: true,
    rendered_regions: results.length,
    warnings: [],
  });
  await expect(page.locator("[data-penguin-translator-region]")).toHaveCount(results.length);
  await expect(page.locator("[data-penguin-translator-region]").first()).toContainText("測試譯文");

  const scrollIndex = extraction.images.findIndex(
    (image) => image.client_image_id === pageImageIds.scroll,
  );
  expect(scrollIndex).toBeGreaterThanOrEqual(0);
  const scrollRegion = page.locator("[data-penguin-translator-region]").nth(scrollIndex);
  const scrollTopBefore = (await scrollRegion.boundingBox())?.y;
  await page.locator("#scroll-reader").evaluate((element) => {
    element.scrollTop = 80;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForFunction(() => document.querySelector("#scroll-reader")?.scrollTop === 80);
  const scrollTopAfter = (await scrollRegion.boundingBox())?.y;
  expect(scrollTopAfter).toBeLessThan(scrollTopBefore ?? Number.POSITIVE_INFINITY);

  const firstRegion = page.locator("[data-penguin-translator-region]").first();
  const widthBefore = (await firstRegion.boundingBox())?.width;
  await page.locator("#page-one").evaluate((element) => {
    element.style.width = "120px";
  });
  await expect
    .poll(async () => (await firstRegion.boundingBox())?.width)
    .toBeLessThan(widthBefore ?? Number.POSITIVE_INFINITY);

  await runRenderer(page, results);
  await expect(page.locator("#penguin-translator-control-host")).toHaveCount(1);
  await expect(page.locator("#penguin-translator-overlay-root")).toHaveCount(1);

  await page
    .locator("#penguin-translator-control-host")
    .getByRole("button", { name: "隱藏譯文" })
    .click();
  expect(
    await page
      .locator("[data-penguin-translator-region]")
      .evaluateAll((regions) =>
        regions.every((region) => (region as HTMLElement).style.display === "none"),
      ),
  ).toBe(true);
  await page
    .locator("#penguin-translator-control-host")
    .getByRole("button", { name: "顯示譯文" })
    .click();
  expect(
    await page
      .locator("[data-penguin-translator-region]")
      .evaluateAll((regions) =>
        regions.every((region) => (region as HTMLElement).style.display === "flex"),
      ),
  ).toBe(true);
  await page
    .locator("#penguin-translator-control-host")
    .getByRole("button", { name: "移除全部" })
    .click();
  await expect(page.locator("#penguin-translator-control-host")).toHaveCount(0);
  await expect(page.locator("#penguin-translator-overlay-root")).toHaveCount(0);
});

test("one API failure does not prevent other image responses from rendering", async ({
  page,
  request,
}) => {
  const extraction = await runExtractor(page);
  const results: unknown[] = [];
  const failures: Array<{ client_image_id: string; status: number }> = [];

  for (const [index, image] of extraction.images.entries()) {
    const body = requestBody(extraction, image, index);
    const response = await request.post(API_URL, {
      headers: { Authorization: "Bearer playwright-local-token" },
      data: index === 1 ? { ...body, source_language: "invalid" } : body,
    });
    if (response.ok()) {
      results.push(await response.json());
    } else {
      failures.push({ client_image_id: image.client_image_id, status: response.status() });
    }
  }

  expect(failures).toHaveLength(1);
  expect(failures[0]?.status).toBe(422);
  expect(results.length).toBe(extraction.images.length - 1);

  const rendering = await runRenderer(page, results);
  expect(rendering).toMatchObject({ ok: true, rendered_regions: results.length });
  await expect(page.locator("[data-penguin-translator-region]")).toHaveCount(results.length);
});

test("WebKit fixture completes through the thin Shortcut adapter and renderer wrapper", async ({
  page,
  request,
}) => {
  const extraction = await runExtractor(page);
  expect(extraction.payload_version).toBe("m2.2-v1");
  const decoded = JSON.parse(
    Buffer.from(
      extraction.shortcut_payload.replaceAll("-", "+").replaceAll("_", "/"),
      "base64",
    ).toString("utf8"),
  ) as Record<string, unknown>;
  decoded.source_language = "ja";
  decoded.reading_order = "rtl";
  const payload = Buffer.from(JSON.stringify(decoded), "utf8")
    .toString("base64url")
    .replace(/=+$/, "");
  const response = await request.post(SHORTCUT_API_URL, {
    headers: { Authorization: "Bearer playwright-local-token" },
    form: { payload },
  });

  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    renderer_payload: string;
    payload_version: string;
    summary: { total: number; successful: number; failed: number };
  };
  expect(body.payload_version).toBe("m2.2-v1");
  expect(body.summary).toEqual({
    total: extraction.images.length,
    successful: extraction.images.length,
    failed: 0,
  });

  const wrapper = (await readFile(resolve("dist/renderer-shortcut.iife.js"), "utf8")).replace(
    "__PENGUIN_RENDERER_PAYLOAD_MAGIC_VARIABLE__",
    body.renderer_payload,
  );
  await page.evaluate(() => {
    Reflect.set(window, "completion", (value: unknown) => {
      Reflect.set(window, "penguinRendering", value);
    });
  });
  await page.addScriptTag({ content: wrapper });
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "penguinRendering")))
    .toMatchObject({ ok: true, rendered_regions: extraction.images.length });
  await expect(page.locator("[data-penguin-translator-region]")).toHaveCount(
    extraction.images.length,
  );
});

test("production bundles contain no credential or fixed API endpoint", async () => {
  for (const name of ["extractor.iife.js", "renderer.iife.js", "renderer-shortcut.iife.js"]) {
    const source = await readFile(resolve("dist", name), "utf8");
    expect(source).not.toMatch(/\b(?:Authorization|Bearer|Token)\b/i);
    expect(source).not.toContain("/v1/translate-image");
    expect(source).not.toMatch(/https?:\/\/(?:localhost|127\.0\.0\.1|10\.|192\.168\.|172\.)/i);
  }
});
