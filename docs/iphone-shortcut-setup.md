# iPhone Shortcut Setup (M0–M2.1)

This guide uses Apple's official English action names. The Owner has observed `重複` for **Repeat
with Each** on an iPhone 12 Pro running iOS 26.5. Other Chinese action names remain **UNVERIFIED**
until they are read from the physical device. Apple requires every **Run JavaScript on Web Page**
action to receive the active Safari webpage, and allows extra data to be inserted into its script with
Magic Variables.

Official references:

- https://support.apple.com/guide/shortcuts/use-the-run-javascript-on-webpage-action-apdb71a01d93/ios
- https://support.apple.com/guide/shortcuts/intro-to-the-run-javascript-on-web-page-action-apd218e2187d/ios
- https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios
- https://support.apple.com/guide/shortcuts/handling-lists-apd9ba41d21b/ios
- https://support.apple.com/guide/shortcuts/using-dictionaries-apd43b69f337/ios

## 1. Start the Windows M0 services

Requirements are Node.js 24, pnpm 10.23.0, uv, and Python 3.11 managed by uv. From the repository root, build the production bundles once:

```powershell
pnpm install --frozen-lockfile
pnpm backend:sync
pnpm build
```

Open two PowerShell windows in the repository root.

Terminal A — Mock FastAPI on the repository's configured port `8000`:

```powershell
pnpm backend:dev:lan
```

Terminal B — self-created test page on the repository's configured port `4173`:

```powershell
pnpm test-page:lan
```

Both commands bind to `0.0.0.0` for same-Wi-Fi testing. If Windows Firewall prompts, allow access on **Private networks** only. These are local development commands, not deployment settings.

Confirm the API from Windows:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/healthz
```

Expected result: `status` is `ok`.

Obtain the active Windows LAN address instead of guessing it:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object InterfaceAlias, IPAddress
```

Do not commit the result. On the iPhone, while connected to the same Wi-Fi, open:

```text
http://<WINDOWS_LAN_IPV4>:4173/test-page/
```

The Shortcut API endpoint will be:

```text
http://<WINDOWS_LAN_IPV4>:8000/v1/translate-image
```

## 2. Enable and scope the Shortcut

1. In Shortcuts settings, enable **Allow Running Scripts**. The Chinese setting label is **UNVERIFIED**.
2. Create a new shortcut and open **Details**.
3. Turn on **Show in Share Sheet**.
4. In **Receive**, deselect every input type except **Safari webpages**.
5. Run the shortcut from Safari's Share Sheet, not from the editor, because the JavaScript action requires an active Safari webpage.

## 3. Preserve the Safari webpage

The second JavaScript action must still receive the same Safari webpage even though API actions run between the two scripts.

1. Add **Set Variable** as the first action.
2. Set its input to the special variable **Shortcut Input**.
3. Name the manual variable `Safari Page`.

Use `Safari Page` as the webpage input of both JavaScript actions below.

## 4. Run the extractor production bundle

1. Add **Run JavaScript on Web Page**.
2. Set its webpage input to `Safari Page`.
3. Replace the sample code with the complete contents of:

   ```text
   apps/shortcut-client/dist/extractor.iife.js
   ```

4. Add **Quick Look** immediately after it while building the Shortcut.

The extractor returns serialized JSON. Expected top-level fields are `version`, `page_url`, `images`, and `warnings`. Each `images` item contains exactly:

```text
client_image_id
source_kind
source
rendered_width
rendered_height
```

The self-created test page should return multiple large images. `small-image` must not appear.

## 5. Parse and prepare variables

1. Add **Get Dictionary from Input** with the extractor output as input.
2. Add **Set Variable** and name the parsed dictionary `Extraction`.
3. Add **Get Dictionary Value**, key `page_url`, dictionary `Extraction`; save it with **Set Variable** as `Page URL`.
4. Add another **Get Dictionary Value**, key `images`, dictionary `Extraction`; save it as `Images`.
5. Add an empty **List**, then **Set Variable** as `Successful Results`.
6. Add another empty **List**, then **Set Variable** as `Failures`.
7. Add a **URL** action containing `http://<WINDOWS_LAN_IPV4>:8000/v1/translate-image`, then **Set Variable** as `API Endpoint`.

