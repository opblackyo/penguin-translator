# Troubleshooting (M0)

- Empty extractor result: confirm the page uses visible HTML `<img>` elements and that the image has loaded.
- JavaScript timeout: confirm API work is in **Get Contents of URL**, not inside either JavaScript action.
- No overlay: confirm each response `client_image_id` still matches the image index from extraction.
- Contract check fails: run `pnpm contracts:export` and `pnpm contracts:generate`, then inspect the diff.
- Local backend cannot start: confirm uv selected Python 3.11 from `.python-version` and `services/api/pyproject.toml`.
