from __future__ import annotations

import json
from pathlib import Path

import pytest
from clinical_vlm.models import CanonicalExtraction, ClinicalFact, GoldAnnotation
from clinical_vlm.parser import StructuredOutputError, parse_structured_output
from pydantic import ValidationError


def test_schema_validation_accepts_canonical_prediction(prediction_payload: dict) -> None:
    extraction = CanonicalExtraction.model_validate(prediction_payload)
    assert len(extraction.facts) == 4


def test_schema_rejects_unknown_fields(prediction_payload: dict) -> None:
    prediction_payload["unexpected"] = "rejected"
    with pytest.raises(ValidationError):
        CanonicalExtraction.model_validate(prediction_payload)


def test_malformed_json_is_rejected() -> None:
    with pytest.raises(StructuredOutputError, match="MALFORMED_JSON"):
        parse_structured_output("```json\n{}\n```")


def test_schema_invalid_json_is_separate_from_parse_failure() -> None:
    with pytest.raises(StructuredOutputError, match="SCHEMA_INVALID"):
        parse_structured_output(json.dumps({"document_id": "synthetic", "facts": "wrong"}))


def test_empty_extraction_is_valid_abstention() -> None:
    extraction = CanonicalExtraction(document_id="synthetic-empty")
    assert extraction.facts == []


def test_provenance_is_required(prediction_payload: dict) -> None:
    fact = prediction_payload["facts"][0]
    fact["source_text"] = ""
    with pytest.raises(ValidationError):
        ClinicalFact.model_validate(fact)


def test_invalid_bbox_is_rejected(prediction_payload: dict) -> None:
    fact = prediction_payload["facts"][0]
    fact["bbox"] = [20, 10, 5, 30]
    with pytest.raises(ValidationError):
        ClinicalFact.model_validate(fact)


def test_category_data_rejects_unknown_fields(prediction_payload: dict) -> None:
    fact = prediction_payload["facts"][0]
    fact["data"]["model_guess"] = "not allowed"
    with pytest.raises(ValidationError):
        ClinicalFact.model_validate(fact)


def test_tracked_json_schemas_match_python_contracts() -> None:
    schema_dir = Path(__file__).resolve().parents[1] / "schemas"
    assert json.loads((schema_dir / "canonical-extraction.schema.json").read_text()) == (
        CanonicalExtraction.model_json_schema()
    )
    assert json.loads((schema_dir / "gold-annotation.schema.json").read_text()) == (
        GoldAnnotation.model_json_schema()
    )
