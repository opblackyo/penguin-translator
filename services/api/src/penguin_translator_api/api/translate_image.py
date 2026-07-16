import hashlib
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from penguin_translator_api.contracts.requests import (
    TranslationImageRequest,
    TranslationPageRequest,
)
from penguin_translator_api.contracts.responses import (
    TranslationImageResponse,
    TranslationPageResponse,
    TranslationRegion,
    TranslationWarmupResponse,
)
from penguin_translator_api.services.image_fetcher import (
    ImageFetchError,
    ImageFetchTimeoutError,
    ImageTooLargeError,
    UnsafeImageUrlError,
    UnsupportedImageTypeError,
)
from penguin_translator_api.services.ocr import OCRProviderUnavailableError
from penguin_translator_api.services.pipeline import InvalidImageContentError
from penguin_translator_api.services.runtime import RuntimeServices, get_runtime_services
from penguin_translator_api.services.translator import TranslatorConfigurationError

router = APIRouter(prefix="/v1", tags=["translation"])
bearer_scheme = HTTPBearer(
    bearerFormat="opaque",
    description="All translation requests require the configured private-LAN local token.",
)


def _verify_translation_token(
    credentials: HTTPAuthorizationCredentials, services: RuntimeServices
) -> None:
    configured = services.settings.local_api_token
    if configured is None or not configured.get_secret_value():
        raise HTTPException(
            status_code=503,
            detail={"code": "LOCAL_API_TOKEN_NOT_CONFIGURED"},
        )
    if not secrets.compare_digest(credentials.credentials, configured.get_secret_value()):
        raise HTTPException(
            status_code=401,
            detail={"code": "LOCAL_API_TOKEN_INVALID"},
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/warmup", response_model=TranslationWarmupResponse)
async def warmup_translation(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    services: Annotated[RuntimeServices, Depends(get_runtime_services)],
) -> TranslationWarmupResponse:
    """Initialize the local OCR pipeline without sending content to Gemini."""
    _verify_translation_token(credentials, services)
    return await services.warmup()


@router.post("/translate-page", response_model=TranslationPageResponse)
async def translate_page(
    request: TranslationPageRequest,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    services: Annotated[RuntimeServices, Depends(get_runtime_services)],
) -> TranslationPageResponse:
    """Translate a page with bounded image preparation and cross-image Gemini batches."""
    _verify_translation_token(credentials, services)
    try:
        return await services.translate_page(request)
    except ValueError as error:
        if str(error) == "PAGE_BATCH_TOO_LARGE":
            raise HTTPException(status_code=413, detail={"code": str(error)}) from error
        raise
    except (OCRProviderUnavailableError, TranslatorConfigurationError) as error:
        raise HTTPException(
            status_code=503,
            detail={"code": "REAL_TRANSLATION_NOT_CONFIGURED"},
        ) from error


@router.post("/translate-image", response_model=TranslationImageResponse)
async def translate_image(
    request: TranslationImageRequest,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    services: Annotated[RuntimeServices, Depends(get_runtime_services)],
) -> TranslationImageResponse:
    """Preserve M0 mock requests and execute the M1 real pipeline for auto-language requests."""
    _verify_translation_token(credentials, services)
    if request.source_language != "ja" or request.reading_order != "rtl":
        try:
            return await services.translate_real(request)
        except UnsafeImageUrlError as error:
            raise HTTPException(status_code=400, detail={"code": error.code}) from error
        except ImageFetchTimeoutError as error:
            raise HTTPException(status_code=504, detail={"code": error.code}) from error
        except ImageTooLargeError as error:
            raise HTTPException(status_code=413, detail={"code": error.code}) from error
        except UnsupportedImageTypeError as error:
            raise HTTPException(status_code=415, detail={"code": error.code}) from error
        except InvalidImageContentError as error:
            raise HTTPException(
                status_code=415, detail={"code": "IMAGE_CONTENT_INVALID"}
            ) from error
        except ImageFetchError as error:
            raise HTTPException(status_code=502, detail={"code": error.code}) from error
        except (OCRProviderUnavailableError, TranslatorConfigurationError) as error:
            raise HTTPException(
                status_code=503,
                detail={"code": "REAL_TRANSLATION_NOT_CONFIGURED", "message": str(error)},
            ) from error

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
