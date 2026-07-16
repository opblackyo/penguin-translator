# M1 Korean/English OCR Spike

## Environment

```text
OS: Windows, CPU inference
Python: 3.11
PaddleOCR: 3.7.0
PaddlePaddle: 3.3.1
Fixtures: self-created 900 × 1200 PNG files
Model files: local ignored cache; never committed
```

## Compared paths

### PP-OCRv5 multilingual scene OCR — selected

```text
Detection: PP-OCRv5_mobile_det
Recognition: korean_PP-OCRv5_mobile_rec
Document orientation: disabled
Document unwarping: disabled
Text-line orientation model: disabled
MKLDNN/oneDNN: disabled for Windows PaddlePaddle 3.3.1 compatibility
```

Cached-model smoke from `pnpm backend:test:ocr-local`:

| Fixture | Regions | Languages | Minimum recognition confidence | Seconds |
| --- | ---: | --- | ---: | ---: |
| Korean dialogue | 3 | ko | 0.991 | 1.233 |
| English dialogue | 3 | en | 0.978 | 1.067 |
| Korean + English | 3 | en, mixed | 0.913 | 1.075 |
| Empty page | 0 | — | — | 0.747 |

Cached model initialization took 4.256 seconds. All returned quadrilateral polygons remained inside
the 900 × 1200 image bounds. PaddleOCR 3.7.0 does not expose a per-box detection score in the OCR
pipeline JSON; the M1 adapter uses the recognition score as the conservative confidence proxy for
that accepted box.

### PaddleOCR-VL 1.6 (0.9B) — not selected

The official `PaddleOCRVL(pipeline_version="v1.6", use_layout_detection=False)` path loaded
successfully after installing the opt-in `paddlex[ocr]` dependencies. Initial model download and
initialization took 57.174 seconds. On the same Korean fixture, CPU inference did not finish within
180 seconds and was terminated by the spike budget.

This path supports Korean, but it is unsuitable for the M1 local CPU vertical slice because it did
not return a result inside the budget and does not improve the precise scene-text polygon path needed
by the renderer.

## Decision

M1 uses `PP-OCRv5_mobile_det` plus `korean_PP-OCRv5_mobile_rec`. It returned Korean, English, and
mixed text with precise polygons in approximately one second per fixture after initialization, while
the VL path exceeded 180 seconds on one fixture.

Reproduce the selected smoke after installing its opt-in dependencies:

```powershell
pnpm backend:sync:ocr
pnpm backend:test:ocr-local
```

The heavier comparison remains available as an explicitly opt-in command:

```powershell
uv --cache-dir .uv-cache sync --project services/api --locked --extra ocr-vl-spike
pnpm backend:test:ocr-vl-spike
```
