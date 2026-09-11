"""Source-bound OpenMed-first clinical proposal provider."""

import re
from dataclasses import dataclass
from functools import lru_cache
from importlib.metadata import version
from pathlib import Path
from typing import Any, ClassVar, Literal, Protocol
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
VALUE = re.compile(r"^(?P<op><=?|>=?)?\s*(?P<num>\d+(?:\.\d+)?)\s*(?P<unit>[^\s]+)?", re.IGNORECASE)
DIAGNOSIS = re.compile(
    r"^(?:diagnosis|impression|assessment|final diagnosis|known case of|past history of|history of|diagnosed with)\s*[:\-]?\s*(.+)$",
    re.IGNORECASE,
)
MEDICATION = re.compile(
    r"^(?:medication|medicine|rx|prescription|prescribed)\s*[:\-]\s*(.+)$", re.IGNORECASE
)
ALLERGY = re.compile(r"^(?:allergy|allergies|allergic to)\s*[:\-]?\s*(.+)$", re.IGNORECASE)
PROCEDURE = re.compile(
    r"^(?:procedure|procedure performed|operation)\s*[:\-]?\s*(.+)$", re.IGNORECASE
)
NEGATIVE_ALLERGY = re.compile(
    r"\b(?:no known (?:drug )?allerg(?:y|ies)|nkda|no allergies|denies?\b.*\ballerg)", re.IGNORECASE
)
FALSE_POSITIVE = re.compile(
    r"^(?::|-|pp|sugar|report|report id|patient|hospital|doctor|diagnosis|medication)$",
    re.IGNORECASE,
)
LABELS = ["diagnosis", "medication", "allergy", "procedure", "clinical finding"]
DEFAULT_OPENMED_MODEL = "urchade/gliner_large_bio-v0.1"
DEFAULT_OPENMED_TOKENIZER = "microsoft/deberta-v3-large"

SectionType = Literal[
    "diagnosis", "impression", "conclusion", "assessment", "history",
    "medication", "allergy", "procedure", "finding", "unknown",
]

SECTION_ALIASES: dict[str, SectionType] = {
    "diagnosis": "diagnosis", "final diagnosis": "diagnosis",
    "impression": "impression", "clinical impression": "impression",
    "conclusion": "conclusion", "assessment": "assessment",
    "past history": "history", "past medical history": "history",
    "history": "history", "known case of": "history",
    "medication": "medication", "medications": "medication",
    "prescription": "medication", "rx": "medication",
    "allergy": "allergy", "allergies": "allergy",
    "procedure": "procedure", "procedures": "procedure",
    "2d echo": "procedure", "2d echo cardiogram": "procedure",
    "echocardiogram": "procedure", "ultrasound": "procedure", "usg": "procedure",
    "findings": "finding", "report": "finding", "observations": "finding",
}
STRUCTURAL_BOUNDARY = re.compile(
    r"^(?:laboratory results?|lab results?|investigations?|reference ranges?|"
    r"patient details?|demographics?|billing|address|contact)(?:\s*:)?$", re.IGNORECASE
)
LAB_ROW = re.compile(
    r"^(?:ha?emoglobin|hgb|hb|platelets?|plt|wbc|rbc|creatinine|hba1c|tsh|ldl|"
    r"triglycerides?|glucose|bilirubin|albumin)\b.*\d", re.IGNORECASE
)


@dataclass(frozen=True, slots=True)
class SectionContext:
    section_type: SectionType
    heading_block_id: str
    distance: int


def classify_section_heading(text: str) -> SectionType | None:
    """Classify only short, known heading labels; never infer headings from prose."""
    normalized = re.sub(r"\s+", " ", text.strip().rstrip(":")).casefold()
    normalized = re.sub(r"[^a-z0-9 /-]", "", normalized).strip()
    if not normalized or len(normalized) > 32 or len(normalized.split()) > 4:
        return None
    if LAB_ROW.match(normalized) or re.search(r"\d", normalized) and normalized not in {"2d echo", "2d echo cardiogram"}:
        return None
    return SECTION_ALIASES.get(normalized)


