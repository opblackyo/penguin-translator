from __future__ import annotations

import logging
from io import BytesIO

import pytest
from PIL import Image, ImageDraw

from penguin_translator_api.contracts.requests import TranslationImageRequest
from penguin_translator_api.services.image_fetcher import FetchedImage
from penguin_translator_api.services.ocr import OcrRegion
from penguin_translator_api.services.ocr_cache import OcrResultCache
from penguin_translator_api.services.pipeline import RealTranslationPipeline, merge_ocr_regions
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


def white_bubble_with_dark_text_bytes(width: int = 320, height: int = 240) -> bytes:
    output = BytesIO()
    image = Image.new("RGB", (width, height), "white")
    ImageDraw.Draw(image).rectangle((40, 20, 110, 35), fill="black")
    image.save(output, format="PNG")
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


class TwoRegionOCR:
    async def recognize(self, image_bytes: bytes, content_type: str) -> list[OcrRegion]:
        _ = image_bytes, content_type
        return [
            OcrRegion(
                region_id="first",
                polygon=((0, 0), (100, 0), (100, 20), (0, 20)),
                source_text="첫째",
                detected_language="ko",
                orientation="horizontal",
                detection_confidence=0.95,
                recognition_confidence=0.95,
            ),
            OcrRegion(
                region_id="second",
                polygon=((0, 80), (100, 80), (100, 100), (0, 100)),
                source_text="둘째",
                detected_language="ko",
                orientation="horizontal",
                detection_confidence=0.95,
                recognition_confidence=0.95,
            ),
        ]


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
    assert [item.region_id for item in translator.calls[0]] == ["i0:r0"]
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


async def test_white_bubble_with_dark_text_uses_opaque_background() -> None:
    pipeline = RealTranslationPipeline(
        settings=make_settings(),
        image_fetcher=FakeFetcher(white_bubble_with_dark_text_bytes()),  # type: ignore[arg-type]
        ocr_provider=FakeOCR(),
        translator=RecordingTranslator(),
        cache=OcrResultCache(ttl_seconds=60, max_entries=8),
    )

    response = await pipeline.translate(real_request())

    assert response.regions[0].background_style == "opaque"


async def test_cross_image_translation_uses_explicit_region_chunks() -> None:
    translator = RecordingTranslator()
    pipeline = RealTranslationPipeline(
        settings=make_settings(gemini_batch_max_regions=3, gemini_batch_max_characters=10_000),
        image_fetcher=FakeFetcher(png_bytes()),  # type: ignore[arg-type]
        ocr_provider=TwoRegionOCR(),
        translator=translator,
        cache=OcrResultCache(ttl_seconds=60, max_entries=8),
    )
    prepared = [await pipeline.prepare(real_request()), await pipeline.prepare(real_request())]

    responses, _, calls = await pipeline.translate_prepared_batch(prepared)

    assert calls == 2
    assert [len(chunk) for chunk in translator.calls] == [3, 1]
    assert [item.region_id for item in translator.calls[0]] == ["i0:r0", "i0:r1", "i1:r0"]
    assert [len(response.regions) for response in responses] == [2, 2]


def ocr_region(
    region_id: str,
    polygon: tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]],
    text: str,
    *,
    language: str = "ko",
    orientation: str = "horizontal",
) -> OcrRegion:
    return OcrRegion(
        region_id=region_id,
        polygon=polygon,
        source_text=text,
        detected_language=language,
        orientation=orientation,  # type: ignore[arg-type]
        detection_confidence=0.95,
        recognition_confidence=0.96,
    )


@pytest.mark.parametrize(
    ("language", "first_text", "second_text"),
    [("ko", "안녕", "하세요"), ("en", "How are", "you?"), ("mixed", "OK", "좋아")],
)
def test_merges_close_multiline_dialogue(language: str, first_text: str, second_text: str) -> None:
    merged = merge_ocr_regions(
        [
            ocr_region(
                "one",
                ((10, 10), (110, 10), (110, 30), (10, 30)),
                first_text,
                language=language,
            ),
            ocr_region(
                "two",
                ((12, 34), (108, 34), (108, 54), (12, 54)),
                second_text,
                language=language,
            ),
        ]
    )

    assert len(merged) == 1
    assert merged[0].source_text == f"{first_text}\n{second_text}"
    assert merged[0].polygon == ((10, 10), (110, 10), (110, 54), (10, 54))


def test_does_not_merge_different_lines_languages_or_vertical_regions() -> None:
    regions = [
        ocr_region("line-one", ((10, 10), (60, 10), (60, 30), (10, 30)), "첫째"),
        ocr_region("line-two", ((150, 32), (210, 32), (210, 52), (150, 52)), "둘째"),
        ocr_region("japanese", ((64, 10), (110, 10), (110, 30), (64, 30)), "別", language="ja"),
        ocr_region(
            "vertical",
            ((120, 10), (140, 10), (140, 60), (120, 60)),
            "세로",
            orientation="vertical",
        ),
    ]

    assert {region.region_id for region in merge_ocr_regions(regions)} == {
        "line-one",
        "line-two",
        "japanese",
        "vertical",
    }
