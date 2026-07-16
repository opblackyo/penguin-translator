from __future__ import annotations

from pathlib import Path

import pytest

from penguin_translator_api.config import REPOSITORY_ENV_FILE, REPOSITORY_ROOT, Settings


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


def test_allowed_hosts_are_normalized() -> None:
    settings = Settings.from_environment(
        None,
        dev_allowed_image_hosts=" M1-Test.Local,example.test,m1-test.local ",
    )

    assert settings.dev_allowed_image_hosts == frozenset({"m1-test.local", "example.test"})
