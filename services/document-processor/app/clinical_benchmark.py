"""Synthetic-only live OpenMed brain benchmark; never prints clinical text."""

from collections import Counter
from time import perf_counter
from uuid import UUID

from app.clinical import OpenMedClinicalNlpProvider
from app.schemas import BoundingBox, PageAnalysis, ProviderMetadata, TextBlock

MODEL = "urchade/gliner_large_bio-v0.1"
LINES = [
    "Diagnosis: Type 1 Diabetes Mellitus",
    "Known case of hypertension",
    "History of myocardial infarction",
    "Assessment: possible pulmonary embolism",
    "Patient denies chest pain",
    "Medication: Metformin 500 mg twice daily",
    "Medication: Insulin Aspart 10 units before meals",
    "Medication: Paracetamol 500 mg PRN",
    "Patient stopped metformin last month",
    "Allergy: Penicillin",
    "Patient denies sulfa allergy",
    "No known drug allergies",
    "2D Echo Cardiogram performed",
    "LVEF 62%",
    "No RWMA",
    "Impression: Grade-II fatty liver",
    "Impression: Grade-I prostatomegaly",
    "Impression: Simple left renal cortical cyst",
]


def main() -> int:
    blocks = [
        TextBlock(
            id=f"synthetic-{index}",
            text=line,
            confidence=1,
            bbox=BoundingBox(x0=10, y0=index * 20, x1=500, y1=index * 20 + 15),
        )
        for index, line in enumerate(LINES)
    ]
    page = PageAnalysis(
        page_number=1,
        width=600,
        height=800,
        rotation=0,
        skew_angle=0,
        source="native_pdf",
        full_text="\n".join(LINES),
        blocks=blocks,
        provider=ProviderMetadata(name="synthetic", version="1"),
    )
    started = perf_counter()
    result = OpenMedClinicalNlpProvider(MODEL).analyze(
        UUID("00000000-0000-0000-0000-000000000000"), [page]
    )
    categories = Counter(candidate.record_type for candidate in result.candidates)
    print("clinical_synthetic_benchmark raw_text_output=false persistence=false")
    print(
        f"model_invoked={str(result.metadata.model_backed).lower()} model={MODEL} "
        f"proposals={result.metadata.candidates_before_validation} "
        f"accepted={result.metadata.candidates_after_validation}"
    )
    print("categories=" + ",".join(f"{key}:{value}" for key, value in sorted(categories.items())))
    rejected = ",".join(
        f"{key}:{value}" for key, value in sorted(result.metadata.rejected_reasons.items())
    )
    print("rejected=" + (rejected or "none"))
    print(f"runtime_seconds={perf_counter() - started:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
