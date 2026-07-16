from __future__ import annotations

import asyncio
import json

from penguin_translator_api.config import Settings
from penguin_translator_api.services.gemini_translator import GeminiTranslator
from penguin_translator_api.services.translator import TranslationInput


async def main() -> None:
    settings = Settings.from_environment()
    print(f"GEMINI_API_KEY configured={str(bool(settings.gemini_api_key)).lower()}")
    if not settings.gemini_api_key:
        raise SystemExit("Gemini live smoke was not run: API key is not configured")
    if not settings.gemini_model:
        raise SystemExit("Gemini live smoke was not run: model is not configured")
    translator = GeminiTranslator(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
    )
    inputs = [
        TranslationInput("ko", "안녕하세요!", "ko"),
        TranslationInput("en", "Are you ready?", "en"),
        TranslationInput("mixed", "Penguin, 안녕!", "mixed"),
    ]
    outputs = await translator.translate(inputs, "zh-Hant")
    if [output.region_id for output in outputs] != ["ko", "en", "mixed"]:
        raise SystemExit("Gemini live response did not preserve every region_id")
    if any(not output.translated_text.strip() for output in outputs):
        raise SystemExit("Gemini live response contained an empty translation")
    print(
        json.dumps(
            {
                "status": "PASS",
                "model": settings.gemini_model,
                "request_count": 1,
                "region_count": len(outputs),
                "region_ids_preserved": True,
                "translations_non_empty": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
