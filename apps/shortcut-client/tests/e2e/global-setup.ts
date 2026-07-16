import { type ChildProcess, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

const TEST_PAGE_URL = "http://127.0.0.1:4173/test-page/";
const HEALTH_URL = "http://127.0.0.1:8000/healthz";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForHealth(api: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) {
      throw new Error(`M0 API exited during startup with code ${api.exitCode}.`);
    }
    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // The socket is expected to reject until Uvicorn has bound the port.
    }
    await delay(100);
  }
  throw new Error(`M0 API did not become healthy at ${HEALTH_URL}.`);
}

async function stopApi(api: ChildProcess): Promise<void> {
  if (api.exitCode !== null || api.signalCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolveExit) => {
    api.once("exit", () => resolveExit());
  });
  api.kill("SIGTERM");
  await Promise.race([exited, delay(15_000)]);
  if (api.exitCode === null && api.signalCode === null) {
    api.kill("SIGKILL");
    await Promise.race([exited, delay(1_000)]);
  }
  if (api.exitCode === null && api.signalCode === null) {
    throw new Error(`M0 API process ${api.pid ?? "unknown"} survived forced teardown.`);
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const clientDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const apiDirectory = resolve(clientDirectory, "../../services/api");
  const apiPython = resolve(
    apiDirectory,
    process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python",
  );
  const api = spawn(
    apiPython,
    ["-m", "uvicorn", "penguin_translator_api.main:app", "--host", "127.0.0.1", "--port", "8000"],
    {
      cwd: apiDirectory,
      env: { ...process.env, PENGUIN_TRANSLATOR_LOCAL_API_TOKEN: "playwright-local-token" },
      stdio: "ignore",
      windowsHide: true,
    },
  );

  let vite: ViteDevServer | undefined;
  try {
    vite = await createServer({
      root: clientDirectory,
      configFile: false,
      logLevel: "error",
      server: { host: "127.0.0.1", port: 4173, strictPort: true },
    });
    await vite.listen();
    await waitForHealth(api);
    const testPage = await fetch(TEST_PAGE_URL);
    if (!testPage.ok) {
      throw new Error(`M0 test page returned ${testPage.status}.`);
    }
  } catch (error) {
    await vite?.close();
    await stopApi(api);
    throw error;
  }

  return async () => {
    await vite.close();
    await stopApi(api);
  };
}
