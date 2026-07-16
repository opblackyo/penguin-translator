import { consumeControlRequests } from "../shared/control-requests";
import { toShortcutError } from "../shared/errors";
import { VERSION } from "../shared/version";
import { collectPageImagesWithDiagnostics, type ExtractionResult } from "./collect-images";

export const DEBUG_QUERY_PARAMETER = "penguin-debug";
export const DEBUG_GLOBAL_KEY = "__PENGUIN_TRANSLATOR_DEBUG__";

export function isDebugModeEnabled(): boolean {
  return (
    new URLSearchParams(window.location.search).get(DEBUG_QUERY_PARAMETER) === "1" ||
    Reflect.get(globalThis, DEBUG_GLOBAL_KEY) === true
  );
}

export function createRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

async function run(): Promise<void> {
  try {
    const collection = await collectPageImagesWithDiagnostics();
    const controls = consumeControlRequests();
    const retryIds = new Set(controls.retryRequested);
    const images = retryIds.size
      ? collection.images.filter((image) => retryIds.has(image.client_image_id))
      : collection.images;
    if (retryIds.size) {
      collection.warnings.push("RETRY_FAILURES_REQUESTED");
    }
    const result: ExtractionResult = {
      version: VERSION,
      page_url: window.location.href,
      images,
      batch_request: {
        request_id: createRequestId(),
        page_url: window.location.href,
        images,
        source_language: "auto",
        target_language: "zh-Hant",
        reading_order: "auto",
      },
      warnings: collection.warnings,
    };
    if (retryIds.size) {
      result.control = { retry_requested: [...retryIds] };
    }
    if (isDebugModeEnabled()) {
      result.debug = collection.diagnostics;
    }
    completion(JSON.stringify(result));
  } catch (error) {
    completion(
      JSON.stringify({
        version: VERSION,
        page_url: window.location.href,
        images: [],
        errors: [toShortcutError(error)],
      }),
    );
  }
}

void run();
