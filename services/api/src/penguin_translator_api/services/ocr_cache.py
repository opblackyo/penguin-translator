from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass

from penguin_translator_api.services.ocr import OcrRegion


@dataclass(frozen=True)
class CacheEntry:
    expires_at: float
    regions: tuple[OcrRegion, ...]


class OcrResultCache:
    def __init__(self, *, ttl_seconds: float, max_entries: int) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._entries: OrderedDict[str, CacheEntry] = OrderedDict()

    def get(self, image_id: str) -> list[OcrRegion] | None:
        entry = self._entries.get(image_id)
        if entry is None:
            return None
        if entry.expires_at <= time.monotonic():
            del self._entries[image_id]
            return None
        self._entries.move_to_end(image_id)
        return list(entry.regions)

    def put(self, image_id: str, regions: list[OcrRegion]) -> None:
        self._entries[image_id] = CacheEntry(
            expires_at=time.monotonic() + self._ttl_seconds,
            regions=tuple(regions),
        )
        self._entries.move_to_end(image_id)
        while len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)
