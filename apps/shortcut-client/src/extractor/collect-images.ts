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
  | "GENERIC_UI_ASSET_HINT"
  | "DUPLICATE_SOURCE"
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
  viewport: { width: number; height: number };
  total_images: number;
  accepted_images: number;
  rejected: RejectedImageDiagnostic[];
}

export interface ExtractionResult {
  version: string;
  page_url: string;
  images: ExtractedImage[];
  warnings: string[];
  control?: {
    retry_requested: string[];
  };
  debug?: ExtractionDiagnostics;
}

export interface ImageCollectionResult {
  images: ExtractedImage[];
  diagnostics: ExtractionDiagnostics;
  warnings: string[];
}

interface CollectionOptions {
  requireViewportIntersection?: boolean;
}

interface PageScanOptions {
  maxSteps?: number;
  settleMilliseconds?: number;
}

const MIN_NATURAL_EDGE = 200;
const MIN_RENDERED_EDGE = 100;
const GENERIC_UI_HINT =
  /(?:^|[\s_-])(avatar|logo|icon|advert|advertisement|banner|badge|emoji|profile)(?:$|[\s_-])/i;

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

function srcsetCandidate(image: HTMLImageElement): string {
  const srcset = image.getAttribute("srcset") ?? "";
  const candidates = srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/, 1)[0] ?? "")
    .filter(Boolean);
  return candidates.at(-1) ?? "";
}

export function resolveImageSource(image: HTMLImageElement): string {
  const lazySource =
    image.getAttribute("data-src") ??
    image.getAttribute("data-lazy-src") ??
    image.getAttribute("data-original") ??
    "";
  const preferred = [image.currentSrc, lazySource, srcsetCandidate(image), image.src];
  return (
    preferred.find((candidate) => candidate && isHttpUrl(candidate)) ??
    preferred.find(Boolean) ??
    ""
  );
}

function hasGenericUiAssetEvidence(image: HTMLImageElement): boolean {
  if (
    image.getAttribute("aria-hidden") === "true" ||
    image.getAttribute("role") === "presentation"
  ) {
    return true;
  }
  const evidence = [image.id, image.className, image.alt, image.getAttribute("role") ?? ""].join(
    " ",
  );
  return GENERIC_UI_HINT.test(evidence);
}

export function collectVisibleImagesWithDiagnostics(
  options: CollectionOptions = {},
): ImageCollectionResult {
  const images: ExtractedImage[] = [];
  const rejected: RejectedImageDiagnostic[] = [];
  const acceptedSources = new Set<string>();
  const requireViewportIntersection = options.requireViewportIntersection ?? true;

  for (const image of Array.from(document.images)) {
    const source = resolveImageSource(image);
    const absoluteSource = isHttpUrl(source) ? new URL(source, document.baseURI).href : source;
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
    if (hasGenericUiAssetEvidence(image)) {
      reasons.push("GENERIC_UI_ASSET_HINT");
    }
    if (!naturalSizeIsLargeEnough && !renderedSizeIsLargeEnough) {
      if (image.naturalWidth < MIN_NATURAL_EDGE) reasons.push("NATURAL_WIDTH_BELOW_MINIMUM");
      if (image.naturalHeight < MIN_NATURAL_EDGE) reasons.push("NATURAL_HEIGHT_BELOW_MINIMUM");
      if (rect.width < MIN_RENDERED_EDGE) reasons.push("RENDERED_WIDTH_BELOW_MINIMUM");
      if (rect.height < MIN_RENDERED_EDGE) reasons.push("RENDERED_HEIGHT_BELOW_MINIMUM");
    }
    reasons.push(
      ...getVisibilityRejectionReasons(image, rect, window, requireViewportIntersection),
    );
    if (reasons.length === 0 && absoluteSource && acceptedSources.has(absoluteSource)) {
      reasons.push("DUPLICATE_SOURCE");
    }

    if (reasons.length === 0) {
      acceptedSources.add(absoluteSource);
      images.push({
        client_image_id: ensureImageClientId(image),
        source_kind: "url" as const,
        source: absoluteSource,
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
      viewport: { width: window.innerWidth, height: window.innerHeight },
      total_images: document.images.length,
      accepted_images: images.length,
      rejected,
    },
    warnings: [],
  };
}

function waitForLazyContent(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function collectPageImagesWithDiagnostics(
  options: PageScanOptions = {},
): Promise<ImageCollectionResult> {
  const maxSteps = options.maxSteps ?? 24;
  const settleMilliseconds = options.settleMilliseconds ?? 80;
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const viewportHeight = Math.max(window.innerHeight, 320);
  const step = Math.max(320, Math.floor(viewportHeight * 0.8));
  let maximumScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
  let requestedSteps = Math.ceil(maximumScroll / step) + 1;
  let scanSteps = Math.min(maxSteps, requestedSteps);
  const warnings: string[] = [];

  if (maximumScroll > 0) {
    try {
      for (let index = 0; index < scanSteps; index += 1) {
        maximumScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
        requestedSteps = Math.max(requestedSteps, Math.ceil(maximumScroll / step) + 1);
        scanSteps = Math.min(maxSteps, Math.max(scanSteps, requestedSteps));
        const top =
          scanSteps === 1 ? maximumScroll : Math.round((maximumScroll * index) / (scanSteps - 1));
        window.scrollTo(originalX, top);
        await waitForLazyContent(settleMilliseconds);
      }
    } finally {
      window.scrollTo(originalX, originalY);
    }
  }

  if (requestedSteps > maxSteps) {
    warnings.push("LAZY_SCAN_STEP_LIMIT_REACHED");
  }

  const collection = collectVisibleImagesWithDiagnostics({ requireViewportIntersection: false });
  collection.warnings.push(...warnings);
  return collection;
}

export function collectVisibleImages(): ExtractedImage[] {
  return collectVisibleImagesWithDiagnostics().images;
}
