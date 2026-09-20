from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest
from clinical_vlm.baseline_adapter import adapt_baseline_candidates
from clinical_vlm.benchmark import BenchmarkRunner
from clinical_vlm.interfaces import DocumentInput, ModelNotInstalled, RenderedPage
from clinical_vlm.models import GoldAnnotation
from clinical_vlm.safe_logging import SafeBenchmarkLogger
from clinical_vlm.vlm_adapter import LocalStructuredVLMAdapter, UnavailableVLMAdapter


def _document() -> DocumentInput:
    return DocumentInput(
        document_id="synthetic-document-001",
        pages=(RenderedPage(1, Path("/private/tmp/synthetic.png"), 100, 100, 200),),
    )


def test_baseline_adapter_preserves_existing_provenance() -> None:
    result = adapt_baseline_candidates(
        "synthetic-document-001",
        [
            {
                "recordType": "lab",
                "sourcePageNumber": 2,
                "sourceBlockIds": ["baseline-block"],
                "sourceText": "Synthetic analyte A 13.5 g/dL",
                "confidence": "high",
                "data": {
                    "test_name": "Synthetic analyte A",
                    "original_value": "13.5",
                    "numeric_value": 13.5,
                    "unit": "g/dL",
                },
            }
        ],
    )
    fact = result.facts[0]
    assert fact.page == 2
    assert fact.source_block_ids == ["baseline-block"]
    assert fact.data["test_name"] == "Synthetic analyte A"
    assert fact.bbox is None


def test_phase1_vlm_adapter_requires_local_model() -> None:
    with pytest.raises(ModelNotInstalled, match="VLM_MODEL_NOT_INSTALLED"):
        UnavailableVLMAdapter().extract(_document())


def test_local_adapter_parses_strict_json(prediction_payload: dict) -> None:
    adapter = LocalStructuredVLMAdapter(
        model_id="synthetic-local-model",
        model_revision="test",
        prompt="synthetic prompt",
        generate=lambda paths, prompt: json.dumps(prediction_payload),
    )
    result = adapter.extract(_document())
    assert result.extraction.document_id == "synthetic-document-001"
    assert result.model_id == "synthetic-local-model"


def test_safe_logger_never_logs_raw_medical_text(caplog: pytest.LogCaptureFixture) -> None:
    logger = logging.getLogger("clinical-vlm-test")
    caplog.set_level(logging.INFO, logger="clinical-vlm-test")
    safe = SafeBenchmarkLogger(logger)
    safe.event(
        "benchmark_document_complete",
        adapter="synthetic",
        document_key="deadbeefdeadbeef",
        fact_count=2,
        gold_count=2,
        latency_seconds=0.1,
        page_count=1,
        schema_valid=True,
        success=True,
    )
    output = caplog.text
    assert "Synthetic analyte" not in output
    assert "source_text" not in output
    assert "deadbeefdeadbeef" in output


def test_safe_logger_rejects_unapproved_fields() -> None:
    with pytest.raises(ValueError, match="UNSAFE_BENCHMARK_LOG_FIELD"):
        SafeBenchmarkLogger().event("unsafe", source_text="must not be logged")


def test_benchmark_runner_calculates_aggregate_metrics(
    prediction_payload: dict, gold_payload: dict
) -> None:
    adapter = LocalStructuredVLMAdapter(
        model_id="synthetic-local-model",
        model_revision="test",
        prompt="synthetic prompt",
        generate=lambda paths, prompt: json.dumps(prediction_payload),
    )
    result = BenchmarkRunner().run(
        adapter,
        _document(),
        GoldAnnotation.model_validate(gold_payload),
    )
    assert result.metrics.fact_f1 == 1
    assert result.document_key != "synthetic-document-001"
    assert result.page_count == 1
