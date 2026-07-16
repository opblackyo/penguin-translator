from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Callable
from functools import lru_cache
from threading import Lock

from penguin_translator_api.config import Settings
from penguin_translator_api.contracts.requests import (
    TranslationImageRequest,
    TranslationPageRequest,
)
from penguin_translator_api.contracts.responses import (
    TranslationImageResponse,
    TranslationPageFailure,
    TranslationPageProgress,
    TranslationPageResponse,
    TranslationPageTiming,
    TranslationWarmupResponse,
)
from penguin_translator_api.services.gemini_translator import GeminiTranslator
from penguin_translator_api.services.image_fetcher import ImageFetcher, ImageFetchError
from penguin_translator_api.services.ocr import OCRProviderUnavailableError
from penguin_translator_api.services.ocr_cache import OcrResultCache
from penguin_translator_api.services.paddle_ocr import PaddleOCRProvider
from penguin_translator_api.services.pipeline import (
    InvalidImageContentError,
    PreparedImage,
    RealTranslationPipeline,
)
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
        self._cold_start_ms = 0.0
        self._was_warmed = False

    def _build_pipeline(self) -> RealTranslationPipeline:
        started_at = time.perf_counter()
        if self._pipeline_factory is not None:
            pipeline = self._pipeline_factory()
            self._cold_start_ms = (time.perf_counter() - started_at) * 1000
            return pipeline
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
        pipeline = RealTranslationPipeline(
            settings=self.settings,
            image_fetcher=self._image_fetcher,
            ocr_provider=ocr_provider,
            translator=translator,
            cache=self._cache,
        )
        self._cold_start_ms = (time.perf_counter() - started_at) * 1000
        logger.info("ocr_model_cold_start_ms=%.1f", self._cold_start_ms)
        return pipeline

    def _ensure_pipeline(self) -> RealTranslationPipeline:
        if self._pipeline is None:
            with self._pipeline_lock:
                if self._pipeline is None:
                    self._pipeline = self._build_pipeline()
        return self._pipeline

    async def warmup(self) -> TranslationWarmupResponse:
        started_at = time.perf_counter()
        try:
            await asyncio.to_thread(self._ensure_pipeline)
        except (OCRProviderUnavailableError, TranslatorConfigurationError):
            return TranslationWarmupResponse(
                ready=False,
                initialization_ms=(time.perf_counter() - started_at) * 1000,
                diagnostic="REAL_TRANSLATION_NOT_CONFIGURED",
            )
        except Exception:
            logger.error("ocr_warmup_failed")
            return TranslationWarmupResponse(
                ready=False,
                initialization_ms=(time.perf_counter() - started_at) * 1000,
                diagnostic="OCR_WARMUP_FAILED",
            )
        self._was_warmed = True
        return TranslationWarmupResponse(
            ready=True,
            initialization_ms=(time.perf_counter() - started_at) * 1000,
        )

    async def translate_real(self, request: TranslationImageRequest) -> TranslationImageResponse:
        pipeline = self._ensure_pipeline()
        async with self._translation_slots:
            return await pipeline.translate(request)

    @staticmethod
    def _failure_code(error: Exception) -> str:
        if isinstance(error, ImageFetchError):
            return error.code
        if isinstance(error, InvalidImageContentError):
            return "IMAGE_CONTENT_INVALID"
        if isinstance(error, (OCRProviderUnavailableError, TranslatorConfigurationError)):
            return "REAL_TRANSLATION_NOT_CONFIGURED"
        return "IMAGE_TRANSLATION_FAILED"

    async def translate_page(self, request: TranslationPageRequest) -> TranslationPageResponse:
        if len(request.images) > self.settings.page_batch_max_images:
            raise ValueError("PAGE_BATCH_TOO_LARGE")
        started_at = time.perf_counter()
        pipeline_was_ready = self._pipeline is not None
        pipeline = self._ensure_pipeline()
        queue: asyncio.Queue[tuple[int, TranslationImageRequest, float]] = asyncio.Queue()
        for index, image in enumerate(request.images):
            queue.put_nowait(
                (
                    index,
                    TranslationImageRequest(
                        request_id=request.request_id,
                        page_url=request.page_url,
                        image=image,
                        source_language=request.source_language,
                        target_language=request.target_language,
                        reading_order=request.reading_order,
                    ),
                    time.perf_counter(),
                )
            )
        prepared: list[PreparedImage | None] = [None] * len(request.images)
        failures: list[TranslationPageFailure | None] = [None] * len(request.images)

        async def worker() -> None:
            while True:
                try:
                    index, image_request, queued_at = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                try:
                    async with self._translation_slots:
                        wait_ms = (time.perf_counter() - queued_at) * 1000
                        prepared[index] = await pipeline.prepare(
                            image_request, queue_wait_ms=wait_ms
                        )
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    failures[index] = TranslationPageFailure(
                        client_image_id=image_request.image.client_image_id,
                        code=self._failure_code(error),
                    )
                finally:
                    queue.task_done()

        worker_count = min(self.settings.max_concurrent_translations, len(request.images))
        tasks = [asyncio.create_task(worker()) for _ in range(worker_count)]
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        successful_prepares = [item for item in prepared if item is not None]
        results: list[TranslationImageResponse] = []
        gemini_ms = 0.0
        gemini_calls = 0
        gemini_queue_wait_ms = 0.0
        if successful_prepares:
            gemini_queued_at = time.perf_counter()
            async with self._translation_slots:
                gemini_queue_wait_ms = (time.perf_counter() - gemini_queued_at) * 1000
                results, gemini_ms, gemini_calls = await pipeline.translate_prepared_batch(
                    successful_prepares
                )
        actual_failures = [failure for failure in failures if failure is not None]
        total_ms = (time.perf_counter() - started_at) * 1000
        return TranslationPageResponse(
            request_id=request.request_id,
            results=results,
            failures=actual_failures,
            progress=TranslationPageProgress(
                total=len(request.images),
                completed=len(request.images),
                successful=len(results),
                failed=len(actual_failures),
            ),
            warnings=[],
            timing=TranslationPageTiming(
                total_ms=total_ms,
                fetch_ms=sum(item.fetch_ms for item in successful_prepares),
                ocr_ms=sum(item.ocr_ms for item in successful_prepares),
                gemini_ms=gemini_ms,
                queue_wait_ms=(
                    sum(item.queue_wait_ms for item in successful_prepares) + gemini_queue_wait_ms
                ),
                cold_start_ms=0 if pipeline_was_ready else self._cold_start_ms,
                gemini_calls=gemini_calls,
                ocr_cache_hits=sum(item.cache_hit for item in successful_prepares),
                warm_execution=pipeline_was_ready or self._was_warmed,
            ),
        )


@lru_cache(maxsize=1)
def get_runtime_services() -> RuntimeServices:
    return RuntimeServices(Settings.from_environment())
