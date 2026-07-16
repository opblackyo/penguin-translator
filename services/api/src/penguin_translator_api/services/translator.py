from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class TranslationInput:
    region_id: str
    source_text: str
    detected_language: str


@dataclass(frozen=True)
class TranslationOutput:
    region_id: str
    translated_text: str


class Translator(Protocol):
    async def translate(
        self, regions: list[TranslationInput], target_language: str
    ) -> list[TranslationOutput]: ...


class TranslatorConfigurationError(RuntimeError):
    pass


class TranslatorResponseError(RuntimeError):
    pass


class FakeTranslator:
    async def translate(
        self, regions: list[TranslationInput], target_language: str
    ) -> list[TranslationOutput]:
        _ = target_language
        return [
            TranslationOutput(
                region_id=region.region_id, translated_text=f"翻譯: {region.source_text}"
            )
            for region in regions
        ]
