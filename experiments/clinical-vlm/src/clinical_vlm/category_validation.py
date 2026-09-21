"""Fail-closed envelope and independent VLM candidate validation.

Envelope failures reject the complete model response. Once the fixed envelope is
usable, every candidate is validated independently. Invalid candidates never enter
the canonical adapter and never suppress unrelated valid candidates.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass
from enum import Enum
from typing import Any, Iterable

from pydantic import BaseModel, ValidationError

from .interfaces import DocumentInput
from .models import CanonicalExtraction, ClinicalFact
from .provenance import validate_fact_grounding
from .vlm_canonical_adapter import (
    adapt_allergy_candidate,
    adapt_diagnosis_candidate,
    adapt_lab_candidate,
    adapt_medication_candidate,
    adapt_patient_candidate,
)
from .vlm_schema import VLMAllergy, VLMDiagnosis, VLMLab, VLMMedication, VLMPatient


class CandidateCategory(str, Enum):
    PATIENT = "patient"
    LAB = "lab"
    DIAGNOSIS = "diagnosis"
    MEDICATION = "medication"
    ALLERGY = "allergy"


class RejectionReason(str, Enum):
    INVALID_SCHEMA = "INVALID_SCHEMA"
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"
    MISSING_PROVENANCE = "MISSING_PROVENANCE"
    GROUNDING_MISMATCH = "GROUNDING_MISMATCH"
    INVALID_ASSERTION = "INVALID_ASSERTION"
    ABSENCE_SENTINEL_AS_ENTITY = "ABSENCE_SENTINEL_AS_ENTITY"
    UNSUPPORTED_VALUE = "UNSUPPORTED_VALUE"
    UNSUPPORTED_UNIT = "UNSUPPORTED_UNIT"
    CONTEXT_MISMATCH = "CONTEXT_MISMATCH"


SAFE_SUMMARIES: dict[RejectionReason, str] = {
    RejectionReason.INVALID_SCHEMA: "candidate failed schema validation",
    RejectionReason.MISSING_REQUIRED_FIELD: "candidate is missing a required field",
    RejectionReason.MISSING_PROVENANCE: "candidate is missing required provenance",
    RejectionReason.GROUNDING_MISMATCH: "candidate evidence does not match its page",
    RejectionReason.INVALID_ASSERTION: "candidate assertion is unsupported",
    RejectionReason.ABSENCE_SENTINEL_AS_ENTITY: "invalid absence representation",
    RejectionReason.UNSUPPORTED_VALUE: "candidate value is unsupported",
    RejectionReason.UNSUPPORTED_UNIT: "candidate unit is unsupported",
    RejectionReason.CONTEXT_MISMATCH: "candidate context conflicts with evidence",
}

ABSENCE_SENTINELS = frozenset(
    {
        "none",
        "nil",
        "n/a",
        "not applicable",
        "no medication",
        "no medications",
        "no known medications",
    }
)

ALLOWED_ENVELOPE_KEYS = frozenset(
    {"patient", "labs", "diagnoses", "medications", "allergies"}
)
REQUIRED_ENVELOPE_KEYS = frozenset({"patient", "labs", "diagnoses", "medications"})


class EnvelopeValidationError(ValueError):
    """Safe global failure containing no model-produced content."""

    def __init__(self, reason_code: str = "INVALID_ENVELOPE") -> None:
        self.reason_code = reason_code
        super().__init__(reason_code)


@dataclass(frozen=True, slots=True, order=True)
class CandidateRef:
    category: CandidateCategory
    index: int


@dataclass(frozen=True, slots=True)
class AcceptedCandidate:
    ref: CandidateRef
    canonical_facts: tuple[ClinicalFact, ...]


@dataclass(frozen=True, slots=True)
class RejectedCandidate:
    ref: CandidateRef
    reason_code: RejectionReason
    safe_summary: str


@dataclass(frozen=True, slots=True)
class CategoryMetrics:
    total_candidates: int
    accepted_candidates: int
    rejected_candidates: int
    candidate_acceptance_rate: float
    category_accepted_counts: dict[str, int]
    category_rejected_counts: dict[str, int]


@dataclass(frozen=True, slots=True)
class SafetyMetrics:
    unsafe_candidates_accepted: int
    valid_candidates_lost: int
    partial_recovery_rate: float


@dataclass(frozen=True, slots=True)
class CategoryValidationResult:
    accepted: tuple[AcceptedCandidate, ...]
    rejected: tuple[RejectedCandidate, ...]
    canonical: CanonicalExtraction
    metrics: CategoryMetrics

    def safe_rejection_log(self) -> tuple[dict[str, str | int], ...]:
        return tuple(
            {
                "category": item.ref.category.value,
                "candidate_index": item.ref.index,
                "reason_code": item.reason_code.value,
                "safe_summary": item.safe_summary,
            }
            for item in self.rejected
        )


def _parse_envelope(raw: str | bytes | dict[str, Any]) -> dict[str, Any]:
    if isinstance(raw, (str, bytes)):
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise EnvelopeValidationError("MALFORMED_JSON") from error
    else:
        payload = raw

    if not isinstance(payload, dict):
        raise EnvelopeValidationError()
    if REQUIRED_ENVELOPE_KEYS - payload.keys():
        raise EnvelopeValidationError("MISSING_ENVELOPE_CATEGORY")
    if set(payload) - ALLOWED_ENVELOPE_KEYS:
        raise EnvelopeValidationError("UNKNOWN_ENVELOPE_CATEGORY")
    if not isinstance(payload["patient"], dict):
        raise EnvelopeValidationError("INVALID_PATIENT_ENVELOPE")
    for key in ("labs", "diagnoses", "medications", "allergies"):
        if key in payload and not isinstance(payload[key], list):
            raise EnvelopeValidationError("INVALID_CATEGORY_ENVELOPE")
    return payload


def _normalise_sentinel(value: str) -> str:
    return re.sub(r"[\s.;:]+$", "", " ".join(value.casefold().split()))


def _has_provenance(candidate: Any) -> bool:
    if not isinstance(candidate, dict):
        return False
    page = candidate.get("page")
    source_text = candidate.get("source_text")
    return isinstance(page, int) and page >= 1 and isinstance(source_text, str) and bool(
        source_text.strip()
    )


def _reason_from_validation_error(
    category: CandidateCategory, error: ValidationError
) -> RejectionReason:
    errors = error.errors(include_url=False, include_input=False)
    locations = {str(item["loc"][-1]) for item in errors if item["loc"]}
    messages = " ".join(str(item["msg"]).casefold() for item in errors)
    if {"page", "source_text"} & locations:
        return RejectionReason.MISSING_PROVENANCE
    if category is CandidateCategory.DIAGNOSIS and "assertion" in locations:
        return RejectionReason.INVALID_ASSERTION
    if category is CandidateCategory.LAB:
        if "value" in locations:
            return RejectionReason.UNSUPPORTED_VALUE
        if "unit" in locations or "complete unit" in messages:
            return RejectionReason.UNSUPPORTED_UNIT
        if "source_text" in messages:
            return RejectionReason.GROUNDING_MISMATCH
    if any(item["type"] == "missing" for item in errors):
        return RejectionReason.MISSING_REQUIRED_FIELD
    return RejectionReason.INVALID_SCHEMA


def _context_matches(assertion: str, source_text: str) -> bool:
    evidence = " ".join(source_text.casefold().split())
    absent = (
        "no evidence of",
        "negative for",
        "absence of",
        "without",
        "denies",
        "not present",
    )
    possible = ("possible", "suspected", "rule out", "cannot exclude", "may represent")
    historical = ("history of", "previous", "past history")
    family = ("family history", "mother", "father", "sibling")
    cue_map = {
        "absent": absent,
        "possible": possible,
        "historical": historical,
        "family_history": family,
    }
    if assertion in cue_map:
        return any(cue in evidence for cue in cue_map[assertion])
    if assertion == "present":
        conflicting = absent + possible + historical + family
        return not any(cue in evidence for cue in conflicting)
    return False


def _facts_for_candidate(category: CandidateCategory, candidate: BaseModel) -> tuple[ClinicalFact, ...]:
    if category is CandidateCategory.PATIENT:
        return tuple(adapt_patient_candidate(candidate))  # type: ignore[arg-type]
    if category is CandidateCategory.LAB:
        return (adapt_lab_candidate(candidate),)  # type: ignore[arg-type]
    if category is CandidateCategory.DIAGNOSIS:
        return (adapt_diagnosis_candidate(candidate),)  # type: ignore[arg-type]
    if category is CandidateCategory.MEDICATION:
        return (adapt_medication_candidate(candidate),)  # type: ignore[arg-type]
    return (adapt_allergy_candidate(candidate),)  # type: ignore[arg-type]


def _reject(ref: CandidateRef, reason: RejectionReason) -> RejectedCandidate:
    return RejectedCandidate(ref, reason, SAFE_SUMMARIES[reason])


def _validate_candidate(
    *,
    ref: CandidateRef,
    raw_candidate: Any,
    model: type[BaseModel],
    document: DocumentInput,
) -> AcceptedCandidate | RejectedCandidate:
    if not _has_provenance(raw_candidate):
        return _reject(ref, RejectionReason.MISSING_PROVENANCE)

    if ref.category is CandidateCategory.MEDICATION and isinstance(raw_candidate, dict):
        name = raw_candidate.get("name")
        if isinstance(name, str) and _normalise_sentinel(name) in ABSENCE_SENTINELS:
            return _reject(ref, RejectionReason.ABSENCE_SENTINEL_AS_ENTITY)

    try:
        candidate = model.model_validate(raw_candidate)
    except ValidationError as error:
        return _reject(ref, _reason_from_validation_error(ref.category, error))

    if ref.category in {CandidateCategory.DIAGNOSIS, CandidateCategory.ALLERGY}:
        assertion = str(getattr(candidate, "assertion"))
        source_text = str(getattr(candidate, "source_text"))
        if not _context_matches(assertion, source_text):
            return _reject(ref, RejectionReason.CONTEXT_MISMATCH)

    facts = _facts_for_candidate(ref.category, candidate)
    if not facts:
        return _reject(ref, RejectionReason.MISSING_REQUIRED_FIELD)
    if any(not validate_fact_grounding(fact, document).valid for fact in facts):
        return _reject(ref, RejectionReason.GROUNDING_MISMATCH)
    return AcceptedCandidate(ref, facts)


def _metrics(
    accepted: Iterable[AcceptedCandidate], rejected: Iterable[RejectedCandidate]
) -> CategoryMetrics:
    accepted_tuple = tuple(accepted)
    rejected_tuple = tuple(rejected)
    accepted_counts = Counter(item.ref.category.value for item in accepted_tuple)
    rejected_counts = Counter(item.ref.category.value for item in rejected_tuple)
    total = len(accepted_tuple) + len(rejected_tuple)
    return CategoryMetrics(
        total_candidates=total,
        accepted_candidates=len(accepted_tuple),
        rejected_candidates=len(rejected_tuple),
        candidate_acceptance_rate=len(accepted_tuple) / total if total else 0.0,
        category_accepted_counts=dict(sorted(accepted_counts.items())),
        category_rejected_counts=dict(sorted(rejected_counts.items())),
    )


def validate_vlm_categories(
    raw: str | bytes | dict[str, Any], *, document: DocumentInput
) -> CategoryValidationResult:
    payload = _parse_envelope(raw)
    ordered: tuple[tuple[CandidateCategory, list[Any], type[BaseModel]], ...] = (
        (CandidateCategory.PATIENT, [payload["patient"]], VLMPatient),
        (CandidateCategory.LAB, payload["labs"], VLMLab),
        (CandidateCategory.DIAGNOSIS, payload["diagnoses"], VLMDiagnosis),
        (CandidateCategory.MEDICATION, payload["medications"], VLMMedication),
        (CandidateCategory.ALLERGY, payload.get("allergies", []), VLMAllergy),
    )

    accepted: list[AcceptedCandidate] = []
    rejected: list[RejectedCandidate] = []
    for category, candidates, model in ordered:
        for index, candidate in enumerate(candidates):
            outcome = _validate_candidate(
                ref=CandidateRef(category, index),
                raw_candidate=candidate,
                model=model,
                document=document,
            )
            if isinstance(outcome, AcceptedCandidate):
                accepted.append(outcome)
            else:
                rejected.append(outcome)

    facts = [fact for item in accepted for fact in item.canonical_facts]
    canonical = CanonicalExtraction(document_id=document.document_id, facts=facts, warnings=[])
    return CategoryValidationResult(
        accepted=tuple(accepted),
        rejected=tuple(rejected),
        canonical=canonical,
        metrics=_metrics(accepted, rejected),
    )


def score_safety(
    result: CategoryValidationResult,
    *,
    expected_valid: frozenset[CandidateRef],
    expected_unsafe: frozenset[CandidateRef],
) -> SafetyMetrics:
    accepted = frozenset(item.ref for item in result.accepted)
    rejected = frozenset(item.ref for item in result.rejected)
    unsafe_accepted = len(accepted & expected_unsafe)
    valid_lost = len(rejected & expected_valid)
    recovered = len(accepted & expected_valid)
    return SafetyMetrics(
        unsafe_candidates_accepted=unsafe_accepted,
        valid_candidates_lost=valid_lost,
        partial_recovery_rate=recovered / len(expected_valid) if expected_valid else 1.0,
    )
