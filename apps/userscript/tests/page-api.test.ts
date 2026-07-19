import { describe, expect, test, vi } from "vitest";
import type { GMRequestDetails } from "../src/gm";
import { type TranslationPageRequest, translatePage } from "../src/page-api";
import { createGM } from "./helpers";

function request(imageCount = 15): TranslationPageRequest {
  return {
    request_id: "123e4567-e89b-42d3-a456-426614174000",
    page_url: "https://reader.example.test/chapter/一",
    images: Array.from({ length: imageCount }, (_, index) => ({
      client_image_id: `penguin-image-${index}`,
      source_kind: "url" as const,
      source: `https://images.example.test/漫畫/${index}.png?章=一`,
      rendered_width: 720,
      rendered_height: 1280,
    })),
    source_language: "auto",
    target_language: "zh-Hant",
    reading_order: "auto",
  };
}

function partialResponse(value: TranslationPageRequest): string {
  return JSON.stringify({
    request_id: value.request_id,
    results: [],
    failures: [{ client_image_id: value.images[14]?.client_image_id, code: "IMAGE_FETCH_FAILED" }],
    progress: { total: 15, completed: 15, successful: 14, failed: 1 },
    warnings: [],
    timing: {
      total_ms: 1200,
      fetch_ms: 100,
      ocr_ms: 500,
      gemini_ms: 500,
      queue_wait_ms: 0,
      cold_start_ms: 0,
      gemini_calls: 2,
      ocr_cache_hits: 0,
      warm_execution: true,
    },
  });
}

describe("GM page API transport", () => {
  test("preserves a 15-image Unicode array and accepts partial failure", async () => {
    const gm = createGM();
    gm.xmlHttpRequest = vi.fn(async (details: GMRequestDetails) => {
      gm.requests.push(details);
      return { status: 200, responseText: partialResponse(JSON.parse(details.data)) };
    });
    const input = request();
    const response = await translatePage(
      gm,
      {
        endpoint: "https://api.example.test/v1/translate-page",
        token: "runtime-only-value",
        targetLanguage: "zh-Hant",
      },
      input,
    );
    const sent = JSON.parse(gm.requests[0]?.data ?? "null") as TranslationPageRequest;
    expect(Array.isArray(sent.images)).toBe(true);
    expect(sent.images).toHaveLength(15);
    expect(sent.images).toEqual(input.images);
    expect(response.progress).toMatchObject({ total: 15, successful: 14, failed: 1 });
    expect(response.failures).toHaveLength(1);
  });

  test("maps HTTP and malformed response failures to safe codes", async () => {
    const gm = createGM();
    gm.xmlHttpRequest = vi.fn(async () => ({ status: 401, responseText: "secret server body" }));
    await expect(
      translatePage(
        gm,
        { endpoint: "https://api.example.test", token: "local", targetLanguage: "zh-Hant" },
        request(1),
      ),
    ).rejects.toThrow("LOCAL_API_TOKEN_INVALID");
    gm.xmlHttpRequest = vi.fn(async () => ({ status: 200, responseText: "not json" }));
    await expect(
      translatePage(
        gm,
        { endpoint: "https://api.example.test", token: "local", targetLanguage: "zh-Hant" },
        request(1),
      ),
    ).rejects.toThrow("PAGE_API_RESPONSE_INVALID");
  });
});
