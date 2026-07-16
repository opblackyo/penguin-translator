from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, ValidationError, field_validator
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
    local_api_token: SecretStr | None = None
    image_fetch_timeout_seconds: float = Field(default=10, gt=0)
    image_fetch_max_bytes: int = Field(default=10 * 1024 * 1024, gt=0)
    image_fetch_max_redirects: int = Field(default=3, gt=0)
    image_max_pixels: int = Field(default=40_000_000, gt=0)
    dev_allowed_image_targets: Annotated[frozenset[str], NoDecode] = frozenset()
    ocr_provider: str = "paddleocr"
    paddleocr_language: str = "korean"
    paddleocr_detection_model: str = "PP-OCRv5_mobile_det"
    paddleocr_recognition_model: str = "korean_PP-OCRv5_mobile_rec"
    paddle_pdx_cache_home: Path = Field(
        default=REPOSITORY_ROOT / "services" / "api" / ".cache" / "paddlex",
        validation_alias="PADDLE_PDX_CACHE_HOME",
    )
    ocr_min_confidence: float = Field(default=0.5, gt=0, le=1)
    ocr_cache_ttl_seconds: float = Field(default=300, gt=0)
    ocr_cache_max_entries: int = Field(default=64, gt=0)
    max_concurrent_translations: int = Field(default=2, ge=1, le=3)
    page_batch_max_images: int = Field(default=30, ge=1, le=50)
    gemini_batch_max_regions: int = Field(default=80, ge=1, le=200)
    gemini_batch_max_characters: int = Field(default=12_000, ge=100, le=50_000)

    @field_validator("dev_allowed_image_targets", mode="before")
    @classmethod
    def _parse_allowed_targets(cls, value: Any) -> Any:
        if isinstance(value, str):
            targets: set[str] = set()
            for raw_target in value.split(","):
                raw_target = raw_target.strip().lower()
                if not raw_target:
                    continue
                try:
                    parsed = urlsplit(f"//{raw_target}")
                    port = parsed.port
                except ValueError as error:
                    raise ValueError("Development image target has an invalid port") from error
                if not parsed.hostname or port is None or parsed.path:
                    raise ValueError("Development image targets must be exact host:port values")
                hostname = f"[{parsed.hostname}]" if ":" in parsed.hostname else parsed.hostname
                targets.add(f"{hostname}:{port}")
            return frozenset(targets)
        return value

    @field_validator("paddle_pdx_cache_home", mode="after")
    @classmethod
    def _resolve_paddle_cache_home(cls, value: Path) -> Path:
        return value if value.is_absolute() else REPOSITORY_ROOT / value

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
