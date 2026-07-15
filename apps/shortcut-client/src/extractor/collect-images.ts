import type { components } from "@penguin-translator/contracts";
import { ensureImageClientId } from "../shared/image-identity";
import { isElementVisible } from "./visibility";

type ApiImageSource = components["schemas"]["ImageSource"];

export type ExtractedImage = ApiImageSource;

export interface ExtractionResult {
  version: string;
  page_url: string;
  images: ExtractedImage[];
  warnings: string[];
}

const MIN_NATURAL_EDGE = 200;
const MIN_RENDERED_EDGE = 100;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value, document.baseURI);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Round a CSS-pixel measurement to the nearest positive integer for the API contract. */
export function normalizeRenderedDimension(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Rendered image dimensions must be finite.");
  }
  return Math.max(1, Math.round(value));
}

export function collectVisibleImages(): ExtractedImage[] {
  return Array.from(document.images).flatMap((image) => {
    const source = image.currentSrc || image.src;
    const rect = image.getBoundingClientRect();
    const naturalIsLarge =
      image.naturalWidth >= MIN_NATURAL_EDGE && image.naturalHeight >= MIN_NATURAL_EDGE;
    const renderedIsLarge = rect.width >= MIN_RENDERED_EDGE && rect.height >= MIN_RENDERED_EDGE;

    if (!source || !isHttpUrl(source) || !naturalIsLarge || !renderedIsLarge) {
      return [];
    }

    if (!isElementVisible(image)) {
      return [];
    }

    return [
      {
        client_image_id: ensureImageClientId(image),
        source_kind: "url" as const,
        source: new URL(source, document.baseURI).href,
        rendered_width: normalizeRenderedDimension(rect.width),
        rendered_height: normalizeRenderedDimension(rect.height),
      },
    ];
  });
}
