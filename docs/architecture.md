# M0 Architecture

```text
iPhone Safari
  → Run JavaScript on Web Page (extractor.iife.js)
  → iOS Shortcut receives visible image descriptors
  → Get Contents of URL sends each descriptor to the Mock API
  → Run JavaScript on Web Page (renderer.iife.js)
  → Preact overlay plus a Shadow DOM control panel
```

Safari JavaScript does not wait for the API. The Bearer value remains in the Shortcut network action and is never included in either bundle.

M0 does not download source images. The API calculates a deterministic mock polygon from the rendered dimensions so the data flow and coordinate mapping can be validated before any OCR dependency is introduced.

For LAN-only M0 validation, `pnpm backend:dev:lan` binds the Mock API to `0.0.0.0:8000`, and `pnpm test-page:lan` serves self-created SVG fixtures from `0.0.0.0:4173`. The request contract accepts HTTP or HTTPS page URLs because the first physical test intentionally uses a private same-Wi-Fi HTTP page. Neither URL is fetched by the API.

## M1 vertical slice

M1 keeps the M0 path intact and selects behavior from the existing request fields:

```text
source_language = ja + reading_order = rtl
  → deterministic M0 response

source_language = auto/ko/en or reading_order = auto/ltr
  → ImageFetcher
  → PaddleOCR provider
  → one Gemini batch translation per image
  → existing TranslationImageResponse and renderer
```

`ImageFetcher`, `OCRProvider`, and `Translator` are independent boundaries; the route does not own
download or model logic. The PaddleOCR model is initialized once per API process. OCR results are
cached briefly by SHA-256 of image bytes, but neither image bytes nor translations are written to
disk. The model cache is a local, ignored opt-in dependency cache and is not application data.
