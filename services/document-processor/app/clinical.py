"""Source-bound OpenMed-first clinical proposal provider."""

import re
from dataclasses import dataclass
from importlib.metadata import version
from typing import ClassVar, Protocol
from uuid import UUID

from app.schemas import BrainCandidate, ClinicalBrainMetadata, PageAnalysis

LABS = [
    (re.compile(r"^(?:ha?emoglobin|hgb|hb)\b", re.IGNORECASE), "Haemoglobin"),
    (re.compile(r"^(?:platelet(?: count)?|platelets|plt)\b", re.IGNORECASE), "Platelet Count"),
    (re.compile(r"^(?:(?:total )?wbc(?: count)?|tc)\b", re.IGNORECASE), "WBC Count"),
    (re.compile(r"^(?:serum )?creatinine\b", re.IGNORECASE), "Creatinine"),
    (re.compile(r"^(?:hba1c|glycosylated hemoglobin)\b", re.IGNORECASE), "HbA1c"),
    (re.compile(r"^(?:tsh|thyroid stimulating hormone)\b", re.IGNORECASE), "TSH"),
    (re.compile(r"^(?:ldl(?: cholesterol)?)\b", re.IGNORECASE), "LDL Cholesterol"),
]
VALUE = re.compile(
    r"^(?P<value><=?|>=?)?\s*(?P<number>\d+(?:\.\d+)?)\s*"
    r"(?P<unit>[^\s]+(?:\s*/\s*[^\s]+)?)?"
    r"(?:\s+(?P<range>\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?))?",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class ClinicalEnhancement:
    normalized_units: tuple[str, ...] = ()
    provider: str = "none"
    version: str = "unavailable"
    status: str = "disabled"


@dataclass(frozen=True, slots=True)
class ClinicalBrainResult:
    candidates: tuple[BrainCandidate, ...]
    metadata: ClinicalBrainMetadata


class ClinicalNlpProvider(Protocol):
    def enhance(self, text: str) -> ClinicalEnhancement: ...
    def analyze(self, document_id: UUID, pages: list[PageAnalysis]) -> ClinicalBrainResult: ...


class NoopClinicalNlpProvider:
    def enhance(self, text: str) -> ClinicalEnhancement:
        del text
        return ClinicalEnhancement()

    def analyze(self, document_id: UUID, pages: list[PageAnalysis]) -> ClinicalBrainResult:
        del document_id, pages
        return ClinicalBrainResult((), ClinicalBrainMetadata())


class OpenMedClinicalNlpProvider:
    """Use verified OpenMed 2.3 measurement APIs with MedMemory provenance gates."""

    apis: ClassVar[list[str]] = [
        "split_measurement_text",
        "normalize_unit_surface",
        "parse_locale_number",
        "parse_reference_range",
    ]

    def _imports(self):
        from openmed.clinical import (
            normalize_unit_surface,
            parse_locale_number,
            parse_reference_range,
            split_measurement_text,
        )
        return normalize_unit_surface, parse_locale_number, parse_reference_range, split_measurement_text

    def enhance(self, text: str) -> ClinicalEnhancement:
        normalize_unit, _, _, split_measurement = self._imports()
        units = []
        for line in text.splitlines():
            measurement = split_measurement(line.strip())
            if measurement and (unit := normalize_unit(measurement[1])):
                units.append(unit)
        return ClinicalEnhancement(tuple(units), "openmed", version("openmed"), "available")

    def analyze(self, document_id: UUID, pages: list[PageAnalysis]) -> ClinicalBrainResult:
        del document_id
        normalize_unit, parse_number, parse_range, split_measurement = self._imports()
        proposed: list[BrainCandidate] = []
        rejected: dict[str, int] = {}
        for page in pages:
            for block in page.blocks:
                if block.region != "main_content":
                    rejected["likely_header_footer"] = rejected.get("likely_header_footer", 0) + 1
                    continue
                for raw_line in block.text.splitlines():
                    line = raw_line.strip()
                    match = next(((pattern.match(line), name) for pattern, name in LABS if pattern.match(line)), None)
                    if not match:
                        continue
                    anchor, test_name = match
                    value = VALUE.match(line[anchor.end():].strip())
                    if not value:
                        rejected["no_same_row_value"] = rejected.get("no_same_row_value", 0) + 1
                        continue
                    original = f"{value.group('value') or ''}{value.group('number')}"
                    unit_text = (value.group("unit") or "").strip()
                    measurement = split_measurement(f"{value.group('number')} {unit_text}") if unit_text else None
                    unit = normalize_unit(measurement[1]) if measurement else None
                    numeric = None if value.group("value") else parse_number(value.group("number"))
                    range_text = value.group("range")
                    if range_text:
                        parse_range(range_text)
                    proposed.append(BrainCandidate(
                        record_type="lab", source_page_number=page.page_number,
                        source_block_ids=[block.id], source_text=line, confidence="high",
                        data={"test_name": test_name, "original_value": original,
                              "numeric_value": numeric, "unit": unit or unit_text or None,
                              "reference_range": range_text, "flag": None,
                              "specimen": None, "collected_at": None},
                    ))
        metadata = ClinicalBrainMetadata(
            name="openmed", version=version("openmed"), invoked=True, model_backed=False,
            apis_used=self.apis, warnings=["model_backed_ner_not_enabled"],
            candidates_before_validation=len(proposed), candidates_after_validation=len(proposed),
            rejected_reasons=rejected,
        )
        return ClinicalBrainResult(tuple(proposed), metadata)


class CompositeClinicalNlpProvider:
    def __init__(self, primary: ClinicalNlpProvider, fallback: ClinicalNlpProvider):
        self.primary, self.fallback = primary, fallback

    def enhance(self, text: str) -> ClinicalEnhancement:
        try:
            return self.primary.enhance(text)
        except (ImportError, RuntimeError, ValueError, TypeError):
            return self.fallback.enhance(text)

    def analyze(self, document_id: UUID, pages: list[PageAnalysis]) -> ClinicalBrainResult:
        try:
            return self.primary.analyze(document_id, pages)
        except (ImportError, RuntimeError, ValueError, TypeError):
            result = self.fallback.analyze(document_id, pages)
            result.metadata.warnings.append("openmed_unavailable_fallback")
            return result
