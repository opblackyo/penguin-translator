# API Contract

FastAPI Pydantic models under `services/api/src/penguin_translator_api/contracts/` are the only contract source. `scripts/export-openapi.py` writes the OpenAPI document, and `openapi-typescript` generates `packages/contracts/src/generated.ts`.

## Endpoints

- `GET /healthz` returns `{"status":"ok"}`.
- `POST /v1/translate-image` requires an `Authorization: Bearer ...` header and returns one mock region.

The M0 Bearer dependency checks presence and scheme only. It is deliberately not a production authentication system.

The formal `pnpm test:contract-roundtrip` check loads the real TypeScript extractor source, serializes its image item, and sends that exact JSON to Python. Python validates it with `ImageSource`, sends it through the FastAPI ASGI app, and verifies that an injected unknown field is still rejected.
