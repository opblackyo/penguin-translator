from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass
from io import BytesIO
from typing import Literal, cast

from PIL import Image, UnidentifiedImageError

from penguin_translator_api.config import Settings
from penguin_translator_api.contracts.requests import TranslationImageRequest
from penguin_translator_api.contracts.responses import (
    TranslationImageResponse,
    TranslationImageTiming,
    TranslationRegion,
)
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


@dataclass(frozen=True)
class PreparedImage:
    request: TranslationImageRequest
    content: bytes
    image_id: str
    width: int
    height: int
    regions: list[OcrRegion]
    warnings: list[str]
    fetch_ms: float
    ocr_ms: float
    queue_wait_ms: float
    cache_hit: bool
    source_region_count: int
    started_at: float


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


def _bounds(region: OcrRegion) -> tuple[int, int, int, int]:
    xs = [point[0] for point in region.polygon]
    ys = [point[1] for point in region.polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _merge_pair(left: OcrRegion, right: OcrRegion) -> OcrRegion:
    left_x, top_y, left_right, bottom_y = _bounds(left)
    right_left, right_top, right_x, right_bottom = _bounds(right)
    merged_left = min(left_x, right_left)
    merged_right = max(left_right, right_x)
    top = min(top_y, right_top)
    bottom = max(bottom_y, right_bottom)
    return OcrRegion(
        region_id=f"{left.region_id}+{right.region_id}",
        polygon=(
            (merged_left, top),
            (merged_right, top),
            (merged_right, bottom),
            (merged_left, bottom),
        ),
        source_text=f"{left.source_text.rstrip()}\n{right.source_text.lstrip()}",
        detected_language=left.detected_language,
        orientation="horizontal",
        detection_confidence=min(left.detection_confidence, right.detection_confidence),
        recognition_confidence=min(left.recognition_confidence, right.recognition_confidence),
    )


def merge_ocr_regions(regions: list[OcrRegion]) -> list[OcrRegion]:
    """Conservatively join adjacent horizontal OCR fragments from the same text line."""
    horizontal = sorted(
        (region for region in regions if region.orientation == "horizontal"),
        key=lambda region: (_bounds(region)[1], _bounds(region)[0]),
    )
    vertical = [region for region in regions if region.orientation != "horizontal"]
    merged: list[OcrRegion] = []
    for region in horizontal:
        if not merged:
            merged.append(region)
            continue
        previous = merged[-1]
        if previous.orientation != "horizontal" or (
            previous.detected_language != region.detected_language
        ):
            merged.append(region)
            continue
        left, top, right, bottom = _bounds(previous)
        next_left, next_top, next_right, next_bottom = _bounds(region)
        line_height = max(1, min(bottom - top, next_bottom - next_top))
        minimum_width = max(1, min(right - left, next_right - next_left))
        horizontal_overlap = max(0, min(right, next_right) - max(left, next_left))
        vertical_gap = next_top - bottom
        if horizontal_overlap / minimum_width >= 0.55 and -round(
            line_height * 0.25
        ) <= vertical_gap <= max(10, round(line_height * 0.8)):
            merged[-1] = _merge_pair(previous, region)
        else:
            merged.append(region)
    return sorted(merged + vertical, key=lambda region: (_bounds(region)[1], _bounds(region)[0]))


def _bounded_polygon(region: OcrRegion, width: int, height: int) -> list[tuple[int, int]]:
    return [(max(0, min(width - 1, x)), max(0, min(height - 1, y))) for x, y in region.polygon]


def _background_style(
    image: Image.Image, polygon: list[tuple[int, int]]
) -> Literal["opaque", "translucent"]:
    """Classify the area around text, avoiding dark glyph pixels inside the polygon."""
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    left, top, right, bottom = min(xs), min(ys), max(xs), max(ys)
    pad = max(3, round(min(right - left + 1, bottom - top + 1) * 0.12))
    outer = (
        max(0, left - pad),
        max(0, top - pad),
        min(image.width, right + pad + 1),
        min(image.height, bottom + pad + 1),
    )
    sample = image.crop(outer).convert("RGB")
    sample.thumbnail((48, 48))
    inner_left = max(0, round((left - outer[0]) * sample.width / max(1, outer[2] - outer[0])))
    inner_top = max(0, round((top - outer[1]) * sample.height / max(1, outer[3] - outer[1])))
    inner_right = min(
        sample.width,
        round((right + 1 - outer[0]) * sample.width / max(1, outer[2] - outer[0])),
    )
    inner_bottom = min(
        sample.height,
        round((bottom + 1 - outer[1]) * sample.height / max(1, outer[3] - outer[1])),
    )
    pixels = [
        cast(tuple[int, int, int], sample.getpixel((x, y)))
        for y in range(sample.height)
        for x in range(sample.width)
        if not (inner_left <= x < inner_right and inner_top <= y < inner_bottom)
    ]
    if not pixels:
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
    return "opaque" if white_pixels / len(pixels) >= 0.72 else "translucent"


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

    async def prepare(
        self, request: TranslationImageRequest, *, queue_wait_ms: float = 0
    ) -> PreparedImage:
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
        accepted = merge_ocr_regions(accepted)
        return PreparedImage(
            request=request,
            content=fetched.content,
            image_id=image_id,
            width=width,
            height=height,
            regions=accepted,
            warnings=warnings,
            fetch_ms=fetch_ms,
            ocr_ms=ocr_ms,
            queue_wait_ms=queue_wait_ms,
            cache_hit=cache_hit,
            source_region_count=len(regions),
            started_at=started_at,
        )

    def _chunks(self, inputs: list[TranslationInput]) -> list[list[TranslationInput]]:
        chunks: list[list[TranslationInput]] = []
        current: list[TranslationInput] = []
        characters = 0
        for item in inputs:
            length = len(item.source_text)
            if current and (
                len(current) >= self._settings.gemini_batch_max_regions
                or characters + length > self._settings.gemini_batch_max_characters
            ):
                chunks.append(current)
                current = []
                characters = 0
            current.append(item)
            characters += length
        if current:
            chunks.append(current)
        return chunks

    async def translate_prepared_batch(
        self, prepared: list[PreparedImage]
    ) -> tuple[list[TranslationImageResponse], float, int]:
        scoped: list[TranslationInput] = []
        for image_index, item in enumerate(prepared):
            for region_index, region in enumerate(item.regions):
                scoped_id = f"i{image_index}:r{region_index}"
                scoped.append(
                    TranslationInput(scoped_id, region.source_text, region.detected_language)
                )
        translated: dict[str, str] = {}
        oversized_ids = {
            item.region_id
            for item in scoped
            if len(item.source_text) > self._settings.gemini_batch_max_characters
        }
        failed_ids: set[str] = set()
        gemini_started_at = time.perf_counter()
        chunks = self._chunks([item for item in scoped if item.region_id not in oversized_ids])
        for chunk in chunks:
            try:
                output = await self._translator.translate(
                    chunk, prepared[0].request.target_language
                )
                translated.update(
                    (translation.region_id, translation.translated_text) for translation in output
                )
            except TranslatorResponseError:
                failed_ids.update(item.region_id for item in chunk)
        gemini_ms = (time.perf_counter() - gemini_started_at) * 1000
        regions_by_image: list[list[TranslationRegion]] = [[] for _ in prepared]
        warnings_by_image = [list(item.warnings) for item in prepared]
        for image_index, item in enumerate(prepared):
            with Image.open(BytesIO(item.content)) as source_image:
                for region_index, region in enumerate(item.regions):
                    scoped_id = f"i{image_index}:r{region_index}"
                    if scoped_id in oversized_ids:
                        warnings_by_image[image_index].append(
                            f"TRANSLATION_TEXT_LIMIT_EXCEEDED:{region.region_id}"
                        )
                        continue
                    if scoped_id in failed_ids or scoped_id not in translated:
                        warnings_by_image[image_index].append(
                            f"TRANSLATION_PROVIDER_FAILED:{region.region_id}"
                        )
                        continue
                    polygon = _bounded_polygon(region, item.width, item.height)
                    regions_by_image[image_index].append(
                        TranslationRegion(
                            region_id=region.region_id,
                            polygon=polygon,
                            source_text=region.source_text,
                            translated_text=translated[scoped_id],
                            orientation=region.orientation,
                            background_style=_background_style(source_image, polygon),
                            detection_confidence=region.detection_confidence,
                            recognition_confidence=region.recognition_confidence,
                        )
                    )
        responses: list[TranslationImageResponse] = []
        for index, item in enumerate(prepared):
            total_ms = (time.perf_counter() - item.started_at) * 1000
            response = TranslationImageResponse(
                request_id=item.request.request_id,
                client_image_id=item.request.image.client_image_id,
                image_id=item.image_id,
                image_width=item.width,
                image_height=item.height,
                regions=regions_by_image[index],
                warnings=warnings_by_image[index],
                timing=TranslationImageTiming(
                    fetch_ms=item.fetch_ms,
                    ocr_ms=item.ocr_ms,
                    gemini_ms=gemini_ms,
                    total_ms=total_ms,
                    queue_wait_ms=item.queue_wait_ms,
                    ocr_cache_hit=item.cache_hit,
                    source_region_count=item.source_region_count,
                    output_region_count=len(regions_by_image[index]),
                    gemini_calls=len(chunks),
                ),
            )
            responses.append(response)
        logger.info(
            "translation_batch_timing image_count=%d fetch_ms=%.1f ocr_ms=%.1f "
            "gemini_ms=%.1f total_ms=%.1f cache_hits=%d gemini_calls=%d",
            len(prepared),
            sum(item.fetch_ms for item in prepared),
            sum(item.ocr_ms for item in prepared),
            gemini_ms,
            max((response.timing.total_ms for response in responses if response.timing), default=0),
            sum(item.cache_hit for item in prepared),
            len(chunks),
        )
        return responses, gemini_ms, len(chunks)

    async def translate(self, request: TranslationImageRequest) -> TranslationImageResponse:
        prepared = await self.prepare(request)
        responses, _, _ = await self.translate_prepared_batch([prepared])
        return responses[0]
