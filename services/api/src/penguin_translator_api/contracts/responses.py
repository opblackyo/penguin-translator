from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt

Point = tuple[NonNegativeInt, NonNegativeInt]
Polygon = Annotated[list[Point], Field(min_length=4, max_length=4)]


class TranslationRegion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region_id: str = Field(min_length=1)
    polygon: Polygon
    source_text: str
    translated_text: str
    orientation: Literal["vertical", "horizontal"]
    background_style: Literal["opaque", "translucent"] = "translucent"
    detection_confidence: float = Field(ge=0, le=1)
    recognition_confidence: float = Field(ge=0, le=1)


class TranslationImageTiming(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fetch_ms: float = Field(ge=0)
    ocr_ms: float = Field(ge=0)
    gemini_ms: float = Field(ge=0)
    total_ms: float = Field(ge=0)
    queue_wait_ms: float = Field(ge=0)
    ocr_cache_hit: bool
    source_region_count: NonNegativeInt
    output_region_count: NonNegativeInt
    gemini_calls: NonNegativeInt


class TranslationImageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    client_image_id: str
    image_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    image_width: int = Field(gt=0)
    image_height: int = Field(gt=0)
    regions: list[TranslationRegion]
    warnings: list[str]
    timing: TranslationImageTiming | None = None


class TranslationPageFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_image_id: str = Field(min_length=1)
    code: str = Field(min_length=1)


class TranslationPageProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total: NonNegativeInt
    completed: NonNegativeInt
    successful: NonNegativeInt
    failed: NonNegativeInt


class TranslationPageTiming(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_ms: float = Field(ge=0)
    fetch_ms: float = Field(ge=0)
    ocr_ms: float = Field(ge=0)
    gemini_ms: float = Field(ge=0)
    queue_wait_ms: float = Field(ge=0)
    cold_start_ms: float = Field(ge=0)
    gemini_calls: NonNegativeInt
    ocr_cache_hits: NonNegativeInt
    warm_execution: bool


class TranslationPageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    results: list[TranslationImageResponse]
    failures: list[TranslationPageFailure]
    progress: TranslationPageProgress
    warnings: list[str]
    timing: TranslationPageTiming


class TranslationWarmupResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ready: bool
    initialization_ms: float = Field(ge=0)
    diagnostic: str | None = None
