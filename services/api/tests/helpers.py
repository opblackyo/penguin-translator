from __future__ import annotations

from penguin_translator_api.config import Settings


def make_settings(**overrides: object) -> Settings:
    settings = Settings(
        translation_provider="gemini",
        gemini_model="test-model",
        gemini_api_key="test-key",
        image_fetch_timeout_seconds=1,
        image_fetch_max_bytes=1024,
        image_fetch_max_redirects=2,
        image_max_pixels=1_000_000,
        dev_allowed_image_hosts=frozenset(),
        ocr_provider="paddleocr",
        paddleocr_language="korean",
        paddleocr_detection_model="PP-OCRv5_mobile_det",
        paddleocr_recognition_model="korean_PP-OCRv5_mobile_rec",
        ocr_min_confidence=0.5,
        ocr_cache_ttl_seconds=60,
        ocr_cache_max_entries=8,
    )
    return settings.model_copy(update=overrides)
