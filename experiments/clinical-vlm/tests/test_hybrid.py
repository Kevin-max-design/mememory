from __future__ import annotations

from pathlib import Path

from clinical_vlm.hybrid import (
    CandidateProvider,
    ReconciliationDecision,
    SourcedFact,
    reconcile_candidates,
)
from clinical_vlm.interfaces import DocumentInput, RenderedPage
from clinical_vlm.models import ClinicalContext, ClinicalFact, FactType, Negation


REFERENCE = """Hemoglobin 13.5 g/dL 12.0 - 16.0
No evidence of anemia.
MEDICATIONS: None."""


def _document() -> DocumentInput:
    return DocumentInput(
        document_id="synthetic",
        pages=(
            RenderedPage(
                page_number=1,
                image_path=Path("synthetic.png"),
                width=1000,
                height=1000,
                dpi=200,
                local_reference_text=REFERENCE,
            ),
        ),
    )


def _lab(value: str = "13.5", source: str = "Hemoglobin 13.5 g/dL 12.0 - 16.0") -> ClinicalFact:
    return ClinicalFact(
        type=FactType.LAB_RESULT,
        value=value,
        page=1,
        source_text=source,
        confidence=0.9,
        data={"test_name": "Hemoglobin", "value": value, "unit": "g/dL"},
    )


def _diagnosis(negation: Negation) -> ClinicalFact:
    return ClinicalFact(
        type=FactType.DIAGNOSIS,
        value="anemia",
        page=1,
        source_text="No evidence of anemia.",
        confidence=0.9,
        context=ClinicalContext(negation=negation),
        data={"name": "anemia", "status": negation.value},
    )


def test_exact_independent_agreement_is_approved() -> None:
    result = reconcile_candidates(
        [
            SourcedFact(CandidateProvider.OCR_OPENMED, _lab()),
            SourcedFact(CandidateProvider.QWEN_VLM, _lab()),
        ],
        _document(),
    )
    assert len(result.candidates) == 1
    assert result.candidates[0].decision is ReconciliationDecision.APPROVED
    assert set(result.candidates[0].providers) == {
        CandidateProvider.OCR_OPENMED,
        CandidateProvider.QWEN_VLM,
    }


def test_single_provider_candidate_requires_review() -> None:
    result = reconcile_candidates(
        [SourcedFact(CandidateProvider.OCR_OPENMED, _lab())], _document()
    )
    assert result.candidates[0].decision is ReconciliationDecision.NEEDS_REVIEW
    assert result.candidates[0].reasons == ("SINGLE_PROVIDER",)


def test_conflicting_lab_values_are_both_routed_to_review() -> None:
    result = reconcile_candidates(
        [
            SourcedFact(CandidateProvider.OCR_OPENMED, _lab("13.5")),
            SourcedFact(CandidateProvider.QWEN_VLM, _lab("15.5")),
        ],
        _document(),
    )
    assert len(result.candidates) == 2
    assert {candidate.fact.value for candidate in result.candidates} == {"13.5", "15.5"}
    assert all(
        candidate.decision is ReconciliationDecision.NEEDS_REVIEW
        for candidate in result.candidates
    )
    assert all(candidate.reasons == ("PROVIDER_CONFLICT",) for candidate in result.candidates)


def test_negation_conflict_cannot_be_auto_approved() -> None:
    result = reconcile_candidates(
        [
            SourcedFact(CandidateProvider.OCR_OPENMED, _diagnosis(Negation.NEGATED)),
            SourcedFact(CandidateProvider.QWEN_VLM, _diagnosis(Negation.AFFIRMED)),
        ],
        _document(),
    )
    assert len(result.candidates) == 2
    assert all(
        candidate.decision is ReconciliationDecision.NEEDS_REVIEW
        for candidate in result.candidates
    )


def test_ungrounded_fact_is_rejected() -> None:
    result = reconcile_candidates(
        [SourcedFact(CandidateProvider.QWEN_VLM, _lab(source="unsupported evidence"))],
        _document(),
    )
    assert result.candidates == ()
    assert result.rejected[0].decision is ReconciliationDecision.REJECTED
    assert result.rejected[0].reasons == ("SOURCE_TEXT_MISMATCH",)


def test_medication_none_sentinel_is_rejected() -> None:
    fact = ClinicalFact(
        type=FactType.MEDICATION,
        value="None",
        page=1,
        source_text="MEDICATIONS: None.",
        confidence=0.9,
        data={"name": "None"},
    )
    result = reconcile_candidates(
        [SourcedFact(CandidateProvider.QWEN_VLM, fact)], _document()
    )
    assert result.candidates == ()
    assert result.rejected[0].reasons == ("MEDICATION_SENTINEL",)
