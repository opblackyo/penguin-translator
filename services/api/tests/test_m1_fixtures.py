from __future__ import annotations

from pathlib import Path

from PIL import Image

from penguin_translator_api.services.ocr import OcrRegion

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "apps/shortcut-client/m1-test-page/assets"


def fake_fixture_regions(name: str) -> list[OcrRegion]:
    results = {
        "korean-dialogue.png": [
            OcrRegion(
                "ko-1",
                ((100, 100), (500, 100), (500, 200), (100, 200)),
                "안녕하세요!",
                "ko",
                "horizontal",
                0.95,
                0.99,
            )
        ],
        "english-dialogue.png": [
            OcrRegion(
                "en-1",
                ((100, 100), (500, 100), (500, 200), (100, 200)),
                "Are you ready?",
                "en",
                "horizontal",
                0.95,
                0.99,
            )
        ],
        "mixed-dialogue.png": [
            OcrRegion(
                "mixed-1",
                ((100, 100), (600, 100), (600, 200), (100, 200)),
                "Penguin, 안녕!",
                "mixed",
                "horizontal",
                0.95,
                0.99,
            )
        ],
        "empty-page.png": [],
    }
    return results[name]


def test_committed_fixtures_and_fake_ocr_cover_m1_languages_without_models() -> None:
    observed_languages: set[str] = set()
    for name in (
        "korean-dialogue.png",
        "english-dialogue.png",
        "mixed-dialogue.png",
        "empty-page.png",
    ):
        path = FIXTURES / name
        with Image.open(path) as image:
            assert image.size == (900, 1200)
            assert image.format == "PNG"
        regions = fake_fixture_regions(name)
        observed_languages.update(region.detected_language for region in regions)
        assert all(0 <= x < 900 and 0 <= y < 1200 for region in regions for x, y in region.polygon)

    assert observed_languages == {"ko", "en", "mixed"}
    assert fake_fixture_regions("empty-page.png") == []
