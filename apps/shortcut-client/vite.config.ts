import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

const configDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const entry = mode === "extractor" ? "extractor" : mode === "renderer" ? "renderer" : null;

  return {
    plugins: [preact()],
    test: {
      environment: "jsdom",
      include: ["tests/**/*.test.{ts,tsx}"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json-summary"],
      },
    },
    ...(entry === null
      ? {}
      : {
          build: {
            target: "es2020",
            outDir: "dist",
            emptyOutDir: false,
            sourcemap: true,
            minify: false,
            cssCodeSplit: false,
            lib: {
              entry: resolve(
                configDirectory,
                `src/${entry}/entry.ts${entry === "renderer" ? "x" : ""}`,
              ),
              name:
                entry === "extractor" ? "PenguinTranslatorExtractor" : "PenguinTranslatorRenderer",
              formats: ["iife" as const],
              fileName: () => `${entry}.iife.js`,
            },
          },
        }),
  };
});
