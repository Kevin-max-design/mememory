from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from clinical_vlm.category_validation import (
    CandidateCategory,
    CandidateRef,
    EnvelopeValidationError,
    RejectionReason,
    score_safety,
    validate_vlm_categories,
)
from clinical_vlm.interfaces import DocumentInput, RenderedPage
from clinical_vlm.models import FactType, Negation

FIXTURE_PATH = Path(__file__).parent / "fixtures/qwen7b_contract_v2_raw.json"

REFERENCE = """PATIENT: TEST PATIENT
DATE: 15 SEP 2026

COMPLETE BLOOD COUNT

Hemoglobin        13.5 g/dL       12.0 - 16.0
Platelet Count    291 x10^3/uL    150 - 450
WBC Count         7.4 x10^3/uL    4.0 - 11.0

IMPRESSION:
No evidence of anemia.

MEDICATIONS:
None."""


def _payload() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def _document(reference: str = REFERENCE) -> DocumentInput:
    return DocumentInput(
        document_id="synthetic-contract-v2",
        pages=(
            RenderedPage(
                page_number=1,
                image_path=Path("synthetic-contract-v2.png"),
                width=1200,
                height=1600,
                dpi=200,
                local_reference_text=reference,
            ),
        ),
    )


def test_valid_lab_is_accepted() -> None:
    result = validate_vlm_categories(_payload(), document=_document())
    labs = [
        candidate
        for candidate in result.accepted
        if candidate.ref.category is CandidateCategory.LAB
    ]
    assert len(labs) == 3


def test_malformed_lab_does_not_affect_other_valid_labs() -> None:
    payload = _payload()
    payload["labs"][1]["value"] = "291 x10^3/uL"
    result = validate_vlm_categories(payload, document=_document())
    accepted_labs = [item for item in result.accepted if item.ref.category is CandidateCategory.LAB]
    rejected_labs = [item for item in result.rejected if item.ref.category is CandidateCategory.LAB]
    assert len(accepted_labs) == 2
    assert len(rejected_labs) == 1
    assert rejected_labs[0].reason_code is RejectionReason.UNSUPPORTED_VALUE


@pytest.mark.parametrize(
    "sentinel",
    [
        "none",
        "None.",
        "nil",
        "n/a",
        "not applicable",
        "no medications",
        "no medication",
        "no known medications",
    ],
)
def test_medication_absence_sentinel_is_rejected(sentinel: str) -> None:
    payload = _payload()
    payload["medications"][0]["name"] = sentinel
    result = validate_vlm_categories(payload, document=_document())
    medication = next(
        item for item in result.rejected if item.ref.category is CandidateCategory.MEDICATION
    )
    assert medication.reason_code is RejectionReason.ABSENCE_SENTINEL_AS_ENTITY


def test_valid_medication_survives_beside_none_sentinel() -> None:
    payload = _payload()
    payload["medications"] = [
        {
            "name": "Metformin",
            "strength": "500 mg",
            "dose": None,
            "route": None,
            "frequency": "daily",
            "page": 1,
            "source_text": "Metformin 500 mg daily",
        },
        payload["medications"][0],
    ]
    reference = REFERENCE.replace("None.", "Metformin 500 mg daily\nNone.")
    result = validate_vlm_categories(payload, document=_document(reference))
    accepted = [item for item in result.accepted if item.ref.category is CandidateCategory.MEDICATION]
    rejected = [item for item in result.rejected if item.ref.category is CandidateCategory.MEDICATION]
    assert [item.ref.index for item in accepted] == [0]
    assert [item.ref.index for item in rejected] == [1]
    assert rejected[0].reason_code is RejectionReason.ABSENCE_SENTINEL_AS_ENTITY


def test_unsupported_diagnosis_does_not_suppress_labs() -> None:
    payload = _payload()
    payload["diagnoses"][0]["assertion"] = "confirmed"
    result = validate_vlm_categories(payload, document=_document())
    assert result.metrics.category_accepted_counts["lab"] == 3
    diagnosis = next(
        item for item in result.rejected if item.ref.category is CandidateCategory.DIAGNOSIS
    )
    assert diagnosis.reason_code is RejectionReason.INVALID_ASSERTION


def test_negated_diagnosis_remains_negated() -> None:
    result = validate_vlm_categories(_payload(), document=_document())
    diagnosis = next(fact for fact in result.canonical.facts if fact.type is FactType.DIAGNOSIS)
    assert diagnosis.context.negation is Negation.NEGATED


def test_assertion_evidence_disagreement_rejects_only_diagnosis() -> None:
    payload = _payload()
    payload["diagnoses"][0]["assertion"] = "present"
    result = validate_vlm_categories(payload, document=_document())
    assert result.metrics.category_accepted_counts["lab"] == 3
    diagnosis = next(
        item for item in result.rejected if item.ref.category is CandidateCategory.DIAGNOSIS
    )
    assert diagnosis.reason_code is RejectionReason.CONTEXT_MISMATCH


