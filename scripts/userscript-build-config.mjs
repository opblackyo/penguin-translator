export const USERSCRIPT_OUTPUT_NAME = "penguin-translator.user.js";

export const USERSCRIPT_METADATA = `// ==UserScript==
// @name         Penguin Translator
// @namespace    https://github.com/opblackyo/penguin-translator
// @version      0.3.0
// @description  Private iOS Safari shell for the owner's Penguin Translator API.
// @match        http://*/test-page/*
// @match        http://*/m1-test-page/*
// @match        http://*/m2-test-page/*
// @match        https://omegascans.org/*
// @run-at       document-idle
// @inject-into  content
// @noframes
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.xmlHttpRequest
// @grant        GM.addStyle
// ==/UserScript==`;

export function userscriptBuildOptions({ entry, output, watch = false }) {
  return {
    configFile: false,
    build: {
      target: "es2022",
      outDir: output,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      watch: watch ? {} : undefined,
      lib: {
        entry,
        name: "PenguinTranslatorUserscript",
        formats: ["iife"],
        fileName: () => USERSCRIPT_OUTPUT_NAME,
      },
      rollupOptions: {
        output: { banner: USERSCRIPT_METADATA },
      },
    },
  };
}
