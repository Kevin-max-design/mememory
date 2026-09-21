"""Deterministic, non-correcting VLM-to-canonical mapping."""

from __future__ import annotations

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
from .vlm_schema import (
    VLMAllergy,
    VLMDiagnosis,
    VLMExtraction,
    VLMLab,
    VLMMedication,
    VLMPatient,
)


def _fact(
    *,
    fact_type: FactType,
    value: str,
    page: int,
    source_text: str,
    section: str,
    data: dict[str, str | None],
    context: ClinicalContext | None = None,
) -> ClinicalFact:
    return ClinicalFact(
        type=fact_type,
        value=value,
        normalized_value=None,
        page=page,
        source_text=source_text,
        source_block_ids=[],
        bbox=None,
        section=section,
        confidence=0.5,
        context=context or ClinicalContext(),
        data=data,
    )


def _diagnosis_context(assertion: str) -> ClinicalContext:
    if assertion == "absent":
        return ClinicalContext(negation=Negation.NEGATED)
    if assertion == "possible":
        return ClinicalContext(certainty=Certainty.POSSIBLE)
    if assertion == "historical":
        return ClinicalContext(temporality=Temporality.HISTORICAL)
    if assertion == "family_history":
        return ClinicalContext(subject=Subject.FAMILY)
    return ClinicalContext()


def adapt_patient_candidate(patient: VLMPatient) -> list[ClinicalFact]:
    """Mechanically map one validated patient/header candidate."""

    facts: list[ClinicalFact] = []
    if patient.name is not None:
        facts.append(
            _fact(
                fact_type=FactType.PATIENT,
                value=patient.name,
                page=patient.page,
                source_text=patient.source_text or "",
                section="patient",
                data={"name": patient.name},
            )
        )
    if patient.date is not None:
        facts.append(
            _fact(
                fact_type=FactType.DOCUMENT_METADATA,
                value=patient.date,
                page=patient.page,
                source_text=patient.source_text or "",
                section="header",
                data={"report_date": patient.date},
            )
        )
    return facts


def adapt_lab_candidate(lab: VLMLab) -> ClinicalFact:
    return _fact(
        fact_type=FactType.LAB_RESULT,
        value=lab.value,
        page=lab.page,
        source_text=lab.source_text,
        section="labs",
        data={
            "test_name": lab.test_name,
            "value": lab.value,
            "unit": lab.unit,
            "reference_range": lab.reference_range,
        },
    )


def adapt_diagnosis_candidate(diagnosis: VLMDiagnosis) -> ClinicalFact:
    return _fact(
        fact_type=FactType.DIAGNOSIS,
        value=diagnosis.name,
        page=diagnosis.page,
        source_text=diagnosis.source_text,
        section="impression",
        data={"name": diagnosis.name, "status": diagnosis.assertion},
        context=_diagnosis_context(diagnosis.assertion),
    )


def adapt_medication_candidate(medication: VLMMedication) -> ClinicalFact:
    return _fact(
        fact_type=FactType.MEDICATION,
        value=medication.name,
        page=medication.page,
        source_text=medication.source_text,
        section="medications",
        data={
            "name": medication.name,
            "strength": medication.strength,
            "dose": medication.dose,
            "route": medication.route,
            "frequency": medication.frequency,
        },
    )


def adapt_allergy_candidate(allergy: VLMAllergy) -> ClinicalFact:
    return _fact(
        fact_type=FactType.ALLERGY,
        value=allergy.allergen,
        page=allergy.page,
        source_text=allergy.source_text,
        section="allergies",
        data={
            "allergen": allergy.allergen,
            "reaction": allergy.reaction,
            "severity": allergy.severity,
            "status": allergy.assertion,
        },
        context=_diagnosis_context(allergy.assertion),
    )


def adapt_vlm_extraction(
    extraction: VLMExtraction, *, document_id: str
) -> CanonicalExtraction:
    """Map fields mechanically; never normalize, infer, or repair their content."""

    facts = adapt_patient_candidate(extraction.patient)

    for lab in extraction.labs:
        facts.append(adapt_lab_candidate(lab))

    for diagnosis in extraction.diagnoses:
        facts.append(adapt_diagnosis_candidate(diagnosis))

    for medication in extraction.medications:
        facts.append(adapt_medication_candidate(medication))

    for allergy in extraction.allergies:
        facts.append(adapt_allergy_candidate(allergy))

    return CanonicalExtraction(document_id=document_id, facts=facts, warnings=[])
