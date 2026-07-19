import { spawn } from "node:child_process";
import process from "node:process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runOnce(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpm, [script], { stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code ?? "unknown"}`));
    });
  });
}

await runOnce("build");
await runOnce("extension:build");

const scripts = ["backend:dev:lan", "test-page:lan", "extension:watch"];
scripts.push("userscript:watch");
const children = scripts.map((script, index) =>
  spawn(pnpm, [script], {
    stdio: "inherit",
    windowsHide: true,
    env:
      index === 0
        ? {
            ...process.env,
            PENGUIN_TRANSLATOR_DEV_CORS_ORIGINS: "http://127.0.0.1:4173,http://localhost:4173",
          }
        : process.env,
  }),
);

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  process.exitCode = exitCode;
}

for (const [index, child] of children.entries()) {
  child.once("error", (error) => {
    process.stderr.write(`${scripts[index]} failed to start: ${String(error)}\n`);
    stop(1);
  });
  child.once("exit", (code) => {
    if (!stopping) {
      process.stderr.write(`${scripts[index]} stopped with code ${code ?? "unknown"}.\n`);
      stop(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.stdout.write(
  "Developer harness: http://127.0.0.1:4173/dev-harness/ (fixture server is the same Vite process)\n",
);
