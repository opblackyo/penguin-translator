from __future__ import annotations

import hashlib
import logging
import time
from io import BytesIO
from typing import Literal, cast

from PIL import Image, UnidentifiedImageError

from penguin_translator_api.config import Settings
from penguin_translator_api.contracts.requests import TranslationImageRequest
from penguin_translator_api.contracts.responses import TranslationImageResponse, TranslationRegion
from penguin_translator_api.services.image_fetcher import ImageFetcher
from penguin_translator_api.services.ocr import OCRProvider, OcrRegion
from penguin_translator_api.services.ocr_cache import OcrResultCache
from penguin_translator_api.services.translator import (
    TranslationInput,
    Translator,
    TranslatorResponseError,
)

logger = logging.getLogger(__name__)


class InvalidImageContentError(RuntimeError):
    pass


def image_dimensions(image_bytes: bytes, *, max_pixels: int) -> tuple[int, int]:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            width, height = image.size
            image.verify()
    except (OSError, UnidentifiedImageError) as error:
        raise InvalidImageContentError(
            "Downloaded content is not a valid supported image"
        ) from error
    if width <= 0 or height <= 0 or width * height > max_pixels:
        raise InvalidImageContentError("Downloaded image dimensions exceed the safety limit")
    return width, height


def _bounded_polygon(region: OcrRegion, width: int, height: int) -> list[tuple[int, int]]:
    return [(max(0, min(width - 1, x)), max(0, min(height - 1, y))) for x, y in region.polygon]


def _background_style(
    image: Image.Image, polygon: list[tuple[int, int]]
) -> Literal["opaque", "translucent"]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    sample = image.crop(box).convert("RGB")
    sample.thumbnail((32, 32))
    pixels = [
        cast(tuple[int, int, int], sample.getpixel((x, y)))
        for y in range(sample.height)
        for x in range(sample.width)
    ]
    if not pixels:
        return "translucent"
    white_pixels = sum(
        1
        for red, green, blue in pixels
        if min(red, green, blue) >= 225 and max(red, green, blue) - min(red, green, blue) <= 24
    )
    dark_neutral_pixels = sum(
        1
        for red, green, blue in pixels
        if max(red, green, blue) <= 90 and max(red, green, blue) - min(red, green, blue) <= 24
    )
    white_ratio = white_pixels / len(pixels)
    neutral_ratio = (white_pixels + dark_neutral_pixels) / len(pixels)
    return "opaque" if white_ratio >= 0.65 and neutral_ratio >= 0.85 else "translucent"


class RealTranslationPipeline:
    def __init__(
        self,
        *,
        settings: Settings,
        image_fetcher: ImageFetcher,
        ocr_provider: OCRProvider,
        translator: Translator,
        cache: OcrResultCache,
    ) -> None:
        self._settings = settings
        self._image_fetcher = image_fetcher
        self._ocr_provider = ocr_provider
        self._translator = translator
        self._cache = cache

    async def translate(self, request: TranslationImageRequest) -> TranslationImageResponse:
        started_at = time.perf_counter()
        fetch_started_at = time.perf_counter()
        fetched = await self._image_fetcher.fetch(str(request.image.source))
        fetch_ms = (time.perf_counter() - fetch_started_at) * 1000
        image_id = hashlib.sha256(fetched.content).hexdigest()
        width, height = image_dimensions(
            fetched.content, max_pixels=self._settings.image_max_pixels
        )

        warnings: list[str] = []
        ocr_started_at = time.perf_counter()
        regions = self._cache.get(image_id)
        cache_hit = regions is not None
        if regions is None:
            regions = await self._ocr_provider.recognize(fetched.content, fetched.content_type)
            self._cache.put(image_id, regions)
        ocr_ms = (time.perf_counter() - ocr_started_at) * 1000

        accepted: list[OcrRegion] = []
        if not regions:
            warnings.append("OCR_NO_TEXT")
        for region in regions:
            if not region.source_text.strip():
                warnings.append(f"OCR_EMPTY_TEXT:{region.region_id}")
            elif min(region.detection_confidence, region.recognition_confidence) < (
                self._settings.ocr_min_confidence
            ):
                warnings.append(f"OCR_LOW_CONFIDENCE:{region.region_id}")
            else:
                accepted.append(region)

        translation_started_at = time.perf_counter()
        try:
            translations = await self._translator.translate(
                [
                    TranslationInput(
                        region_id=region.region_id,
                        source_text=region.source_text,
                        detected_language=region.detected_language,
                    )
                    for region in accepted
                ],
                request.target_language,
            )
        except TranslatorResponseError:
            translations = []
            warnings.extend(
                f"TRANSLATION_PROVIDER_FAILED:{region.region_id}" for region in accepted
            )
        translation_ms = (time.perf_counter() - translation_started_at) * 1000
        translated_by_id = {
            translation.region_id: translation.translated_text for translation in translations
        }

        with Image.open(BytesIO(fetched.content)) as source_image:
            response_regions: list[TranslationRegion] = []
            for region in accepted:
                if region.region_id not in translated_by_id:
                    continue
                polygon = _bounded_polygon(region, width, height)
                response_regions.append(
                    TranslationRegion(
                        region_id=region.region_id,
                        polygon=polygon,
                        source_text=region.source_text,
                        translated_text=translated_by_id[region.region_id],
                        orientation=region.orientation,
                        background_style=_background_style(source_image, polygon),
                        detection_confidence=region.detection_confidence,
                        recognition_confidence=region.recognition_confidence,
                    )
                )
        total_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "translation_timing fetch_ms=%.1f ocr_ms=%.1f translation_ms=%.1f total_ms=%.1f "
            "cache_hit=%s region_count=%d",
            fetch_ms,
            ocr_ms,
            translation_ms,
            total_ms,
            cache_hit,
            len(response_regions),
        )
        return TranslationImageResponse(
            request_id=request.request_id,
            client_image_id=request.image.client_image_id,
            image_id=image_id,
            image_width=width,
            image_height=height,
            regions=response_regions,
            warnings=warnings,
        )
