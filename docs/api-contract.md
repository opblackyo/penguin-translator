# API Contract

FastAPI Pydantic models under `services/api/src/penguin_translator_api/contracts/` are the only contract source. `scripts/export-openapi.py` writes the OpenAPI document, and `openapi-typescript` generates `packages/contracts/src/generated.ts`.

## Endpoints

- `GET /healthz` returns `{"status":"ok"}`.
- `POST /v1/translate-image` requires an `Authorization: Bearer ...` header. `ja + rtl` returns the
  M0 mock region; M1 language/order values run image fetch, OCR, and translation.

The M0 Bearer dependency checks presence and scheme only. Real translation compares the Bearer value
against `PENGUIN_TRANSLATOR_LOCAL_API_TOKEN` using a constant-time comparison. A missing local token
returns diagnostic `503`; a mismatch returns `401`. The token is a private-LAN alpha boundary, not a
public deployment authentication system.

`source_language` accepts `auto`, `ja`, `ko`, and `en`. `reading_order` accepts `auto`, `ltr`, and
`rtl`. `target_language` remains `zh-Hant`.

Each M2 region includes `background_style = opaque | translucent`. The API derives this from the
downloaded image bytes so cross-origin canvas restrictions do not prevent white speech-bubble
coverage; older responses without the field retain the renderer's safe translucent fallback.

`page_url` accepts HTTP and HTTPS URLs so self-created pages can be opened over the Windows LAN. The
M0 path treats both URLs as opaque values. The M1 path fetches only `image.source` through the
SSRF-bounded `ImageFetcher`; it never fetches `page_url`.

Non-public image addresses are denied unless the resolved target matches an exact development-only
`hostname:port` entry. Every redirect target is resolved and checked again. Timeout, size, MIME,
HTTP status, connection, read, TLS, and protocol failures are normalized to bounded diagnostic
responses without returning the source URL.

The formal `pnpm test:contract-roundtrip` check loads the real TypeScript extractor source, serializes its image item, and sends that exact JSON to Python. Python validates it with `ImageSource`, sends it through the FastAPI ASGI app, and verifies that an injected unknown field is still rejected.
