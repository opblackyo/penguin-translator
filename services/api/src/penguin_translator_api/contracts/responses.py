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
    detection_confidence: float = Field(ge=0, le=1)
    recognition_confidence: float = Field(ge=0, le=1)


class TranslationImageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    client_image_id: str
    image_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    image_width: int = Field(gt=0)
    image_height: int = Field(gt=0)
    regions: list[TranslationRegion]
    warnings: list[str]
