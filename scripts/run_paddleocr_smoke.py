from __future__ import annotations

import asyncio
import importlib.metadata
import json
import os
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "apps/shortcut-client/m1-test-page/assets"
os.environ.setdefault(
    "PADDLE_PDX_CACHE_HOME", str(ROOT / "services/api/.cache/paddlex")
)
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

from penguin_translator_api.services.paddle_ocr import PaddleOCRProvider  # noqa: E402
from penguin_translator_api.services.ocr import OcrRegion  # noqa: E402


async def main() -> None:
    init_started = time.perf_counter()
    provider = PaddleOCRProvider(
        language="korean",
        detection_model="PP-OCRv5_mobile_det",
        recognition_model="korean_PP-OCRv5_mobile_rec",
    )
    init_seconds = time.perf_counter() - init_started
    summaries: list[dict[str, object]] = []
    all_regions: dict[str, list[OcrRegion]] = {}
    for name in (
        "korean-dialogue.png",
        "english-dialogue.png",
        "mixed-dialogue.png",
        "empty-page.png",
    ):
        path = FIXTURES / name
        started = time.perf_counter()
        regions = await provider.recognize(path.read_bytes(), "image/png")
        elapsed = time.perf_counter() - started
        all_regions[name] = regions
        summaries.append(
            {
                "fixture": name,
                "seconds": round(elapsed, 3),
                "region_count": len(regions),
                "languages": sorted({region.detected_language for region in regions}),
                "minimum_recognition_confidence": round(
                    min(
                        (region.recognition_confidence for region in regions),
                        default=1.0,
                    ),
                    3,
                ),
            }
        )

    korean = all_regions["korean-dialogue.png"]
    english = all_regions["english-dialogue.png"]
    mixed = all_regions["mixed-dialogue.png"]
    empty = all_regions["empty-page.png"]
    if not korean or not any(region.detected_language == "ko" for region in korean):
        raise SystemExit("Korean fixture produced no Korean OCR region")
    if not english or not any(region.detected_language == "en" for region in english):
        raise SystemExit("English fixture produced no English OCR region")
    if not mixed or not any(region.detected_language == "mixed" for region in mixed):
        raise SystemExit("Mixed fixture produced no mixed-language OCR region")
    if empty:
        raise SystemExit("Empty fixture unexpectedly produced OCR regions")
    for path_name, regions in all_regions.items():
        for region in regions:
            if any(not (0 <= x < 900 and 0 <= y < 1200) for x, y in region.polygon):
                raise SystemExit(f"OCR polygon escaped fixture bounds: {path_name}")

    print(
        json.dumps(
            {
                "status": "PASS",
                "paddleocr_version": importlib.metadata.version("paddleocr"),
                "paddlepaddle_version": importlib.metadata.version("paddlepaddle"),
                "detection_model": "PP-OCRv5_mobile_det",
                "recognition_model": "korean_PP-OCRv5_mobile_rec",
                "init_seconds": round(init_seconds, 3),
                "fixtures": summaries,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
