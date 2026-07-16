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
iPhone Real Translation: PASS
Safari Real Overlay: PASS
Controls: PASS
Scroll / Orientation: PASS
Repeated Injection: PASS
Partial Failure: UNVERIFIED
Final Human Gate: PASS_WITH_ONE_UNVERIFIED_SCENARIO
Final Status: M1_IPHONE_REAL_TRANSLATION_PASS
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
- Physical-device evidence was recorded on an iPhone 12 Pro running iOS 26.5. With
  `source_language = auto` and `reading_order = auto`, the Shortcut returned `ok = true`,
  `rendered_regions = 9`, and no warnings. The Korean, English, and mixed fixtures displayed real
  Traditional Chinese translations; the empty fixture displayed no translation box.
- Safari overlay, hide, show, remove-all, page-scroll alignment, orientation-change alignment, and
  repeated injection passed. Repeated execution left one control panel, produced no duplicate
  overlays, and did not trigger a JavaScript timeout.
- Intentional partial API failure has not been tested on the physical iPhone and remains
  `UNVERIFIED`; its automated coverage is not represented as physical-device evidence.

## Evidence boundary

M1 is a private-LAN fixture vertical slice. This evidence does not establish public deployment,
general compatibility with commercial manga websites, complex-background reconstruction, or
physical-iPhone partial-failure handling.
