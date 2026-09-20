"""Aggregate-only benchmark logging."""

from __future__ import annotations

import json
import logging
from typing import Any

SAFE_FIELDS = {
    "adapter",
    "document_key",
    "error_code",
    "fact_count",
    "gold_count",
    "latency_seconds",
    "page_count",
    "schema_valid",
    "success",
}


class SafeBenchmarkLogger:
    def __init__(self, logger: logging.Logger | None = None) -> None:
        self.logger = logger or logging.getLogger("clinical_vlm.benchmark")

    def event(self, name: str, **fields: Any) -> None:
        unexpected = set(fields) - SAFE_FIELDS
        if unexpected:
            raise ValueError("UNSAFE_BENCHMARK_LOG_FIELD")
        payload = {"event": name, **fields}
        self.logger.info(json.dumps(payload, sort_keys=True, separators=(",", ":")))
