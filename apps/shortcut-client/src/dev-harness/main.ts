import type { components } from "@penguin-translator/contracts";

type TranslationPageRequest = components["schemas"]["TranslationPageRequest"];
type TranslationPageResponse = components["schemas"]["TranslationPageResponse"];

interface ExtractionResult {
  version: string;
  payload_version: string;
  images: TranslationPageRequest["images"];
  batch_request: TranslationPageRequest;
  warnings: string[];
}

const allowedFixtures = new Set(["/test-page/", "/m1-test-page/", "/m2-test-page/"]);

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing harness element: ${id}`);
  return found as T;
}

const fixture = element<HTMLSelectElement>("fixture");
const endpoint = element<HTMLInputElement>("api-endpoint");
const token = element<HTMLInputElement>("api-token");
const frame = element<HTMLIFrameElement>("fixture-frame");
const status = element<HTMLOutputElement>("status");
const extractionOutput = element<HTMLElement>("extraction-output");
const translationOutput = element<HTMLElement>("translation-output");

let extraction: ExtractionResult | undefined;
let translation: TranslationPageResponse | undefined;
endpoint.value = `${window.location.protocol}//${window.location.hostname}:8000`;

function loadFrame(path: string): Promise<Window> {
  if (!allowedFixtures.has(path))
    return Promise.reject(new Error("Only self-created fixtures allowed."));
  return new Promise((resolve, reject) => {
    frame.addEventListener(
      "load",
      () => {
        if (!frame.contentWindow) reject(new Error("Fixture frame is unavailable."));
        else resolve(frame.contentWindow);
      },
      { once: true },
    );
    frame.src = path;
  });
}

function injectScript(target: Window, source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = target.document.createElement("script");
    script.src = source;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${source}`));
    target.document.documentElement.append(script);
  });
}

async function runExtractor(): Promise<void> {
  status.textContent = "Running extractor…";
  const target = await loadFrame(fixture.value);
  const serialized = await new Promise<string>((resolve, reject) => {
    Reflect.set(target, "completion", (value: unknown) => {
      if (typeof value === "string") resolve(value);
      else reject(new Error("Extractor completion was not serialized JSON."));
    });
    void injectScript(target, "/dist/extractor.iife.js").catch(reject);
  });
  extraction = JSON.parse(serialized) as ExtractionResult;
  translation = undefined;
  extractionOutput.textContent = JSON.stringify(
    {
      version: extraction.version,
      payload_version: extraction.payload_version,
      image_count: extraction.images.length,
      images: extraction.images,
      batch_request: extraction.batch_request,
      warnings: extraction.warnings,
    },
    null,
    2,
  );
  translationOutput.textContent = "Not run";
  status.textContent = `Extractor complete: ${extraction.images.length} images.`;
}

async function translatePage(): Promise<void> {
  if (!extraction) throw new Error("Run extractor first.");
  if (!token.value) throw new Error("Local API Token is required.");
  status.textContent = "Calling page API…";
  const response = await fetch(`${endpoint.value.replace(/\/$/, "")}/v1/translate-page`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json" },
    body: JSON.stringify(extraction.batch_request),
  });
  if (!response.ok) throw new Error(`Page API returned ${response.status}.`);
  translation = (await response.json()) as TranslationPageResponse;
  translationOutput.textContent = JSON.stringify(
    {
      progress: translation.progress,
      failures: translation.failures,
      timing: translation.timing,
      per_image_timing: translation.results.map((result) => ({
        client_image_id: result.client_image_id,
        timing: result.timing,
        region_count: result.regions.length,
        warnings: result.warnings,
      })),
    },
    null,
    2,
  );
  status.textContent = `Translation complete: ${translation.progress.successful} successful, ${translation.progress.failed} failed, Gemini ${translation.timing.gemini_calls}.`;
}

async function renderOverlays(): Promise<void> {
  if (!translation || !frame.contentWindow) throw new Error("Translate the fixture first.");
  const target = frame.contentWindow;
  const result = await new Promise<unknown>((resolve, reject) => {
    Reflect.set(target, "shortcutInput", translation);
    Reflect.set(target, "completion", resolve);
    void injectScript(target, "/dist/renderer.iife.js").catch(reject);
  });
  status.textContent = `Renderer completion: ${JSON.stringify(result)}`;
}

function sanitizedDiagnostics(): Record<string, unknown> {
  return {
    schema: "penguin-translator-sanitized-diagnostic-v1",
    extraction: extraction
      ? {
          version: extraction.version,
          payload_version: extraction.payload_version,
          image_count: extraction.images.length,
          warnings: extraction.warnings,
        }
      : null,
    translation: translation
      ? {
          progress: translation.progress,
          timing: translation.timing,
          failure_codes: translation.failures.map((failure) => failure.code),
          image_region_counts: translation.results.map((result) => result.regions.length),
          image_warning_codes: translation.results.map((result) => result.warnings),
        }
      : null,
  };
}

function exportDiagnostics(): void {
  const blob = new Blob([JSON.stringify(sanitizedDiagnostics(), null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "penguin-translator-diagnostic.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function handle(action: () => Promise<void>): void {
  void action().catch((error: unknown) => {
    status.textContent = error instanceof Error ? error.message : "Harness action failed.";
  });
}

element("extract").addEventListener("click", () => handle(runExtractor));
element("translate").addEventListener("click", () => handle(translatePage));
element("render").addEventListener("click", () => handle(renderOverlays));
element("export").addEventListener("click", exportDiagnostics);
void loadFrame(fixture.value);
