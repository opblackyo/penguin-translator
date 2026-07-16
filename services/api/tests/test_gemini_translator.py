from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from penguin_translator_api.services.gemini_translator import GeminiTranslator
from penguin_translator_api.services.translator import (
    TranslationInput,
    TranslatorConfigurationError,
    TranslatorResponseError,
)


class FakeModels:
    def __init__(self, response: dict[str, object]) -> None:
        self.response = response
        self.calls: list[dict[str, object]] = []

    async def generate_content(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(text=json.dumps(self.response, ensure_ascii=False))


def client_with(response: dict[str, object]) -> tuple[SimpleNamespace, FakeModels]:
    models = FakeModels(response)
    return SimpleNamespace(aio=SimpleNamespace(models=models)), models


async def test_batches_korean_english_and_mixed_regions_in_one_structured_call() -> None:
    client, models = client_with(
        {
            "translations": [
                {"region_id": "ko", "translated_text": "你好"},
                {"region_id": "en", "translated_text": "再見"},
                {"region_id": "mixed", "translated_text": "企鵝你好"},
            ]
        }
    )
    translator = GeminiTranslator(api_key="test", model="owner-model", client=client)
    inputs = [
        TranslationInput("ko", "안녕하세요", "ko"),
        TranslationInput("en", "Goodbye", "en"),
        TranslationInput("mixed", "Penguin 안녕", "mixed"),
    ]

    output = await translator.translate(inputs, "zh-Hant")

    assert [item.region_id for item in output] == ["ko", "en", "mixed"]
    assert all(item.translated_text for item in output)
    assert len(models.calls) == 1
    assert models.calls[0]["model"] == "owner-model"
    config = models.calls[0]["config"]
    assert isinstance(config, dict)
    assert config["response_mime_type"] == "application/json"
    assert "response_json_schema" in config


@pytest.mark.parametrize(
    "response",
    [
        {"translations": [{"region_id": "one", "translated_text": "一"}]},
        {
            "translations": [
                {"region_id": "one", "translated_text": "一"},
                {"region_id": "two", "translated_text": "二"},
                {"region_id": "extra", "translated_text": "多"},
            ]
        },
        {
            "translations": [
                {"region_id": "one", "translated_text": "一"},
                {"region_id": "one", "translated_text": "一"},
            ]
        },
    ],
)
async def test_rejects_missing_extra_or_duplicate_output_ids(
    response: dict[str, object],
) -> None:
    client, _ = client_with(response)
    translator = GeminiTranslator(api_key="test", model="owner-model", client=client)
    inputs = [
        TranslationInput("one", "one", "en"),
        TranslationInput("two", "two", "en"),
    ]

    with pytest.raises(TranslatorResponseError):
        await translator.translate(inputs, "zh-Hant")


async def test_rejects_empty_text_and_duplicate_input_ids_without_calling_provider() -> None:
    client, models = client_with({"translations": []})
    translator = GeminiTranslator(api_key="test", model="owner-model", client=client)

    with pytest.raises(TranslatorResponseError):
        await translator.translate([TranslationInput("empty", " ", "en")], "zh-Hant")
    with pytest.raises(TranslatorResponseError):
        await translator.translate(
            [TranslationInput("same", "one", "en"), TranslationInput("same", "two", "en")],
            "zh-Hant",
        )
    assert models.calls == []


def test_requires_key_and_model_without_contacting_google() -> None:
    with pytest.raises(TranslatorConfigurationError):
        GeminiTranslator(api_key=None, model="owner-model")
    with pytest.raises(TranslatorConfigurationError):
        GeminiTranslator(api_key="test", model=None)
