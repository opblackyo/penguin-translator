from io import BytesIO

import pytest
from PIL import Image

from penguin_translator_api.services.ocr import OCRProviderUnavailableError
from penguin_translator_api.services.paddle_ocr import (
    PaddleOCRProvider,
    detect_text_language,
    normalize_paddle_results,
)


def test_normalizes_polygons_text_confidence_and_orientation() -> None:
    regions = normalize_paddle_results(
        [
            {
                "res": {
                    "rec_polys": [[[10.2, 20.4], [100.1, 20], [100, 60], [10, 60]]],
                    "rec_texts": ["안녕하세요"],
                    "rec_scores": [0.91],
                    "dt_scores": [0.95],
                    "textline_orientation_angles": [0],
                }
            }
        ],
        detected_language="korean",
    )

    assert len(regions) == 1
    assert regions[0].polygon == ((10, 20), (100, 20), (100, 60), (10, 60))
    assert regions[0].source_text == "안녕하세요"
    assert regions[0].detected_language == "ko"
    assert regions[0].orientation == "horizontal"
    assert regions[0].detection_confidence == 0.95
    assert regions[0].recognition_confidence == 0.91


def test_ignores_non_quadrilateral_regions() -> None:
    regions = normalize_paddle_results(
        [{"rec_polys": [[[0, 0], [1, 0], [1, 1]]], "rec_texts": ["text"], "rec_scores": [1]}],
        detected_language="en",
    )

    assert regions == []


def test_detects_korean_english_and_mixed_scripts() -> None:
    assert detect_text_language("안녕하세요", "korean") == "ko"
    assert detect_text_language("Hello", "korean") == "en"
    assert detect_text_language("Penguin 안녕", "korean") == "mixed"


async def test_wraps_model_inference_failure_as_provider_error() -> None:
    class BrokenEngine:
        def predict(self, pixels: object) -> object:
            _ = pixels
            raise RuntimeError("model unavailable")

    provider = PaddleOCRProvider(
        language="korean",
        detection_model="unused",
        recognition_model="unused",
        engine=BrokenEngine(),
    )
    output = BytesIO()
    Image.new("RGB", (16, 16), "white").save(output, format="PNG")

    with pytest.raises(OCRProviderUnavailableError):
        await provider.recognize(output.getvalue(), "image/png")
