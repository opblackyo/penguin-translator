import { describe, expect, it } from "vitest";
import {
  decodeBase64UrlJson,
  encodeBase64UrlJson,
  SHORTCUT_PAYLOAD_VERSION,
} from "../src/shared/base64url";

describe("Shortcut Base64URL transport", () => {
  it("round-trips 15 descriptors with Unicode metadata without unsafe characters", () => {
    const request = {
      request_id: "123e4567-e89b-12d3-a456-426614174000",
      page_url: "https://example.com/讀者?章=一",
      images: Array.from({ length: 15 }, (_, index) => ({
        client_image_id: `企鵝-${index}`,
        source_kind: "url",
        source: `https://images.example.com/漫畫/${index}.png?語言=韓文`,
        rendered_width: 800,
        rendered_height: 1200,
      })),
      source_language: "auto",
      target_language: "zh-Hant",
      reading_order: "auto",
    };

    const encoded = encodeBase64UrlJson(request);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain("\n");
    expect(decodeBase64UrlJson(encoded)).toEqual(request);
    expect(SHORTCUT_PAYLOAD_VERSION).toBe("m2.2-v1");
  });

  it("rejects malformed input", () => {
    expect(() => decodeBase64UrlJson("not+base64")).toThrow("not Base64URL");
  });
});
