import type { components } from "@penguin-translator/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectPageImagesWithDiagnostics,
  collectVisibleImages,
  collectVisibleImagesWithDiagnostics,
  normalizeRenderedDimension,
} from "../src/extractor/collect-images";
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
  complete = true,
  bounds = rect(400, 600),
}: {
  src?: string;
  currentSrc?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  complete?: boolean;
  bounds?: DOMRect;
} = {}): HTMLImageElement {
  const image = document.createElement("img");
  image.src = src;
  Object.defineProperties(image, {
    currentSrc: { configurable: true, value: currentSrc },
    naturalWidth: { configurable: true, value: naturalWidth },
    naturalHeight: { configurable: true, value: naturalHeight },
    complete: { configurable: true, value: complete },
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

  it("preserves query strings and excludes duplicate sources", () => {
    addImage({ currentSrc: "https://cdn.example.com/page.webp?chapter=12&slice=1" });
    const duplicate = addImage({
      currentSrc: "https://cdn.example.com/page.webp?chapter=12&slice=1",
    });
    duplicate.id = "duplicate-page";

    const collection = collectVisibleImagesWithDiagnostics();

    expect(collection.images.map((image) => image.source)).toEqual([
      "https://cdn.example.com/page.webp?chapter=12&slice=1",
    ]);
    expect(collection.diagnostics.rejected).toEqual([
      expect.objectContaining({ id: "duplicate-page", reasons: ["DUPLICATE_SOURCE"] }),
    ]);
  });

  it("excludes generic UI assets without named-site rules", () => {
    const avatar = addImage();
    avatar.className = "reader-profile-avatar";

    const collection = collectVisibleImagesWithDiagnostics();

    expect(collection.images).toEqual([]);
    expect(collection.diagnostics.rejected[0]?.reasons).toContain("GENERIC_UI_ASSET_HINT");
  });

  it("rejects images outside the viewport", () => {
    addImage({ bounds: rect(400, 600, window.innerHeight + 1) });

    expect(collectVisibleImages()).toEqual([]);
  });

  it.each([
    { naturalWidth: 183, naturalHeight: 274, renderedWidth: 183, renderedHeight: 274.5 },
    { naturalWidth: 180, naturalHeight: 270, renderedWidth: 180, renderedHeight: 270 },
  ])("accepts iPhone manga dimensions $naturalWidth x $naturalHeight when the rendered size is sufficient", ({
    naturalWidth,
    naturalHeight,
    renderedWidth,
    renderedHeight,
  }) => {
    addImage({
      naturalWidth,
      naturalHeight,
      bounds: rect(renderedWidth, renderedHeight),
    });

    expect(collectVisibleImages()).toHaveLength(1);
  });

  it("accepts when either size group is sufficient and rejects when neither is sufficient", () => {
    addImage({
      currentSrc: "https://example.com/rendered-large.jpg",
      naturalWidth: 64,
      naturalHeight: 64,
      bounds: rect(400, 600),
    });
    addImage({
      currentSrc: "https://example.com/natural-large.jpg",
      naturalWidth: 800,
      naturalHeight: 1200,
      bounds: rect(64, 64),
    });
    const small = addImage({ naturalWidth: 64, naturalHeight: 64, bounds: rect(64, 64) });
    small.id = "small-image";

    const collection = collectVisibleImagesWithDiagnostics();

    expect(collection.images).toHaveLength(2);
    expect(collection.diagnostics.rejected).toEqual([
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

  it("reports every measured value and rejection reason without changing filtering", () => {
    const accepted = addImage();
    accepted.id = "page-one";
    const unloaded = addImage({
      naturalWidth: 0,
      naturalHeight: 0,
      bounds: rect(0, 0),
    });
    unloaded.id = "page-two";
    const belowViewport = addImage({ bounds: rect(400, 600, window.innerHeight + 1) });
    belowViewport.id = "scroll-page";
    const small = addImage({ naturalWidth: 64, naturalHeight: 64, bounds: rect(64, 64) });
    small.id = "small-image";

    const collection = collectVisibleImagesWithDiagnostics();

    expect(collection.images).toHaveLength(1);
    expect(collection.diagnostics).toMatchObject({
      total_images: 4,
      accepted_images: 1,
    });
    expect(collection.diagnostics.rejected).toEqual([
      expect.objectContaining({
        id: "page-two",
        complete: true,
        natural_width: 0,
        natural_height: 0,
        reasons: [
          "NATURAL_WIDTH_BELOW_MINIMUM",
          "NATURAL_HEIGHT_BELOW_MINIMUM",
          "RENDERED_WIDTH_BELOW_MINIMUM",
          "RENDERED_HEIGHT_BELOW_MINIMUM",
          "RENDERED_WIDTH_ZERO",
          "RENDERED_HEIGHT_ZERO",
        ],
      }),
      expect.objectContaining({
        id: "scroll-page",
        reasons: ["OUTSIDE_VIEWPORT_BELOW"],
      }),
      expect.objectContaining({
        id: "small-image",
        natural_width: 64,
        natural_height: 64,
        rendered_rect: expect.objectContaining({ width: 64, height: 64 }),
        reasons: [
          "NATURAL_WIDTH_BELOW_MINIMUM",
          "NATURAL_HEIGHT_BELOW_MINIMUM",
          "RENDERED_WIDTH_BELOW_MINIMUM",
          "RENDERED_HEIGHT_BELOW_MINIMUM",
        ],
      }),
    ]);
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

  it("collects off-screen long pages and images inserted during a bounded lazy scan", async () => {
    const first = addImage({
      currentSrc: "https://example.com/long-page-1.png",
      naturalWidth: 900,
      naturalHeight: 6000,
      bounds: rect(390, 2600, window.innerHeight + 100),
    });
    first.id = "long-page";
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(2400);
    vi.spyOn(window, "scrollTo").mockImplementation((_x, y) => {
      if (Number(y) > 0 && !document.getElementById("lazy-page")) {
        const lazy = addImage({
          currentSrc: "https://example.com/lazy-page.png",
          naturalWidth: 900,
          naturalHeight: 1800,
          bounds: rect(390, 780, 1500),
        });
        lazy.id = "lazy-page";
      }
    });

    const collection = await collectPageImagesWithDiagnostics({
      maxSteps: 4,
      settleMilliseconds: 0,
    });

    expect(collection.images.map((image) => image.source)).toEqual([
      "https://example.com/long-page-1.png",
      "https://example.com/lazy-page.png",
    ]);
  });

  it("distributes bounded scan steps across a genuinely long page", async () => {
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(50_768);
    const visited: number[] = [];
    vi.spyOn(window, "scrollTo").mockImplementation((_x, y) => {
      const top = Number(y);
      visited.push(top);
      if (top >= 20_000 && top <= 30_000 && !document.getElementById("middle-lazy-page")) {
        const middle = addImage({
          currentSrc: "https://example.com/middle-lazy-page.png",
          naturalWidth: 900,
          naturalHeight: 1800,
          bounds: rect(390, 780, 25_000),
        });
        middle.id = "middle-lazy-page";
      }
    });

    const collection = await collectPageImagesWithDiagnostics({
      maxSteps: 5,
      settleMilliseconds: 0,
    });

    expect(visited).toContain(25_000);
    expect(collection.images.map((image) => image.source)).toContain(
      "https://example.com/middle-lazy-page.png",
    );
    expect(collection.warnings).toContain("LAZY_SCAN_STEP_LIMIT_REACHED");
  });
});
