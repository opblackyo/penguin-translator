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
  batch_request: {
    request_id: string;
    page_url: string;
    images: ExtractedImage[];
    source_language: "auto";
    target_language: "zh-Hant";
    reading_order: "auto";
  };
  shortcut_payload: string;
  payload_version: string;
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
  timeBudgetMilliseconds?: number;
  stableScanLimit?: number;
  minimumScanSteps?: number;
  deadlineReserveMilliseconds?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
}

export const DEFAULT_SCAN_MAX_STEPS = 8;
export const DEFAULT_SCAN_SETTLE_MILLISECONDS = 40;
export const DEFAULT_SCAN_TIME_BUDGET_MILLISECONDS = 2_200;
export const DEFAULT_SCAN_STABLE_LIMIT = 2;
export const DEFAULT_SCAN_MINIMUM_STEPS = 3;
export const DEFAULT_SCAN_DEADLINE_RESERVE_MILLISECONDS = 100;

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

function normalizedSource(image: HTMLImageElement): string {
  const source = resolveImageSource(image);
  return isHttpUrl(source) ? new URL(source, document.baseURI).href : source;
}

function sourceDiscoverySignature(): string {
  return Array.from(document.images, normalizedSource).filter(Boolean).sort().join("\n");
}

function documentImageStateSignature(): string {
  return Array.from(document.images, (image) =>
    [
      normalizedSource(image),
      image.currentSrc,
      image.getAttribute("src") ?? "",
      image.naturalWidth,
      image.naturalHeight,
      image.complete ? 1 : 0,
    ].join("|"),
  ).join("\n");
}

function mergeDiscoveredImages(
  target: Map<string, ExtractedImage>,
  collection: ImageCollectionResult,
): void {
  for (const image of collection.images) {
    if (!target.has(image.source)) {
      target.set(image.source, image);
    }
  }
}

export async function collectPageImagesWithDiagnostics(
  options: PageScanOptions = {},
): Promise<ImageCollectionResult> {
  const maxSteps = options.maxSteps ?? DEFAULT_SCAN_MAX_STEPS;
  const settleMilliseconds = options.settleMilliseconds ?? DEFAULT_SCAN_SETTLE_MILLISECONDS;
  const timeBudgetMilliseconds =
    options.timeBudgetMilliseconds ?? DEFAULT_SCAN_TIME_BUDGET_MILLISECONDS;
  const stableScanLimit = options.stableScanLimit ?? DEFAULT_SCAN_STABLE_LIMIT;
  const minimumScanSteps = options.minimumScanSteps ?? DEFAULT_SCAN_MINIMUM_STEPS;
  const deadlineReserveMilliseconds =
    options.deadlineReserveMilliseconds ?? DEFAULT_SCAN_DEADLINE_RESERVE_MILLISECONDS;
  const now = options.now ?? (() => performance.now());
  const wait = options.wait ?? waitForLazyContent;
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const viewportHeight = Math.max(window.innerHeight, 320);
  const step = Math.max(320, Math.floor(viewportHeight * 0.8));
  const deadline = now() + timeBudgetMilliseconds;
  const effectiveDeadline =
    deadline - Math.min(deadlineReserveMilliseconds, timeBudgetMilliseconds / 4);
  let maximumScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
  let requestedSteps = Math.ceil(maximumScroll / step) + 1;
  let scanSteps = Math.min(maxSteps, requestedSteps);
  const warnings: string[] = [];
  const discoveredImages = new Map<string, ExtractedImage>();
  let latestCollection = collectVisibleImagesWithDiagnostics({
    requireViewportIntersection: false,
  });
  mergeDiscoveredImages(discoveredImages, latestCollection);
  let imageStateSignature = documentImageStateSignature();
  let discoverySignature = sourceDiscoverySignature();
  let stableScans = 0;
  let completedSteps = 0;
  let timeBudgetReached = now() >= effectiveDeadline;

  const refreshCollectionWhenChanged = (): void => {
    const nextStateSignature = documentImageStateSignature();
    if (nextStateSignature === imageStateSignature) return;
    imageStateSignature = nextStateSignature;
    latestCollection = collectVisibleImagesWithDiagnostics({
      requireViewportIntersection: false,
    });
    mergeDiscoveredImages(discoveredImages, latestCollection);
  };

  try {
    if (maximumScroll > 0 && !timeBudgetReached) {
      for (let index = 0; index < scanSteps; index += 1) {
        if (now() >= effectiveDeadline) {
          timeBudgetReached = true;
          break;
        }
        maximumScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
        requestedSteps = Math.max(requestedSteps, Math.ceil(maximumScroll / step) + 1);
        scanSteps = Math.min(maxSteps, Math.max(scanSteps, requestedSteps));
        const top =
          scanSteps === 1 ? maximumScroll : Math.round((maximumScroll * index) / (scanSteps - 1));
        window.scrollTo(originalX, top);
        completedSteps += 1;
        refreshCollectionWhenChanged();

        if (now() >= effectiveDeadline) {
          timeBudgetReached = true;
          break;
        }
        const remainingSettleBudget = Math.max(0, effectiveDeadline - now());
        await wait(Math.min(settleMilliseconds, remainingSettleBudget));
        refreshCollectionWhenChanged();

        const nextDiscoverySignature = sourceDiscoverySignature();
        stableScans = nextDiscoverySignature === discoverySignature ? stableScans + 1 : 0;
        discoverySignature = nextDiscoverySignature;
        if (completedSteps >= minimumScanSteps && stableScans >= stableScanLimit) break;
        if (now() >= effectiveDeadline) {
          timeBudgetReached = true;
          break;
        }
      }
    }
  } finally {
    window.scrollTo(originalX, originalY);
  }

  if (timeBudgetReached) {
    warnings.push("LAZY_SCAN_TIME_BUDGET_REACHED");
  }
  if (requestedSteps > maxSteps && completedSteps >= maxSteps) {
    warnings.push("LAZY_SCAN_STEP_LIMIT_REACHED");
  }

  const acceptedSources = new Set(discoveredImages.keys());
  latestCollection.diagnostics.total_images = document.images.length;
  latestCollection.diagnostics.accepted_images = discoveredImages.size;
  latestCollection.diagnostics.rejected = latestCollection.diagnostics.rejected.filter(
    (diagnostic) =>
      diagnostic.reasons.includes("DUPLICATE_SOURCE") ||
      !acceptedSources.has(
        isHttpUrl(diagnostic.source)
          ? new URL(diagnostic.source, document.baseURI).href
          : diagnostic.source,
      ),
  );
  return {
    images: [...discoveredImages.values()],
    diagnostics: latestCollection.diagnostics,
    warnings,
  };
}

export function collectVisibleImages(): ExtractedImage[] {
  return collectVisibleImagesWithDiagnostics().images;
}
