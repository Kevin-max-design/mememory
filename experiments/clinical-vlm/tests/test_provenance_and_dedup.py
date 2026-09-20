from __future__ import annotations

from pathlib import Path

from clinical_vlm.dedup import deduplicate_facts
from clinical_vlm.interfaces import DocumentInput, RenderedPage
from clinical_vlm.models import CanonicalExtraction, Negation
from clinical_vlm.provenance import validate_fact_grounding


def _document() -> DocumentInput:
    return DocumentInput(
        document_id="synthetic-document-001",
        pages=(
            RenderedPage(
                page_number=1,
                image_path=Path("/private/tmp/synthetic-page.png"),
                width=1000,
                height=1400,
                dpi=200,
                local_reference_text="Synthetic analyte A 13.5 g/dL",
            ),
        ),
    )


def test_page_and_source_text_grounding(prediction_payload: dict) -> None:
    fact = CanonicalExtraction.model_validate(prediction_payload).facts[0]
    result = validate_fact_grounding(fact, _document())
    assert result.valid
    assert result.reason == "GROUNDED"


def test_missing_page_is_not_grounded(prediction_payload: dict) -> None:
    fact = CanonicalExtraction.model_validate(prediction_payload).facts[2]
    result = validate_fact_grounding(fact, _document())
    assert not result.valid
    assert result.reason == "PAGE_NOT_IN_INPUT"


def test_bbox_must_fit_page(prediction_payload: dict) -> None:
    prediction_payload["facts"][0]["bbox"] = [0, 0, 1200, 20]
    fact = CanonicalExtraction.model_validate(prediction_payload).facts[0]
    result = validate_fact_grounding(fact, _document())
    assert not result.valid
    assert result.reason == "BBOX_OUT_OF_PAGE"


def test_dedup_keeps_best_confidence(prediction_payload: dict) -> None:
    extraction = CanonicalExtraction.model_validate(prediction_payload)
    original = extraction.facts[0]
    lower = original.model_copy(update={"confidence": 0.2})
    deduplicated = deduplicate_facts([lower, original])
    assert deduplicated == [original]


def test_dedup_preserves_different_negation(prediction_payload: dict) -> None:
    extraction = CanonicalExtraction.model_validate(prediction_payload)
    original = extraction.facts[2]
    affirmed = original.model_copy(
        update={"context": original.context.model_copy(update={"negation": Negation.AFFIRMED})}
    )
    assert len(deduplicate_facts([original, affirmed])) == 2
