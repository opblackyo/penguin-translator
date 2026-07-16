# M2 Private Alpha Readiness

## Scope

```text
private Safari webpage
→ bounded long-page extractor
→ exact host:port ImageFetcher
→ PaddleOCR
→ one Gemini batch per image
→ readable renderer overlay
→ isolated per-image failures
```

This milestone is private-LAN readiness only. It does not include public deployment, named-site
bypasses, anti-bot evasion, Edge/Safari extensions, inpainting, accounts, databases, queues, or a
second translation provider.

## Implemented evidence

- Mock and real translation require the exact configured local token; missing and incorrect values
  are diagnostic and no credential is logged or bundled.
- Private image exceptions are exact `host:port`; redirects and DNS results are revalidated.
- HTTPX transport failures map to safe downloader errors.
- Paddle cache configuration is applied before model initialization; malformed output is wrapped.
- Heavy OCR/Gemini work is limited to two concurrent requests by default.
- Extractor supports long pages, bounded lazy scroll activation, `currentSrc`, `srcset`, lazy source
  attributes, query strings, multiple slices, duplicate removal, and generic UI-asset exclusion.
- Backend image-byte sampling labels white regions even for cross-origin page images. Renderer
  provides near-opaque white-region covers, translucent fallback, bounded font fitting,
  horizontal wrapping, source/translation toggle, progress counts, consumed cancel requests,
  next-run failed-ID retry, and
  preserved hide/show/remove, resize, scroll, and repeated-injection behavior.
- All committed fixtures are self-created.

## Status

```text
Automated Evidence: PASS
Windows Private-Alpha Evidence: PASS
Private LAN Test Page: PASS
iPhone M2 Real Page Evidence: UNVERIFIED
Intentional Partial Failure on iPhone: UNVERIFIED
Final Status: READY_FOR_PRIVATE_REAL_PAGE_TEST
```

The automated gate covers 36 frontend unit tests, 47 backend tests, nine Playwright WebKit E2E
scenarios, generated-contract verification, static typing, formatting, lint, and production bundles.
The WebKit suite exercises the self-created M2 long page and keeps the M0/M1 and partial-failure
paths passing. No Gemini request or model download is part of the general gate.

The one requested readonly review initially found auth, bounded-scan, and control-flow gaps plus
background, redirect, and malformed-output edge cases. A follow-up fix commit addresses all six;
the workflow intentionally does not claim a second independent review.
