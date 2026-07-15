# API Contract

FastAPI Pydantic models under `services/api/src/penguin_translator_api/contracts/` are the only contract source. `scripts/export-openapi.py` writes the OpenAPI document, and `openapi-typescript` generates `packages/contracts/src/generated.ts`.

## Endpoints

- `GET /healthz` returns `{"status":"ok"}`.
- `POST /v1/translate-image` requires an `Authorization: Bearer ...` header and returns one mock region.

The M0 Bearer dependency checks presence and scheme only. It is deliberately not a production authentication system.

`page_url` accepts HTTP and HTTPS URLs during M0 so the self-created page can be opened from an iPhone over the Windows LAN. The API treats both `page_url` and `image.source` as opaque validated URL strings and never fetches them.

The formal `pnpm test:contract-roundtrip` check loads the real TypeScript extractor source, serializes its image item, and sends that exact JSON to Python. Python validates it with `ImageSource`, sends it through the FastAPI ASGI app, and verifies that an injected unknown field is still rejected.
