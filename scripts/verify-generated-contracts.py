import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_SRC = ROOT / "services/api/src"
sys.path.insert(0, str(API_SRC))

from penguin_translator_api.main import app  # noqa: E402


def main() -> None:
    openapi_path = ROOT / "packages/contracts/openapi/openapi.json"
    generated_path = ROOT / "packages/contracts/src/generated.ts"
    checked_openapi = json.loads(openapi_path.read_text(encoding="utf-8"))
    if checked_openapi != app.openapi():
        raise SystemExit("OpenAPI JSON is stale. Run `pnpm contracts:export`.")

    with tempfile.TemporaryDirectory() as temporary_directory:
        candidate = Path(temporary_directory) / "generated.ts"
        node = shutil.which("node")
        if node is None:
            raise SystemExit("Node.js is required to verify generated TypeScript.")
        generator = (
            ROOT / "packages/contracts/node_modules/openapi-typescript/bin/cli.js"
        )
        subprocess.run(
            [
                node,
                str(generator),
                str(openapi_path),
                "--output",
                str(candidate),
            ],
            cwd=ROOT,
            check=True,
        )
        if candidate.read_text(encoding="utf-8") != generated_path.read_text(
            encoding="utf-8"
        ):
            raise SystemExit(
                "Generated TypeScript is stale. Run `pnpm contracts:generate`."
            )


if __name__ == "__main__":
    main()
