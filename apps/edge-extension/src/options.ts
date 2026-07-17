/// <reference path="./chrome.d.ts" />

import { STORAGE_KEYS } from "./config";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing options element: ${id}`);
  return found as T;
}

const form = element<HTMLFormElement>("options-form");
const endpointInput = element<HTMLInputElement>("api-endpoint");
const tokenInput = element<HTMLInputElement>("local-token");
const targetInput = element<HTMLSelectElement>("target-language");
const status = element<HTMLOutputElement>("status");

void chrome.storage.local.get([...STORAGE_KEYS]).then((stored) => {
  endpointInput.value = typeof stored.apiEndpoint === "string" ? stored.apiEndpoint : "";
  tokenInput.value = typeof stored.localApiToken === "string" ? stored.localApiToken : "";
  targetInput.value = stored.targetLanguage === "zh-Hant" ? "zh-Hant" : "zh-Hant";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    status.textContent = "";
    const endpoint = new URL(endpointInput.value.trim());
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      throw new Error("API Endpoint must use HTTP or HTTPS.");
    }
    const token = tokenInput.value.trim();
    if (!token) throw new Error("Local API Token is required.");
    const granted = await chrome.permissions.request({ origins: [`${endpoint.origin}/*`] });
    if (!granted) throw new Error("API origin permission was not granted.");
    await chrome.storage.local.set({
      apiEndpoint: endpointInput.value.trim(),
      localApiToken: token,
      targetLanguage: "zh-Hant",
    });
    status.textContent = "Saved locally.";
  })().catch((error: unknown) => {
    status.textContent = error instanceof Error ? error.message : "Options could not be saved.";
  });
});
