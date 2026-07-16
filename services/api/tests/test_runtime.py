from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import cast

from penguin_translator_api.contracts.responses import TranslationImageResponse
from penguin_translator_api.services.pipeline import RealTranslationPipeline
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
