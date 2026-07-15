# iPhone Shortcut Setup (M0)

This guide uses Apple's official English action names. Chinese action names remain **UNVERIFIED** until they are read from the physical iPhone. Apple requires every **Run JavaScript on Web Page** action to receive the active Safari webpage, and allows extra data to be inserted into its script with Magic Variables.

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
2. Inside the repeat, add **Generate UUID**. If this action is not present under that exact English name on the physical device, record the displayed name and stop the Human Gate; do not guess a Chinese name.
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
     Authorization: Bearer m0-local-shortcut
   Request Body: JSON
   JSON value: the request Dictionary above
   ```

`m0-local-shortcut` is a non-secret M0 presence value. The API does not authenticate it. Do not put a real credential in either JavaScript bundle.

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

Replace `SUCCESSFUL_RESULTS_MAGIC_VARIABLE` by inserting the `Successful Results` Magic Variable directly in the JavaScript field; do not type its displayed text. Then paste the complete production renderer bundle below the first line.

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
- API returns `401` or `403`: confirm the `Authorization` header has the `Bearer ` prefix and a non-empty M0 value.
- API returns `422`: inspect the request Dictionary for key names, UUID, language values, HTTP/HTTPS `page_url`, and the unmodified image descriptor.
- Renderer reports `IMAGE_NOT_FOUND`: do not reload the Safari page between extractor and renderer; the marked image element must remain in the DOM.
- JavaScript Timeout: remove intermediate **Quick Look** actions and confirm each script calls `completion`.

## 9. Human Gate record

After the physical run, update `reports/validation/M0-shortcut-roundtrip.md` with the iPhone model, iOS version, exact displayed Chinese action names, image count, renderer completion, overlay screenshots or observations, failures, and timing. Until then, iPhone and Safari evidence remain **UNVERIFIED**.
