from __future__ import annotations

import asyncio
import importlib
from collections.abc import Iterable, Mapping, Sequence
from io import BytesIO
from typing import Any, cast

from PIL import Image

from penguin_translator_api.services.ocr import OCRProviderUnavailableError, OcrRegion


def detect_text_language(text: str, fallback: str) -> str:
    has_hangul = any("\uac00" <= character <= "\ud7a3" for character in text)
    has_latin = any("a" <= character.lower() <= "z" for character in text)
    if has_hangul and has_latin:
        return "mixed"
    if has_hangul:
        return "ko"
    if has_latin:
        return "en"
    return fallback


def _result_payload(result: object) -> Mapping[str, object]:
    payload = getattr(result, "json", result)
    if callable(payload):
        payload = payload()
    if not isinstance(payload, Mapping):
        raise OCRProviderUnavailableError("PaddleOCR returned an unsupported result object")
    typed_payload = cast(Mapping[str, object], payload)
    nested = typed_payload.get("res")
    return cast(Mapping[str, object], nested) if isinstance(nested, Mapping) else typed_payload


def _sequence(payload: Mapping[str, object], key: str) -> Sequence[object]:
    value = payload.get(key, ())
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return cast(Sequence[object], value)
    return ()


def _number(value: object) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return float(str(value))


def _polygon(value: object) -> tuple[tuple[int, int], ...]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return ()
    points: list[tuple[int, int]] = []
    for point in cast(Sequence[object], value):
        if not isinstance(point, Sequence) or isinstance(point, (str, bytes)):
            return ()
        typed_point = cast(Sequence[object], point)
        if len(typed_point) < 2:
            return ()
        points.append((round(_number(typed_point[0])), round(_number(typed_point[1]))))
    return tuple(points)


def normalize_paddle_results(
    results: Iterable[object], *, detected_language: str
) -> list[OcrRegion]:
    normalized: list[OcrRegion] = []
    for result in results:
        payload = _result_payload(result)
        polygons = _sequence(payload, "rec_polys")
        texts = _sequence(payload, "rec_texts")
        recognition_scores = _sequence(payload, "rec_scores")
        detection_scores = _sequence(payload, "dt_scores") or recognition_scores
        orientation_angles = _sequence(payload, "textline_orientation_angles")

        for index, (polygon, text, recognition_score) in enumerate(
            zip(polygons, texts, recognition_scores, strict=False)
        ):
            points = _polygon(polygon)
            if len(points) != 4:
                continue
            detection_score = (
                _number(detection_scores[index])
                if index < len(detection_scores)
                else _number(recognition_score)
            )
            angle = _number(orientation_angles[index]) if index < len(orientation_angles) else 0
            normalized.append(
                OcrRegion(
                    region_id=f"ocr-region-{len(normalized) + 1}",
                    polygon=(points[0], points[1], points[2], points[3]),
                    source_text=str(text),
                    detected_language=detect_text_language(str(text), detected_language),
                    orientation="vertical" if abs(angle) in {90, 270} else "horizontal",
                    detection_confidence=max(0.0, min(1.0, detection_score)),
                    recognition_confidence=max(0.0, min(1.0, _number(recognition_score))),
                )
            )
    return normalized


class PaddleOCRProvider:
    def __init__(
        self,
        *,
        language: str,
        detection_model: str,
        recognition_model: str,
        engine: Any = None,
    ) -> None:
        self._language = language
        if engine is None:
            try:
                paddleocr_module = cast(Any, importlib.import_module("paddleocr"))
            except ImportError as error:
                raise OCRProviderUnavailableError(
                    "PaddleOCR is unavailable; install the optional OCR dependencies"
                ) from error
            try:
                engine = paddleocr_module.PaddleOCR(
                    text_detection_model_name=detection_model,
                    text_recognition_model_name=recognition_model,
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                    enable_mkldnn=False,
                )
            except Exception as error:
                raise OCRProviderUnavailableError(
                    "PaddleOCR model initialization failed"
                ) from error
        self._engine = engine

    async def recognize(self, image_bytes: bytes, content_type: str) -> list[OcrRegion]:
        _ = content_type
        try:
            np = cast(Any, importlib.import_module("numpy"))
        except ImportError as error:
            raise OCRProviderUnavailableError(
                "NumPy is unavailable; install the optional OCR dependencies"
            ) from error
        with Image.open(BytesIO(image_bytes)) as image:
            pixels = np.asarray(image.convert("RGB"))
        try:
            results = cast(Iterable[object], await asyncio.to_thread(self._engine.predict, pixels))
        except Exception as error:
            raise OCRProviderUnavailableError("PaddleOCR inference failed") from error
        return normalize_paddle_results(results, detected_language=self._language)
