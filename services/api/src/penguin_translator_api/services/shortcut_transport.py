from __future__ import annotations

import base64
import binascii
import json
import re
from urllib.parse import parse_qsl

from pydantic import ValidationError

from penguin_translator_api.contracts.requests import TranslationPageRequest
from penguin_translator_api.contracts.responses import TranslationPageResponse

PAYLOAD_VERSION = "m2.2-v1"
BASE64URL_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


class ShortcutTransportError(ValueError):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def parse_shortcut_form(body: bytes, *, maximum_bytes: int) -> str:
    if len(body) > maximum_bytes:
        raise ShortcutTransportError("SHORTCUT_FORM_TOO_LARGE", 413)
    try:
        text = body.decode("ascii")
        fields = parse_qsl(
            text,
            keep_blank_values=True,
            strict_parsing=True,
            max_num_fields=2,
            encoding="ascii",
            errors="strict",
        )
    except (UnicodeError, ValueError) as error:
        raise ShortcutTransportError("SHORTCUT_FORM_INVALID", 400) from error
    if len(fields) != 1 or fields[0][0] != "payload" or not fields[0][1]:
        raise ShortcutTransportError("SHORTCUT_FORM_INVALID", 400)
    return fields[0][1]


def _decode_base64url(value: str, *, maximum_decoded_bytes: int) -> bytes:
    maximum_encoded_length = ((maximum_decoded_bytes + 2) // 3) * 4
    if len(value) > maximum_encoded_length:
        raise ShortcutTransportError("SHORTCUT_PAYLOAD_TOO_LARGE", 413)
    if not BASE64URL_PATTERN.fullmatch(value):
        raise ShortcutTransportError("SHORTCUT_PAYLOAD_BASE64_INVALID", 400)
    padding = "=" * (-len(value) % 4)
    try:
        decoded = base64.b64decode((value + padding).encode("ascii"), altchars=b"-_", validate=True)
    except (ValueError, binascii.Error) as error:
        raise ShortcutTransportError("SHORTCUT_PAYLOAD_BASE64_INVALID", 400) from error
    if len(decoded) > maximum_decoded_bytes:
        raise ShortcutTransportError("SHORTCUT_PAYLOAD_TOO_LARGE", 413)
    return decoded


def decode_translation_page_payload(
    value: str, *, maximum_decoded_bytes: int
) -> TranslationPageRequest:
    decoded = _decode_base64url(value, maximum_decoded_bytes=maximum_decoded_bytes)
    try:
        document = json.loads(decoded.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ShortcutTransportError("SHORTCUT_PAYLOAD_JSON_INVALID", 400) from error
    try:
        return TranslationPageRequest.model_validate(document)
    except ValidationError as error:
        raise ShortcutTransportError("SHORTCUT_PAYLOAD_REQUEST_INVALID", 422) from error


def encode_renderer_payload(response: TranslationPageResponse) -> str:
    serialized = response.model_dump_json().encode("utf-8")
    return base64.urlsafe_b64encode(serialized).decode("ascii").rstrip("=")
