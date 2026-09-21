"""Deterministic 30-page synthetic benchmark generator for Phase 2A.4.

The structured source drives both image rendering and exact gold labels. The model
is never involved in gold creation. All names and clinical content are synthetic.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from PIL import Image, ImageDraw, ImageFont

SEED = 260921
BENCHMARK_VERSION = "phase2a4-v1"
PAGE_SIZE = (1600, 2100)


@dataclass(frozen=True, slots=True)
class Case:
    document_id: str
    family: Literal["laboratory", "medication", "imaging", "discharge", "mixed"]
    difficulty: Literal["easy", "medium", "hard"]
    title: str
    labs: tuple[dict[str, Any], ...] = ()
    medications: tuple[dict[str, Any], ...] = ()
    diagnoses: tuple[dict[str, Any], ...] = ()
    allergies: tuple[dict[str, Any], ...] = ()
    notes: tuple[tuple[str, tuple[str, ...]], ...] = ()


def lab(name: str, value: str, unit: str, reference: str) -> dict[str, Any]:
    source = f"{name:<24} {value:>8} {unit:<12} {reference}"
    return {
        "test_name": name,
        "value": value,
        "unit": unit,
        "reference_range": reference,
        "page": 1,
        "source_text": source,
    }


def medication(
    name: str,
    strength: str,
    frequency: str,
    *,
    dose: str | None = None,
    route: str | None = None,
) -> dict[str, Any]:
    components = [name, strength]
    if dose:
        components.append(dose)
    if route:
        components.append(route)
    components.append(frequency)
    return {
        "name": name,
        "strength": strength,
        "dose": dose,
        "route": route,
        "frequency": frequency,
        "page": 1,
        "source_text": " | ".join(components),
    }


def diagnosis(name: str, assertion: str, source: str) -> dict[str, Any]:
    return {
        "name": name,
        "assertion": assertion,
        "page": 1,
        "source_text": source,
    }


def allergy(
    allergen: str,
    assertion: str,
    source: str,
    *,
    reaction: str | None = None,
    severity: str | None = None,
) -> dict[str, Any]:
    return {
        "allergen": allergen,
        "assertion": assertion,
        "reaction": reaction,
        "severity": severity,
        "page": 1,
        "source_text": source,
    }


def cases() -> tuple[Case, ...]:
    return (
        Case("syn-e01-cbc", "laboratory", "easy", "COMPLETE BLOOD COUNT", labs=(lab("Hemoglobin", "13.2", "g/dL", "12.0 - 16.0"), lab("Platelet Count", "284", "x10^3/uL", "150 - 450"), lab("WBC Count", "7.6", "x10^3/uL", "4.0 - 11.0"))),
        Case("syn-e02-metabolic", "laboratory", "easy", "BASIC METABOLIC PANEL", labs=(lab("Glucose", "96", "mg/dL", "70 - 99"), lab("Sodium", "139", "mmol/L", "136 - 145"), lab("Potassium", "4.1", "mmol/L", "3.5 - 5.1"))),
        Case("syn-e03-liver", "laboratory", "easy", "LIVER FUNCTION TESTS", labs=(lab("ALT", "24", "U/L", "7 - 35"), lab("AST", "22", "U/L", "10 - 35"), lab("Total Bilirubin", "0.8", "mg/dL", "0.2 - 1.2"))),
        Case("syn-e04-renal", "laboratory", "easy", "RENAL FUNCTION PANEL", labs=(lab("Creatinine", "0.9", "mg/dL", "0.6 - 1.1"), lab("BUN", "14", "mg/dL", "7 - 20"), lab("eGFR", "92", "mL/min", ">= 60"))),
        Case("syn-e05-lipid", "laboratory", "easy", "LIPID PROFILE", labs=(lab("Total Cholesterol", "172", "mg/dL", "< 200"), lab("LDL Cholesterol", "98", "mg/dL", "< 100"), lab("HDL Cholesterol", "54", "mg/dL", ">= 40"), lab("Triglycerides", "101", "mg/dL", "< 150"))),
        Case("syn-e06-thyroid", "laboratory", "easy", "THYROID PANEL", labs=(lab("TSH", "2.18", "mIU/L", "0.40 - 4.50"), lab("Free T4", "1.2", "ng/dL", "0.8 - 1.8"))),
        Case("syn-e07-prescription", "medication", "easy", "OUTPATIENT PRESCRIPTION", medications=(medication("Metformin", "500 mg", "twice daily", route="by mouth"), medication("Atorvastatin", "20 mg", "once nightly", route="by mouth"))),
        Case("syn-e08-ultrasound", "imaging", "easy", "ABDOMINAL ULTRASOUND", diagnoses=(diagnosis("gallstones", "present", "Multiple gallstones are present."), diagnosis("cholecystitis", "absent", "No evidence of acute cholecystitis."))),
        Case("syn-e09-xray", "imaging", "easy", "CHEST X-RAY", diagnoses=(diagnosis("pneumonia", "absent", "No evidence of pneumonia."), diagnosis("pleural effusion", "absent", "No pleural effusion is present."))),
        Case("syn-e10-allergy", "mixed", "easy", "ALLERGY CLINIC NOTE", allergies=(allergy("Penicillin", "present", "Penicillin - rash", reaction="rash"),), notes=(("ASSESSMENT", ("Routine allergy documentation visit.",)),)),
        Case("syn-m01-glycemic", "laboratory", "medium", "GLYCEMIC ASSESSMENT", labs=(lab("Fasting Glucose", "108", "mg/dL", "70 - 99"), lab("HbA1c", "5.8", "%", "4.0 - 5.6")), notes=(("SPECIMEN", ("Fasting venous sample",)),)),
        Case("syn-m02-dense-cbc", "laboratory", "medium", "HEMATOLOGY REPORT", labs=(lab("RBC Count", "4.62", "x10^6/uL", "4.00 - 5.20"), lab("Hemoglobin", "13.9", "g/dL", "12.0 - 16.0"), lab("Hematocrit", "41.7", "%", "36.0 - 46.0"), lab("Platelet Count", "296", "x10^3/uL", "150 - 450"), lab("WBC Count", "6.9", "x10^3/uL", "4.0 - 11.0"))),
        Case("syn-m03-discharge-meds", "medication", "medium", "DISCHARGE MEDICATION LIST", medications=(medication("Pantoprazole", "40 mg", "before breakfast", dose="1 tablet", route="by mouth"), medication("Amoxicillin", "500 mg", "three times daily", dose="1 capsule", route="by mouth"), medication("Paracetamol", "500 mg", "every 8 hours as needed", dose="1 tablet", route="by mouth")), notes=(("INSTRUCTIONS", ("Take medicines exactly as directed.",)),)),
        Case("syn-m04-discharge-summary", "discharge", "medium", "DISCHARGE SUMMARY", diagnoses=(diagnosis("viral gastroenteritis", "present", "Final diagnosis: Viral gastroenteritis."), diagnosis("dehydration", "historical", "Dehydration resolved during admission.")), notes=(("PROCEDURE", ("Intravenous fluid therapy completed.",)), ("FOLLOW-UP", ("Review with primary clinician in 7 days.",)))),
        Case("syn-m05-ct", "imaging", "medium", "CT CHEST REPORT", diagnoses=(diagnosis("small pleural effusion", "possible", "Cannot exclude a small pleural effusion."), diagnosis("pulmonary embolism", "absent", "No evidence of pulmonary embolism."))),
        Case("syn-m06-mri", "imaging", "medium", "MRI KNEE REPORT", diagnoses=(diagnosis("meniscal tear", "possible", "Possible small medial meniscal tear."), diagnosis("fracture", "absent", "Negative for acute fracture."))),
        Case("syn-m07-multi-allergy", "mixed", "medium", "PRE-OPERATIVE ASSESSMENT", allergies=(allergy("Sulfonamides", "present", "Sulfonamides - hives", reaction="hives"), allergy("Latex", "present", "Latex - contact dermatitis", reaction="contact dermatitis")), diagnoses=(diagnosis("cardiopulmonary symptoms", "absent", "Patient denies chest pain or shortness of breath."),)),
        Case("syn-m08-no-meds", "medication", "medium", "MEDICATION RECONCILIATION", notes=(("CURRENT MEDICATIONS", ("Medications: None",)), ("COMMENT", ("No prescriptions supplied at this visit.",)))),
        Case("syn-m09-mixed", "mixed", "medium", "ENDOCRINE FOLLOW-UP", labs=(lab("TSH", "3.10", "mIU/L", "0.40 - 4.50"), lab("Free T4", "1.1", "ng/dL", "0.8 - 1.8")), medications=(medication("Levothyroxine", "50 mcg", "once daily", dose="1 tablet", route="by mouth"),), diagnoses=(diagnosis("hypothyroidism", "present", "Assessment: Hypothyroidism, clinically stable."),)),
        Case("syn-m10-family", "mixed", "medium", "FAMILY HISTORY NOTE", diagnoses=(diagnosis("diabetes", "family_history", "Family history of diabetes in mother."), diagnosis("hypertension", "family_history", "Father has hypertension."))),
        Case("syn-h01-multicol-labs", "laboratory", "hard", "COMBINED LABORATORY REPORT", labs=(lab("Hemoglobin", "14.1", "g/dL", "12.0 - 16.0"), lab("Platelet Count", "301", "x10^3/uL", "150 - 450"), lab("Glucose", "101", "mg/dL", "70 - 99"), lab("Sodium", "141", "mmol/L", "136 - 145"), lab("Potassium", "4.0", "mmol/L", "3.5 - 5.1"))),
        Case("syn-h02-similar-values", "laboratory", "hard", "DENSE CHEMISTRY TABLE", labs=(lab("Calcium", "9.4", "mg/dL", "8.6 - 10.2"), lab("Phosphorus", "3.4", "mg/dL", "2.5 - 4.5"), lab("Albumin", "4.4", "g/dL", "3.6 - 5.1"), lab("Total Protein", "7.4", "g/dL", "6.1 - 8.1"), lab("Magnesium", "2.4", "mg/dL", "1.5 - 2.5"))),
        Case("syn-h03-wrapped-meds", "medication", "hard", "COMPLEX MEDICATION PLAN", medications=(medication("Metformin", "500 mg", "twice daily with meals", dose="1 tablet", route="by mouth"), medication("Atorvastatin", "20 mg", "once nightly", dose="1 tablet", route="by mouth"), medication("Pantoprazole", "40 mg", "before breakfast", dose="1 tablet", route="by mouth"), medication("Vitamin D3", "1000 IU", "once daily", dose="1 capsule", route="by mouth"))),
        Case("syn-h04-multiple-dates", "discharge", "hard", "LONGITUDINAL CLINICAL SUMMARY", diagnoses=(diagnosis("hypertension", "historical", "History of hypertension diagnosed in 2022."), diagnosis("appendectomy", "historical", "Previous appendectomy in 2019."), diagnosis("respiratory examination", "present", "Current examination shows clear breath sounds.")), notes=(("DATES", ("Admission: 02 SEP 2026", "Discharge: 06 SEP 2026", "Follow-up: 20 SEP 2026")),)),
        Case("syn-h05-context", "mixed", "hard", "ACUTE CARE ASSESSMENT", diagnoses=(diagnosis("viral infection", "possible", "Possible viral infection."), diagnosis("pneumonia", "possible", "Suspected pneumonia."), diagnosis("appendicitis", "possible", "Rule out appendicitis."), diagnosis("chest pain", "absent", "Patient denies chest pain."))),
        Case("syn-h06-family-subject", "mixed", "hard", "HISTORY AND RISK ASSESSMENT", diagnoses=(diagnosis("diabetes", "family_history", "Mother has diabetes."), diagnosis("coronary artery disease", "family_history", "Father had coronary artery disease."), diagnosis("hypertension", "absent", "Patient has no history of hypertension."))),
        Case("syn-h07-absence", "discharge", "hard", "ADMISSION RECONCILIATION", allergies=(allergy("drug allergies", "absent", "No known drug allergies."),), diagnoses=(diagnosis("fracture", "absent", "Negative for fracture."),), notes=(("MEDICATIONS", ("Medications: None",)), ("ALLERGIES", ("No known drug allergies.",)))),
        Case("syn-h08-imaging", "imaging", "hard", "MULTI-REGION IMAGING REPORT", diagnoses=(diagnosis("small effusion", "possible", "Cannot exclude small effusion."), diagnosis("focal consolidation", "absent", "No focal consolidation."), diagnosis("mild cardiomegaly", "present", "Mild cardiomegaly is present."))),
        Case("syn-h09-discharge-mixed", "discharge", "hard", "COMPREHENSIVE DISCHARGE SUMMARY", labs=(lab("Creatinine", "1.0", "mg/dL", "0.6 - 1.1"),), medications=(medication("Cefuroxime", "500 mg", "twice daily", dose="1 tablet", route="by mouth"),), diagnoses=(diagnosis("urinary tract infection", "present", "Discharge diagnosis: Urinary tract infection."), diagnosis("sepsis", "absent", "No evidence of sepsis.")), notes=(("HOSPITAL COURSE", ("Improved with hydration and antimicrobial therapy.",)), ("FOLLOW-UP", ("Clinical review in 5 days.",)))),
        Case("syn-h10-repeated-tests", "discharge", "hard", "GLUCOSE TOLERANCE AND FOLLOW-UP", labs=(lab("Glucose (fasting)", "92", "mg/dL", "70 - 99"), lab("Glucose (1-hour)", "142", "mg/dL", "< 180"), lab("Glucose (2-hour)", "118", "mg/dL", "< 140")), diagnoses=(diagnosis("diabetes", "absent", "No evidence of diabetes on current testing."),), notes=(("DATES", ("Collection date: 12 SEP 2026", "Review date: 15 SEP 2026")),)),
    )


def _font(size: int, *, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    if mono:
        candidates = ["/System/Library/Fonts/Supplemental/Courier New.ttf"]
    elif bold:
        candidates = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf"]
    else:
        candidates = ["/System/Library/Fonts/Supplemental/Arial.ttf"]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sections(case: Case) -> list[tuple[str, list[str]]]:
    sections: list[tuple[str, list[str]]] = []
    if case.labs:
        sections.append(("LABORATORY RESULTS", [str(item["source_text"]) for item in case.labs]))
    if case.medications:
        sections.append(("MEDICATIONS", [str(item["source_text"]) for item in case.medications]))
    if case.diagnoses:
        sections.append(("ASSESSMENT / IMPRESSION", [str(item["source_text"]) for item in case.diagnoses]))
    if case.allergies:
        sections.append(("ALLERGIES", [str(item["source_text"]) for item in case.allergies]))
    sections.extend((heading, list(lines)) for heading, lines in case.notes)
    return sections


def _draw_section(
    draw: ImageDraw.ImageDraw,
    *,
    x: int,
    y: int,
    width: int,
    heading: str,
    lines: list[str],
    density: str,
) -> int:
    heading_font = _font(27 if density == "easy" else 23, bold=True)
    body_font = _font(27 if density == "easy" else 22)
    mono_font = _font(24 if density == "easy" else 20, mono=True)
    padding = 24
    line_height = 40 if density == "easy" else 34
    expanded = [piece for line in lines for piece in line.split("\n")]
    height = 58 + line_height * len(expanded) + padding
    draw.rounded_rectangle((x, y, x + width, y + height), radius=12, outline="#97a6a6", width=2, fill="#fbfdfd")
    draw.text((x + padding, y + 15), heading, fill="#0c5f5a", font=heading_font)
    cursor = y + 65
    for line in expanded:
        font = mono_font if any(character.isdigit() for character in line) else body_font
        draw.text((x + padding, cursor), line, fill="#142525", font=font)
        cursor += line_height
    return y + height + 24


def render_case(case: Case, *, patient: str, report_date: str, facility: str, clinician: str, path: Path) -> str:
    image = Image.new("RGB", PAGE_SIZE, "white")
    draw = ImageDraw.Draw(image)
    title_font = _font(43, bold=True)
    header_font = _font(24, bold=True)
    body_font = _font(23)
    watermark_font = _font(18, bold=True)

    draw.rectangle((0, 0, PAGE_SIZE[0], 170), fill="#0b6b66")
    draw.text((90, 38), "NORTHSTAR CLINICAL CENTER", fill="white", font=title_font)
    draw.text((92, 112), "SYNTHETIC TEST RECORD", fill="#d5f0ed", font=watermark_font)
    draw.text((90, 205), case.title, fill="#102828", font=title_font)
    draw.line((90, 270, 1510, 270), fill="#6b7f7e", width=3)
    draw.text((90, 300), f"PATIENT: {patient}", fill="#142525", font=header_font)
    draw.text((90, 345), f"REPORT DATE: {report_date}", fill="#142525", font=header_font)
    draw.text((820, 300), f"FACILITY: {facility}", fill="#142525", font=body_font)
    draw.text((820, 345), f"CLINICIAN: {clinician}", fill="#142525", font=body_font)

    sections = _sections(case)
    if case.difficulty == "hard":
        columns = [(90, 680), (830, 680)]
        for index, (heading, lines) in enumerate(sections):
            column = index % 2
            x, y = columns[column]
            columns[column] = (x, _draw_section(draw, x=x, y=y, width=680, heading=heading, lines=lines, density="hard"))
    else:
        y = 430
        width = 1420
        for heading, lines in sections:
            y = _draw_section(draw, x=90, y=y, width=width, heading=heading, lines=lines, density=case.difficulty)

    draw.line((90, 2015, 1510, 2015), fill="#a0aaaa", width=2)
    draw.text((90, 2035), "Synthetic benchmark only — not a real medical record", fill="#586868", font=_font(18))
    draw.text((1400, 2035), "Page 1", fill="#586868", font=_font(18))
    image.save(path, format="PNG", optimize=False)

    reference_lines = [f"PATIENT: {patient}", f"REPORT DATE: {report_date}", case.title]
    for heading, lines in sections:
        reference_lines.append(heading)
        reference_lines.extend(lines)
    return "\n".join(reference_lines)


def generate(output: Path) -> dict[str, Any]:
    if output.exists() and any(output.iterdir()):
        raise RuntimeError("BENCHMARK_OUTPUT_ALREADY_EXISTS")
    pages_dir = output / "pages"
    gold_dir = output / "gold"
    contact_dir = output / "contact-sheets"
    pages_dir.mkdir(parents=True, exist_ok=True)
    gold_dir.mkdir(parents=True, exist_ok=True)
    contact_dir.mkdir(parents=True, exist_ok=True)

    rng = random.Random(SEED)
    first_names = ["Avery", "Casey", "Jordan", "Morgan", "Riley", "Taylor", "Skyler", "Reese", "Quinn", "Rowan"]
    last_names = ["Teston", "Sample", "Example", "Mockwell", "Fiction", "Simulated"]
    facilities = ["Northstar Main", "Northstar East", "Northstar West"]
    clinicians = ["Dr. Arun Test", "Dr. Mira Sample", "Dr. Lee Example"]
    dates = [f"{day:02d} SEP 2026" for day in range(1, 29)]

    manifest_documents: list[dict[str, Any]] = []
    rendered_paths: list[Path] = []
    for case in cases():
        patient = f"{rng.choice(first_names)} {rng.choice(last_names)}"
        report_date = rng.choice(dates)
        facility = rng.choice(facilities)
        clinician = rng.choice(clinicians)
        image_path = pages_dir / f"{case.document_id}.png"
        reference_text = render_case(
            case,
            patient=patient,
            report_date=report_date,
            facility=facility,
            clinician=clinician,
            path=image_path,
        )
        rendered_paths.append(image_path)

        patient_source = f"PATIENT: {patient}\nREPORT DATE: {report_date}"
        envelope = {
            "patient": {"name": patient, "date": report_date, "page": 1, "source_text": patient_source},
            "labs": list(case.labs),
            "diagnoses": list(case.diagnoses),
            "medications": list(case.medications),
            "allergies": list(case.allergies),
        }
        gold = {
            "benchmark_version": BENCHMARK_VERSION,
            "source_kind": "synthetic",
            "document_id": case.document_id,
            "family": case.family,
            "difficulty": case.difficulty,
            "page": 1,
            "reference_text": reference_text,
            "expected_envelope": envelope,
        }
        gold_path = gold_dir / f"{case.document_id}.json"
        gold_path.write_text(json.dumps(gold, indent=2, sort_keys=True) + "\n")
        expected_counts = {
            "patient": 1,
            "lab": len(case.labs),
            "diagnosis": len(case.diagnoses),
            "medication": len(case.medications),
            "allergy": len(case.allergies),
        }
        manifest_documents.append(
            {
                "document_id": case.document_id,
                "family": case.family,
                "difficulty": case.difficulty,
                "page_count": 1,
                "expected_candidate_counts": expected_counts,
                "image_sha256": _sha256(image_path),
                "gold_sha256": _sha256(gold_path),
            }
        )

    for start in range(0, len(rendered_paths), 10):
        group = rendered_paths[start : start + 10]
        sheet = Image.new("RGB", (1000, 1320), "#dfe7e6")
        sheet_draw = ImageDraw.Draw(sheet)
        for offset, source in enumerate(group):
            with Image.open(source) as page:
                thumb = page.copy()
                thumb.thumbnail((300, 420))
                x = 20 + (offset % 3) * 325
                y = 30 + (offset // 3) * 315
                sheet.paste(thumb, (x, y))
                sheet_draw.text((x, y + 270), source.stem, fill="#102828", font=_font(15, bold=True))
        sheet.save(contact_dir / f"pages-{start + 1:02d}-{start + len(group):02d}.png")

    manifest = {
        "benchmark_version": BENCHMARK_VERSION,
        "seed": SEED,
        "documents": manifest_documents,
    }
    manifest_path = output / "benchmark_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = generate(args.output)
    print(f"documents={len(manifest['documents'])}")
    print(f"pages={sum(item['page_count'] for item in manifest['documents'])}")
    print(f"seed={manifest['seed']}")
    print(f"manifest_sha256={_sha256(args.output / 'benchmark_manifest.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
