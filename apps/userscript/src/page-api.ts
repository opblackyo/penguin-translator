import type { components } from "@penguin-translator/contracts";
import type { PenguinGM } from "./gm";
import type { UserscriptSettings } from "./settings";

export type TranslationPageRequest = components["schemas"]["TranslationPageRequest"];
export type TranslationPageResponse = components["schemas"]["TranslationPageResponse"];

function safeApiError(status: number): Error {
  if (status === 401) return new Error("LOCAL_API_TOKEN_INVALID");
  if (status === 413) return new Error("PAGE_BATCH_TOO_LARGE");
  if (status === 422) return new Error("PAGE_REQUEST_INVALID");
  if (status === 503) return new Error("TRANSLATION_NOT_CONFIGURED");
  return new Error(`PAGE_API_${status}`);
}

function isPageResponse(value: unknown): value is TranslationPageResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.results) &&
    Array.isArray(record.failures) &&
    typeof record.progress === "object" &&
    record.progress !== null &&
    typeof record.timing === "object" &&
    record.timing !== null
  );
}

export async function translatePage(
  gm: PenguinGM,
  settings: UserscriptSettings,
  request: TranslationPageRequest,
): Promise<TranslationPageResponse> {
  const response = await gm.xmlHttpRequest({
    url: settings.endpoint,
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.token}`,
      "Content-Type": "application/json",
    },
    data: JSON.stringify(request),
    responseType: "text",
    timeout: 300_000,
  });
  if (response.status < 200 || response.status >= 300) throw safeApiError(response.status);
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.responseText);
  } catch {
    throw new Error("PAGE_API_RESPONSE_INVALID");
  }
  if (!isPageResponse(parsed)) throw new Error("PAGE_API_RESPONSE_INVALID");
  return parsed;
}
