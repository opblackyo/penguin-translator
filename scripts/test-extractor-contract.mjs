import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(root, "apps/shortcut-client");
const viteModule = pathToFileURL(resolve(client, "node_modules/vite/dist/node/index.js")).href;
const jsdomModule = pathToFileURL(resolve(client, "node_modules/jsdom/lib/api.js")).href;
const cacheDirectory = await mkdtemp(resolve(tmpdir(), "penguin-extractor-contract-"));

let dom;
try {
  const [{ build }, { JSDOM }] = await Promise.all([import(viteModule), import(jsdomModule)]);
  const buildResult = await build({
    configFile: false,
    logLevel: "silent",
    cacheDir: cacheDirectory,
    build: {
      write: false,
      target: "node24",
      minify: false,
      sourcemap: false,
      lib: {
        entry: resolve(client, "src/extractor/collect-images.ts"),
        formats: ["es"],
        fileName: "extractor-contract",
      },
    },
  });
  const outputs = Array.isArray(buildResult) ? buildResult : [buildResult];
  const chunk = outputs
    .flatMap((output) => output.output)
    .find((output) => output.type === "chunk");
  if (chunk?.type !== "chunk") {
    throw new Error("Vite did not return an in-memory extractor chunk.");
  }

  dom = new JSDOM('<img id="page" src="https://example.com/page.jpg" width="400" height="600">', {
    url: "https://example.com/reader",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  });

  const image = dom.window.document.querySelector("#page");
  if (!(image instanceof dom.window.HTMLImageElement)) {
    throw new Error("Contract test image was not created.");
  }
  Object.defineProperties(image, {
    currentSrc: { value: "https://example.com/page.jpg" },
    naturalWidth: { value: 800 },
    naturalHeight: { value: 1200 },
  });
  image.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 399.5,
    bottom: 600.25,
    width: 399.5,
    height: 600.25,
    toJSON: () => ({}),
  });

  const encodedChunk = Buffer.from(chunk.code).toString("base64");
  const extractorModule = await import(`data:text/javascript;base64,${encodedChunk}`);
  const images = extractorModule.collectVisibleImages();
  if (!Array.isArray(images) || images.length !== 1) {
    throw new Error(`Expected one actual extractor item, received ${images.length}.`);
  }

  const serializedItem = JSON.stringify(images[0]);
  const python = spawnSync(
    "uv",
    [
      "--cache-dir",
      ".uv-cache",
      "run",
      "--project",
      "services/api",
      "python",
      "scripts/validate-extractor-contract.py",
    ],
    {
      cwd: root,
      input: serializedItem,
      encoding: "utf8",
    },
  );
  if (python.status !== 0) {
    process.stderr.write(python.stderr);
    throw new Error(`Python contract validation exited with ${python.status ?? "no status"}.`);
  }

  const validation = JSON.parse(python.stdout);
  process.stdout.write(`${JSON.stringify({ extractor_item: images[0], validation }, null, 2)}\n`);
} finally {
  dom?.window.close();
  await rm(cacheDirectory, { recursive: true, force: true });
}
