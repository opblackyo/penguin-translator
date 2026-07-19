import { describe, expect, test } from "vitest";
import {
  deleteSettings,
  loadSettings,
  normalizeApiEndpoint,
  SETTINGS_KEYS,
  saveSettings,
} from "../src/settings";
import { createGM } from "./helpers";

describe("userscript settings", () => {
  test("normalizes the page endpoint without credentials, query, or fragments", () => {
    expect(normalizeApiEndpoint("http://localhost:8000/")).toBe(
      "http://localhost:8000/v1/translate-page",
    );
    expect(normalizeApiEndpoint("https://api.example.test/root?secret=no#fragment")).toBe(
      "https://api.example.test/root/v1/translate-page",
    );
    expect(() => normalizeApiEndpoint("ftp://api.example.test")).toThrow(
      "API_ENDPOINT_PROTOCOL_INVALID",
    );
    expect(() => normalizeApiEndpoint("https://user:password@api.example.test")).toThrow(
      "API_ENDPOINT_CREDENTIALS_INVALID",
    );
  });

  test("stores, updates, loads, and deletes only the three local values", async () => {
    const gm = createGM();
    await saveSettings(gm, {
      endpoint: "http://localhost:8000",
      token: "first-local-value",
      targetLanguage: "zh-Hant",
    });
    await saveSettings(gm, {
      endpoint: "https://api.example.test",
      token: "updated-local-value",
      targetLanguage: "zh-Hant",
    });
    expect(await loadSettings(gm)).toEqual({
      endpoint: "https://api.example.test/v1/translate-page",
      token: "updated-local-value",
      targetLanguage: "zh-Hant",
    });
    expect([...gm.storage.keys()].sort()).toEqual(Object.values(SETTINGS_KEYS).sort());
    await deleteSettings(gm);
    expect(gm.storage.size).toBe(0);
  });
});
