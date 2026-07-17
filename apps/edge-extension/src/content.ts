/// <reference path="./chrome.d.ts" />

import type { components } from "@penguin-translator/contracts";
import { collectPageImagesWithDiagnostics } from "../../shortcut-client/src/extractor/collect-images";
import { mount } from "../../shortcut-client/src/renderer/runtime";
import { createRequestId } from "../../shortcut-client/src/shared/request-id";

type TranslationPageRequest = components["schemas"]["TranslationPageRequest"];
type TranslationPageResponse = components["schemas"]["TranslationPageResponse"];

const LISTENER_KEY = "__penguinTranslatorEdgeListenerInstalled";

async function runTranslation(): Promise<void> {
  const extraction = await collectPageImagesWithDiagnostics();
  const request: TranslationPageRequest = {
    request_id: createRequestId(),
    page_url: window.location.href,
    images: extraction.images,
    source_language: "auto",
    target_language: "zh-Hant",
    reading_order: "auto",
  };
  mount([], {
    progress: { total: request.images.length, completed: 0, successful: 0, failed: 0 },
  });
  const message = (await chrome.runtime.sendMessage({
    type: "penguin:translate-page",
    request,
  })) as { ok?: boolean; response?: TranslationPageResponse; code?: string };
  if (!message.ok || !message.response) throw new Error(message.code ?? "EDGE_TRANSLATION_FAILED");
  const response = message.response;
  mount(response.results, {
    progress: response.progress,
    failures: response.failures.map((failure) => failure.client_image_id),
    timingLabel: `${Math.round(response.timing.total_ms)} ms · Gemini ${response.timing.gemini_calls}`,
  });
}

if (!Reflect.get(globalThis, LISTENER_KEY)) {
  Reflect.set(globalThis, LISTENER_KEY, true);
  chrome.runtime.onMessage.addListener((message) => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== "penguin:run"
    ) {
      return false;
    }
    void runTranslation().catch((error: unknown) => {
      const code = error instanceof Error ? error.message : "EDGE_TRANSLATION_FAILED";
      window.alert(`Penguin Translator: ${code}`);
    });
    return false;
  });
}
