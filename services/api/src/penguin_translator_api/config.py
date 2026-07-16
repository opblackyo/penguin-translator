from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class ConfigurationError(ValueError):
    pass


REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
REPOSITORY_ENV_FILE = REPOSITORY_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ENV_FILE,
        env_file_encoding="utf-8",
        env_prefix="PENGUIN_TRANSLATOR_",
        extra="ignore",
        frozen=True,
        populate_by_name=True,
    )

    translation_provider: str | None = None
    gemini_model: str | None = None
    gemini_api_key: str | None = Field(default=None, validation_alias="GEMINI_API_KEY")
    image_fetch_timeout_seconds: float = Field(default=10, gt=0)
    image_fetch_max_bytes: int = Field(default=10 * 1024 * 1024, gt=0)
    image_fetch_max_redirects: int = Field(default=3, gt=0)
    image_max_pixels: int = Field(default=40_000_000, gt=0)
    dev_allowed_image_hosts: Annotated[frozenset[str], NoDecode] = frozenset()
    ocr_provider: str = "paddleocr"
    paddleocr_language: str = "korean"
    paddleocr_detection_model: str = "PP-OCRv5_mobile_det"
    paddleocr_recognition_model: str = "korean_PP-OCRv5_mobile_rec"
    ocr_min_confidence: float = Field(default=0.5, gt=0, le=1)
    ocr_cache_ttl_seconds: float = Field(default=300, gt=0)
    ocr_cache_max_entries: int = Field(default=64, gt=0)

    @field_validator("dev_allowed_image_hosts", mode="before")
    @classmethod
    def _parse_allowed_hosts(cls, value: Any) -> Any:
        if isinstance(value, str):
            return frozenset(host.strip().lower() for host in value.split(",") if host.strip())
        return value

    @classmethod
    def from_environment(
        cls,
        env_file: Path | str | None = REPOSITORY_ENV_FILE,
        **overrides: Any,
    ) -> Settings:
        try:
            return cls(_env_file=env_file, **overrides)  # pyright: ignore[reportCallIssue]
        except ValidationError as error:
            raise ConfigurationError("Application settings are invalid") from error