Use **Quick Look** on `Extraction` and `Images` while debugging. Remove or disable those previews for the timing test.

## 6. POST each image

1. Add **Repeat with Each** and set its input to `Images`. The current descriptor is the **Repeat Item** variable.
2. Inside the repeat, add **Generate UUID**. A fixed syntactically valid UUID may instead be used for
   M0 because the Mock API only correlates and echoes `request_id`; it does not use the UUID for
   authentication, authorization, or deduplication. If **Generate UUID** is not present under that exact
   English name on the physical device, record the displayed name and do not guess a Chinese name.
3. Add a **Dictionary** action with these entries:

   | Key | Value |
   | --- | --- |
   | `request_id` | output of **Generate UUID** |
   | `page_url` | `Page URL` |
   | `image` | `Repeat Item` as a Dictionary |
   | `source_language` | Text `ja` |
   | `target_language` | Text `zh-Hant` |
   | `reading_order` | Text `rtl` |

4. Add **Get Contents of URL** with URL `API Endpoint`.
5. Expand **Show More** and configure:

   ```text
   Method: POST
   Headers:
    Authorization: Bearer <LOCAL_RANDOM_TOKEN>
   Request Body: JSON
   JSON value: the request Dictionary above
   ```

Use the same random local value configured as `PENGUIN_TRANSLATOR_LOCAL_API_TOKEN` in the ignored
`.env`. M2 authenticates both retained mock and real translation requests. Never commit the value or
put it in either JavaScript bundle.

6. Add **Get Dictionary Value** for key `regions` from the API response.
7. Add **If** and check whether that dictionary value has any value:
   - Success branch: use **Add to Variable** to append the complete API response to `Successful Results`.
   - Otherwise branch: create a **Dictionary** containing `client_image_id` and the response, then use **Add to Variable** to append it to `Failures`.
8. Finish at **End Repeat**.

The automated test proves that a `422` response for one item can be recorded while other results still render. Whether the installed iOS version exposes a non-2xx response without stopping the Shortcut is part of the physical Human Gate and remains **UNVERIFIED**.

## 7. Run the renderer production bundle

Add a second **Run JavaScript on Web Page** and set its webpage input to `Safari Page`. Its script must have this shape:

```javascript
const shortcutInput = { results: SUCCESSFUL_RESULTS_MAGIC_VARIABLE };

// Paste the complete apps/shortcut-client/dist/renderer.iife.js below this line.
```

`Successful Results` is exposed by Shortcuts as separate dictionary values rather than JavaScript
array source. Before inserting it into the JavaScript field:

1. Combine the values with **Combine Text**, using a half-width comma `,` as the separator.
2. Surround the combined text with half-width ASCII brackets `[` and `]`.
3. Insert that result in place of `SUCCESSFUL_RESULTS_MAGIC_VARIABLE` without surrounding quotes.

The result must be valid JavaScript such as:

```javascript
const shortcutInput = { results: [{"request_id":"..."},{"request_id":"..."}] };
```

Do not use the full-width characters `［` (U+FF3B) or `］` (U+FF3D). Safari treats them as invalid
JavaScript tokens and reports a `SyntaxError`. Then paste the complete production renderer bundle
below the first line.

Apple documents that additional data can be inserted into **Run JavaScript on Web Page** with Magic Variables. The action still receives `Safari Page` as its required webpage input.

Add **Quick Look** after the renderer during setup. Expected completion output:

```text
ok: true
rendered_regions: at least 1
warnings: empty unless an image disappeared
```

The page should show `測試譯文`. The Shadow DOM control panel must support:

- `隱藏譯文`
- `顯示譯文`
- `移除全部`

Run the Shortcut twice and confirm there is still only one control panel.

## 8. Diagnose each stage

Use **Quick Look** after these points, one at a time:

