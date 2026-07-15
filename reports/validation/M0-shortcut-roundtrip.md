# M0 Shortcut Round-Trip Validation

## Status

```text
Automated Evidence: PASS
Windows API Evidence: PASS
iPhone Shortcut Evidence: UNVERIFIED
Safari Overlay Evidence: UNVERIFIED
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

Latest counts:

```text
Frontend unit: 23 passed
Backend pytest: 6 passed
Playwright WebKit E2E: 6 passed
```

## Windows API Evidence — PASS

- Playwright starts the Python 3.11 virtual-environment executable directly and waits for `GET /healthz` to return success.
- The E2E suite sends real HTTP requests to the Uvicorn process, validates successful and `422` responses, and closes the process during teardown.
- `pnpm backend:dev:lan` is the formal LAN command and binds `0.0.0.0:8000`.
- `pnpm test-page:lan` serves only self-created SVG fixtures from `0.0.0.0:4173`.
- The repository contains placeholders only and no actual Windows LAN address.

This proves the Windows process and HTTP round trip. Reachability from the physical iPhone, the selected Windows network profile, and the firewall prompt remain part of the Human Gate.

## iPhone Shortcut Evidence — UNVERIFIED

The repository now provides a reproducible action-by-action guide in `docs/iphone-shortcut-setup.md`, using official English action names and marking Chinese names as unverified. No physical iPhone has yet confirmed:

- Share Sheet visibility and Safari webpage input.
- The displayed Chinese action names.
- Same-Wi-Fi access to ports `4173` and `8000`.
- Per-image `Get Contents of URL` behavior for a non-2xx response.
- JavaScript timing and completion on the device.

## Safari Overlay Evidence — UNVERIFIED

WebKit automation verifies overlay behavior, but physical Safari has not yet confirmed:

- Region alignment on the iPhone display.
- Overlay movement in the real test page's scroll container.
- Show, hide, remove-all, and repeated Shortcut execution.
- Visual legibility and absence of JavaScript timeout.

## Failures

No unresolved automated failure remains. The intentional partial-failure scenario returns one `422` and confirms that successful responses still render. Record physical-device failures here without changing an UNVERIFIED state to PASS.

## Final Human Gate — PENDING

The user must follow `docs/iphone-shortcut-setup.md` on an iPhone and record:

| Check | Required evidence |
| --- | --- |
| Share Sheet starts Shortcut | iPhone model, iOS version, displayed action names |
| Extractor output | Number of included images and excluded small image |
| LAN API | `/healthz` and per-image response observations |
| Safari overlay | `測試譯文`, alignment, scroll, resize/orientation observation |
| Controls | Hide, show, remove all |
| Repeat run | One control panel only |
| Partial failure | Other successful image remains rendered |
| Timing | No JavaScript Timeout |

Only after all required physical evidence is recorded may `iPhone Shortcut Evidence`, `Safari Overlay Evidence`, and `Final Human Gate` change to PASS.
