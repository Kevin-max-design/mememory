from uuid import uuid4

from app.clinical import OpenMedClinicalNlpProvider
from app.schemas import BoundingBox, PageAnalysis, ProviderMetadata, TextBlock


def page_with(*texts: tuple[str, str]):
    blocks = [
        TextBlock(
            id=identifier,
            text=text,
            confidence=0.9,
            bbox=BoundingBox(x0=10, y0=100 + index * 30, x1=500, y1=120 + index * 30),
        )
        for index, (identifier, text) in enumerate(texts)
    ]
    return PageAnalysis(
        page_number=1,
        width=600,
        height=800,
        rotation=0,
        skew_angle=0,
        source="ocr",
        full_text="\n".join(block.text for block in blocks),
        blocks=blocks,
        provider=ProviderMetadata(name="paddleocr", version="3.7.0"),
    )


def test_openmed_brain_uses_verified_measurement_apis_with_provenance():
    result = OpenMedClinicalNlpProvider().analyze(
        uuid4(),
        [
            page_with(
                ("hgb", "Haemoglobin 13.5 gm% 13.0-17.0"),
                ("plt", "Platelet Count 291 x10^3/uL 150-400"),
                ("tsh", "TSH 1.56 uIU/mL"),
            )
        ],
    )
    assert result.metadata.invoked is True
    assert result.metadata.model_backed is False
    assert result.metadata.candidates_before_validation == 3
    assert result.candidates[0].source_block_ids == ["hgb"]
    assert result.candidates[0].source_text == "Haemoglobin 13.5 gm% 13.0-17.0"
    assert result.candidates[0].data["numeric_value"] == 13.5
    assert result.candidates[1].data["numeric_value"] == 291
    assert result.candidates[2].data["unit"] == "uiu/ml"


def test_openmed_brain_rejects_non_main_content_and_missing_same_row_value():
    page = page_with(("header", "TSH 1.56 uIU/mL"), ("missing", "Creatinine"))
    page.blocks[0].region = "likely_header"
    result = OpenMedClinicalNlpProvider().analyze(uuid4(), [page])
    assert result.candidates == ()
    assert result.metadata.rejected_reasons == {
        "likely_header_footer": 1,
        "no_same_row_value": 1,
    }


def entity_predictor(mapping):
    def predict(text, _labels, _threshold):
        found = []
        for surface, label in mapping.items():
            if surface in text:
                start = text.index(surface)
                found.append(
                    {
                        "text": surface,
                        "start": start,
                        "end": start + len(surface),
                        "label": label,
                        "score": 0.91,
                    }
                )
        return found

    return predict


def test_model_entities_keep_offsets_and_openmed_assertion_context():
    predict = entity_predictor(
        {
            "Type 1 Diabetes Mellitus": "diagnosis",
            "hypertension": "diagnosis",
            "myocardial infarction": "diagnosis",
            "pulmonary embolism": "diagnosis",
            "chest pain": "clinical finding",
        }
    )
    page = page_with(
        ("d1", "Diagnosis: Type 1 Diabetes Mellitus"),
        ("d2", "Known case of hypertension"),
        ("d3", "History of myocardial infarction"),
        ("d4", "Assessment: possible pulmonary embolism"),
        ("d5", "Patient denies chest pain"),
    )
    result = OpenMedClinicalNlpProvider(model_id="synthetic", predict=predict).analyze(
        uuid4(), [page]
    )
    diagnoses = [
        candidate for candidate in result.candidates if candidate.record_type == "diagnosis"
    ]
    assert [candidate.data["name"] for candidate in diagnoses] == [
        "Type 1 Diabetes Mellitus",
        "hypertension",
        "myocardial infarction",
    ]
    assert diagnoses[2].assertion["temporality"] == "historical"
    assert (
        diagnoses[0].source_text[diagnoses[0].source_start : diagnoses[0].source_end]
        == diagnoses[0].entity_text
    )
    assert result.metadata.rejected_reasons["uncertain"] >= 1
    assert result.metadata.rejected_reasons["negated"] >= 1


def test_medication_allergy_procedure_and_finding_are_context_gated():
    predict = entity_predictor(
        {
            "Metformin": "medication",
            "metformin level": "medication",
            "Penicillin": "allergy",
            "sulfa allergy": "allergy",
            "2D Echo Cardiogram": "procedure",
            "LVEF 62%": "clinical finding",
            "RWMA": "clinical finding",
        }
    )
    page = page_with(
        ("m1", "Medication: Metformin 500 mg twice daily"),
        ("m2", "metformin level"),
        ("a1", "Allergy: Penicillin"),
        ("a2", "Patient denies sulfa allergy"),
        ("a3", "No known drug allergies"),
        ("p1", "2D Echo Cardiogram performed"),
        ("f1", "LVEF 62%"),
        ("f2", "No RWMA"),
    )
    result = OpenMedClinicalNlpProvider(model_id="synthetic", predict=predict).analyze(
        uuid4(), [page]
    )
    by_type = {
        kind: [candidate for candidate in result.candidates if candidate.record_type == kind]
        for kind in ("medication", "allergy", "procedure", "doctor_note")
    }
    assert by_type["medication"][0].data["dose"] == 500.0
    assert by_type["medication"][0].data["dose_unit"] == "mg"
    assert by_type["allergy"][0].data["allergen"] == "Penicillin"
    assert by_type["procedure"][0].data["procedure_name"] == "2D Echo Cardiogram"
    assert by_type["doctor_note"][0].data["text"] == "LVEF 62%"
    assert len(by_type["allergy"]) == 1
    assert result.metadata.rejected_reasons["medication_without_context"] >= 1
    assert result.metadata.rejected_reasons["allergy_negated"] >= 1
    assert result.metadata.rejected_reasons["negated"] >= 1


