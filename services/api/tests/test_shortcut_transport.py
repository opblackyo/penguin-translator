from __future__ import annotations

import base64
import json
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from penguin_translator_api.contracts.requests import TranslationPageRequest
from penguin_translator_api.contracts.responses import (
    TranslationPageFailure,
    TranslationPageProgress,
    TranslationPageResponse,
    TranslationPageTiming,
)
from penguin_translator_api.main import app
from penguin_translator_api.services.runtime import get_runtime_services
from penguin_translator_api.services.shortcut_transport import (
    PAYLOAD_VERSION,
    ShortcutTransportError,
    decode_translation_page_payload,
    encode_renderer_payload,
    parse_shortcut_form,
)
from tests.helpers import make_settings


def page_document(image_count: int = 15) -> dict[str, object]:
    return {
        "request_id": "123e4567-e89b-12d3-a456-426614174000",
        "page_url": "https://example.com/讀者?章=一",
        "images": [
            {
                "client_image_id": f"企鵝-image-{index}",
                "source_kind": "url",
                "source": f"https://images.example.com/漫畫/{index}.png?語言=韓文",
                "rendered_width": 800,
                "rendered_height": 1200,
            }
            for index in range(image_count)
        ],
        "source_language": "auto",
        "target_language": "zh-Hant",
        "reading_order": "auto",
    }


def encoded_document(document: object) -> str:
    serialized = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(serialized).decode().rstrip("=")


def page_response(*, failed: int = 0) -> TranslationPageResponse:
    total = 15
    return TranslationPageResponse(
        request_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
        results=[],
        failures=[
            TranslationPageFailure(client_image_id=f"企鵝-image-{index}", code="IMAGE_FETCH_FAILED")
            for index in range(failed)
        ],
        progress=TranslationPageProgress(
            total=total,
            completed=total,
            successful=total - failed,
            failed=failed,
        ),
        warnings=[],
        timing=TranslationPageTiming(
            total_ms=10,
            fetch_ms=2,
            ocr_ms=3,
            gemini_ms=4,
            queue_wait_ms=1,
            cold_start_ms=0,
            gemini_calls=2,
            ocr_cache_hits=0,
            warm_execution=True,
        ),
    )


def test_base64url_round_trip_preserves_15_images_and_unicode() -> None:
    payload = encoded_document(page_document())
    parsed = decode_translation_page_payload(payload, maximum_decoded_bytes=262_144)

    assert len(parsed.images) == 15
    assert parsed.images[0].client_image_id == "企鵝-image-0"
    assert "%E6%BC%AB%E7%95%AB" in str(parsed.images[0].source)
    assert parse_shortcut_form(f"payload={payload}".encode(), maximum_bytes=350_000) == payload


@pytest.mark.parametrize(
    ("payload", "code", "status"),
    [
        ("not+base64", "SHORTCUT_PAYLOAD_BASE64_INVALID", 400),
        (encoded_document({"broken": True}), "SHORTCUT_PAYLOAD_REQUEST_INVALID", 422),
        (
            base64.urlsafe_b64encode(b"{").decode().rstrip("="),
            "SHORTCUT_PAYLOAD_JSON_INVALID",
            400,
        ),
    ],
)
def test_rejects_malformed_or_invalid_payload(payload: str, code: str, status: int) -> None:
    with pytest.raises(ShortcutTransportError) as captured:
        decode_translation_page_payload(payload, maximum_decoded_bytes=262_144)

    assert captured.value.code == code
    assert captured.value.status_code == status


def test_rejects_oversized_form_and_decoded_payload() -> None:
    with pytest.raises(ShortcutTransportError, match="SHORTCUT_FORM_TOO_LARGE"):
        parse_shortcut_form(b"payload=abcd", maximum_bytes=4)
    with pytest.raises(ShortcutTransportError, match="SHORTCUT_PAYLOAD_TOO_LARGE"):
        decode_translation_page_payload(encoded_document(page_document()), maximum_decoded_bytes=32)


def test_renderer_payload_round_trip_is_utf8_base64url() -> None:
    response = page_response(failed=1)
    encoded = encode_renderer_payload(response)
    decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode()

    assert "+" not in encoded and "/" not in encoded and "\n" not in encoded
    assert TranslationPageResponse.model_validate_json(decoded) == response


async def test_shortcut_adapter_preserves_list_and_partial_failure_summary() -> None:
    class RecordingRuntime:
        settings = make_settings()
        received: TranslationPageRequest | None = None

        async def translate_page(self, request: TranslationPageRequest) -> TranslationPageResponse:
            self.received = request
            return page_response(failed=1)

    runtime = RecordingRuntime()
    app.dependency_overrides[get_runtime_services] = lambda: runtime
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            missing_bearer = await client.post(
                "/v1/shortcut/translate-page",
                data={"payload": encoded_document(page_document())},
            )
            response = await client.post(
                "/v1/shortcut/translate-page",
                headers={"Authorization": "Bearer test-local-token"},
                data={"payload": encoded_document(page_document())},
            )
    finally:
        app.dependency_overrides.clear()

    assert missing_bearer.status_code in {401, 403}
    assert response.status_code == 200
    assert runtime.received is not None and len(runtime.received.images) == 15
    assert response.json()["payload_version"] == PAYLOAD_VERSION
    assert response.json()["summary"] == {"total": 15, "successful": 14, "failed": 1}


async def test_shortcut_adapter_returns_safe_4xx_codes() -> None:
    class Runtime:
        settings = make_settings(shortcut_form_max_bytes=64)

    app.dependency_overrides[get_runtime_services] = lambda: Runtime()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            malformed = await client.post(
                "/v1/shortcut/translate-page",
                headers={"Authorization": "Bearer test-local-token"},
                data={"payload": "%%%"},
            )
            oversized = await client.post(
                "/v1/shortcut/translate-page",
                content=b"payload=" + b"a" * 100,
                headers={
                    "Authorization": "Bearer test-local-token",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert malformed.status_code == 400
    assert malformed.json()["detail"] == {"code": "SHORTCUT_PAYLOAD_BASE64_INVALID"}
    assert oversized.status_code == 413
    assert oversized.json()["detail"] == {"code": "SHORTCUT_FORM_TOO_LARGE"}
