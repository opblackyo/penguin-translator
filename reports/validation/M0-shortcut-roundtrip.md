# M0 Shortcut Round-Trip Validation

Status: **Not yet physically validated**

Repository bootstrap establishes automated mocks only. The following Human Gate requires an iPhone, the confirmed Shortcut action names in the device language, a reachable HTTPS endpoint, and explicit API runtime configuration.

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Share Sheet starts shortcut | Not tested | Physical iPhone required |
| Extractor returns image descriptors | Not tested on device | Automated browser test only |
| Shortcut POST reaches Mock API | Not tested | API endpoint not configured |
| Mock region is returned | Not tested on device | API unit test only |
| Renderer aligns test text | Not tested on device | Unit mapping test only |
| No JavaScript timeout | Not tested | Physical iPhone required |
| Overlay survives shortcut completion | Not tested | Physical iPhone required |
| Overlay follows scrolling | Not tested on device | Listener implemented |
| Token absent from page context | Pending inspection | No token exists in repository or bundles |

Do not fill image-count or payload-size limits until measurements are recorded here.
