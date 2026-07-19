import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { userscriptBuildOptions } from "./userscript-build-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(root, "apps/shortcut-client");
const userscript = resolve(root, "apps/userscript");
const output = resolve(userscript, "dist");
const viteModule = pathToFileURL(resolve(client, "node_modules/vite/dist/node/index.js")).href;
const { build } = await import(viteModule);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build(
  userscriptBuildOptions({
    entry: resolve(userscript, "src/entry.ts"),
    output,
  }),
);
