from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from clinical_vlm.models import FactType, Negation
from clinical_vlm.vlm_canonical_adapter import adapt_vlm_extraction
from clinical_vlm.vlm_schema import VLMLab, VLMExtraction

FIXTURE_PATH = Path(__file__).parent / "fixtures/vlm_contract_v2_cases.json"


def _payload() -> dict:
    return {
        "patient": {
            "name": "TEST PATIENT",
            "date": "15 SEP 2026",
            "page": 1,
            "source_text": "PATIENT: TEST PATIENT\nDATE: 15 SEP 2026",
        },
        "labs": [
            {
                "test_name": "Hemoglobin",
                "value": "13.5",
                "unit": "g/dL",
                "reference_range": "12.0 - 16.0",
                "page": 1,
                "source_text": "Hemoglobin        13.5 g/dL       12.0 - 16.0",
            }
        ],
        "diagnoses": [
            {
                "name": "anemia",
                "assertion": "absent",
                "page": 1,
                "source_text": "No evidence of anemia.",
            }
        ],
        "medications": [],
    }


def test_simplified_schema_accepts_grounded_shape() -> None:
    parsed = VLMExtraction.model_validate(_payload())
    assert parsed.labs[0].test_name == "Hemoglobin"


def test_json_schema_structurally_requires_patient_source_text() -> None:
    schema = VLMExtraction.model_json_schema()
    patient_schema = schema["$defs"]["VLMPatient"]
    assert "source_text" in patient_schema["required"]


def test_patient_values_require_non_null_source_text() -> None:
    payload = _payload()
    payload["patient"]["source_text"] = None
    with pytest.raises(ValidationError, match="patient name/date requires source_text"):
        VLMExtraction.model_validate(payload)


def test_absent_patient_values_allow_explicit_null_source_text() -> None:
    payload = _payload()
    payload["patient"] = {
        "name": None,
        "date": None,
        "page": 1,
        "source_text": None,
    }
    parsed = VLMExtraction.model_validate(payload)
    assert parsed.patient.source_text is None


def test_simplified_schema_rejects_extra_fields() -> None:
    payload = _payload()
    payload["labs"][0]["normalized_value"] = "13.5"
    with pytest.raises(ValidationError):
        VLMExtraction.model_validate(payload)


def test_adapter_preserves_valid_tuple_without_repairs() -> None:
    payload = _payload()
    payload["labs"][0] = {
        "test_name": "Platelet Count",
        "value": "291",
        "unit": "x10^3/uL",
        "reference_range": "150 - 450",
        "page": 1,
        "source_text": "Platelet Count 291 x10^3/uL 150 - 450",
    }
    canonical = adapt_vlm_extraction(
        VLMExtraction.model_validate(payload), document_id="synthetic-cbc"
    )
    lab = next(fact for fact in canonical.facts if fact.type is FactType.LAB_RESULT)
    assert lab.data == {
        "test_name": "Platelet Count",
        "value": "291",
        "unit": "x10^3/uL",
        "reference_range": "150 - 450",
    }
    assert lab.normalized_value is None


def test_synthetic_v2_lab_fixture_cases() -> None:
    cases = json.loads(FIXTURE_PATH.read_text())
    for candidate in cases["valid_labs"]:
        assert VLMLab.model_validate(candidate).unit == candidate["unit"]
    for candidate in cases["invalid_labs"]:
        with pytest.raises(ValidationError):
            VLMLab.model_validate(candidate)


def test_lab_rejects_source_row_without_exact_reference_range() -> None:
    payload = _payload()
    payload["labs"][0]["reference_range"] = "11.0 - 15.0"
    with pytest.raises(ValidationError, match="reference_range"):
        VLMExtraction.model_validate(payload)


def test_absent_assertion_maps_to_negation() -> None:
    canonical = adapt_vlm_extraction(
        VLMExtraction.model_validate(_payload()), document_id="synthetic-cbc"
    )
    diagnosis = next(fact for fact in canonical.facts if fact.type is FactType.DIAGNOSIS)
    assert diagnosis.context.negation is Negation.NEGATED
    assert diagnosis.source_text == "No evidence of anemia."


def test_empty_medications_adds_no_medication_fact() -> None:
    canonical = adapt_vlm_extraction(
        VLMExtraction.model_validate(_payload()), document_id="synthetic-cbc"
    )
    assert all(fact.type is not FactType.MEDICATION for fact in canonical.facts)


def test_medication_none_sentinel_is_rejected_at_contract_boundary() -> None:
    payload = _payload()
    payload["medications"] = [
        {
            "name": "None",
            "strength": None,
            "dose": None,
            "route": None,
            "frequency": None,
            "page": 1,
            "source_text": "MEDICATIONS: None.",
        }
    ]
    with pytest.raises(ValidationError, match="empty list"):
        VLMExtraction.model_validate(payload)