1. Extractor output: valid JSON string and multiple `images`.
2. `Extraction`: a Dictionary containing `page_url` and `images`.
3. Request **Dictionary** inside the repeat: all seven required keys.
4. **Get Contents of URL**: response contains matching `client_image_id`, dimensions, and `regions`.
5. `Successful Results`: a List containing only valid API response dictionaries.
6. `Failures`: empty during the normal test; populated when one response lacks `regions`.
7. Renderer completion: `ok: true` and the expected region count.

Common failures:

- Shortcut absent from Safari: confirm **Show in Share Sheet** and only **Safari webpages** in **Receive**.
- JavaScript permission error: enable **Allow Running Scripts**.
- API unreachable: confirm both devices use the same Wi-Fi, the current IPv4 value, port `8000`, `/healthz`, and Private-network firewall access.
- Test page unreachable: confirm Terminal B is running on port `4173`.
- Extractor returns zero images: wait for SVG images to load and confirm the page is the repository test page.
- API returns `401` or `403`: confirm the `Authorization` header has the `Bearer ` prefix and exactly
  matches the ignored `.env` value; `503 LOCAL_API_TOKEN_NOT_CONFIGURED` means no token was loaded.
- API returns `422`: inspect the request Dictionary for key names, UUID, language values, HTTP/HTTPS `page_url`, and the unmodified image descriptor.
- Renderer reports `IMAGE_NOT_FOUND`: do not reload the Safari page between extractor and renderer; the marked image element must remain in the DOM.
- JavaScript Timeout: remove intermediate **Quick Look** actions and confirm each script calls `completion`.

## 9. Human Gate record

The confirmed device is an iPhone 12 Pro running iOS 26.5. Confirmed evidence is recorded in
`reports/validation/M0-shortcut-roundtrip.md`. Hide/show/remove controls, page and element scrolling,
orientation change, repeated execution, partial API failure, timeout status, timing, and all remaining
Chinese action names stay **UNVERIFIED** until the Owner reports them.

## 10. M1 real translation retest

Do not rebuild the Shortcut. After the M1 backend smoke passes, change only these two Dictionary
values inside the existing request:

```text
source_language: auto
reading_order: auto
```

Keep `target_language: zh-Hant`, the extractor, API URL, Repeat flow, result combination, and renderer
unchanged. The ignored repository-root `.env` must contain these local values; placeholders are not
literal values and the token must be a new random local secret:

```dotenv
PENGUIN_TRANSLATOR_TRANSLATION_PROVIDER=gemini
PENGUIN_TRANSLATOR_GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_API_KEY=<LOCAL_SECRET>
PENGUIN_TRANSLATOR_LOCAL_API_TOKEN=<LOCAL_RANDOM_TOKEN>
PENGUIN_TRANSLATOR_DEV_ALLOWED_IMAGE_TARGETS=<WINDOWS_LAN_IPV4>:4173
PADDLE_PDX_CACHE_HOME=services/api/.cache/paddlex
```

Replace the Shortcut's old M0 Bearer presence value with the same `<LOCAL_RANDOM_TOKEN>`, then start
the API with `pnpm backend:dev:lan`. Never write the actual LAN address, Gemini key, or local token
into Git or either JavaScript bundle.

For the live backend smoke, keep both LAN services running and set the fixture URL only in the local
PowerShell process:

```powershell
$env:PENGUIN_TRANSLATOR_M1_FIXTURE_URL = "http://<WINDOWS_LAN_IPV4>:4173/m1-test-page/assets/korean-dialogue.png"
pnpm backend:test:m1-live
```

### Confirmed M1 physical-device evidence

The Owner completed this flow on an iPhone 12 Pro running iOS 26.5 with
`source_language = auto` and `reading_order = auto`:

- Korean, English, and mixed self-created fixtures displayed real Traditional Chinese translations.
- The empty fixture displayed no translation box.
- Renderer completion reported `ok = true`, `rendered_regions = 9`, and no warnings.
- Safari overlay, hide, show, remove all, page-scroll alignment, orientation-change alignment, and
  repeated execution passed.
- Repeated execution left one control panel and no duplicate overlays.
- No JavaScript timeout occurred.

