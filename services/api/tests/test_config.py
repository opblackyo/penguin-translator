from __future__ import annotations

from pathlib import Path

import pytest

from penguin_translator_api.config import (
    REPOSITORY_ENV_FILE,
    REPOSITORY_ROOT,
    ConfigurationError,
    Settings,
)


def test_repository_env_file_is_anchored_to_source_location() -> None:
    assert REPOSITORY_ENV_FILE == REPOSITORY_ROOT / ".env"
    assert REPOSITORY_ROOT.name == "penguin-translator"


def test_settings_load_dotenv_independently_of_current_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / "local.env"
    env_file.write_text(
        "PENGUIN_TRANSLATOR_TRANSLATION_PROVIDER=gemini\n"
        "PENGUIN_TRANSLATOR_GEMINI_MODEL=dotenv-model\n"
        "GEMINI_API_KEY=dotenv-key\n",
        encoding="utf-8",
    )
    working_directory = tmp_path / "different-working-directory"
    working_directory.mkdir()
    monkeypatch.chdir(working_directory)

    settings = Settings.from_environment(env_file)

    assert settings.translation_provider == "gemini"
    assert settings.gemini_model == "dotenv-model"
    assert settings.gemini_api_key == "dotenv-key"


def test_process_environment_overrides_dotenv(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / "local.env"
    env_file.write_text(
        "PENGUIN_TRANSLATOR_GEMINI_MODEL=dotenv-model\nGEMINI_API_KEY=dotenv-key\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("PENGUIN_TRANSLATOR_GEMINI_MODEL", "process-model")
    monkeypatch.setenv("GEMINI_API_KEY", "process-key")

    settings = Settings.from_environment(env_file)

    assert settings.gemini_model == "process-model"
    assert settings.gemini_api_key == "process-key"


def test_allowed_targets_are_normalized_and_require_ports() -> None:
    settings = Settings.from_environment(
        None,
        dev_allowed_image_targets=" M1-Test.Local:4173,example.test:8080,m1-test.local:4173 ",
    )

    assert settings.dev_allowed_image_targets == frozenset(
        {"m1-test.local:4173", "example.test:8080"}
    )

    with pytest.raises(ConfigurationError):
        Settings.from_environment(None, dev_allowed_image_targets="missing-port.example")


def test_development_cors_origins_are_explicit_origins_only() -> None:
    settings = Settings.from_environment(
        None,
        dev_cors_origins=" http://127.0.0.1:4173/,https://dev.example:4173 ",
    )

    assert settings.dev_cors_origins == (
        "http://127.0.0.1:4173",
        "https://dev.example:4173",
    )
    with pytest.raises(ConfigurationError):
        Settings.from_environment(None, dev_cors_origins="https://example.com/path")
