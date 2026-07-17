import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(root, "apps/shortcut-client");
const viteModule = pathToFileURL(resolve(client, "node_modules/vite/dist/node/index.js")).href;
const { build } = await import(viteModule);

await rm(resolve(client, "dist"), { recursive: true, force: true });

for (const mode of ["extractor", "renderer", "renderer-shortcut"]) {
  await build({
    configFile: resolve(client, "vite.config.ts"),
    mode,
  });
}
