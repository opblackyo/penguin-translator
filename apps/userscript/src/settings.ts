import type { PenguinGM } from "./gm";

export const SETTINGS_KEYS = {
  endpoint: "penguin.apiEndpoint",
  token: "penguin.localApiToken",
  targetLanguage: "penguin.targetLanguage",
} as const;

export interface UserscriptSettings {
  endpoint: string;
  token: string;
  targetLanguage: "zh-Hant";
}

export function normalizeApiEndpoint(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("API_ENDPOINT_PROTOCOL_INVALID");
  }
  if (parsed.username || parsed.password) throw new Error("API_ENDPOINT_CREDENTIALS_INVALID");
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  const path = parsed.pathname.replace(/\/$/, "");
  parsed.pathname = path.endsWith("/v1/translate-page") ? path : `${path}/v1/translate-page`;
  return parsed.toString();
}

export async function loadSettings(gm: PenguinGM): Promise<UserscriptSettings> {
  const [endpoint, token, targetLanguage] = await Promise.all([
    gm.getValue(SETTINGS_KEYS.endpoint, ""),
    gm.getValue(SETTINGS_KEYS.token, ""),
    gm.getValue(SETTINGS_KEYS.targetLanguage, "zh-Hant"),
  ]);
  return {
    endpoint: typeof endpoint === "string" ? endpoint : "",
    token: typeof token === "string" ? token : "",
    targetLanguage: targetLanguage === "zh-Hant" ? "zh-Hant" : "zh-Hant",
  };
}

export async function saveSettings(
  gm: PenguinGM,
  value: UserscriptSettings,
): Promise<UserscriptSettings> {
  const normalized = {
    endpoint: normalizeApiEndpoint(value.endpoint),
    token: value.token.trim(),
    targetLanguage: "zh-Hant" as const,
  };
  if (!normalized.token) throw new Error("LOCAL_API_TOKEN_REQUIRED");
  await Promise.all([
    gm.setValue(SETTINGS_KEYS.endpoint, normalized.endpoint),
    gm.setValue(SETTINGS_KEYS.token, normalized.token),
    gm.setValue(SETTINGS_KEYS.targetLanguage, normalized.targetLanguage),
  ]);
  return normalized;
}

export async function deleteSettings(gm: PenguinGM): Promise<void> {
  await Promise.all(Object.values(SETTINGS_KEYS).map((key) => gm.deleteValue(key)));
}
