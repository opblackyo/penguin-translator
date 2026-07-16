from __future__ import annotations

import logging
from io import BytesIO

from PIL import Image

from penguin_translator_api.contracts.requests import TranslationImageRequest
from penguin_translator_api.services.image_fetcher import FetchedImage
from penguin_translator_api.services.ocr import OcrRegion
from penguin_translator_api.services.ocr_cache import OcrResultCache
from penguin_translator_api.services.pipeline import RealTranslationPipeline
from penguin_translator_api.services.translator import (
    TranslationInput,
    TranslationOutput,
    TranslatorResponseError,
)
from tests.helpers import make_settings


def png_bytes(width: int = 320, height: int = 240) -> bytes:
    output = BytesIO()
    Image.new("RGB", (width, height), "white").save(output, format="PNG")
    return output.getvalue()


def real_request() -> TranslationImageRequest:
    return TranslationImageRequest.model_validate(
        {
            "request_id": "123e4567-e89b-12d3-a456-426614174000",
            "page_url": "https://example.com/reader",
            "image": {
                "client_image_id": "penguin-image-real",
                "source_kind": "url",
                "source": "https://images.example.com/page.png",
                "rendered_width": 320,
                "rendered_height": 240,
            },
            "source_language": "auto",
            "target_language": "zh-Hant",
            "reading_order": "auto",
        }
    )


class FakeFetcher:
    def __init__(self, content: bytes) -> None:
        self.content = content

    async def fetch(self, source: str) -> FetchedImage:
        _ = source
        return FetchedImage(self.content, "image/png")


class FakeOCR:
    def __init__(self) -> None:
        self.calls = 0

    async def recognize(self, image_bytes: bytes, content_type: str) -> list[OcrRegion]:
        _ = image_bytes, content_type
        self.calls += 1
        return [
            OcrRegion(
                region_id="ko-1",
                polygon=((-5, -2), (330, 0), (330, 80), (0, 80)),
                source_text="안녕하세요",
                detected_language="ko",
                orientation="horizontal",
                detection_confidence=0.9,
                recognition_confidence=0.91,
            ),
            OcrRegion(
                region_id="low",
                polygon=((0, 100), (100, 100), (100, 140), (0, 140)),
                source_text="uncertain",
                detected_language="en",
                orientation="horizontal",
                detection_confidence=0.4,
                recognition_confidence=0.8,
            ),
        ]


class RecordingTranslator:
    def __init__(self) -> None:
        self.calls: list[list[TranslationInput]] = []

    async def translate(
        self, regions: list[TranslationInput], target_language: str
    ) -> list[TranslationOutput]:
        assert target_language == "zh-Hant"
        self.calls.append(regions)
        return [TranslationOutput(region.region_id, "你好") for region in regions]


class FailingTranslator:
    async def translate(
        self, regions: list[TranslationInput], target_language: str
    ) -> list[TranslationOutput]:
        _ = regions, target_language
        raise TranslatorResponseError("provider failed")


class EmptyOCR:
    async def recognize(self, image_bytes: bytes, content_type: str) -> list[OcrRegion]:
        _ = image_bytes, content_type
        return []


async def test_real_pipeline_batches_regions_bounds_polygons_and_caches_ocr(
    caplog: object,
) -> None:
    content = png_bytes()
    ocr = FakeOCR()
    translator = RecordingTranslator()
    pipeline = RealTranslationPipeline(
        settings=make_settings(),
        image_fetcher=FakeFetcher(content),  # type: ignore[arg-type]
        ocr_provider=ocr,
        translator=translator,
        cache=OcrResultCache(ttl_seconds=60, max_entries=8),
    )

    with caplog.at_level(logging.INFO):  # type: ignore[attr-defined]
        first = await pipeline.translate(real_request())
        second = await pipeline.translate(real_request())

    assert ocr.calls == 1
    assert len(translator.calls) == 2
    assert [item.region_id for item in translator.calls[0]] == ["ko-1"]
    assert first.regions[0].translated_text == "你好"
    assert first.regions[0].background_style == "opaque"
    assert first.regions[0].polygon == [(0, 0), (319, 0), (319, 80), (0, 80)]
    assert first.warnings == ["OCR_LOW_CONFIDENCE:low"]
    assert second.image_id == first.image_id
    assert "안녕하세요" not in caplog.text  # type: ignore[attr-defined]
    assert "images.example.com" not in caplog.text  # type: ignore[attr-defined]


async def test_translation_failure_returns_warning_without_source_as_translation() -> None:
    pipeline = RealTranslationPipeline(
        settings=make_settings(),
        image_fetcher=FakeFetcher(png_bytes()),  # type: ignore[arg-type]
        ocr_provider=FakeOCR(),
        translator=FailingTranslator(),
        cache=OcrResultCache(ttl_seconds=60, max_entries=8),
    )

    response = await pipeline.translate(real_request())

    assert response.regions == []
    assert "TRANSLATION_PROVIDER_FAILED:ko-1" in response.warnings


async def test_empty_image_returns_explicit_no_text_warning() -> None:
    pipeline = RealTranslationPipeline(
        settings=make_settings(),
        image_fetcher=FakeFetcher(png_bytes()),  # type: ignore[arg-type]
        ocr_provider=EmptyOCR(),
        translator=RecordingTranslator(),
        cache=OcrResultCache(ttl_seconds=60, max_entries=8),
    )

    response = await pipeline.translate(real_request())

    assert response.regions == []
    assert response.warnings == ["OCR_NO_TEXT"]
