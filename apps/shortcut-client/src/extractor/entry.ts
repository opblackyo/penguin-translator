import { toShortcutError } from "../shared/errors";
import { VERSION } from "../shared/version";
import { collectVisibleImages, type ExtractionResult } from "./collect-images";

function run(): void {
  try {
    const result: ExtractionResult = {
      version: VERSION,
      page_url: window.location.href,
      images: collectVisibleImages(),
      warnings: [],
    };
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

run();
