# iPhone Shortcut Setup (M0 draft)

This document uses Apple's official English action names. Do not infer localized Chinese names; confirm those on the physical iPhone.

The final M0 flow is:

1. Configure the shortcut to receive Safari web pages from the Share Sheet.
2. Add **Run JavaScript on Web Page** and paste `extractor.iife.js`.
3. Parse the returned image list and use **Repeat with Each**.
4. In the repeat body, use **Get Contents of URL** with method POST, JSON body matching the OpenAPI request, and a Bearer header held only in the shortcut.
5. Accumulate successful API results without aborting on one failed image.
6. Add another **Run JavaScript on Web Page**, pass `{ "results": [...] }`, and paste `renderer.iife.js`.

`rendered_width` and `rendered_height` are CSS-pixel measurements rounded to the nearest positive integer (minimum `1`) at extraction time so they satisfy the API integer contract. The renderer still reads the image's current fractional `getBoundingClientRect()` dimensions when mapping returned image coordinates back onto the page.

Each extractor image item contains exactly `client_image_id`, `source_kind`, `source`, `rendered_width`, and `rendered_height`, so the same object can be used as the request's `image` value without removing extra fields.

No API URL, hostname, port, or Bearer value is supplied here because none has been confirmed. Until that Human Gate is complete, use only `http://127.0.0.1:<actual development port>` for computer-local testing; an iPhone cannot reach that loopback address.
