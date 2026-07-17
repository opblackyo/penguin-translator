# Edge Private Development Extension

此 Manifest V3 extension 是企鵝翻譯機的私人開發殼層，不是商店發行物。它直接 import
Shortcut client 的 extractor 與 renderer 原始碼；token 只存於 `chrome.storage.local`，API
endpoint 與 token 都不會編進 extension bundle，也不載入任何遠端 JavaScript。

## Build and load unpacked

```powershell
pnpm extension:build
```

1. 在 Edge 開啟 `edge://extensions/`。
2. 開啟 **Developer mode**。
3. 選 **Load unpacked**。
4. 選擇 `F:\github\penguin-translator\apps\edge-extension\dist`。
5. 開啟 extension 的 **Details** → **Extension options**。
6. 輸入本機 API Endpoint、與 `.env` 完全相同的 Local API Token，以及
   `Traditional Chinese (zh-Hant)`。
7. 儲存時只批准該 API origin 的 optional host permission。
8. 開啟 Repository 自製 fixture 或私人測試頁，按工具列的 Penguin Translator 按鈕。

Options 不提供預設 endpoint。extension 只有 `activeTab`、`scripting`、`storage` 三個核心
permissions；HTTP(S) API origin 是使用者在 Options 頁按下 Save 時才請求。每次重新 build
後，在 `edge://extensions/` 對 unpacked extension 按 **Reload**。

## Development workflow

只監看 extension：

```powershell
pnpm extension:watch
```

一次啟動 FastAPI、Vite fixtures／dev harness 與 extension watcher：

```powershell
pnpm dev:translator
```

Developer harness：

```text
http://127.0.0.1:4173/dev-harness/
```

Harness 只允許 `/test-page/`、`/m1-test-page/`、`/m2-test-page/` 三組自製 fixtures，可查看
descriptors、語意 batch request、每張 timing、aggregate progress 與 Gemini call count，並在
iframe 中注入 production renderer。Sanitized diagnostic export 不含 Token、URL、來源文字或
譯文。

完整 desktop-first gate：

```powershell
pnpm test:translator
```

它涵蓋 unit/backend/contracts、production bundles、Chromium unpacked extension、WebKit
adapter round-trip 與 performance benchmark。前三層未通過時不要進行 iPhone 實機測試。

此 extension 不代表公開部署授權、Edge Store 發行、公開 API 或跨使用者服務。真實商業
網站仍可能受 CSP、登入狀態、圖片供應方式與站點 DOM 影響，必須逐站驗證。
