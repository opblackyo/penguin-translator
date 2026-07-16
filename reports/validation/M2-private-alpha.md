# M2 Private Alpha Readiness

## Scope

```text
private Safari webpage
→ bounded long-page extractor
→ exact host:port ImageFetcher
→ PaddleOCR
→ cross-image bounded Gemini batches
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
- M2.1 accepts one authenticated page request, prepares images with a bounded worker pool, preserves
  deterministic result ordering, isolates per-image failures, and translates accepted OCR regions
  across images in explicit region-count and character-count chunks.
- OCR warmup initializes only the local pipeline. Timing responses and logs contain aggregate
  durations/counts and never image URLs, source/translated text, keys, or tokens.
- Conservative region grouping joins only close, substantially horizontally-overlapping lines with
  compatible orientation and detected language. Renderer layout suppresses near-identical regions,
  centers bounded expansion, avoids collisions where space exists, uses solid white bubble covers,
  and reports `完成` when all images finish.

## Status

```text
Automated Evidence: PASS
Windows Private-Alpha Evidence: PASS
Private LAN Test Page: PASS
iPhone M2 First Real Page Extractor: FAIL_TIMEOUT
Extractor Timeout Remediation Physical Retest: PASS_TO_BACKEND
Real HTTPS Image Fetch: FAIL_SNI_TYPE
HTTPS SNI String Remediation: AUTOMATED_PASS
Remediated Real HTTPS Image Retest: PASS (15 / 15, 0 failures)
Real Page Functional Path: PASS
Pre-M2.1 Physical Performance: FAIL (several minutes)
Pre-M2.1 Overlay Readability: PARTIAL
M2.1 Deterministic 15-Image Benchmark: PASS
M2.1 iPhone Performance Retest: UNVERIFIED
M2.1 Overlay Readability Retest: UNVERIFIED
Intentional Partial Failure on iPhone: UNVERIFIED
Final Status: READY_FOR_M2_PERFORMANCE_IPHONE_RETEST
```

The complete automated gate covers 45 frontend unit tests, 59 backend tests, ten Playwright WebKit
E2E scenarios, generated-contract verification, static typing, formatting, lint, and production
bundles.
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

## First real HTTPS image-fetch finding

The physical extractor remediation retest advanced past Safari extraction and reached FastAPI on the
same iPhone. Every real HTTPS image then failed before OCR or Gemini. The traceback reached HTTPcore
and AnyIO TLS setup and ended with `AttributeError: 'bytes' object has no attribute 'encode'`.

`ImageFetcher` pinned the connection to the validated IP and correctly retained the original
hostname for Host/SNI, but encoded the HTTPX `sni_hostname` extension to bytes. HTTPcore passes that
extension to AnyIO as `server_hostname: str | None`; AnyIO performs its own IDNA encoding. The fix
keeps DNS pinning, Host, SNI, redirect revalidation, SSRF policy, timeout, and byte limits unchanged,
while passing the ASCII hostname as `str`. Non-ASCII IDNs are explicitly rejected before transport
until an intentional IDN policy is added.

Automated evidence asserts HTTPS SNI is a string at the transport boundary, HTTP has no SNI, pinned
URLs retain resolved IPs, original Host headers and non-default ports remain correct, and IDNs fail
safely. The subsequent 15 / 15 physical HTTPS run passed; no general real-site compatibility is
claimed.

## M2.1 real-page performance and readability finding

The SNI-remediated physical run on the same iPhone 12 Pro / iOS 26.5 completed all 15 private-page
images with zero failures and displayed real translated overlays. This closes the real HTTPS
functional path, but the sequential Shortcut took several minutes. Source artwork remained visible
through some covers, adjacent OCR boxes overlapped, and the completed panel still used an in-progress
label. The finding is `REAL_PAGE_FUNCTIONAL_PASS` with performance remediation required and overlay
readability partial—not daily-use readiness.

M2.1 changes the Shortcut-facing contract to one page request and lets the backend use a bounded
worker pool. Accepted OCR text is translated across images in chunks capped by 80 regions and 12,000
characters by default, so a typical 15-image page can use approximately one to three Gemini calls.
The legacy single-image endpoint remains compatible. One image fetch/OCR failure produces a safe
per-image failure and does not cancel other images.

The opt-in deterministic benchmark models a self-created 15-image equivalent workload without
network, commercial content, Paddle model downloads, or Gemini calls. Three-run medians recorded:

```text
sequential cold: 915.1 ms
sequential warm: 476.7 ms
batch concurrency 2 cold: 378.9 ms (58.6% improvement)
batch concurrency 2 warm: 126.0 ms (73.6% improvement)
batch concurrency 3 cold: 274.0 ms (70.1% improvement)
batch concurrency 3 warm: 99.5 ms (79.1% improvement)
```

This passes the 50% scheduling benchmark gate but is not a physical latency claim. The Owner must
replace both production bundles, migrate the Shortcut to `/v1/translate-page`, and record cold/warm
real-page timing plus overlay readability before the project can claim daily-use performance.
