from __future__ import annotations

import json
import os
from uuid import uuid4

import httpx


def main() -> None:
    api_url = os.getenv(
        "PENGUIN_TRANSLATOR_M1_API_URL", "http://127.0.0.1:8000/v1/translate-image"
    )
    fixture_url = os.getenv("PENGUIN_TRANSLATOR_M1_FIXTURE_URL")
    if not fixture_url:
        raise SystemExit("PENGUIN_TRANSLATOR_M1_FIXTURE_URL is not set")
    body = {
        "request_id": str(uuid4()),
        "page_url": fixture_url,
        "image": {
            "client_image_id": "m1-live-korean",
            "source_kind": "url",
            "source": fixture_url,
            "rendered_width": 900,
            "rendered_height": 1200,
        },
        "source_language": "auto",
        "target_language": "zh-Hant",
        "reading_order": "auto",
    }
    response = httpx.post(
        api_url,
        headers={"Authorization": "Bearer m1-local-smoke"},
        json=body,
        timeout=300,
    )
    response.raise_for_status()
    payload = response.json()
    regions = payload.get("regions", [])
    if not regions or any(not region.get("translated_text") for region in regions):
        raise SystemExit("M1 live response contained no translated regions")
    print(
        json.dumps(
            {
                "status": "PASS",
                "region_count": len(regions),
                "warnings": payload.get("warnings", []),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
