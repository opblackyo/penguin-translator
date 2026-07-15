from uuid import UUID

from httpx import ASGITransport, AsyncClient

from penguin_translator_api.contracts.responses import TranslationImageResponse
from penguin_translator_api.main import app


def valid_request() -> dict[str, object]:
    return {
        "request_id": "123e4567-e89b-12d3-a456-426614174000",
        "page_url": "https://example.com/reader",
        "image": {
            "client_image_id": "penguin-image-0",
            "source_kind": "url",
            "source": "https://images.example.com/page.webp",
            "rendered_width": 800,
            "rendered_height": 1200,
        },
        "source_language": "ja",
        "target_language": "zh-Hant",
        "reading_order": "rtl",
    }


async def test_translate_image_requires_bearer_credential() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/v1/translate-image", json=valid_request())

    assert response.status_code in {401, 403}


async def test_translate_image_returns_deterministic_mock_region() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/translate-image",
            headers={"Authorization": "Bearer local-m0-test-value"},
            json=valid_request(),
        )

    assert response.status_code == 200
    body = TranslationImageResponse.model_validate_json(response.text)
    assert body.request_id == UUID("123e4567-e89b-12d3-a456-426614174000")
    assert body.client_image_id == "penguin-image-0"
    assert body.regions[0].translated_text == "測試譯文"
    assert body.warnings == ["M0_MOCK_RESULT_NO_IMAGE_FETCH"]


async def test_translate_image_accepts_http_lan_test_page() -> None:
    request = valid_request()
    request["page_url"] = "http://m0-test-page.local/reader"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/translate-image",
            headers={"Authorization": "Bearer local-m0-test-value"},
            json=request,
        )

    assert response.status_code == 200


async def test_translate_image_rejects_non_http_page_url() -> None:
    request = valid_request()
    request["page_url"] = "ftp://example.com/reader"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/translate-image",
            headers={"Authorization": "Bearer local-m0-test-value"},
            json=request,
        )

    assert response.status_code == 422
