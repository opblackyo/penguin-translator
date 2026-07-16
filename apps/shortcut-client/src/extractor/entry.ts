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
