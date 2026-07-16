from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr

from penguin_translator_api.config import Settings


def make_settings(**overrides: object) -> Settings:
    settings = Settings(
        translation_provider="gemini",
        gemini_model="test-model",
        gemini_api_key="test-key",
        local_api_token=SecretStr("test-local-token"),
        image_fetch_timeout_seconds=1,
        image_fetch_max_bytes=1024,
        image_fetch_max_redirects=2,
        image_max_pixels=1_000_000,
        dev_allowed_image_targets=frozenset(),
        ocr_provider="paddleocr",
        paddleocr_language="korean",
        paddleocr_detection_model="PP-OCRv5_mobile_det",
        paddleocr_recognition_model="korean_PP-OCRv5_mobile_rec",
        paddle_pdx_cache_home=Path("services/api/.cache/paddlex"),
        ocr_min_confidence=0.5,
        ocr_cache_ttl_seconds=60,
        ocr_cache_max_entries=8,
        max_concurrent_translations=2,
    )
    return settings.model_copy(update=overrides)
