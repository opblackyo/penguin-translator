from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

Point = tuple[int, int]
OcrPolygon = tuple[Point, Point, Point, Point]


@dataclass(frozen=True)
class OcrRegion:
    region_id: str
    polygon: OcrPolygon
    source_text: str
    detected_language: str
    orientation: Literal["vertical", "horizontal"]
    detection_confidence: float
    recognition_confidence: float


class OCRProvider(Protocol):
    async def recognize(self, image_bytes: bytes, content_type: str) -> list[OcrRegion]: ...


class OCRProviderUnavailableError(RuntimeError):
    pass
