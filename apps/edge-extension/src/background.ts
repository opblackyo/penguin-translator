/// <reference path="./chrome.d.ts" />

import type { components } from "@penguin-translator/contracts";
import { STORAGE_KEYS, translationApiUrl } from "./config";

type TranslationPageRequest = components["schemas"]["TranslationPageRequest"];
type TranslationPageResponse = components["schemas"]["TranslationPageResponse"];

async function translatePage(request: TranslationPageRequest): Promise<TranslationPageResponse> {
  const stored = await chrome.storage.local.get([...STORAGE_KEYS]);
  const endpoint = typeof stored.apiEndpoint === "string" ? stored.apiEndpoint : "";
  const token = typeof stored.localApiToken === "string" ? stored.localApiToken : "";
  const targetLanguage: TranslationPageRequest["target_language"] = "zh-Hant";
  if (!endpoint || !token) throw new Error("EDGE_OPTIONS_REQUIRED");
  const response = await fetch(translationApiUrl(endpoint), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, target_language: targetLanguage }),
  });
  if (!response.ok) throw new Error(`PAGE_API_${response.status}`);
  return (await response.json()) as TranslationPageResponse;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "penguin:translate-page" ||
    !("request" in message)
  ) {
    return false;
  }
  void translatePage(message.request as TranslationPageRequest).then(
    (response) => sendResponse({ ok: true, response }),
    (error: unknown) =>
      sendResponse({
        ok: false,
        code: error instanceof Error ? error.message : "EDGE_TRANSLATION_FAILED",
      }),
  );
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== "number") return;
  void chrome.scripting
    .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
    .then(() => chrome.tabs.sendMessage(tab.id as number, { type: "penguin:run" }));
});
