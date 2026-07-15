# M0 Shortcut Round-Trip Validation

## Status

```text
Automated Evidence: PASS
Windows API Evidence: PASS
iPhone Shortcut Evidence: PARTIALLY_VERIFIED
Safari Overlay Evidence: PARTIALLY_VERIFIED
Final Human Gate: PENDING
```

This report covers the deterministic Mock round trip only. It does not claim OCR, translation quality, public deployment, or physical-device completion.

## Automated Evidence — PASS

Validated on Windows with Node.js 24, pnpm, Python 3.11, uv, WebKit, and the repository lockfiles:

- The production extractor bundle executes against the self-created HTTP test page.
- The extractor returns multiple visible image descriptors and excludes the 64×64 image.
- The actual descriptor JSON passes the Pydantic `ImageSource` contract.
- A live Uvicorn/FastAPI process accepts each `/v1/translate-image` request and returns deterministic `測試譯文` regions.
- The production renderer bundle consumes the real API responses and mounts regions on the marked images.
- A `422` response for one image is recorded while other images continue to render.
- Repeated renderer injection leaves one overlay root and one Shadow DOM control panel.
- The control panel hides, shows, and removes all translations.
- Missing-image, element-scroll, window-scroll, resize, ResizeObserver, success completion, and error completion paths are covered.
- Bundle inspection rejects credential terms, the API endpoint path, localhost/private-host literals, and fixed API URLs.
- Contract generation and checked-in OpenAPI/TypeScript artifacts agree with FastAPI.

Formal command chain:

```text
pnpm install --frozen-lockfile
pnpm backend:sync
pnpm format:check
pnpm lint
pnpm backend:format:check
pnpm backend:lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm format:check
```

Latest counts after the iPhone extractor fix:

```text
Frontend unit: 28 passed
Backend pytest: 6 passed
Playwright WebKit E2E: 7 passed
```

## Windows API Evidence — PASS

- Playwright starts the Python 3.11 virtual-environment executable directly and waits for `GET /healthz` to return success.
- The E2E suite sends real HTTP requests to the Uvicorn process, validates successful and `422` responses, and closes the process during teardown.
- `pnpm backend:dev:lan` is the formal LAN command and binds `0.0.0.0:8000`.
- `pnpm test-page:lan` serves only self-created SVG fixtures from `0.0.0.0:4173`.
- The repository contains placeholders only and no actual Windows LAN address.

This proves the Windows process and HTTP round trip. Same-Wi-Fi reachability from the physical
iPhone has also been observed, but the LAN address remains intentionally absent from this report.

## iPhone Shortcut Evidence — PARTIALLY VERIFIED

Physical-device observations supplied by the Owner:

- Device: iPhone 12 Pro.
- iOS: 26.5.
- Safari Share Sheet starts the `企鵝翻譯機` Shortcut.
- The Windows test page and API are reachable over the same Wi-Fi.
- Extractor diagnostics reported `total_images = 4` and `accepted_images = 3`.
- `page-one`, `page-two`, and `scroll-page` were accepted.
- The 64×64 `small-image` was correctly rejected by the size rule.
- The three accepted descriptors entered **Repeat with Each** and produced three successful
  `/v1/translate-image` requests.
- The displayed Chinese label `重複` has been observed for **Repeat with Each**. Other Chinese
  action names remain `UNVERIFIED` and must not be inferred from translations.

Still `UNVERIFIED` on the physical device:

- Per-image `Get Contents of URL` behavior for a non-2xx response.
- JavaScript Timeout status and end-to-end timing.

## Safari Overlay Evidence — PARTIALLY VERIFIED

Physical Safari returned this renderer completion:

```text
version = 0.1.0-m0
rendered_regions = 3
ok = true
warnings = []
```

Three visible `測試譯文` overlays and the Shadow DOM control panel appeared on the self-created
test page.

Still `UNVERIFIED` on the physical device:

- **Hide Translations**, **Show Translations**, and **Remove All** behavior.
- Alignment after page scrolling.
- Alignment after scrolling the green element-scroll container.
- Alignment after orientation change.
- Control-panel count after running the Shortcut twice.
- Visual legibility and absence of JavaScript Timeout.

## Failures

No unresolved automated failure remains. The intentional partial-failure scenario returns one `422`
and confirms that successful responses still render. The equivalent partial-failure behavior remains
`UNVERIFIED` on the physical device.

## Final Human Gate — PENDING

The remaining physical checks are:

| Check | Required evidence |
| --- | --- |
| Displayed action names | Record names shown by iOS 26.5; do not guess translations |
| Safari overlay | Alignment after page, element-container, and orientation changes |
| Controls | Hide, show, remove all |
| Repeat run | One control panel only |
| Partial failure | Other successful image remains rendered |
| Timing | No JavaScript Timeout |

Only after all required physical evidence is recorded may `iPhone Shortcut Evidence`, `Safari Overlay Evidence`, and `Final Human Gate` change to PASS.
