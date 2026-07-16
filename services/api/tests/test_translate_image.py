from uuid import UUID

from httpx import ASGITransport, AsyncClient

from penguin_translator_api.contracts.responses import (
    TranslationImageResponse,
    TranslationPageProgress,
    TranslationPageResponse,
    TranslationPageTiming,
    TranslationWarmupResponse,
)
from penguin_translator_api.main import app
from penguin_translator_api.services.image_fetcher import ImageRedirectError
from penguin_translator_api.services.runtime import get_runtime_services
from tests.helpers import make_settings


class ConfiguredRuntime:
    settings = make_settings()


def use_configured_runtime() -> None:
    app.dependency_overrides[get_runtime_services] = lambda: ConfiguredRuntime()


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


def valid_page_request() -> dict[str, object]:
    single = valid_request()
    return {
        "request_id": single["request_id"],
        "page_url": single["page_url"],
        "images": [single["image"]],
        "source_language": "auto",
        "target_language": "zh-Hant",
        "reading_order": "auto",
    }


async def test_page_batch_and_warmup_require_token_and_return_typed_contracts() -> None:
    class PageRuntime:
        settings = make_settings()

        async def translate_page(self, request: object) -> TranslationPageResponse:
            _ = request
            return TranslationPageResponse(
                request_id="123e4567-e89b-12d3-a456-426614174000",  # type: ignore[arg-type]
                results=[],
                failures=[],
                progress=TranslationPageProgress(total=1, completed=1, successful=0, failed=0),
                warnings=["OCR_NO_TEXT"],
                timing=TranslationPageTiming(
                    total_ms=1,
                    fetch_ms=0,
                    ocr_ms=1,
                    gemini_ms=0,
                    queue_wait_ms=0,
                    cold_start_ms=0,
                    gemini_calls=0,
                    ocr_cache_hits=0,
                    warm_execution=True,
                ),
            )

        async def warmup(self) -> TranslationWarmupResponse:
            return TranslationWarmupResponse(ready=True, initialization_ms=1)

    app.dependency_overrides[get_runtime_services] = lambda: PageRuntime()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            unauthorized = await client.post("/v1/translate-page", json=valid_page_request())
            page = await client.post(
                "/v1/translate-page",
                headers={"Authorization": "Bearer test-local-token"},
                json=valid_page_request(),
            )
            warmup = await client.post(
                "/v1/warmup", headers={"Authorization": "Bearer test-local-token"}
            )
    finally:
        app.dependency_overrides.clear()

    assert unauthorized.status_code in {401, 403}
    assert page.status_code == 200
    assert page.json()["progress"]["completed"] == 1
    assert warmup.json() == {"ready": True, "initialization_ms": 1.0, "diagnostic": None}


async def test_translate_image_requires_bearer_credential() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/v1/translate-image", json=valid_request())

    assert response.status_code in {401, 403}


async def test_translate_image_returns_deterministic_mock_region() -> None:
    use_configured_runtime()
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/v1/translate-image",
                headers={"Authorization": "Bearer test-local-token"},
                json=valid_request(),
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = TranslationImageResponse.model_validate_json(response.text)
    assert body.request_id == UUID("123e4567-e89b-12d3-a456-426614174000")
    assert body.client_image_id == "penguin-image-0"
    assert body.regions[0].translated_text == "測試譯文"
    assert body.warnings == ["M0_MOCK_RESULT_NO_IMAGE_FETCH"]


async def test_translate_image_accepts_http_lan_test_page() -> None:
    use_configured_runtime()
    request = valid_request()
    request["page_url"] = "http://m0-test-page.local/reader"

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/v1/translate-image",
                headers={"Authorization": "Bearer test-local-token"},
                json=request,
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200


async def test_translate_image_rejects_non_http_page_url() -> None:
    use_configured_runtime()
    request = valid_request()
    request["page_url"] = "ftp://example.com/reader"

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/v1/translate-image",
                headers={"Authorization": "Bearer test-local-token"},
                json=request,
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


async def test_mock_request_rejects_an_incorrect_local_token() -> None:
    use_configured_runtime()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/v1/translate-image",
                headers={"Authorization": "Bearer arbitrary-non-empty-value"},
                json=valid_request(),
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "LOCAL_API_TOKEN_INVALID"


async def test_mock_request_without_token_configuration_is_diagnostic() -> None:
    class MissingTokenRuntime:
        settings = make_settings(local_api_token=None)

    app.dependency_overrides[get_runtime_services] = lambda: MissingTokenRuntime()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/v1/translate-image",
                headers={"Authorization": "Bearer any-value"},
                json=valid_request(),
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "LOCAL_API_TOKEN_NOT_CONFIGURED"


async def test_real_request_uses_runtime_pipeline_without_rebuilding_m0_flow() -> None:
    expected = TranslationImageResponse.model_validate(
        {
            "request_id": "123e4567-e89b-12d3-a456-426614174000",
            "client_image_id": "penguin-image-0",
            "image_id": "a" * 64,
            "image_width": 640,
            "image_height": 960,
            "regions": [],
            "warnings": ["REAL_PIPELINE_TEST"],
        }
    )

    class FakeRuntime:
        settings = make_settings()

        async def translate_real(self, request: object) -> TranslationImageResponse:
            _ = request
            return expected

    request = valid_request()
    request["source_language"] = "auto"
    request["reading_order"] = "auto"
    app.dependency_overrides[get_runtime_services] = lambda: FakeRuntime()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/v1/translate-image",
                headers={"Authorization": "Bearer test-local-token"},
                json=request,
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["warnings"] == ["REAL_PIPELINE_TEST"]


async def test_real_request_without_runtime_configuration_is_diagnostic() -> None:
    request = valid_request()
    request["source_language"] = "auto"
    request["reading_order"] = "auto"

    class MissingConfigurationRuntime:
        settings = make_settings(
            local_api_token=None,
            translation_provider=None,
            gemini_model=None,
            gemini_api_key=None,
        )

        async def translate_real(self, request: object) -> TranslationImageResponse:
            raise AssertionError("Token validation must happen before pipeline initialization")

    app.dependency_overrides[get_runtime_services] = lambda: MissingConfigurationRuntime()

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/v1/translate-image",
                headers={"Authorization": "Bearer any-value"},
                json=request,
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "LOCAL_API_TOKEN_NOT_CONFIGURED"


async def test_real_request_rejects_an_incorrect_local_token() -> None:
    class FakeRuntime:
        settings = make_settings()

        async def translate_real(self, request: object) -> TranslationImageResponse:
            raise AssertionError("Invalid token must be rejected before translation")

    request = valid_request()
    request["source_language"] = "auto"
    request["reading_order"] = "auto"
    app.dependency_overrides[get_runtime_services] = lambda: FakeRuntime()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/v1/translate-image",
                headers={"Authorization": "Bearer incorrect-token"},
                json=request,
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "LOCAL_API_TOKEN_INVALID"


async def test_real_request_maps_redirect_limit_to_safe_502() -> None:
    class RedirectFailureRuntime:
        settings = make_settings()

        async def translate_real(self, request: object) -> TranslationImageResponse:
            _ = request
            raise ImageRedirectError("Image redirect limit exceeded")

    request = valid_request()
    request["source_language"] = "auto"
    request["reading_order"] = "auto"
    app.dependency_overrides[get_runtime_services] = lambda: RedirectFailureRuntime()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/v1/translate-image",
                headers={"Authorization": "Bearer test-local-token"},
                json=request,
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 502
    assert response.json()["detail"] == {"code": "IMAGE_REDIRECT_FAILED"}
