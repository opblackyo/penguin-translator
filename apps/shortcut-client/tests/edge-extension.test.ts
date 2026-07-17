import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { translationApiUrl } from "../../edge-extension/src/config";

const extensionRoot = resolve(import.meta.dirname, "../../edge-extension");

describe("Edge private development extension", () => {
  it("uses minimum core permissions and optional API origins", async () => {
    const manifest = JSON.parse(await readFile(resolve(extensionRoot, "manifest.json"), "utf8"));

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
    expect(manifest.optional_host_permissions).toEqual(["http://*/*", "https://*/*"]);
    expect(manifest).not.toHaveProperty("content_scripts");
    expect(manifest.content_security_policy.extension_pages).toBe(
      "script-src 'self'; object-src 'self'",
    );
  });

  it("imports the shared extractor and renderer rather than copying them", async () => {
    const content = await readFile(resolve(extensionRoot, "src/content.ts"), "utf8");

    expect(content).toContain('shortcut-client/src/extractor/collect-images"');
    expect(content).toContain('shortcut-client/src/renderer/runtime"');
    expect(content).not.toContain("GEMINI_API_KEY");
  });

  it("keeps endpoint and token out of extension source defaults", async () => {
    const files = await Promise.all(
      ["src/background.ts", "src/content.ts", "src/options.ts", "options.html"].map((path) =>
        readFile(resolve(extensionRoot, path), "utf8"),
      ),
    );
    const combined = files.join("\n");

    expect(combined).not.toMatch(/Bearer [A-Za-z0-9_-]+/);
    expect(combined).not.toMatch(/https?:\/\/(?:127\.0\.0\.1|localhost|192\.168\.)/);
    expect(combined).not.toContain("AIza");
  });

  it("normalizes a user-provided API origin to the shared page route", () => {
    expect(translationApiUrl("http://localhost:8000")).toBe(
      "http://localhost:8000/v1/translate-page",
    );
    expect(() => translationApiUrl("file:///tmp/api")).toThrow("HTTP or HTTPS");
  });
});
