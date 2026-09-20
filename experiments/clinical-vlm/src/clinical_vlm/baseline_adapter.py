"""Convert unchanged MedMemory baseline candidates to the experiment schema."""

from __future__ import annotations

from typing import Any

from .models import (
    CanonicalExtraction,
    Certainty,
    ClinicalContext,
    ClinicalFact,
    FactType,
    Negation,
    Subject,
    Temporality,
)

TYPE_MAP = {
    "lab": FactType.LAB_RESULT,
    "medication": FactType.MEDICATION,
    "diagnosis": FactType.DIAGNOSIS,
    "allergy": FactType.ALLERGY,
    "vital": FactType.VITAL,
    "procedure": FactType.PROCEDURE,
    "doctor_note": FactType.CLINICAL_FINDING,
}
CONFIDENCE_MAP = {"high": 0.9, "medium": 0.65, "low": 0.35}


def _first(candidate: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in candidate:
            return candidate[key]
    return default


def _enum(enum_type: type[Any], value: Any, default: Any) -> Any:
    try:
        return enum_type(str(value))
    except ValueError:
        return default


def _fact_value(kind: FactType, data: dict[str, Any]) -> Any:
    keys = {
        FactType.LAB_RESULT: ("original_value", "value", "numeric_value"),
        FactType.MEDICATION: ("name",),
        FactType.DIAGNOSIS: ("name",),
        FactType.ALLERGY: ("allergen",),
        FactType.VITAL: ("original_value", "numeric_value"),
        FactType.PROCEDURE: ("procedure_name",),
        FactType.CLINICAL_FINDING: ("text",),
    }[kind]
    return next((data[key] for key in keys if data.get(key) not in (None, "")), "unknown")


def adapt_baseline_candidates(document_id: str, candidates: list[dict[str, Any]]) -> CanonicalExtraction:
    facts: list[ClinicalFact] = []
    for candidate in candidates:
        record_type = _first(candidate, "record_type", "recordType")
        if record_type not in TYPE_MAP:
            continue
        kind = TYPE_MAP[record_type]
        raw_data = dict(candidate.get("data") or {})
        if kind is FactType.LAB_RESULT:
            raw_data.setdefault("value", raw_data.get("original_value", raw_data.get("numeric_value")))
        assertion = dict(candidate.get("assertion") or {})
        source_blocks = _first(candidate, "source_block_ids", "sourceBlockIds", default=[])
        confidence = candidate.get("confidence", "low")
        facts.append(
            ClinicalFact(
                type=kind,
                value=_fact_value(kind, raw_data),
                normalized_value=candidate.get("normalized_name"),
                page=_first(candidate, "source_page_number", "sourcePageNumber"),
                source_text=_first(candidate, "source_text", "sourceText"),
                source_block_ids=list(source_blocks),
                bbox=None,
                section=assertion.get("section_type"),
                confidence=CONFIDENCE_MAP.get(str(confidence), 0.35),
                context=ClinicalContext(
                    subject=_enum(Subject, assertion.get("subject", "patient"), Subject.PATIENT),
                    negation=_enum(Negation, assertion.get("negation", "affirmed"), Negation.UNKNOWN),
                    certainty=_enum(Certainty, assertion.get("certainty", "certain"), Certainty.UNKNOWN),
                    temporality=_enum(Temporality, assertion.get("temporality", "unknown"), Temporality.UNKNOWN),
                ),
                data=raw_data,
            )
        )
    return CanonicalExtraction(document_id=document_id, facts=facts)
