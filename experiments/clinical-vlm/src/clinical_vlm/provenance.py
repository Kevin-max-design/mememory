"""Source-grounding checks that never invent evidence or coordinates."""

from __future__ import annotations

import re
from dataclasses import dataclass

from .interfaces import DocumentInput
from .models import CanonicalExtraction, ClinicalFact


def _normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


@dataclass(frozen=True, slots=True)
class GroundingResult:
    valid: bool
    reason: str


def validate_fact_grounding(fact: ClinicalFact, document: DocumentInput) -> GroundingResult:
    pages = {page.page_number: page for page in document.pages}
    page = pages.get(fact.page)
    if page is None:
        return GroundingResult(False, "PAGE_NOT_IN_INPUT")
    if fact.bbox is not None:
        x0, y0, x1, y1 = fact.bbox
        if x1 > page.width or y1 > page.height or x0 >= page.width or y0 >= page.height:
            return GroundingResult(False, "BBOX_OUT_OF_PAGE")
    if page.local_reference_text is None:
        return GroundingResult(True, "SOURCE_TEXT_PRESENT_UNVERIFIED")
    evidence = _normalized(fact.source_text)
    source = _normalized(page.local_reference_text)
    if evidence not in source:
        return GroundingResult(False, "SOURCE_TEXT_MISMATCH")
    return GroundingResult(True, "GROUNDED")


def grounding_results(
    extraction: CanonicalExtraction, document: DocumentInput
) -> list[GroundingResult]:
    return [validate_fact_grounding(fact, document) for fact in extraction.facts]
