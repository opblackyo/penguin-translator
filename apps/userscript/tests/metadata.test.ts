import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const outputName = "penguin-translator.user.js";

describe("production userscript", () => {
  test("is one installable .user.js file with conservative valid metadata", async () => {
    const files = await readdir(resolve(root, "dist"));
    expect(files).toEqual([outputName]);
    const bundle = await readFile(resolve(root, "dist", outputName), "utf8");
    expect(bundle.startsWith("// ==UserScript==")).toBe(true);
    expect(bundle).toContain("// @name         Penguin Translator");
    expect(bundle).toMatch(/\/\/ @version\s+\d+\.\d+\.\d+/);
    expect(bundle).toContain("// @run-at       document-idle");
    expect(bundle).toContain("// @inject-into  content");
    expect(bundle).toContain("// @noframes");
    expect(bundle).toContain("// @match        http://*/m2-test-page/*");
    expect(bundle).toContain("// @match        https://omegascans.org/*");
    expect(bundle).not.toContain("// @match        https://*.omegascans.org/*");
    expect(bundle).not.toContain("// @match        *://*/*");
    expect(bundle).not.toContain("// @require");
    for (const grant of [
      "GM.getValue",
      "GM.setValue",
      "GM.deleteValue",
      "GM.xmlHttpRequest",
      "GM.addStyle",
    ]) {
      expect(bundle).toContain(`// @grant        ${grant}`);
    }
  });

  test("contains shared implementation but no credential or fixed private LAN address", async () => {
    const bundle = await readFile(resolve(root, "dist", outputName), "utf8");
    const source = await readFile(resolve(root, "src/shell.ts"), "utf8");
    expect(source).toContain("../../shortcut-client/src/extractor/collect-images");
    expect(source).toContain("../../shortcut-client/src/renderer/runtime");
    expect(bundle).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(bundle).not.toMatch(/(?:192\.168|10\.|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}/);
    expect(bundle).not.toContain("playwright-local-token");
    expect(bundle).not.toContain("test-local-token");
  });
});
