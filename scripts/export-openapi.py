import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_SRC = ROOT / "services/api/src"
sys.path.insert(0, str(API_SRC))

from penguin_translator_api.main import app  # noqa: E402


def main() -> None:
    destination = ROOT / "packages/contracts/openapi/openapi.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
