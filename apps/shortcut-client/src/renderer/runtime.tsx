import type { components } from "@penguin-translator/contracts";
import { render } from "preact";
import {
  CANCEL_REQUESTED_KEY,
  consumeControlRequests,
  RETRY_REQUESTED_KEY,
  readControlRequests,
  requestCancellation,
  requestFailureRetry,
} from "../shared/control-requests";
import { toShortcutError } from "../shared/errors";
import { findImageByClientId } from "../shared/image-identity";
import { VERSION } from "../shared/version";
import { CONTROL_PANEL_STYLE, ControlPanel, type ProgressState } from "./control-panel";
import { mapPolygonToDocument, type Point } from "./coordinate-mapper";
import { layoutOverlayRegions } from "./overlay-layout";
import { type OverlayRegion, OverlayRoot } from "./overlay-root";
import { detectRegionBackground, type RegionBackgroundMode } from "./region-style";

export type TranslationResult = components["schemas"]["TranslationImageResponse"];

export const ROOT_ID = "penguin-translator-overlay-root";
export const PANEL_ID = "penguin-translator-control-host";
export const RENDERER_CLEANUP_KEY = "__penguinTranslatorM0RendererCleanup";
export const CANCEL_EVENT = "penguin-translator:cancel";
export const RETRY_FAILURES_EVENT = "penguin-translator:retry-failures";
export { CANCEL_REQUESTED_KEY, RETRY_REQUESTED_KEY };

type Cleanup = () => void;

export interface MountResult {
  renderedRegions: number;
  warnings: string[];
}

