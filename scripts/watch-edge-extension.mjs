import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(root, "apps/shortcut-client");
const extension = resolve(root, "apps/edge-extension");
const output = resolve(extension, "dist");
const viteModule = pathToFileURL(resolve(client, "node_modules/vite/dist/node/index.js")).href;
const { build } = await import(viteModule);

await mkdir(output, { recursive: true });
await copyFile(resolve(extension, "manifest.json"), resolve(output, "manifest.json"));
await copyFile(resolve(extension, "options.html"), resolve(output, "options.html"));

for (const [name, format] of [
  ["background", "es"],
  ["content", "iife"],
  ["options", "iife"],
]) {
  await build({
    configFile: false,
    build: {
      target: "es2022",
      outDir: output,
      emptyOutDir: false,
      minify: false,
      sourcemap: true,
      watch: {},
      lib: {
        entry: resolve(extension, `src/${name}.ts`),
        name: `PenguinTranslatorEdge${name}`,
        formats: [format],
        fileName: () => `${name}.js`,
      },
    },
  });
}

process.stdout.write(
  "Edge extension watch is active. Reload the unpacked extension after changes.\n",
);
