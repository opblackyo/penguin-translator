# Privacy and Security

M0 accepts URL strings for contract testing but does not fetch them, log them, or persist them.

M1 adds image downloading only on the real translation path. The downloader:

- accepts HTTP and HTTPS without URL credentials;
- resolves and pins the connection to a validated address;
- rejects loopback, private, link-local, reserved, multicast, and other non-global addresses;
- revalidates every redirect and limits redirect count;
- limits timeout, response bytes, decoded pixels, and accepted image MIME types;
- forwards no Shortcut Authorization, Cookie, or caller headers;
- never logs the complete image URL or query string.

Private/LAN image fetching is disabled by default. Local iPhone development requires
`PENGUIN_TRANSLATOR_DEV_ALLOWED_IMAGE_TARGETS` to contain the exact current test-page `host:port`.
The exception does not authorize other ports on that host, and redirects are checked against the
same boundary. This is a dev-only setting and no actual LAN address may be committed.

The Gemini credential is loaded by the API's centralized settings object. Local development reads
the explicitly located repository-root `.env`; process environment values override `.env` for CI
and deployment. The real `.env` is ignored and must never be tracked, while `.env.example` keeps
`GEMINI_API_KEY` empty. The credential must never be embedded in the Shortcut, JavaScript bundles,
fixtures, snapshots, command output, Actions logs, or Git history. Application logs contain timings
and region counts, not URLs, image bytes, recognized source text, translated text, request
Authorization, or API keys.

Real translation also requires a local random Bearer value from
`PENGUIN_TRANSLATOR_LOCAL_API_TOKEN`. It is loaded only through centralized Settings, compared in
constant time, and must not appear in documentation examples, bundles, reports, logs, or Git. API
startup and the M0 mock path do not require this token, but M1/M2 requests fail clearly without it.

`PADDLE_PDX_CACHE_HOME` is resolved by centralized Settings and applied before model initialization.
The default repository cache directory is ignored; model files are local dependencies and never
application output or committed artifacts.

M1 has no database, Redis, queue, telemetry, tunnel, public deployment, or disk persistence. A
bounded process-memory cache stores only normalized OCR regions keyed by an image-byte hash.

The M0 LAN commands bind ports `8000` and `4173` to all local interfaces for Private-network testing only. They do not configure TLS, a tunnel, router forwarding, or production deployment. No actual LAN address is stored in the repository.