export interface RendererInput {
  results: TranslationResult[];
  failures: string[];
  progress: ProgressState;
  consumeControlRequests: boolean;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeProgress(value: unknown, successful: number, failed: number): ProgressState {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const completedFallback = successful + failed;
  const total = nonNegativeInteger(record.total, completedFallback);
  const completed = Math.min(total, nonNegativeInteger(record.completed, completedFallback));
  return {
    total,
    completed,
    successful: Math.min(completed, nonNegativeInteger(record.successful, successful)),
    failed: Math.min(completed, nonNegativeInteger(record.failed, failed)),
  };
}

export function parseInput(input: unknown): RendererInput {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  const results = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "results" in parsed
      ? (parsed as { results: unknown }).results
      : null;

  if (!Array.isArray(results)) {
    throw new Error("Renderer input must be a result array or an object containing results.");
  }

  const record =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  const failureValues = Array.isArray(record.failures) ? record.failures : [];
  const failures = failureValues
    .map((failure) =>
      typeof failure === "string"
        ? failure
        : typeof failure === "object" && failure !== null && "client_image_id" in failure
          ? String((failure as { client_image_id: unknown }).client_image_id)
          : "",
    )
    .filter(Boolean);
  return {
    results: results as TranslationResult[],
    failures,
    progress: normalizeProgress(record.progress, results.length, failures.length),
    consumeControlRequests: record.consume_control_requests === true,
  };
}

function activeCleanup(): Cleanup | undefined {
  const cleanup = Reflect.get(window, RENDERER_CLEANUP_KEY);
  return typeof cleanup === "function" ? (cleanup as Cleanup) : undefined;
}

export function removeExisting(): void {
  const cleanup = activeCleanup();
  if (cleanup) {
    cleanup();
    return;
  }

  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(PANEL_ID)?.remove();
}

export function mount(
  results: TranslationResult[],
  options: { progress?: ProgressState; failures?: string[] } = {},
): MountResult {
  removeExisting();

  const overlay = document.createElement("div");
  overlay.id = ROOT_ID;
  overlay.dataset.penguinTranslatorRoot = "true";
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483646";
  overlay.style.pointerEvents = "none";
  document.body.append(overlay);

  const panelHost = document.createElement("div");
  panelHost.id = PANEL_ID;
  panelHost.dataset.penguinTranslatorPanel = "true";
  const shadow = panelHost.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CONTROL_PANEL_STYLE;
  shadow.append(style);
  const panelMount = document.createElement("div");
  shadow.append(panelMount);
  document.body.append(panelHost);

  const warnings: string[] = [];
  const matchedImages = new Set<HTMLImageElement>();
  for (const result of results) {
    const image = findImageByClientId(result.client_image_id);
    if (image) {
      matchedImages.add(image);
    } else {
      warnings.push(`IMAGE_NOT_FOUND:${result.client_image_id}`);
    }
  }

  let animationFrame: number | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let disposed = false;
  let textMode: "source" | "translation" = "translation";
  const backgroundModes = new Map<string, RegionBackgroundMode>();
  const progress = options.progress ?? normalizeProgress(undefined, results.length, 0);
  const failures = options.failures ?? [];

  const draw = (): void => {
    if (disposed) {
      return;
    }

    const regions: OverlayRegion[] = [];
    for (const result of results) {
      const image = findImageByClientId(result.client_image_id);
      if (!image) {
        continue;
      }
      const rect = image.getBoundingClientRect();
      const imageRegions: OverlayRegion[] = [];
      for (const region of result.regions) {
        const key = `${result.client_image_id}:${region.region_id}`;
        let backgroundMode = backgroundModes.get(key);
        if (!backgroundMode) {
          backgroundMode =
            "background_style" in region &&
            (region.background_style === "opaque" || region.background_style === "translucent")
              ? region.background_style
              : detectRegionBackground(image, region.polygon as Point[]);
          backgroundModes.set(key, backgroundMode);
        }
        imageRegions.push({
          key,
          position: mapPolygonToDocument(
            image,
            region.polygon as Point[],
            result.image_width,
            result.image_height,
            rect,
          ),
          sourceText: region.source_text,
          translatedText: region.translated_text,
          backgroundMode,
        });
      }
      regions.push(
        ...layoutOverlayRegions(imageRegions, {
          left: window.scrollX + rect.left,
          top: window.scrollY + rect.top,
          right: window.scrollX + rect.right,
          bottom: window.scrollY + rect.bottom,
        }),
      );
    }
    render(<OverlayRoot regions={regions} textMode={textMode} />, overlay);
  };

  const scheduleDraw = (): void => {
    if (disposed || animationFrame !== undefined) {
      return;
    }
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = undefined;
      draw();
    });
  };

  const cleanup: Cleanup = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    document.removeEventListener("scroll", scheduleDraw, true);
    window.removeEventListener("scroll", scheduleDraw);
    window.removeEventListener("resize", scheduleDraw);
    resizeObserver?.disconnect();
    if (animationFrame !== undefined) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
    }
    render(null, overlay);
    render(null, panelMount);
    overlay.remove();
    panelHost.remove();
    if (activeCleanup() === cleanup) {
      Reflect.deleteProperty(window, RENDERER_CLEANUP_KEY);
    }
  };

  Reflect.set(window, RENDERER_CLEANUP_KEY, cleanup);

  try {
    draw();
    render(
      <ControlPanel
        onRemove={removeExisting}
        onTextModeChange={(mode) => {
          textMode = mode;
          draw();
        }}
        onCancel={() => {
          requestCancellation();
          window.dispatchEvent(new CustomEvent(CANCEL_EVENT));
        }}
        onRetryFailures={() => {
          requestFailureRetry(failures);
          window.dispatchEvent(
            new CustomEvent(RETRY_FAILURES_EVENT, { detail: { client_image_ids: failures } }),
          );
        }}
        progress={progress}
      />,
      panelMount,
    );
    document.addEventListener("scroll", scheduleDraw, { capture: true, passive: true });
    window.addEventListener("scroll", scheduleDraw, { passive: true });
    window.addEventListener("resize", scheduleDraw, { passive: true });

    if (typeof window.ResizeObserver === "function") {
      resizeObserver = new window.ResizeObserver(scheduleDraw);
      for (const image of matchedImages) {
        resizeObserver.observe(image);
      }
    }

    return {
      renderedRegions: overlay.querySelectorAll("[data-penguin-translator-region]").length,
      warnings,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function runRenderer(input: unknown, complete: (result: unknown) => void): void {
  try {
    const parsed = parseInput(input);
    const result = mount(parsed.results, {
      progress: parsed.progress,
      failures: parsed.failures,
    });
    const controls = parsed.consumeControlRequests
      ? consumeControlRequests()
      : readControlRequests();
    complete({
      ok: true,
      version: VERSION,
      rendered_regions: result.renderedRegions,
      warnings: result.warnings,
      cancel_requested: controls.cancelRequested,
      retry_requested: controls.retryRequested,
    });
  } catch (error) {
    complete({ ok: false, version: VERSION, errors: [toShortcutError(error)] });
  }
}
