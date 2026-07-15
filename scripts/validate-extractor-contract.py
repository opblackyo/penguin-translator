import asyncio
import json
import sys
from pathlib import Path

from httpx import ASGITransport, AsyncClient
from pydantic import TypeAdapter, ValidationError

ROOT = Path(__file__).resolve().parents[1]
API_SRC = ROOT / "services/api/src"
sys.path.insert(0, str(API_SRC))

from penguin_translator_api.contracts.requests import (  # noqa: E402
    ImageSource,
    TranslationImageRequest,
)
from penguin_translator_api.main import app  # noqa: E402

EXPECTED_KEYS = {
    "client_image_id",
    "source_kind",
    "source",
    "rendered_width",
    "rendered_height",
}


async def validate() -> None:
    image_payload = TypeAdapter(dict[str, object]).validate_json(sys.stdin.read())
    if set(image_payload) != EXPECTED_KEYS:
        raise AssertionError(
            f"Extractor keys differ from ImageSource: {sorted(image_payload)}"
        )

    image = ImageSource.model_validate(image_payload)
    if image.rendered_width != 400 or image.rendered_height != 600:
        raise AssertionError(
            "Fractional CSS dimensions were not normalized to 400 x 600"
        )

    request_payload: dict[str, object] = {
        "request_id": "123e4567-e89b-12d3-a456-426614174000",
        "page_url": "https://example.com/reader",
        "image": image_payload,
        "source_language": "ja",
        "target_language": "zh-Hant",
        "reading_order": "rtl",
    }
    TranslationImageRequest.model_validate(request_payload)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/v1/translate-image",
            headers={"Authorization": "Bearer local-contract-test-value"},
            json=request_payload,
        )
    if response.status_code != 200:
        raise AssertionError(
            f"FastAPI rejected the actual extractor item: {response.status_code} {response.text}"
        )

    try:
        ImageSource.model_validate({**image_payload, "unknown_field": True})
    except ValidationError as error:
        if not any(detail["type"] == "extra_forbidden" for detail in error.errors()):
            raise AssertionError(
                "Unknown field failed for an unexpected reason"
            ) from error
    else:
        raise AssertionError(
            "ImageSource accepted an unknown field despite extra='forbid'"
        )

    print(
        json.dumps(
            {
                "pydantic": "accepted",
                "fastapi_status": response.status_code,
                "unknown_field": "rejected_extra_forbidden",
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    asyncio.run(validate())
