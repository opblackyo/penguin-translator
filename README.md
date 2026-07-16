# 企鵝翻譯機 / Penguin Translator

企鵝翻譯機是一個將 iPhone Safari 網頁漫畫圖片送往使用者自有後端，再把繁體中文譯文疊回頁面的專案。

目前已完成 M0 Mock 往返的自動化實作，並在 iPhone 12 Pro / iOS 26.5 上確認 Safari
Share Sheet、三張圖片 extractor/API 往返、三個 Mock 譯文覆蓋與 Shadow DOM 控制列。
控制按鈕、捲動／旋轉定位、重複執行、timeout 與部分 API 失敗仍待實機驗證，因此 Final
Human Gate 維持 PENDING。專案尚未接上 OCR、真實翻譯服務或公開 HTTPS 入口，不應視為
可產出正確漫畫翻譯的版本。

M1 私人 LAN 垂直切片已在 iPhone 12 Pro / iOS 26.5 完成自製韓文、英文、混合與空白
fixture 實測：安全圖片取得、PaddleOCR、Gemini structured batch translation 與既有 renderer
共顯示九個繁中區域。Safari overlay、顯示／隱藏／移除、頁面捲動、旋轉與重複注入已通過，
且沒有 JavaScript timeout；實機 intentional partial API failure 仍為 UNVERIFIED。這不代表公開
部署、真實商業漫畫網站全面相容或複雜背景修補完成。

M2 正在準備私人 Alpha：加入精確本機 token、`host:port` 圖片例外、統一下載錯誤、最多
兩張重型請求並行、長頁／lazy／srcset／duplicate extractor、自製長條測試頁，以及更不透出
原文的翻譯框與進度控制。M2 仍不包含公開部署、特定網站繞過、Extension 或 inpainting。

## 技術組合

- 注入式前端：TypeScript、Preact、Vite Library Mode、Shadow DOM
- API：Python 3.11、FastAPI、Pydantic、PaddleOCR、Google Gen AI SDK、uv
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

本機 M1 Gemini 設定從 Repository 根目錄的 `.env` 載入；該檔案已被 Git ignore，且
process environment 的同名值具有較高優先權。請從 `.env.example` 複製設定並只在 `.env`
填入真實 `GEMINI_API_KEY`。API 沒有 Key 時仍可啟動，一般測試也不會呼叫 Gemini；只有
明確執行 `pnpm backend:test:gemini-live` 才會發出 live request。

真實翻譯另外要求 `.env` 中的 `PENGUIN_TRANSLATOR_LOCAL_API_TOKEN`；Shortcut 使用完全相同
的本機隨機值。Private image 例外使用精確 `PENGUIN_TRANSLATOR_DEV_ALLOWED_IMAGE_TARGETS`
`host:port` 清單，例如 `<WINDOWS_LAN_IPV4>:4173`，不得將實際值 Commit。

要執行 WebKit 煙霧測試，需先在本機安裝 Playwright WebKit：

```text
pnpm playwright:install
pnpm test:e2e
```

同一 Wi-Fi 的 M0 實機測試使用兩個 PowerShell 視窗：

```text
pnpm backend:dev:lan
pnpm test-page:lan
```

Mock API 使用 repository script 明確設定的 `8000` port，自拍 SVG 測試頁使用 `4173` port。實際 LAN IPv4 與完整 iPhone 捷徑步驟見 [`docs/iphone-shortcut-setup.md`](docs/iphone-shortcut-setup.md)，不得將實際 LAN IP 寫入 Git。

## M0 限制

- M2 的 Mock 與真實翻譯路徑都以 constant-time comparison 驗證本機設定的 Bearer token；
  token 未設定時服務仍可啟動，但翻譯 endpoint 會回傳診斷性 `503`。
- Mock API 不下載圖片，不儲存 URL 或圖片內容，只回傳可預測的測試區域。
- `extractor.iife.js` 和 `renderer.iife.js` 是自包含 bundle，供 iOS 捷徑中的 **Run JavaScript on Web Page** 使用。
- 捷徑中文動作名稱必須由使用者在實機上確認。

架構、API、隱私邊界與實機紀錄見 [`docs/`](docs/)與 [`reports/validation/`](reports/validation/)。

## License

Apache License 2.0。第三方套件資訊見 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
