from typing import Literal
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field


class ImageSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_image_id: str = Field(min_length=1, max_length=200)
    source_kind: Literal["url"]
    source: AnyHttpUrl
    rendered_width: int = Field(gt=0)
    rendered_height: int = Field(gt=0)


class TranslationImageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    page_url: AnyHttpUrl
    image: ImageSource
    source_language: Literal["auto", "ja", "ko", "en"]
    target_language: Literal["zh-Hant"]
    reading_order: Literal["auto", "ltr", "rtl"]
