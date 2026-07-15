# Privacy and Security

M0 accepts URL strings for contract testing but does not fetch them, log them, or persist them. It has no cache, database, OCR model, translation provider, telemetry, tunnel, or deployment hostname.

Before image downloading is added in M2, the implementation must enforce DNS and redirect validation, reject non-public address ranges, limit bytes/pixels/time/concurrency, inspect content bytes and Content-Type, and avoid URL query strings in logs.

Secrets must remain in the iOS Shortcut network action or a later confirmed runtime configuration. They must never be embedded in either JavaScript bundle, fixtures, snapshots, Actions logs, or Git history.
