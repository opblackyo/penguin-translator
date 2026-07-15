# 企鵝翻譯機 / Penguin Translator

企鵝翻譯機是一個將 iPhone Safari 網頁漫畫圖片送往使用者自有後端，再把繁體中文譯文疊回頁面的專案。

目前僅建立 M0 的 Repository Bootstrap 與 Mock 往返骨架。專案尚未接上 OCR、真實翻譯服務或公開 HTTPS 入口，不應視為可產出正確漫畫翻譯的版本。

## 技術組合

- 注入式前端：TypeScript、Preact、Vite Library Mode、Shadow DOM
- Mock API：Python 3.11、FastAPI、Pydantic、uv
- 測試：Vitest、Playwright、pytest、Ruff、Pyright
- 契約：Pydantic Models → OpenAPI JSON → 自動產生 TypeScript

## 開發

需要 Node.js 24、pnpm 10.23.0、uv，後端 Python 3.11 由 uv 管理。

```text
pnpm install --frozen-lockfile
uv sync --project services/api --locked
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

要執行 WebKit 煙霧測試，需先在本機安裝 Playwright WebKit：

```text
pnpm playwright:install
pnpm test:e2e
```

## M0 限制

- Mock API 只檢查 Bearer credential 是否存在，尚未建立正式 token 驗證。
- Mock API 不下載圖片，不儲存 URL 或圖片內容，只回傳可預測的測試區域。
- `extractor.iife.js` 和 `renderer.iife.js` 是自包含 bundle，供 iOS 捷徑中的 **Run JavaScript on Web Page** 使用。
- 捷徑中文動作名稱必須由使用者在實機上確認。

架構、API、隱私邊界與實機紀錄見 [`docs/`](docs/)與 [`reports/validation/`](reports/validation/)。

## License

Apache License 2.0。第三方套件資訊見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
