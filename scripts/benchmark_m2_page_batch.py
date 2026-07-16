from __future__ import annotations

import argparse
import asyncio
import statistics
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class Workload:
    images: int = 15
    fetch_seconds: float = 0.012
    ocr_seconds: float = 0.025
    gemini_seconds: float = 0.018
    cold_start_seconds: float = 0.04
    batch_gemini_calls: int = 2


async def sequential_baseline(workload: Workload, *, warm: bool) -> float:
    started = time.perf_counter()
    if not warm:
        await asyncio.sleep(workload.cold_start_seconds)
    for _ in range(workload.images):
        await asyncio.sleep(workload.fetch_seconds)
        if not warm:
            await asyncio.sleep(workload.ocr_seconds)
        await asyncio.sleep(workload.gemini_seconds)
    return time.perf_counter() - started


async def page_batch(workload: Workload, *, concurrency: int, warm: bool) -> float:
    started = time.perf_counter()
    if not warm:
        await asyncio.sleep(workload.cold_start_seconds)
    queue: asyncio.Queue[int] = asyncio.Queue()
    for image_index in range(workload.images):
        queue.put_nowait(image_index)

    async def worker() -> None:
        while True:
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                await asyncio.sleep(workload.fetch_seconds)
                if not warm:
                    await asyncio.sleep(workload.ocr_seconds)
            finally:
                queue.task_done()

    tasks = [
        asyncio.create_task(worker()) for _ in range(min(concurrency, workload.images))
    ]
    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    for _ in range(workload.batch_gemini_calls):
        await asyncio.sleep(workload.gemini_seconds)
    return time.perf_counter() - started


def improvement(baseline: float, candidate: float) -> float:
    return (baseline - candidate) / baseline * 100


async def run(iterations: int, minimum_improvement: float | None) -> None:
    workload = Workload()
    baseline_cold = [
        await sequential_baseline(workload, warm=False) for _ in range(iterations)
    ]
    baseline_warm = [
        await sequential_baseline(workload, warm=True) for _ in range(iterations)
    ]
    cold_results: dict[int, list[float]] = {}
    warm_results: dict[int, list[float]] = {}
    for concurrency in (2, 3):
        cold_results[concurrency] = [
            await page_batch(workload, concurrency=concurrency, warm=False)
            for _ in range(iterations)
        ]
        warm_results[concurrency] = [
            await page_batch(workload, concurrency=concurrency, warm=True)
            for _ in range(iterations)
        ]
    cold_baseline_median = statistics.median(baseline_cold)
    warm_baseline_median = statistics.median(baseline_warm)
    print(
        "M2_PAGE_BATCH_BENCHMARK "
        f"images={workload.images} iterations={iterations} external_network=false"
    )
    print(f"sequential_cold_median_ms={cold_baseline_median * 1000:.1f}")
    print(f"sequential_warm_median_ms={warm_baseline_median * 1000:.1f}")
    improvements: list[float] = []
    for concurrency in (2, 3):
        cold = statistics.median(cold_results[concurrency])
        warm = statistics.median(warm_results[concurrency])
        cold_improvement = improvement(cold_baseline_median, cold)
        warm_improvement = improvement(warm_baseline_median, warm)
        improvements.extend((cold_improvement, warm_improvement))
        print(
            f"batch_concurrency={concurrency} cold_median_ms={cold * 1000:.1f} "
            f"cold_improvement_percent={cold_improvement:.1f} "
            f"warm_median_ms={warm * 1000:.1f} "
            f"warm_improvement_percent={warm_improvement:.1f}"
        )
    if minimum_improvement is not None and min(improvements) < minimum_improvement:
        raise SystemExit(
            f"Benchmark improvement {min(improvements):.1f}% is below "
            f"required {minimum_improvement:.1f}%"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Opt-in deterministic 15-image scheduling benchmark; no network or real content."
    )
    parser.add_argument("--iterations", type=int, default=3)
    parser.add_argument("--assert-min-improvement", type=float)
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    if arguments.iterations < 1:
        raise SystemExit("--iterations must be at least 1")
    asyncio.run(run(arguments.iterations, arguments.assert_min_improvement))
