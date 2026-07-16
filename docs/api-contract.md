# API Contract

FastAPI Pydantic models under `services/api/src/penguin_translator_api/contracts/` are the only contract source. `scripts/export-openapi.py` writes the OpenAPI document, and `openapi-typescript` generates `packages/contracts/src/generated.ts`.

## Endpoints

- `GET /healthz` returns `{"status":"ok"}`.
- `POST /v1/translate-image` requires an `Authorization: Bearer ...` header. `ja + rtl` returns the
  M0 mock region; M1 language/order values run image fetch, OCR, and translation.

The M0 Bearer dependency checks presence and scheme only. It is deliberately not a production authentication system.

`source_language` accepts `auto`, `ja`, `ko`, and `en`. `reading_order` accepts `auto`, `ltr`, and
`rtl`. `target_language` remains `zh-Hant`.

`page_url` accepts HTTP and HTTPS URLs so self-created pages can be opened over the Windows LAN. The
M0 path treats both URLs as opaque values. The M1 path fetches only `image.source` through the
SSRF-bounded `ImageFetcher`; it never fetches `page_url`.

The formal `pnpm test:contract-roundtrip` check loads the real TypeScript extractor source, serializes its image item, and sends that exact JSON to Python. Python validates it with `ImageSource`, sends it through the FastAPI ASGI app, and verifies that an injected unknown field is still rejected.
