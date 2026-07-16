from __future__ import annotations

import json
from collections import Counter
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from penguin_translator_api.services.translator import (
    TranslationInput,
    TranslationOutput,
    TranslatorConfigurationError,
    TranslatorResponseError,
)


class TranslationItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region_id: str = Field(min_length=1)
    translated_text: str = Field(min_length=1)


class TranslationBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    translations: list[TranslationItem]


SYSTEM_INSTRUCTION = """You translate OCR regions from manga into Traditional Chinese.
Translate only the supplied text. Preserve dialogue tone, honorifics, names, and forms of address.
Do not explain, summarize, censor, rewrite the plot, or add content absent from the source.
Korean, English, and mixed-language source text are supported.
Preserve every region_id exactly and return one translation for every input region.
"""


class GeminiTranslator:
    def __init__(self, *, api_key: str | None, model: str | None, client: Any = None) -> None:
        if not api_key:
            raise TranslatorConfigurationError("GEMINI_API_KEY is required for real translation")
        if not model:
            raise TranslatorConfigurationError(
                "PENGUIN_TRANSLATOR_GEMINI_MODEL is required for real translation"
            )
        self._model = model
        if client is None:
            try:
                from google import genai
            except ImportError as error:
                raise TranslatorConfigurationError(
                    "google-genai is not installed; run the backend sync command"
                ) from error
            client = genai.Client(api_key=api_key)
        self._client = client

    async def translate(
        self, regions: list[TranslationInput], target_language: str
    ) -> list[TranslationOutput]:
        if not regions:
            return []
        identifiers = [region.region_id for region in regions]
        duplicates = [key for key, count in Counter(identifiers).items() if count > 1]
        if duplicates:
            raise TranslatorResponseError("Translation input contains duplicate region_id values")
        if any(not region.source_text.strip() for region in regions):
            raise TranslatorResponseError("Translation input contains empty source_text")

        payload = {
            "requested_target_language": target_language,
            "regions": [
                {
                    "region_id": region.region_id,
                    "source_text": region.source_text,
                    "detected_language": region.detected_language,
                }
                for region in regions
            ],
        }
        try:
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=json.dumps(payload, ensure_ascii=False),
                config={
                    "system_instruction": SYSTEM_INSTRUCTION,
                    "response_mime_type": "application/json",
                    "response_json_schema": TranslationBatch.model_json_schema(),
                },
            )
            batch = TranslationBatch.model_validate_json(response.text)
        except Exception as error:
            raise TranslatorResponseError("Gemini structured translation failed") from error

        output_ids = [item.region_id for item in batch.translations]
        if len(output_ids) != len(set(output_ids)):
            raise TranslatorResponseError("Gemini returned duplicate region_id values")
        if set(output_ids) != set(identifiers):
            raise TranslatorResponseError(
                "Gemini response region_id set does not match the request"
            )

        by_identifier = {item.region_id: item.translated_text for item in batch.translations}
        return [
            TranslationOutput(region_id=identifier, translated_text=by_identifier[identifier])
            for identifier in identifiers
        ]