def test_missing_provenance_rejects_only_affected_candidate() -> None:
    payload = _payload()
    del payload["labs"][0]["source_text"]
    result = validate_vlm_categories(payload, document=_document())
    assert result.metrics.category_accepted_counts["lab"] == 2
    assert result.rejected[0].ref == CandidateRef(CandidateCategory.LAB, 0)
    assert result.rejected[0].reason_code is RejectionReason.MISSING_PROVENANCE


@pytest.mark.parametrize(
    "payload",
    ["not json", [], {"patient": {}, "labs": [], "diagnoses": []}],
)
def test_malformed_document_envelope_fails_globally(payload: object) -> None:
    with pytest.raises(EnvelopeValidationError):
        validate_vlm_categories(payload, document=_document())  # type: ignore[arg-type]


def test_rejected_candidates_never_reach_canonical_adapter() -> None:
    result = validate_vlm_categories(_payload(), document=_document())
    assert all(fact.type is not FactType.MEDICATION for fact in result.canonical.facts)
    assert CandidateRef(CandidateCategory.MEDICATION, 0) in {
        item.ref for item in result.rejected
    }


def test_rejection_log_contains_no_candidate_content() -> None:
    payload = _payload()
    payload["medications"] = [
        {
            "name": "SYNTHETIC SECRET MEDICATION",
            "page": 1,
            "source_text": "SYNTHETIC SECRET MEDICATION",
        }
    ]
    result = validate_vlm_categories(payload, document=_document())
    serialized = json.dumps(result.safe_rejection_log())
    assert "SYNTHETIC SECRET MEDICATION" not in serialized
    assert "GROUNDING_MISMATCH" in serialized


def test_allergy_category_is_independently_supported() -> None:
    payload = _payload()
    payload["allergies"] = [
        {
            "allergen": "Penicillin",
            "assertion": "present",
            "reaction": "rash",
            "severity": None,
            "page": 1,
            "source_text": "Penicillin - rash",
        }
    ]
    result = validate_vlm_categories(
        payload,
        document=_document(REFERENCE + "\nALLERGIES:\nPenicillin - rash"),
    )
    assert result.metrics.category_accepted_counts["allergy"] == 1
    assert any(fact.type is FactType.ALLERGY for fact in result.canonical.facts)


def test_deterministic_order_and_result() -> None:
    payload = _payload()
    first = validate_vlm_categories(copy.deepcopy(payload), document=_document())
    second = validate_vlm_categories(copy.deepcopy(payload), document=_document())
    assert first == second
    assert [item.ref for item in first.accepted] == [
        CandidateRef(CandidateCategory.PATIENT, 0),
        CandidateRef(CandidateCategory.LAB, 0),
        CandidateRef(CandidateCategory.LAB, 1),
        CandidateRef(CandidateCategory.LAB, 2),
        CandidateRef(CandidateCategory.DIAGNOSIS, 0),
    ]
    assert [item.ref for item in first.rejected] == [
        CandidateRef(CandidateCategory.MEDICATION, 0)
    ]


def test_frozen_qwen_fixture_recovers_only_safe_candidates() -> None:
    result = validate_vlm_categories(FIXTURE_PATH.read_text(), document=_document())
    expected_valid = frozenset(
        {
            CandidateRef(CandidateCategory.PATIENT, 0),
            CandidateRef(CandidateCategory.LAB, 0),
            CandidateRef(CandidateCategory.LAB, 1),
            CandidateRef(CandidateCategory.LAB, 2),
            CandidateRef(CandidateCategory.DIAGNOSIS, 0),
        }
    )
    expected_unsafe = frozenset({CandidateRef(CandidateCategory.MEDICATION, 0)})
    safety = score_safety(
        result,
        expected_valid=expected_valid,
        expected_unsafe=expected_unsafe,
    )

    tuples = {
        (
            fact.data["test_name"],
            fact.data["value"],
            fact.data["unit"],
        )
        for fact in result.canonical.facts
        if fact.type is FactType.LAB_RESULT
    }
    assert tuples == {
        ("Hemoglobin", "13.5", "g/dL"),
        ("Platelet Count", "291", "x10^3/uL"),
        ("WBC Count", "7.4", "x10^3/uL"),
    }
    assert result.metrics.total_candidates == 6
    assert result.metrics.accepted_candidates == 5
    assert result.metrics.rejected_candidates == 1
    assert result.metrics.candidate_acceptance_rate == pytest.approx(5 / 6)
    assert result.metrics.category_accepted_counts == {
        "diagnosis": 1,
        "lab": 3,
        "patient": 1,
    }
    assert result.metrics.category_rejected_counts == {"medication": 1}
    assert safety.unsafe_candidates_accepted == 0
    assert safety.valid_candidates_lost == 0
    assert safety.partial_recovery_rate == 1.0
