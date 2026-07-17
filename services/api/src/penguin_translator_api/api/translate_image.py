import hashlib
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from penguin_translator_api.contracts.requests import (
    TranslationImageRequest,
    TranslationPageRequest,
)
from penguin_translator_api.contracts.responses import (
    ShortcutTranslationResponse,
    ShortcutTranslationSummary,
    TranslationImageResponse,
    TranslationPageProgress,
    TranslationPageResponse,
    TranslationPageTiming,
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
from penguin_translator_api.services.shortcut_transport import (
    PAYLOAD_VERSION,
    ShortcutTransportError,
    decode_translation_page_payload,
    encode_renderer_payload,
    parse_shortcut_form,
)
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


async def _read_limited_body(request: Request, maximum_bytes: int) -> bytes:
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > maximum_bytes:
            raise ShortcutTransportError("SHORTCUT_FORM_TOO_LARGE", 413)
        body.extend(chunk)
    return bytes(body)


def _mock_translation(request: TranslationImageRequest) -> TranslationImageResponse:
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


async def _execute_page_translation(
    request: TranslationPageRequest, services: RuntimeServices
) -> TranslationPageResponse:
    if request.source_language == "ja" and request.reading_order == "rtl":
        results = [
            _mock_translation(
                TranslationImageRequest(
                    request_id=request.request_id,
                    page_url=request.page_url,
                    image=image,
                    source_language=request.source_language,
                    target_language=request.target_language,
                    reading_order=request.reading_order,
                )
            )
            for image in request.images
        ]
        return TranslationPageResponse(
            request_id=request.request_id,
            results=results,
            failures=[],
            progress=TranslationPageProgress(
                total=len(results),
                completed=len(results),
                successful=len(results),
                failed=0,
            ),
            warnings=["M0_MOCK_PAGE_RESULT_NO_IMAGE_FETCH"],
            timing=TranslationPageTiming(
                total_ms=0,
                fetch_ms=0,
                ocr_ms=0,
                gemini_ms=0,
                queue_wait_ms=0,
                cold_start_ms=0,
                gemini_calls=0,
                ocr_cache_hits=0,
                warm_execution=True,
            ),
        )
    return await services.translate_page(request)


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
        return await _execute_page_translation(request, services)
    except ValueError as error:
        if str(error) == "PAGE_BATCH_TOO_LARGE":
            raise HTTPException(status_code=413, detail={"code": str(error)}) from error
        raise
    except (OCRProviderUnavailableError, TranslatorConfigurationError) as error:
        raise HTTPException(
            status_code=503,
            detail={"code": "REAL_TRANSLATION_NOT_CONFIGURED"},
        ) from error


@router.post("/shortcut/translate-page", response_model=ShortcutTranslationResponse)
async def translate_page_for_shortcut(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    services: Annotated[RuntimeServices, Depends(get_runtime_services)],
) -> ShortcutTranslationResponse:
    """Decode a thin-Shortcut form request and reuse the page translation pipeline."""
    _verify_translation_token(credentials, services)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/x-www-form-urlencoded":
        raise HTTPException(
            status_code=415,
            detail={"code": "SHORTCUT_FORM_CONTENT_TYPE_INVALID"},
        )
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            parsed_length = int(content_length)
            if parsed_length < 0:
                raise ValueError("negative content length")
            if parsed_length > services.settings.shortcut_form_max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail={"code": "SHORTCUT_FORM_TOO_LARGE"},
                )
        except ValueError as error:
            raise HTTPException(
                status_code=400,
                detail={"code": "SHORTCUT_FORM_INVALID"},
            ) from error
    try:
        payload = parse_shortcut_form(
            await _read_limited_body(request, services.settings.shortcut_form_max_bytes),
            maximum_bytes=services.settings.shortcut_form_max_bytes,
        )
        page_request = decode_translation_page_payload(
            payload,
            maximum_decoded_bytes=services.settings.shortcut_payload_max_decoded_bytes,
        )
        translated = await _execute_page_translation(page_request, services)
    except ShortcutTransportError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={"code": error.code},
        ) from error
    except ValueError as error:
        if str(error) == "PAGE_BATCH_TOO_LARGE":
            raise HTTPException(status_code=413, detail={"code": str(error)}) from error
        raise
    except (OCRProviderUnavailableError, TranslatorConfigurationError) as error:
        raise HTTPException(
            status_code=503,
            detail={"code": "REAL_TRANSLATION_NOT_CONFIGURED"},
        ) from error
    return ShortcutTranslationResponse(
        renderer_payload=encode_renderer_payload(translated),
        payload_version=PAYLOAD_VERSION,
        summary=ShortcutTranslationSummary(
            total=translated.progress.total,
            successful=translated.progress.successful,
            failed=translated.progress.failed,
        ),
    )


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

    return _mock_translation(request)
