"""Evidence-first reconciliation for OCR/OpenMed and image-VLM candidates.

This module is experiment-only. It combines independently produced canonical
facts without normalizing or repairing their medical content.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import Enum

from .interfaces import DocumentInput
from .models import ClinicalFact, FactType
from .provenance import validate_fact_grounding


class CandidateProvider(str, Enum):
    OCR_OPENMED = "ocr_openmed"
    QWEN_VLM = "qwen_vlm"


class ReconciliationDecision(str, Enum):
    APPROVED = "approved"
    NEEDS_REVIEW = "needs_review"
    REJECTED = "rejected"


@dataclass(frozen=True, slots=True)
class SourcedFact:
    provider: CandidateProvider
    fact: ClinicalFact


@dataclass(frozen=True, slots=True)
class ReconciledCandidate:
    fact: ClinicalFact
    decision: ReconciliationDecision
    providers: tuple[CandidateProvider, ...]
    reasons: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ReconciliationResult:
    candidates: tuple[ReconciledCandidate, ...]
    rejected: tuple[ReconciledCandidate, ...]


def _text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def _identity(fact: ClinicalFact) -> tuple[object, ...]:
    field = {
        FactType.LAB_RESULT: "test_name",
        FactType.MEDICATION: "name",
        FactType.DIAGNOSIS: "name",
        FactType.ALLERGY: "allergen",
        FactType.VITAL: "measurement_type",
        FactType.PROCEDURE: "procedure_name",
    }.get(fact.type)
    value = fact.data.get(field) if field else fact.value
    return fact.type.value, fact.page, _text(value)


def _semantic_signature(fact: ClinicalFact) -> tuple[object, ...]:
    return (
        _identity(fact),
        _text(fact.value),
        fact.context.subject.value,
        fact.context.negation.value,
        fact.context.certainty.value,
        fact.context.temporality.value,
        json.dumps(fact.data, sort_keys=True, separators=(",", ":"), default=str).casefold(),
    )


def _unsafe_sentinel(fact: ClinicalFact) -> str | None:
    if fact.type is FactType.MEDICATION and _text(fact.data.get("name")) in {
        "none",
        "nil",
        "no medications",
        "no medication",
    }:
        return "MEDICATION_SENTINEL"
    return None


def _preferred(entries: list[SourcedFact]) -> ClinicalFact:
    """Select existing evidence deterministically without changing its content."""

    return max(
        entries,
        key=lambda item: (
            item.fact.confidence,
            item.provider is CandidateProvider.OCR_OPENMED,
            len(item.fact.source_block_ids),
        ),
    ).fact


def reconcile_candidates(
    candidates: list[SourcedFact], document: DocumentInput
) -> ReconciliationResult:
    """Approve exact cross-provider agreement; review ambiguity; reject unsafe facts."""

    valid: list[SourcedFact] = []
    rejected: list[ReconciledCandidate] = []
    for candidate in candidates:
        sentinel = _unsafe_sentinel(candidate.fact)
        grounding = validate_fact_grounding(candidate.fact, document)
        reason = sentinel or (None if grounding.valid else grounding.reason)
        if reason:
            rejected.append(
                ReconciledCandidate(
                    fact=candidate.fact,
                    decision=ReconciliationDecision.REJECTED,
                    providers=(candidate.provider,),
                    reasons=(reason,),
                )
            )
        else:
            valid.append(candidate)

    groups: dict[tuple[object, ...], list[SourcedFact]] = {}
    for candidate in valid:
        groups.setdefault(_identity(candidate.fact), []).append(candidate)

    resolved: list[ReconciledCandidate] = []
    for identity in sorted(groups, key=repr):
        entries = groups[identity]
        variants: dict[tuple[object, ...], list[SourcedFact]] = {}
        for entry in entries:
            variants.setdefault(_semantic_signature(entry.fact), []).append(entry)

        has_conflict = len(variants) > 1
        for signature in sorted(variants, key=repr):
            matching = variants[signature]
            providers = tuple(sorted({item.provider for item in matching}, key=str))
            cross_provider = len(providers) > 1
            if has_conflict:
                decision = ReconciliationDecision.NEEDS_REVIEW
                reasons = ("PROVIDER_CONFLICT",)
            elif cross_provider:
                decision = ReconciliationDecision.APPROVED
                reasons = ("INDEPENDENT_PROVIDER_AGREEMENT",)
            else:
                decision = ReconciliationDecision.NEEDS_REVIEW
                reasons = ("SINGLE_PROVIDER",)
            resolved.append(
                ReconciledCandidate(
                    fact=_preferred(matching),
                    decision=decision,
                    providers=providers,
                    reasons=reasons,
                )
            )

    return ReconciliationResult(tuple(resolved), tuple(rejected))
