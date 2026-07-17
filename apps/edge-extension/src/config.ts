export const STORAGE_KEYS = ["apiEndpoint", "localApiToken", "targetLanguage"] as const;

export function translationApiUrl(endpoint: string): string {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("API endpoint must use HTTP or HTTPS.");
  }
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.search = "";
  const path = parsed.pathname.replace(/\/$/, "");
  parsed.pathname = path.endsWith("/v1/translate-page") ? path : `${path}/v1/translate-page`;
  return parsed.toString();
}