def test_model_medication_label_on_lab_row_is_rejected_without_sig_context():
    text = "Creatinine 1.1 mg/dl"
    predict = entity_predictor({"Creatinine": "medication"})
    result = OpenMedClinicalNlpProvider(model_id="synthetic", predict=predict).analyze(
        uuid4(), [page_with(("lab", text))]
    )
    medications = [item for item in result.candidates if item.record_type == "medication"]
    assert medications == []
    assert result.metadata.rejected_reasons["medication_without_context"] == 1


def test_impression_and_conclusion_sections_propagate_without_weakening_negation():
    predict = entity_predictor(
        {
            "Grade-II fatty liver": "diagnosis",
            "Grade-I prostatomegaly": "diagnosis",
            "Simple left renal cortical cyst": "diagnosis",
            "Normal LV/RV systolic function": "clinical finding",
            "LVEF 62%": "clinical finding",
            "RWMA": "clinical finding",
        }
    )
    page = page_with(
        ("ih", "IMPRESSION:"),
        ("i1", "Grade-II fatty liver."),
        ("i2", "Grade-I prostatomegaly."),
        ("i3", "Simple left renal cortical cyst."),
        ("ch", "CONCLUSION:"),
        ("c1", "Normal LV/RV systolic function."),
        ("c2", "LVEF 62%."),
        ("c3", "No RWMA."),
    )
    result = OpenMedClinicalNlpProvider(model_id="synthetic", predict=predict).analyze(
        uuid4(), [page]
    )
    diagnoses = [item for item in result.candidates if item.record_type == "diagnosis"]
    findings = [item for item in result.candidates if item.record_type == "doctor_note"]
    assert [item.data["name"] for item in diagnoses] == [
        "Grade-II fatty liver",
        "Grade-I prostatomegaly",
        "Simple left renal cortical cyst",
    ]
    assert len(findings) == 2
    assert result.metadata.rejected_reasons["negated"] == 1
    assert result.metadata.section_headings_detected == {"impression": 1, "conclusion": 1}
    assert result.metadata.proposals_with_section_context == 6


def test_history_medication_and_allergy_sections_preserve_safe_context():
    predict = entity_predictor(
        {
            "Myocardial infarction": "diagnosis",
            "Metformin": "medication",
            "Penicillin": "allergy",
        }
    )
    page = page_with(
        ("hh", "PAST MEDICAL HISTORY:"),
        ("h1", "Myocardial infarction in 2020."),
        ("mh", "MEDICATIONS:"),
        ("m1", "Metformin 500 mg twice daily."),
        ("ah", "ALLERGIES:"),
        ("a1", "Penicillin."),
        ("a2", "No known drug allergies."),
    )
    result = OpenMedClinicalNlpProvider(model_id="synthetic", predict=predict).analyze(
        uuid4(), [page]
    )
    diagnosis = next(item for item in result.candidates if item.record_type == "diagnosis")
    medication = next(item for item in result.candidates if item.record_type == "medication")
    allergy = next(item for item in result.candidates if item.record_type == "allergy")
    assert diagnosis.assertion["temporality"] == "historical"
    assert medication.data["dose"] == 500.0
    assert allergy.data["allergen"] == "Penicillin"
    assert len([item for item in result.candidates if item.record_type == "allergy"]) == 1


def test_lab_boundary_resets_impression_context():
    predict = entity_predictor({"Fatty liver": "diagnosis", "Triglycerides": "diagnosis"})
    page = page_with(
        ("ih", "IMPRESSION:"),
        ("i1", "Fatty liver."),
        ("lh", "LAB RESULTS:"),
        ("l1", "Triglycerides 240 mg/dl"),
    )
    result = OpenMedClinicalNlpProvider(model_id="synthetic", predict=predict).analyze(
        uuid4(), [page]
    )
    assert [item.data["name"] for item in result.candidates] == ["Fatty liver"]
    assert result.metadata.rejected_reasons["no_section_context"] == 1


def test_major_geometry_break_resets_section_context():
    predict = entity_predictor({"Fatty liver": "diagnosis", "Hypertension": "diagnosis"})
    page = page_with(
        ("ih", "IMPRESSION:"),
        ("i1", "Fatty liver."),
        ("u1", "Hypertension."),
    )
    page.blocks[2].bbox.y0 = 650
    page.blocks[2].bbox.y1 = 670
    result = OpenMedClinicalNlpProvider(model_id="synthetic", predict=predict).analyze(
        uuid4(), [page]
    )
    assert [item.data["name"] for item in result.candidates] == ["Fatty liver"]
    assert result.metadata.rejected_reasons["no_section_context"] == 1
