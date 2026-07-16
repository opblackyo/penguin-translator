# M1 Real Translation Vertical Slice

## Status

```text
No-secret unit/contract/build path: PASS
Playwright WebKit E2E: PASS
PaddleOCR local smoke: PASS
Gemini live smoke: PASS
Live FastAPI round trip: PASS
Automated Evidence: PASS
Windows API Evidence: PASS
iPhone real translation: UNVERIFIED
Safari real overlay: UNVERIFIED
Final Human Gate: PENDING
Final status: READY_FOR_IPHONE_REAL_TRANSLATION_TEST
```

## Implemented path

```text
self-created Korean/English PNG
→ SSRF-bounded ImageFetcher
→ PaddleOCR quadrilateral regions
→ one Gemini structured-output batch per image
→ TranslationImageResponse
→ existing renderer
```

The existing `ja + rtl` request remains the deterministic M0 path. A request using
`source_language = auto` and `reading_order = auto` selects the M1 path. Missing runtime OCR or
Gemini configuration returns a diagnostic error and never falls back to `測試譯文`.

## Evidence boundaries

- General CI uses fake OCR/translation results and performs no network request or model download.
- Node 24 validation passed 28 frontend unit tests and 31 backend tests, contract checks, type checks,
  lint, formatting, production build, and eight Playwright WebKit E2E scenarios.
- The selected PaddleOCR smoke is opt-in and passed on all four self-created fixtures.
- The Gemini implementation uses one structured-output call for all regions and verifies exact
  `region_id` set equality.
- Repository-root `.env` loading now uses centralized `pydantic-settings`; process environment
  values override `.env`, and tests verify loading is independent of the current working directory.
  Secret checks report only `GEMINI_API_KEY configured=true/false`.
- The Gemini live smoke passed with one `gemini-3.1-flash-lite` request, three non-empty translated
  regions, and exact region-ID preservation. No credential value or derivative was printed.
- The local FastAPI round trip passed against the self-created Korean fixture: the real downloader,
  PaddleOCR, one Gemini batch, and response contract produced three translated regions with no
  warnings. Both loopback-only test services were stopped afterward.
- No iPhone M1 test has been performed. M0 physical-device evidence remains in the M0 report.

## Remaining gates

1. Change only `source_language` and `reading_order` to `auto` in the existing iPhone Shortcut.
2. Record real translated overlays on the iPhone.
