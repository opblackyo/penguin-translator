import type { components } from "@penguin-translator/contracts";
import { render } from "preact";
import { toShortcutError } from "../shared/errors";
import { findImageByClientId } from "../shared/image-identity";
import { VERSION } from "../shared/version";
import { CONTROL_PANEL_STYLE, ControlPanel } from "./control-panel";
import { mapPolygonToDocument, type Point } from "./coordinate-mapper";
import { type OverlayRegion, OverlayRoot } from "./overlay-root";

export type TranslationResult = components["schemas"]["TranslationImageResponse"];

export const ROOT_ID = "penguin-translator-overlay-root";
export const PANEL_ID = "penguin-translator-control-host";
export const RENDERER_CLEANUP_KEY = "__penguinTranslatorM0RendererCleanup";

type Cleanup = () => void;

export interface MountResult {
  renderedRegions: number;
  warnings: string[];
}

export function parseInput(input: unknown): TranslationResult[] {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  const results = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "results" in parsed
      ? (parsed as { results: unknown }).results
      : null;

  if (!Array.isArray(results)) {
    throw new Error("Renderer input must be a result array or an object containing results.");
  }

  return results as TranslationResult[];
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

export function mount(results: TranslationResult[]): MountResult {
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
      for (const region of result.regions) {
        regions.push({
          key: `${result.client_image_id}:${region.region_id}`,
          position: mapPolygonToDocument(
            image,
            region.polygon as Point[],
            result.image_width,
            result.image_height,
          ),
          text: region.translated_text,
        });
      }
    }
    render(<OverlayRoot regions={regions} />, overlay);
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
    render(<ControlPanel onRemove={removeExisting} />, panelMount);
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
    const result = mount(parseInput(input));
    complete({
      ok: true,
      version: VERSION,
      rendered_regions: result.renderedRegions,
      warnings: result.warnings,
    });
  } catch (error) {
    complete({ ok: false, version: VERSION, errors: [toShortcutError(error)] });
  }
}
