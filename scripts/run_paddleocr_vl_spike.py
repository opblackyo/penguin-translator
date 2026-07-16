from __future__ import annotations

import argparse
import importlib
import json
import multiprocessing
import os
import time
from pathlib import Path
from queue import Empty
from typing import Any, cast

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "apps/shortcut-client/m1-test-page/assets/korean-dialogue.png"


def worker(queue: multiprocessing.Queue[dict[str, object]]) -> None:
    os.environ.setdefault(
        "PADDLE_PDX_CACHE_HOME", str(ROOT / "services/api/.cache/paddlex")
    )
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    paddleocr_module = cast(Any, importlib.import_module("paddleocr"))

    started = time.perf_counter()
    pipeline = paddleocr_module.PaddleOCRVL(
        pipeline_version="v1.6",
        use_layout_detection=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
    )
    initialized = time.perf_counter()
    results = cast(
        list[object], list(pipeline.predict(str(FIXTURE), use_layout_detection=False))
    )
    queue.put(
        {
            "status": "PASS",
            "init_seconds": round(initialized - started, 3),
            "predict_seconds": round(time.perf_counter() - initialized, 3),
            "result_count": len(results),
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout-seconds", type=float, default=180)
    args = parser.parse_args()
    queue: multiprocessing.Queue[dict[str, object]] = multiprocessing.Queue()
    process = multiprocessing.Process(target=worker, args=(queue,))
    started = time.perf_counter()
    process.start()
    process.join(args.timeout_seconds)
    if process.is_alive():
        process.terminate()
        process.join()
        result: dict[str, object] = {
            "status": "TIMEOUT",
            "timeout_seconds": args.timeout_seconds,
            "total_seconds": round(time.perf_counter() - started, 3),
        }
    else:
        try:
            result = queue.get_nowait()
        except Empty:
            result = {"status": "FAIL", "exit_code": process.exitcode}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
