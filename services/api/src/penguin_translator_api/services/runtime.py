from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Callable
from functools import lru_cache
from threading import Lock

from penguin_translator_api.config import Settings
from penguin_translator_api.contracts.requests import TranslationImageRequest
from penguin_translator_api.contracts.responses import TranslationImageResponse
from penguin_translator_api.services.gemini_translator import GeminiTranslator
from penguin_translator_api.services.image_fetcher import ImageFetcher
from penguin_translator_api.services.ocr import OCRProviderUnavailableError
from penguin_translator_api.services.ocr_cache import OcrResultCache
from penguin_translator_api.services.paddle_ocr import PaddleOCRProvider
from penguin_translator_api.services.pipeline import RealTranslationPipeline
from penguin_translator_api.services.translator import TranslatorConfigurationError

logger = logging.getLogger(__name__)
PipelineFactory = Callable[[], RealTranslationPipeline]


def apply_paddle_cache_environment(settings: Settings) -> None:
    os.environ["PADDLE_PDX_CACHE_HOME"] = str(settings.paddle_pdx_cache_home)


class RuntimeServices:
    def __init__(
        self,
        settings: Settings,
        *,
        pipeline_factory: PipelineFactory | None = None,
    ) -> None:
        self.settings = settings
        apply_paddle_cache_environment(settings)
        self._image_fetcher = ImageFetcher(settings)
        self._cache = OcrResultCache(
            ttl_seconds=settings.ocr_cache_ttl_seconds,
            max_entries=settings.ocr_cache_max_entries,
        )
        self._pipeline: RealTranslationPipeline | None = None
        self._pipeline_lock = Lock()
        self._translation_slots = asyncio.Semaphore(settings.max_concurrent_translations)
        self._pipeline_factory = pipeline_factory

    def _build_pipeline(self) -> RealTranslationPipeline:
        started_at = time.perf_counter()
        if self._pipeline_factory is not None:
            return self._pipeline_factory()
        if self.settings.ocr_provider != "paddleocr":
            raise OCRProviderUnavailableError("PENGUIN_TRANSLATOR_OCR_PROVIDER must be paddleocr")
        if self.settings.translation_provider != "gemini":
            raise TranslatorConfigurationError(
                "PENGUIN_TRANSLATOR_TRANSLATION_PROVIDER must be gemini"
            )
        translator = GeminiTranslator(
            api_key=self.settings.gemini_api_key,
            model=self.settings.gemini_model,
        )
        ocr_provider = PaddleOCRProvider(
            language=self.settings.paddleocr_language,
            detection_model=self.settings.paddleocr_detection_model,
            recognition_model=self.settings.paddleocr_recognition_model,
        )
        logger.info("ocr_model_cold_start_ms=%.1f", (time.perf_counter() - started_at) * 1000)
        return RealTranslationPipeline(
            settings=self.settings,
            image_fetcher=self._image_fetcher,
            ocr_provider=ocr_provider,
            translator=translator,
            cache=self._cache,
        )

    async def translate_real(self, request: TranslationImageRequest) -> TranslationImageResponse:
        if self._pipeline is None:
            with self._pipeline_lock:
                if self._pipeline is None:
                    self._pipeline = self._build_pipeline()
        async with self._translation_slots:
            return await self._pipeline.translate(request)


@lru_cache(maxsize=1)
def get_runtime_services() -> RuntimeServices:
    return RuntimeServices(Settings.from_environment())