def local_model_available(model_id: str = DEFAULT_OPENMED_MODEL) -> bool:
    """Check the Hugging Face cache without network access or model initialization."""
    try:
        from huggingface_hub import snapshot_download

        snapshot_download(model_id, local_files_only=True)
        return True
    except (ImportError, OSError, RuntimeError, ValueError):
        return False


def build_openmed_provider(model_id: str = DEFAULT_OPENMED_MODEL) -> "CompositeClinicalNlpProvider":
    """Build the production OpenMed-first provider with a safe no-op fallback."""
    return CompositeClinicalNlpProvider(
        OpenMedClinicalNlpProvider(model_id), NoopClinicalNlpProvider()
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
    """Run cached local OpenMed NER, then apply provenance and context gates."""

    apis: ClassVar[list[str]] = [
        "GLiNERHandle",
        "resolve_span_context",
        "parse_sig",
        "split_measurement_text",
        "normalize_unit_surface",
        "parse_locale_number",
    ]

    def __init__(self, model_id: str = "", *, threshold: float = 0.3, predict: Any = None):
        self.model_id, self.threshold, self.predict_override = model_id, threshold, predict

    def _imports(self):
        from openmed.clinical import (
            normalize_unit_surface,
            parse_locale_number,
            parse_sig,
            resolve_span_context,
            split_measurement_text,
        )

        return (
            normalize_unit_surface,
            parse_locale_number,
            parse_sig,
            resolve_span_context,
            split_measurement_text,
        )

    @staticmethod
    @lru_cache(maxsize=2)
    def _model(model_id: str):
        from gliner import GLiNER
        from huggingface_hub import snapshot_download
        from openmed.ner.families.gliner import GLiNERHandle

        path = snapshot_download(model_id, local_files_only=True)
        model = GLiNER.from_pretrained(str(Path(path)), local_files_only=True)
        return GLiNERHandle(model_id=model_id, model=model)

    def _predict(self, text: str):
        if self.predict_override:
            return list(self.predict_override(text, LABELS, self.threshold))
        if not self.model_id:
            return []
        return list(
            self._model(self.model_id).predict_entities(text, LABELS, threshold=self.threshold)
        )

    def enhance(self, text: str) -> ClinicalEnhancement:
        normalize, _, _, _, split = self._imports()
        units = tuple(
            unit
            for line in text.splitlines()
            if (part := split(line)) and (unit := normalize(part[1]))
        )
        return ClinicalEnhancement(units, "openmed", version("openmed"), "available")

    @staticmethod
    def _get(entity: Any, key: str, default: Any = None):
        return (
            entity.get(key, default) if isinstance(entity, dict) else getattr(entity, key, default)
        )

    @staticmethod
    def _reject(rejected: dict[str, int], reason: str):
        rejected[reason] = rejected.get(reason, 0) + 1

    def _candidate(
        self,
        entity: Any,
        page: int,
        block: str,
        text: str,
        parse_sig: Any,
        context: Any,
        rejected: dict[str, int],
        section: SectionContext | None = None,
    ):
        start, end = self._get(entity, "start"), self._get(entity, "end")
        label, score = str(self._get(entity, "label", "")).lower(), self._get(entity, "score")
        if (
            not isinstance(start, int)
            or not isinstance(end, int)
            or start < 0
            or end <= start
            or end > len(text)
        ):
            self._reject(rejected, "missing_source_span")
            return None
        surface = text[start:end]
        if surface != str(self._get(entity, "text", surface)):
            self._reject(rejected, "invalid_span")
            return None
        clean = surface.strip(" .:;-\t")
        if (
            len(clean) < 3
            or FALSE_POSITIVE.fullmatch(clean)
            or not re.search(r"[A-Za-z]{3}", clean)
        ):
            self._reject(rejected, "garbage_punctuation")
            return None
        assertion = context({"text": clean, "context": text, "start": start, "end": end})
        if assertion.negation == "negated":
            self._reject(
                rejected,
                "allergy_negated" if label == "allergy" else "negated",
            )
            return None
        if assertion.certainty != "certain":
            self._reject(rejected, "uncertain")
            return None
        numeric_score = float(score) if isinstance(score, (int, float)) else 0.0
        effective_temporality = (
            "historical"
            if section and section.section_type == "history"
            else assertion.temporality
        )
        common = {
            "source_page_number": page,
            "source_block_ids": [block],
            "source_text": text,
            "source_start": start,
            "source_end": end,
            "entity_text": surface,
            "normalized_name": clean,
            "provider": "openmed",
            "provider_version": version("openmed"),
            "model_name": self.model_id or "test-model",
            "model_confidence": numeric_score,
            "assertion": {
                "negation": assertion.negation,
                "temporality": effective_temporality,
                "certainty": assertion.certainty,
                "section_type": section.section_type if section else "unknown",
                "section_heading_block_id": section.heading_block_id if section else "",
                "section_distance": str(section.distance) if section else "",
            },
            "confidence": "high" if numeric_score >= 0.8 else "medium",
        }
        match = DIAGNOSIS.match(text)
        if label in {"diagnosis", "disease", "condition", "problem"}:
            allowed = {"diagnosis", "impression", "assessment", "conclusion", "history"}
            if not match and (not section or section.section_type not in allowed):
                self._reject(rejected, "no_section_context")
                return None
            if section and section.section_type not in allowed and not match:
                self._reject(rejected, "section_category_mismatch")
                return None
            name = match[1].strip(" .") if match else clean
            return BrainCandidate(
                record_type="diagnosis",
                data={
                    "name": name,
                    "code": None,
                    "diagnosed_at": None,
                    "status": effective_temporality,
                },
                **common,
            )
        match = MEDICATION.match(text)
        if label in {"medication", "drug", "treatment"}:
            body = match[1] if match else text
            medication_section = bool(section and section.section_type == "medication")
            if not match and not medication_section:
                explicit_dose = re.search(
                    r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?|iu)\b",
                    text,
                    re.IGNORECASE,
                )
                explicit_frequency = re.search(
                    r"\b(?:once|twice|thrice|daily|weekly|before meals|after meals|"
                    r"at bedtime|prn|bid|tid|qid|every \d+ hours?)\b",
                    text,
                    re.IGNORECASE,
                )
                entity_starts_line = start == 0
                if not (explicit_dose and explicit_frequency and entity_starts_line):
                    self._reject(rejected, "medication_without_context")
                    return None
            if LAB_ROW.match(text):
                self._reject(rejected, "section_category_mismatch")
                return None
            name = re.match(r"([A-Za-z][A-Za-z .'-]*?)(?=\s+\d|$)", body)
            if not name:
                self._reject(rejected, "medication_without_context")
                return None
            sig = parse_sig(body)
            return BrainCandidate(
                record_type="medication",
                data={
                    "name": name[1].strip(),
                    "generic_name": None,
                    "dose": sig["dose"],
                    "dose_unit": sig["unit"],
                    "route": sig["route"],
                    "frequency": str(sig["frequency_per_day"])
                    if sig["frequency_per_day"] is not None
                    else ("as needed" if sig["as_needed"] else None),
                    "duration": str(sig["duration_days"]) if sig["duration_days"] else None,
                    "start_date": None,
                    "end_date": None,
                    "status": "discontinued"
                    if re.search(r"\b(?:stopped|discontinued)\b", text, re.IGNORECASE)
                    else effective_temporality,
                },
                **common,
            )
        match = ALLERGY.match(text)
        if label == "allergy":
            if NEGATIVE_ALLERGY.search(text):
                self._reject(rejected, "allergy_negated")
                return None
            allergy_section = bool(section and section.section_type == "allergy")
            if not match and not allergy_section:
                self._reject(rejected, "no_section_context")
                return None
            allergen = match[1].strip(" .") if match else clean
            return BrainCandidate(
                record_type="allergy",
                data={
                    "allergen": allergen,
                    "reaction": None,
                    "severity": None,
                    "status": "active",
                },
                **common,
            )
        match = PROCEDURE.match(text)
        if label in {"procedure", "test"}:
            procedure_section = bool(section and section.section_type == "procedure")
            if not match and not re.search(
                r"\b(?:performed|underwent|completed)\b", text, re.IGNORECASE
            ) and not (procedure_section and section and section.distance > 0):
                self._reject(rejected, "procedure_without_evidence")
                return None
            return BrainCandidate(
                record_type="procedure",
                data={
                    "procedure_name": (match[1] if match else clean).strip(" ."),
                    "performed_at": None,
                    "notes": None,
                },
                **common,
            )
        if label in {"clinical finding", "finding"}:
            diagnosis = DIAGNOSIS.match(text)
            if diagnosis:
                return BrainCandidate(
                    record_type="diagnosis",
                    data={
                        "name": diagnosis[1].strip(" ."),
                        "code": None,
                        "diagnosed_at": None,
                        "status": effective_temporality,
                    },
                    **common,
                )
            if re.search(r"\bLVEF\s+\d+(?:\.\d+)?%", text, re.IGNORECASE):
                return BrainCandidate(record_type="doctor_note", data={"text": text}, **common)
            finding_sections = {"impression", "conclusion", "assessment", "finding", "procedure"}
            if section and section.section_type in finding_sections:
                return BrainCandidate(record_type="doctor_note", data={"text": text}, **common)
            self._reject(rejected, "finding_without_context")
            return None
        self._reject(
            rejected,
            "unsupported_category" if label not in LABELS else "section_category_mismatch",
        )
        return None

    def analyze(self, document_id: UUID, pages: list[PageAnalysis]) -> ClinicalBrainResult:
        del document_id
        normalize, parse_number, parse_sig, context, split = self._imports()
        accepted, rejected, before, model_invoked = [], {}, 0, False
        raw_categories: dict[str, int] = {}
        section_headings: dict[str, int] = {}
        proposals_with_section = 0
        ner_blocks_evaluated = 0
        for page in pages:
            active_section: SectionContext | None = None
            previous_y1: float | None = None
            for block in sorted(page.blocks, key=lambda item: (item.bbox.y0, item.bbox.x0)):
                if block.region != "main_content":
                    self._reject(rejected, "likely_header_footer")
                    active_section = None
                    previous_y1 = None
                    continue
                # Imaging reports often leave large whitespace between a section label and
                # its first finding. Only a major page break is strong enough to clear the
                # section; explicit headings and non-content regions remain the primary guards.
                if previous_y1 is not None and block.bbox.y0 - previous_y1 > page.height * 0.30:
                    active_section = None
                previous_y1 = max(previous_y1 or block.bbox.y1, block.bbox.y1)
                if block.text.strip():
                    ner_blocks_evaluated += 1
                for raw in block.text.splitlines():
                    line = raw.strip()
                    if not line:
                        continue
                    heading = classify_section_heading(line)
                    if heading:
                        active_section = SectionContext(heading, block.id, 0)
                        section_headings[heading] = section_headings.get(heading, 0) + 1
                        continue
                    if STRUCTURAL_BOUNDARY.fullmatch(line):
                        active_section = None
                        continue
                    section = active_section
                    entities = self._predict(line)
                    model_invoked |= bool(self.model_id or self.predict_override)
                    before += len(entities)
                    if section:
                        proposals_with_section += len(entities)
                    for entity in entities:
                        label = str(self._get(entity, "label", "")).lower()
                        category = {
                            "disease": "diagnosis",
                            "condition": "diagnosis",
                            "problem": "diagnosis",
                            "drug": "medication",
                            "treatment": "medication",
                            "test": "procedure",
                            "clinical finding": "finding",
                        }.get(
                            label,
                            label
                            if label in {"diagnosis", "medication", "allergy", "procedure"}
                            else "unsupported",
                        )
                        raw_categories[category] = raw_categories.get(category, 0) + 1
                    accepted.extend(
                        c
                        for entity in entities
                        if (
                            c := self._candidate(
                                entity,
                                page.page_number,
                                block.id,
                                line,
                                parse_sig,
                                context,
                                rejected,
                                section,
                            )
                        )
                    )
                    if active_section:
                        active_section = SectionContext(
                            active_section.section_type,
                            active_section.heading_block_id,
                            active_section.distance + 1,
                        )
                    match = next(((p.match(line), name) for p, name in LABS if p.match(line)), None)
                    if not match:
                        continue
                    anchor, name = match
                    value = VALUE.match(line[anchor.end() :].strip())
                    if not value:
                        self._reject(rejected, "no_same_row_value")
                        continue
                    unit_text = value["unit"] or ""
                    measurement = split(f"{value['num']} {unit_text}") if unit_text else None
                    accepted.append(
                        BrainCandidate(
                            record_type="lab",
                            source_page_number=page.page_number,
                            source_block_ids=[block.id],
                            source_text=line,
                            confidence="high",
                            provider="openmed",
                            provider_version=version("openmed"),
                            data={
                                "test_name": name,
                                "original_value": f"{value['op'] or ''}{value['num']}",
                                "numeric_value": None
                                if value["op"]
                                else parse_number(value["num"]),
                                "unit": normalize(measurement[1]) if measurement else None,
                                "reference_range": None,
                                "flag": None,
                                "specimen": None,
                                "collected_at": None,
                            },
                        )
                    )
                    before += 1
                    raw_categories["lab"] = raw_categories.get("lab", 0) + 1
        accepted_categories: dict[str, int] = {}
        for candidate in accepted:
            category = (
                "finding" if candidate.record_type == "doctor_note" else candidate.record_type
            )
            accepted_categories[category] = accepted_categories.get(category, 0) + 1
        metadata = ClinicalBrainMetadata(
            name="openmed",
            version=version("openmed"),
            invoked=True,
            model_backed=model_invoked,
            model_name=self.model_id or None,
            apis_used=self.apis,
            warnings=[] if model_invoked else ["OPENMED_MODEL_UNAVAILABLE"],
            candidates_before_validation=before,
            candidates_after_validation=len(accepted),
            rejected_reasons=rejected,
            raw_proposals_by_category=raw_categories,
            accepted_by_category=accepted_categories,
            ner_blocks_evaluated=ner_blocks_evaluated,
            section_headings_detected=section_headings,
            proposals_with_section_context=proposals_with_section,
        )
        return ClinicalBrainResult(tuple(accepted), metadata)


class CompositeClinicalNlpProvider:
    def __init__(self, primary: ClinicalNlpProvider, fallback: ClinicalNlpProvider):
        self.primary, self.fallback = primary, fallback

    def enhance(self, text: str) -> ClinicalEnhancement:
        try:
            return self.primary.enhance(text)
        except (ImportError, OSError, RuntimeError, ValueError, TypeError):
            return self.fallback.enhance(text)

    def analyze(self, document_id: UUID, pages: list[PageAnalysis]) -> ClinicalBrainResult:
        try:
            return self.primary.analyze(document_id, pages)
        except (ImportError, OSError, RuntimeError, ValueError, TypeError):
            result = self.fallback.analyze(document_id, pages)
            result.metadata.warnings.append("OPENMED_NER_FAILED")
            return result
