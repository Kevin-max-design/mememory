"""Small, local-only benchmark orchestration without raw-content logging."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from hashlib import sha256
from typing import Any

from .interfaces import DocumentInput, ExtractionAdapter
from .metrics import EvaluationMetrics, evaluate
from .models import GoldAnnotation
from .safe_logging import SafeBenchmarkLogger


def privacy_safe_document_key(document_id: str) -> str:
    return sha256(document_id.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True, slots=True)
class BenchmarkResult:
    adapter: str
    model_id: str
    model_revision: str
    document_key: str
    page_count: int
    latency_per_document_seconds: float
    latency_per_page_seconds: float
    peak_ram_bytes: int | None
    peak_vram_bytes: int | None
    output_tokens: int | None
    metrics: EvaluationMetrics

    def aggregate_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["metrics"] = self.metrics.to_dict()
        return result


class BenchmarkRunner:
    def __init__(self, logger: SafeBenchmarkLogger | None = None) -> None:
        self.logger = logger or SafeBenchmarkLogger()

    def run(
        self,
        adapter: ExtractionAdapter,
        document: DocumentInput,
        gold: GoldAnnotation,
    ) -> BenchmarkResult:
        if document.document_id != gold.document_id:
            raise ValueError("GOLD_DOCUMENT_ID_MISMATCH")
        result = adapter.extract(document)
        metrics = evaluate(result.extraction.facts, gold)
        page_count = len(document.pages)
        safe_key = privacy_safe_document_key(document.document_id)
        self.logger.event(
            "benchmark_document_complete",
            adapter=adapter.name,
            document_key=safe_key,
            fact_count=len(result.extraction.facts),
            gold_count=len(gold.facts),
            latency_seconds=round(result.latency_seconds, 6),
            page_count=page_count,
            schema_valid=True,
            success=True,
        )
        return BenchmarkResult(
            adapter=adapter.name,
            model_id=result.model_id,
            model_revision=result.model_revision,
            document_key=safe_key,
            page_count=page_count,
            latency_per_document_seconds=result.latency_seconds,
            latency_per_page_seconds=result.latency_seconds / page_count if page_count else 0,
            peak_ram_bytes=result.peak_ram_bytes,
            peak_vram_bytes=result.peak_vram_bytes,
            output_tokens=result.output_tokens,
            metrics=metrics,
        )
