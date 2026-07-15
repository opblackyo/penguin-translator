import type { components } from "@penguin-translator/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectVisibleImages, normalizeRenderedDimension } from "../src/extractor/collect-images";
import { IMAGE_ID_ATTRIBUTE } from "../src/shared/image-identity";

type ApiImageSource = components["schemas"]["ImageSource"];

function rect(width: number, height: number, top = 10, left = 10): DOMRect {
  return {
    x: left,
    y: top,
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

function addImage({
  src = "https://example.com/fallback.jpg",
  currentSrc = src,
  naturalWidth = 800,
  naturalHeight = 1200,
  bounds = rect(400, 600),
}: {
  src?: string;
  currentSrc?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  bounds?: DOMRect;
} = {}): HTMLImageElement {
  const image = document.createElement("img");
  image.src = src;
  Object.defineProperties(image, {
    currentSrc: { configurable: true, value: currentSrc },
    naturalWidth: { configurable: true, value: naturalWidth },
    naturalHeight: { configurable: true, value: naturalHeight },
  });
  vi.spyOn(image, "getBoundingClientRect").mockReturnValue(bounds);
  document.body.append(image);
  return image;
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("collectVisibleImages", () => {
  it.each([
    "http://example.com/page.jpg",
    "https://example.com/page.jpg",
  ])("accepts a visible %s image", (source) => {
    addImage({ src: source });

    expect(collectVisibleImages()).toHaveLength(1);
  });

  it("rejects non-HTTP sources", () => {
    addImage({ src: "data:image/png;base64,AAAA" });

    expect(collectVisibleImages()).toEqual([]);
  });

  it("prefers currentSrc over src", () => {
    addImage({
      src: "https://example.com/fallback.jpg",
      currentSrc: "https://cdn.example.com/responsive.webp",
    });

    expect(collectVisibleImages()[0]?.source).toBe("https://cdn.example.com/responsive.webp");
  });

  it("rejects images outside the viewport or below either size threshold", () => {
    addImage({ bounds: rect(400, 600, window.innerHeight + 1) });
    addImage({ bounds: rect(99, 600) });
    addImage({ naturalWidth: 199 });

    expect(collectVisibleImages()).toEqual([]);
  });

  it("rounds fractional CSS pixels to positive integers matching the API shape", () => {
    addImage({ bounds: rect(399.5, 600.25) });

    const extracted = collectVisibleImages()[0];
    if (!extracted) {
      throw new Error("Expected a visible extracted image.");
    }
    const apiImage: ApiImageSource = extracted;
    expect(apiImage.rendered_width).toBe(400);
    expect(apiImage.rendered_height).toBe(600);
    expect(Number.isInteger(apiImage.rendered_width)).toBe(true);
    expect(Number.isInteger(apiImage.rendered_height)).toBe(true);
    expect(apiImage).not.toHaveProperty("natural_width");
    expect(apiImage).not.toHaveProperty("natural_height");
    expect(normalizeRenderedDimension(0.1)).toBe(1);
  });

  it("marks the image directly and preserves the identifier across extraction runs", () => {
    const image = addImage();

    const first = collectVisibleImages()[0]?.client_image_id;
    const second = collectVisibleImages()[0]?.client_image_id;

    expect(first).toMatch(/^penguin-image-/);
    expect(second).toBe(first);
    expect(image.getAttribute(IMAGE_ID_ATTRIBUTE)).toBe(first);
  });

  it("does not use network, cookies, or Web Storage", () => {
    addImage();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    const storageRead = vi.spyOn(Storage.prototype, "getItem");
    const cookieRead = vi.spyOn(document, "cookie", "get");

    collectVisibleImages();

    expect(fetch).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(storageRead).not.toHaveBeenCalled();
    expect(cookieRead).not.toHaveBeenCalled();
  });
});