An intentional partial API failure has not been tested through the physical iPhone Shortcut and
remains `UNVERIFIED`. The M1 result covers the repository's self-created fixtures over a private LAN;
it does not claim general compatibility with real commercial manga sites or public deployment.

## 11. M2 private-alpha test page

Start the same API and Vite commands, then open this self-created page on the iPhone:

```text
http://<WINDOWS_LAN_IPV4>:4173/m2-test-page/
```

It contains a long webtoon image, multiple slices, `srcset/currentSrc`, a query-string URL, a lazy
image, an image inserted after scrolling, a duplicate, an avatar, and an advertisement banner. The
extractor performs a bounded scan and restores the original page position. The duplicate, avatar,
and banner must not enter `images`.

Renderer input may retain the existing `results` list and additionally supply:

```javascript
{
  results: SUCCESSFUL_RESULTS,
  failures: FAILED_CLIENT_IMAGE_IDS,
  progress: { total, completed, successful, failed }
}
```

To make progress and cancellation operational without rebuilding the whole Shortcut, add these
actions at the end of the existing **Repeat with Each** body:

1. Build the current renderer input from `Successful Results`, `Failures`, and counts for `total`,
   `completed`, `successful`, and `failed`.
2. Run the renderer with **Run JavaScript on Web Page** so the panel is updated after this image.
3. Add **Wait** for one second, giving the Owner a bounded chance to tap **取消**.
4. Run the renderer once more with the same input plus `consume_control_requests: true`.
5. Read `cancel_requested` from its completion Dictionary with **Get Dictionary Value**. Use **If**;
   when true, use **Stop This Shortcut**. Already completed overlays stay mounted.

The second invocation atomically returns and clears the flag, so it cannot leak into a later run. An
already-running **Get Contents of URL** action cannot be interrupted; cancellation takes effect at
the next image boundary.

After the final renderer invocation, tapping **重試失敗圖片** queues the failed stable image IDs.
Run the Shortcut again from the same Safari page: the extractor consumes that queue and returns only
those failed descriptors, so the existing **Repeat with Each** retries only them. Reloading the page
discards the DOM identity and queued retry. Keep heavy request concurrency at the backend default of
two; do not issue dozens of parallel Shortcut requests.

## 12. Replace and retest the deadline-bounded M2 extractor

The first private real-page attempt on an iPhone 12 Pro / iOS 26.5 failed in the initial **Run
JavaScript on Web Page** action with a completion-handler timeout. The self-created M2 long page
remained successful, and the API, OCR, Gemini, and renderer were not reached on the failed real-page
attempt.

The remediated extractor uses these fixed defaults:

```text
maximum positions: 8
wall-clock budget: 2200 ms
completion reserve: 100 ms
settle interval: 40 ms
early stability exit: 2 consecutive scans after at least 3 positions
```

If the time budget is reached, the action returns images already discovered and includes
`LAZY_SCAN_TIME_BUDGET_REACHED`; this is a partial success, not a JavaScript error. The original page
position is restored before completion.

For the physical retest:

1. Reload the real manga page once to clear state left by the timed-out scan.
2. Replace only the complete script in the first **Run JavaScript on Web Page** action with the new
   `apps/shortcut-client/dist/extractor.iife.js` contents.
3. Do not change the Bearer token, API request, `Successful Results`, `Failures`, renderer bundle,
   `.env`, or backend for this remediation.
4. Run the Shortcut once and inspect the extractor result before continuing.
5. Accept either a complete result with no scan warning or a usable partial result containing
   `LAZY_SCAN_TIME_BUDGET_REACHED`; confirm `images` is non-empty before the API phase.

The physical retest must record extractor completion, elapsed behavior, image count, warnings, and
whether API processing begins. General real-site compatibility remains **UNVERIFIED**.

## 13. M2.1：改為一次整頁 Batch Request

M2.1 保留兩段 **Run JavaScript on Web Page**，但以一次 `/v1/translate-page` 取代第 6 節的
逐張 **Repeat with Each** API 呼叫。下列說明使用繁體中文描述操作；動作名稱仍採 Apple
官方英文名稱。除實機已確認的「重複」外，其他中文動作名稱不得據此視為已驗證。

