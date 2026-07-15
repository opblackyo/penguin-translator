import json
from pathlib import Path

from penguin_translator_api.main import app

ROOT = Path(__file__).resolve().parents[3]


def test_checked_in_openapi_matches_fastapi() -> None:
    checked_in = json.loads((ROOT / "packages/contracts/openapi/openapi.json").read_text())

    assert checked_in == app.openapi()
