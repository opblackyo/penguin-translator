# M2 Private Alpha Readiness

## Scope

```text
private Safari/Edge webpage
→ shared bounded long-page extractor
→ Shortcut-safe adapter or Edge background request
→ exact host:port ImageFetcher
→ PaddleOCR
→ cross-image bounded Gemini batches
→ shared renderer overlay
→ isolated per-image failures
```

This milestone is private-LAN readiness only. It includes a private, unpacked Edge development
extension, but does not include public deployment, named-site bypasses, anti-bot evasion, extension
store distribution, inpainting, accounts, databases, queues, or a second translation provider.

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
- M2.2 adds a strict, size-limited Base64URL form adapter that authenticates before reading the
  request body, validates the decoded value with the existing page contract, reuses the M2.1 page
  pipeline, and returns one encoded renderer payload plus a safe aggregate summary.
- The production extractor emits the complete semantic request as `shortcut_payload`; the renderer
  wrapper accepts one marked Base64URL value. The previous M2.1 hand-built nested Shortcut JSON
  flow is deprecated because physical iOS testing collapsed the image list into one dictionary and
  produced a `422 list_type` response.
- A private Manifest V3 Edge development extension and a localhost desktop harness reuse the shared
  extractor and renderer. Endpoint and token are runtime settings, never production bundle values.

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
M2.2 Shortcut Adapter Automated Evidence: PASS
M2.2 Chromium Unpacked Extension Evidence: PASS
M2.2 WebKit Adapter Round-Trip Evidence: PASS
M2.2 Desktop Harness Evidence: PASS
M2.2 Thin iPhone Shortcut Evidence: UNVERIFIED
Final Status: READY_FOR_THIN_SHORTCUT_RETEST
```

The complete automated gate covers 51 frontend unit tests, 68 backend tests, one Chromium
unpacked-extension scenario, 12 Playwright WebKit scenarios, generated-contract verification,
static typing, formatting, lint, production bundles, and the deterministic M2 batch benchmark.
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
sequential cold: 909.5 ms
sequential warm: 470.6 ms
batch concurrency 2 cold: 380.7 ms (58.1% improvement)
batch concurrency 2 warm: 129.1 ms (72.6% improvement)
batch concurrency 3 cold: 275.5 ms (69.7% improvement)
batch concurrency 3 warm: 102.2 ms (78.3% improvement)
```

This passes the 50% scheduling benchmark gate but is not a physical latency claim. The Owner must
replace both production bundles, migrate the Shortcut to `/v1/translate-page`, and record cold/warm
real-page timing plus overlay readability before the project can claim daily-use performance.

## M2.2 Shortcut transport and desktop-first workflow

The M2.1 physical Shortcut attempt proved that nested Dictionary/List construction is not a stable
transport boundary: although extraction and Repeat appeared correct, iOS serialized `images` as a
single dictionary instead of a list. The backend correctly rejected that shape with `422
list_type`. Continuing to hand-build or debug nested request objects on the phone is deprecated.

The thin Shortcut now carries only `shortcut_payload` to
`/v1/shortcut/translate-page` as one `application/x-www-form-urlencoded` field, then carries only
`renderer_payload` into the production renderer wrapper. Base64URL is unpadded, line-break-free,
UTF-8 JSON. The adapter applies bounded form and decoded-payload limits, exact Bearer authentication,
safe 4xx errors, existing Pydantic validation, and the existing page translation pipeline. It does
not log the payload, image URLs, source/translated text, or credentials.

Development and debugging now happen in the unpacked Edge extension and localhost harness first.
Automated Chromium verifies the actual unpacked Manifest V3 flow; WebKit verifies extractor bundle
→ adapter → renderer wrapper against self-created fixtures, including repeated renderer injection and
partial failure. The iPhone is the final physical gate only. The thin iOS 26.5 Shortcut, real-page
overlay alignment, rotation/scroll behavior, and physical timing remain `UNVERIFIED`; compatibility
with commercial sites remains site-specific, and public deployment is not authorized.
