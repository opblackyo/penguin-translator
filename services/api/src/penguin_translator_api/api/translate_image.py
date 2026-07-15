import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from penguin_translator_api.contracts.requests import TranslationImageRequest
from penguin_translator_api.contracts.responses import TranslationImageResponse, TranslationRegion

router = APIRouter(prefix="/v1", tags=["translation"])
bearer_scheme = HTTPBearer(
    bearerFormat="opaque",
    description="M0 checks only that a Bearer credential is present.",
)


@router.post("/translate-image", response_model=TranslationImageResponse)
async def translate_image(
    request: TranslationImageRequest,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> TranslationImageResponse:
    """Return a deterministic region without downloading or retaining the image."""
    _ = credentials
    width = request.image.rendered_width
    height = request.image.rendered_height
    left = max(1, round(width * 0.15))
    top = max(1, round(height * 0.15))
    right = max(left + 1, round(width * 0.55))
    bottom = max(top + 1, round(height * 0.45))
    image_id = hashlib.sha256(str(request.image.source).encode()).hexdigest()

    return TranslationImageResponse(
        request_id=request.request_id,
        client_image_id=request.image.client_image_id,
        image_id=image_id,
        image_width=width,
        image_height=height,
        regions=[
            TranslationRegion(
                region_id="mock-region-1",
                polygon=[(left, top), (right, top), (right, bottom), (left, bottom)],
                source_text="テスト",
                translated_text="測試譯文",
                orientation="vertical",
                detection_confidence=1.0,
                recognition_confidence=1.0,
            )
        ],
        warnings=["M0_MOCK_RESULT_NO_IMAGE_FETCH"],
    )
