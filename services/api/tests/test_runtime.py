from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import cast

import pytest

from penguin_translator_api.contracts.requests import (
    TranslationImageRequest,
    TranslationPageRequest,
)
from penguin_translator_api.contracts.responses import TranslationImageResponse
from penguin_translator_api.services.pipeline import PreparedImage, RealTranslationPipeline
from penguin_translator_api.services.runtime import RuntimeServices
from tests.helpers import make_settings
from tests.test_pipeline import real_request


def response() -> TranslationImageResponse:
    return TranslationImageResponse.model_validate(
        {
            "request_id": "123e4567-e89b-12d3-a456-426614174000",
            "client_image_id": "penguin-image-real",
            "image_id": "a" * 64,
            "image_width": 320,
            "image_height": 240,
            "regions": [],
            "warnings": [],
        }
    )


async def test_limits_heavy_translation_concurrency_to_configured_value() -> None:
    class RecordingPipeline:
        def __init__(self) -> None:
            self.active = 0
            self.maximum_active = 0

        async def translate(self, request: object) -> TranslationImageResponse:
            _ = request
            self.active += 1
            self.maximum_active = max(self.maximum_active, self.active)
            await asyncio.sleep(0.01)
            self.active -= 1
            return response()

    pipeline = RecordingPipeline()
    services = RuntimeServices(
        make_settings(max_concurrent_translations=2),
        pipeline_factory=lambda: cast(RealTranslationPipeline, pipeline),
    )

    await asyncio.gather(*(services.translate_real(real_request()) for _ in range(5)))

    assert pipeline.maximum_active == 2


def test_applies_configured_paddle_cache_path() -> None:
    settings = make_settings(paddle_pdx_cache_home=Path("services/api/.cache/m2-test"))

    RuntimeServices(settings)

    assert os.environ["PADDLE_PDX_CACHE_HOME"] == str(settings.paddle_pdx_cache_home)


def page_request(count: int = 15) -> TranslationPageRequest:
    return TranslationPageRequest.model_validate(
        {
            "request_id": "123e4567-e89b-12d3-a456-426614174000",
            "page_url": "https://example.com/reader",
            "images": [
                {
                    "client_image_id": f"image-{index}",
                    "source_kind": "url",
                    "source": f"https://images.example.com/{index}.png",
                    "rendered_width": 320,
                    "rendered_height": 480,
                }
                for index in range(count)
            ],
            "source_language": "auto",
            "target_language": "zh-Hant",
            "reading_order": "auto",
        }
    )


async def test_page_batch_uses_bounded_workers_keeps_order_and_isolates_failures() -> None:
    class BatchPipeline:
        def __init__(self) -> None:
            self.active = 0
            self.maximum_active = 0
            self.batch_ids: list[str] = []

        async def prepare(
            self, request: TranslationImageRequest, *, queue_wait_ms: float = 0
        ) -> PreparedImage:
            client_id = request.image.client_image_id
            self.active += 1
            self.maximum_active = max(self.maximum_active, self.active)
            await asyncio.sleep(0.005 if client_id != "image-0" else 0.02)
            self.active -= 1
            if client_id == "image-2":
                raise RuntimeError("isolated failure")
            return PreparedImage(
                request=request,
                content=b"unused",
                image_id=str(client_id[-1]) * 64,
                width=320,
                height=480,
                regions=[],
                warnings=[],
                fetch_ms=1,
                ocr_ms=2,
                queue_wait_ms=queue_wait_ms,
                cache_hit=False,
                source_region_count=0,
                started_at=time.perf_counter(),
            )

        async def translate_prepared_batch(
            self, prepared: list[PreparedImage]
        ) -> tuple[list[TranslationImageResponse], float, int]:
            self.batch_ids = [item.request.image.client_image_id for item in prepared]
            return (
                [
                    response().model_copy(
                        update={
                            "request_id": item.request.request_id,
                            "client_image_id": item.request.image.client_image_id,
                            "image_id": item.image_id,
                        }
                    )
                    for item in prepared
                ],
                3,
                1,
            )

    pipeline = BatchPipeline()
    services = RuntimeServices(
        make_settings(max_concurrent_translations=2),
        pipeline_factory=lambda: cast(RealTranslationPipeline, pipeline),
    )

    result = await services.translate_page(page_request())

    assert pipeline.maximum_active == 2
    assert pipeline.batch_ids == [
        "image-0",
        "image-1",
        *[f"image-{index}" for index in range(3, 15)],
    ]
    assert [item.client_image_id for item in result.results] == pipeline.batch_ids
    assert result.failures[0].client_image_id == "image-2"
    assert result.failures[0].code == "IMAGE_TRANSLATION_FAILED"
    assert result.progress.model_dump() == {
        "total": 15,
        "completed": 15,
        "successful": 14,
        "failed": 1,
    }
    assert result.timing.gemini_calls == 1


async def test_warmup_is_explicit_and_does_not_translate() -> None:
    builds = 0

    def build() -> RealTranslationPipeline:
        nonlocal builds
        builds += 1
        return cast(RealTranslationPipeline, object())

    services = RuntimeServices(make_settings(), pipeline_factory=build)

    first = await services.warmup()
    second = await services.warmup()

    assert first.ready is True
    assert second.ready is True
    assert builds == 1


async def test_page_batch_cancellation_cleans_up_workers() -> None:
    class WaitingPipeline:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.active = 0

        async def prepare(
            self, request: TranslationImageRequest, *, queue_wait_ms: float = 0
        ) -> PreparedImage:
            _ = request, queue_wait_ms
            self.active += 1
            self.started.set()
            try:
                await asyncio.Event().wait()
            finally:
                self.active -= 1
            raise AssertionError("unreachable")

    pipeline = WaitingPipeline()
    services = RuntimeServices(
        make_settings(max_concurrent_translations=2),
        pipeline_factory=lambda: cast(RealTranslationPipeline, pipeline),
    )
    task = asyncio.create_task(services.translate_page(page_request(3)))
    await pipeline.started.wait()

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert pipeline.active == 0
