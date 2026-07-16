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
- Real-page scanning is capped at eight uniformly distributed positions, a 2,200 ms monotonic
  budget with a 100 ms completion reserve, and 40 ms settle intervals. It exits after two stable
  discovery scans once at least three positions were checked, accumulates partial discoveries, and
  reports `LAZY_SCAN_TIME_BUDGET_REACHED` instead of throwing at the deadline.
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
iPhone M2 First Real Page Extractor: FAIL_TIMEOUT
API/OCR/Gemini on First Real Page Attempt: NOT_REACHED
Extractor Timeout Remediation: AUTOMATED_PASS
Remediated iPhone Real Page Retest: UNVERIFIED
Intentional Partial Failure on iPhone: UNVERIFIED
Final Status: READY_FOR_REAL_PAGE_EXTRACTOR_RETEST
```

The automated gate covers 39 frontend unit tests, 47 backend tests, ten Playwright WebKit E2E
scenarios, generated-contract verification, static typing, formatting, lint, and production bundles.
The WebKit suite exercises the self-created M2 long page and keeps the M0/M1 and partial-failure
paths passing. No Gemini request or model download is part of the general gate.

The one requested readonly review initially found auth, bounded-scan, and control-flow gaps plus
background, redirect, and malformed-output edge cases. A follow-up fix commit addresses all six;
the workflow intentionally does not claim a second independent review.

## First private real-page finding

On an iPhone 12 Pro running iOS 26.5, the self-created M2 long-page fixture passed, but the first
private real manga page failed in the initial **Run JavaScript on Web Page** action. iOS reported that
the action took too long to call its completion handler. No image API request, OCR, Gemini request,
or renderer execution occurred. This is recorded as `REAL_PAGE_EXTRACTOR_TIMEOUT`.

The remediation adds a hard elapsed-time exit, adaptive early stability exit, conservative scan
count, short settle interval, partial-result accumulation, and unconditional original-position
restoration. Automated evidence covers expensive handlers, expanding height, continuous insertion,
deadline partial success, completion, diagnostics, and a production WebKit bundle scenario. Physical
real-page compatibility remains unverified until the updated extractor bundle is retested; this does
not claim general compatibility with commercial sites.