先重新執行 `pnpm build`，並把最新版 `extractor.iife.js` 與 `renderer.iife.js` 貼入原本兩個
JavaScript 動作。新版 extractor 除了既有 `images`，還會直接產生符合 API 契約的
`batch_request`；捷徑不必手工建立巢狀 images Dictionary。

### 可選的冷啟動暖機

後端重啟後，可先用捷徑執行一次暖機；這只初始化本機 OCR pipeline，不會呼叫 Gemini：

1. 加入 **URL**，內容為 `http://<WINDOWS_LAN_IPV4>:8000/v1/warmup`。
2. 加入 **Get Contents of URL**，Method 選 `POST`。
3. 在 Headers 加入 `Authorization: Bearer <LOCAL_RANDOM_TOKEN>`，不要加入 Request Body。
4. 以 **Quick Look** 確認 `ready` 為 `true`。若為 `false`，查看 `diagnostic`；回應不會包含
   Key、Token、圖片 URL 或文字。

普通 CI 不執行此暖機，也不會下載大型模型。實機計時必須分別標示 cold（後端剛重啟且
未暖機）與 warm（暖機完成或同頁 OCR cache 命中）。

### 由逐張 Repeat 遷移為單次 POST

保留第 2–4 節的 Share Sheet、`Safari Page` 與第一個 **Run JavaScript on Web Page**，然後：

1. 以 **Get Dictionary from Input** 解析 extractor JSON，再以 **Set Variable** 存成
   `Extraction`。
2. 以 **Get Dictionary Value** 從 `Extraction` 取得 key `batch_request`，再以
   **Set Variable** 存成 `Batch Request`。
3. 以 **Quick Look** 確認其中有 `request_id`、`page_url`、完整 `images`、
   `source_language: auto`、`target_language: zh-Hant`、`reading_order: auto`。
4. 加入 **URL**：`http://<WINDOWS_LAN_IPV4>:8000/v1/translate-page`。
5. 加入一個 **Get Contents of URL**，設定 Method `POST`、Header
   `Authorization: Bearer <LOCAL_RANDOM_TOKEN>`、Request Body `JSON`，JSON 值直接選
   `Batch Request` Dictionary。
6. 以 **Set Variable** 把完整回應存成 `Page Response`。不要再使用逐張
   **Repeat with Each**、`Successful Results` 或手工累積 `Failures`。
7. 以 **Quick Look** 確認 `results`、`failures`、`progress` 與 `timing`；部分圖片失敗時
   HTTP 請求仍成功，失敗項目會在 `failures` 內以 `client_image_id` 和安全 `code` 表示。
8. 第二個 **Run JavaScript on Web Page** 仍以 `Safari Page` 為 webpage input。在 bundle
   前放入 `const shortcutInput = PAGE_RESPONSE_MAGIC_VARIABLE;`，並把 `Page Response`
   Magic Variable 插在等號後、不加引號。其後貼上完整 `renderer.iife.js`。
9. 以 **Quick Look** 檢查 renderer completion 的 `ok: true` 與 `rendered_regions`。

Batch 請求執行期間，iOS 的 **Get Contents of URL** 不能中途取消；取消界線是 API 呼叫前
或回應後。`重試失敗圖片` 仍會把失敗 ID 留給下一次 extractor；下一次執行產生的
`batch_request.images` 只包含待重試項目。重複注入仍會先移除舊控制面板與 overlays。

### M2.1 實機重測記錄

在同一個 15 圖私人頁面分別記錄 cold 與 warm 的 `timing.total_ms`、成功／失敗數、
`gemini_calls`、控制面板完成文字、重疊框及原文是否透出。Repository 的本機基準只驗證
排程與 batching 改善，不等同真實 iPhone、PaddleOCR 或 Gemini 延遲。下列項目在 Owner
完成新版捷徑前均為 **UNVERIFIED**：至少 50% 實機改善、warm 約 60 秒、partial failure、
新 overlay 可讀性，以及最終 daily-use readiness。
