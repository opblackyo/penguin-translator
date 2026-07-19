# iOS Safari Userscripts Setup (M2.3)

M2.3 停止使用 iOS Shortcuts。Windows 仍使用既有 Edge unpacked extension；iPhone Safari
改用開源的 Userscripts 延伸功能載入單一、自包含的 `penguin-translator.user.js`。

Userscripts 官方文件確認 iOS 可從 Safari 開啟 path 以 `.user.js` 結尾的 URL，再由延伸功能
popup 顯示安裝提示。企鵝翻譯機不使用遠端 `@require`，extractor、request shell 與 renderer
都已打包在同一檔案中。

官方參考：

- Userscripts App Store：https://apps.apple.com/tw/app/userscripts/id1463298887
- Userscripts iOS 使用與安裝：https://github.com/quoid/userscripts#ios-ipados
- Apple Safari 延伸功能：https://support.apple.com/zh-tw/guide/iphone/iphab0432bf6/ios

## 1. Build 與目前保守 match

從 Repository root 執行：

```powershell
pnpm userscript:build
```

正式輸出固定為：

```text
apps/userscript/dist/penguin-translator.user.js
```

輸出只匹配 Repository 自製 LAN fixtures 的明確 path，以及 Owner 核准的私人驗收 origin：

```text
http://*/test-page/*
http://*/m1-test-page/*
http://*/m2-test-page/*
https://omegascans.org/*
```

它不包含 `https://*/*`、`https://*.omegascans.org/*`、實際 LAN IP、API endpoint 或 token。
`@match` 只決定 script 可在哪些頁面執行，Safari 的延伸功能網站權限仍應只允許實際驗收
站點。若網站日後改用其他 hostname，必須另行明確核准，不可自動擴張。

## 2. 在 iPhone 安裝 Userscripts

1. 從 App Store 安裝 **Userscripts**。
2. 第一次開啟 Userscripts App。新版會建立預設 scripts directory；若 App 要求，選擇一個
   本機或 iCloud Drive 資料夾。
3. 開啟 iPhone **設定** → **Apps** → **Safari** → **Extensions** → **Userscripts**，啟用
   延伸功能。也可在 Safari 的頁面選單開啟 **Manage Extensions**。
4. 網站權限只選 Repository fixture origin 與 Owner 核准的私人漫畫站。不要授權所有網站。
5. 確認 Userscripts popup 的 **Enable Injection** 已開啟。

## 3. 從 `.user.js` URL 安裝

Push 完成後，在 iPhone Safari 開啟以下 raw URL；URL path 的最後一段確實以 `.user.js`
結尾：

```text
https://raw.githubusercontent.com/opblackyo/penguin-translator/feat/m2-private-alpha/apps/userscript/dist/penguin-translator.user.js
```

接著：

1. 開啟 Safari 的 Userscripts 延伸功能 popup。
2. 點安裝提示，檢查名稱為 **Penguin Translator**。
3. 確認沒有遠端 `@require`，matches 只有已核准的 fixture／私人站。
4. 完成安裝後重新整理漫畫頁面。

若 raw URL 無安裝提示，也可把同一檔案儲存到 Userscripts App 指定的 scripts directory；
檔名必須保留 `.user.js`。

## 4. 第一次設定

匹配的頁面右側會出現 **企鵝翻譯** 與 **設定** 按鈕。第一次點 **企鵝翻譯** 時會自動
打開設定面板：

- **API Endpoint**：`http://<WINDOWS_LAN_IPV4>:8000`
- **Local API Token**：與 Repository root `.env` 的
  `PENGUIN_TRANSLATOR_LOCAL_API_TOKEN` 完全相同
- **Target Language**：`繁體中文 (zh-Hant)`

Endpoint 會在 Userscripts 本機儲存空間正規化為 `/v1/translate-page`。Token 只透過
`GM.setValue` 保存、透過 `GM.getValue` 讀取；不會寫進 bundle、URL、DOM attribute、console
或 diagnostic export。設定面板使用 password input，儲存後會清空畫面中的 input value。

## 5. 執行、重試與移除

1. Windows 啟動 API：`pnpm backend:dev:lan`。
2. iPhone 與 Windows 連到同一 Wi-Fi，Safari 開啟已核准的頁面。
3. 點 **企鵝翻譯**。狀態依序為 **掃描中…**、**翻譯中 0 / N**、**完成 N / N**。
4. Renderer 控制列保留 **隱藏譯文**、**顯示原文／顯示譯文**、**重試失敗圖片**與
   **移除全部**。單張失敗不會中止其他圖片；按 retry 後再點浮動翻譯按鈕，只送失敗 IDs。
5. 要修改 Endpoint／Token，點右側 **設定**；要刪除本機設定，點 **清除設定**。
6. 要停用 script，在 Safari 的 Userscripts popup 關閉 **Penguin Translator**；要完整移除，
   從 Userscripts 的 scripts list 刪除該檔案。這不會修改 Windows `.env`。

## 6. 安全邊界與限制

- Userscript 直接用 `GM.xmlHttpRequest` POST 一次完整 `TranslationPageRequest` 到本機 API，
  不使用 Shortcut adapter 或 Base64URL transport。
- 不繞過登入、付費牆、網站權限或存取控制；只處理 Safari 當下已合法顯示的頁面。
- 不授權公開 API、公開部署、Userscripts 自動更新或 Safari App Store 發行。
- 真實商業網站仍受 DOM、CSP、圖片供應方式與網站改版影響，必須逐站實機驗收。
- iPhone Userscripts 安裝、真實頁 overlay、捲動與旋轉在 Owner 完成實測前維持
  **UNVERIFIED**。
