import type { components } from "@penguin-translator/contracts";
import { ensureImageClientId } from "../shared/image-identity";
import { getVisibilityRejectionReasons, type VisibilityRejectionReason } from "./visibility";

type ApiImageSource = components["schemas"]["ImageSource"];

export type ExtractedImage = ApiImageSource;

export type ImageRejectionReason =
  | "MISSING_SOURCE"
  | "UNSUPPORTED_SOURCE_PROTOCOL"
  | "NATURAL_WIDTH_BELOW_MINIMUM"
  | "NATURAL_HEIGHT_BELOW_MINIMUM"
  | "RENDERED_WIDTH_BELOW_MINIMUM"
  | "RENDERED_HEIGHT_BELOW_MINIMUM"
  | VisibilityRejectionReason;

export interface RejectedImageDiagnostic {
  id: string | null;
  source: string;
  complete: boolean;
  natural_width: number;
  natural_height: number;
  rendered_rect: {
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  computed_style: {
    display: string;
    visibility: string;
    opacity: string;
  };
  reasons: ImageRejectionReason[];
}

export interface ExtractionDiagnostics {
  document_ready_state: DocumentReadyState;
  viewport: {
    width: number;
    height: number;
  };
  total_images: number;
  accepted_images: number;
  rejected: RejectedImageDiagnostic[];
}

export interface ExtractionResult {
  version: string;
  page_url: string;
  images: ExtractedImage[];
  warnings: string[];
  debug?: ExtractionDiagnostics;
}

export interface ImageCollectionResult {
  images: ExtractedImage[];
  diagnostics: ExtractionDiagnostics;
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

export function collectVisibleImagesWithDiagnostics(): ImageCollectionResult {
  const images: ExtractedImage[] = [];
  const rejected: RejectedImageDiagnostic[] = [];

  for (const image of Array.from(document.images)) {
    const source = image.currentSrc || image.src;
    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    const reasons: ImageRejectionReason[] = [];
    const naturalSizeIsLargeEnough =
      image.naturalWidth >= MIN_NATURAL_EDGE && image.naturalHeight >= MIN_NATURAL_EDGE;
    const renderedSizeIsLargeEnough =
      rect.width >= MIN_RENDERED_EDGE && rect.height >= MIN_RENDERED_EDGE;

    if (!source) {
      reasons.push("MISSING_SOURCE");
    } else if (!isHttpUrl(source)) {
      reasons.push("UNSUPPORTED_SOURCE_PROTOCOL");
    }
    if (!naturalSizeIsLargeEnough && !renderedSizeIsLargeEnough) {
      if (image.naturalWidth < MIN_NATURAL_EDGE) {
        reasons.push("NATURAL_WIDTH_BELOW_MINIMUM");
      }
      if (image.naturalHeight < MIN_NATURAL_EDGE) {
        reasons.push("NATURAL_HEIGHT_BELOW_MINIMUM");
      }
      if (rect.width < MIN_RENDERED_EDGE) {
        reasons.push("RENDERED_WIDTH_BELOW_MINIMUM");
      }
      if (rect.height < MIN_RENDERED_EDGE) {
        reasons.push("RENDERED_HEIGHT_BELOW_MINIMUM");
      }
    }
    reasons.push(...getVisibilityRejectionReasons(image, rect));

    if (reasons.length === 0) {
      images.push({
        client_image_id: ensureImageClientId(image),
        source_kind: "url" as const,
        source: new URL(source, document.baseURI).href,
        rendered_width: normalizeRenderedDimension(rect.width),
        rendered_height: normalizeRenderedDimension(rect.height),
      });
    } else {
      rejected.push({
        id: image.id || null,
        source,
        complete: image.complete,
        natural_width: image.naturalWidth,
        natural_height: image.naturalHeight,
        rendered_rect: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        computed_style: {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
        },
        reasons,
      });
    }
  }

  return {
    images,
    diagnostics: {
      document_ready_state: document.readyState,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      total_images: document.images.length,
      accepted_images: images.length,
      rejected,
    },
  };
}

export function collectVisibleImages(): ExtractedImage[] {
  return collectVisibleImagesWithDiagnostics().images;
}
