from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import platform
import resource
import sys
from pathlib import Path
from time import perf_counter

os.environ.update(
    {
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_DATASETS_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "DO_NOT_TRACK": "1",
        "TOKENIZERS_PARALLELISM": "false",
    }
)


def deny_network(event: str, args: tuple[object, ...]) -> None:
    if event == "socket.connect":
        raise RuntimeError("NETWORK_DISABLED")


sys.addaudithook(deny_network)

REPO = Path("/Users/aremkevin/Downloads/untitled folder 4")
EXPERIMENT = REPO / "experiments/clinical-vlm"
MODEL = Path.home() / "Library/Caches/medmemory-vlm/Qwen2.5-VL-7B-Instruct-4bit"
IMAGE_PATH = EXPERIMENT / "artifacts/phase2a/synthetic-cbc.png"
ARTIFACT_DIR = EXPERIMENT / "artifacts/phase2a4-qwen7b-contract-v2"
RAW_OUTPUT_PATH = ARTIFACT_DIR / "model-output.json"
SUMMARY_PATH = ARTIFACT_DIR / "summary.json"
REVISION = "fdcc572e8b05ba9daeaf71be8c9e4267c826ff9b"
EXPECTED_IMAGE_SHA256 = "02bf0540d3d4e6467431bc534c42f48ef0037170e71daa6e9bc49a0e1cd92989"
DOCUMENT_ID = "synthetic-phase2a-001"

sys.path.insert(0, str(EXPERIMENT / "src"))

from clinical_vlm.interfaces import DocumentInput, RenderedPage
from clinical_vlm.models import FactType, Negation
from clinical_vlm.provenance import grounding_results
from clinical_vlm.vlm_canonical_adapter import adapt_vlm_extraction
from clinical_vlm.vlm_schema import (
    VLM_CONTRACT_VERSION,
    VLM_PROMPT_VERSION,
    VLMExtraction,
)


REFERENCE_TEXT = """PATIENT: TEST PATIENT
DATE: 15 SEP 2026

COMPLETE BLOOD COUNT

Hemoglobin        13.5 g/dL       12.0 - 16.0
Platelet Count    291 x10^3/uL    150 - 450
WBC Count         7.4 x10^3/uL    4.0 - 11.0

IMPRESSION:
No evidence of anemia.

MEDICATIONS:
None."""

PROMPT_PATH = EXPERIMENT / "prompts/extract_v2.txt"
PROMPT = PROMPT_PATH.read_text(encoding="utf-8")

def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def norm(value: object) -> str:
    return " ".join(str(value or "").split()).casefold()


def main() -> int:
    if not MODEL.is_dir():
        raise RuntimeError("MODEL_DIRECTORY_MISSING")
    if file_sha256(IMAGE_PATH) != EXPECTED_IMAGE_SHA256:
        raise RuntimeError("SYNTHETIC_IMAGE_CHANGED")

    from PIL import Image
    from mlx_vlm import generate, load
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.structured import build_json_schema_logits_processor

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    with Image.open(IMAGE_PATH) as image:
        width, height = image.size

    summary: dict[str, object] = {
        "model": "mlx-community/Qwen2.5-VL-7B-Instruct-4bit",
        "revision": REVISION,
        "runtime": {
            "python": platform.python_version(),
            "mlx": importlib.metadata.version("mlx"),
            "mlx_vlm": importlib.metadata.version("mlx-vlm"),
        },
        "local_only": True,
        "network_blocked": True,
        "model_path": str(MODEL),
        "model_disk_bytes": sum(
            path.stat().st_size for path in MODEL.rglob("*") if path.is_file()
        ),
        "image_sha256_before": EXPECTED_IMAGE_SHA256,
        "generation_method": "JSON-Schema-constrained decoding",
        "vlm_contract_version": VLM_CONTRACT_VERSION,
        "vlm_prompt_version": VLM_PROMPT_VERSION,
        "prompt_sha256": file_sha256(PROMPT_PATH),
        "primary_inference_count": 0,
    }

    load_started = perf_counter()
    model, processor = load(str(MODEL), lazy=False, strict=True)
    summary["model_load_seconds"] = perf_counter() - load_started

    schema_processor = build_json_schema_logits_processor(
        processor.tokenizer, VLMExtraction.model_json_schema()
    )
    formatted_prompt = apply_chat_template(
        processor,
        model.config,
        PROMPT,
        num_images=1,
        add_generation_prompt=True,
    )

    inference_started = perf_counter()
    summary["primary_inference_count"] = 1
    result = generate(
        model,
        processor,
        formatted_prompt,
        image=[str(IMAGE_PATH)],
        max_tokens=4096,
        temperature=0.0,
        seed=17,
        logits_processors=[schema_processor],
        verbose=False,
    )
    summary["inference_seconds"] = perf_counter() - inference_started
    summary["output_tokens"] = result.generation_tokens
    summary["mlx_peak_memory_gb"] = result.peak_memory
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    summary["process_peak_memory_bytes"] = (
        rss if platform.system() == "Darwin" else rss * 1024
    )

    raw = result.text.strip()
    RAW_OUTPUT_PATH.write_text(raw, encoding="utf-8")
    summary["raw_output_sha256"] = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    summary["image_sha256_after"] = file_sha256(IMAGE_PATH)
    summary["image_unchanged"] = summary["image_sha256_after"] == EXPECTED_IMAGE_SHA256

    try:
        payload = json.loads(raw)
        summary["raw_vlm_json_valid"] = True
    except json.JSONDecodeError:
        summary.update(
            raw_vlm_json_valid=False,
            raw_vlm_schema_valid=False,
            canonical_schema_valid=False,
            grounding_valid=False,
            decision="C",
            failure_class="STRUCTURED_OUTPUT",
        )
        SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
        return 2

    try:
        simplified = VLMExtraction.model_validate(payload)
        summary["raw_vlm_schema_valid"] = True
    except Exception as error:
        summary.update(
            raw_vlm_schema_valid=False,
            canonical_schema_valid=False,
            grounding_valid=False,
            decision="C",
            failure_class="STRUCTURED_OUTPUT",
            safe_error_type=type(error).__name__,
        )
        SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
        return 3

    try:
        canonical = adapt_vlm_extraction(simplified, document_id=DOCUMENT_ID)
        summary["canonical_schema_valid"] = True
    except Exception as error:
        summary.update(
            canonical_schema_valid=False,
            grounding_valid=False,
            decision="C",
            failure_class="STRUCTURED_OUTPUT",
            safe_error_type=type(error).__name__,
        )
        SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
        return 4

    document = DocumentInput(
        document_id=DOCUMENT_ID,
        pages=(
            RenderedPage(
                page_number=1,
                image_path=IMAGE_PATH,
                width=width,
                height=height,
                dpi=200,
                local_reference_text=REFERENCE_TEXT,
            ),
        ),
    )
    grounding = grounding_results(canonical, document)
    summary["grounding_valid"] = all(item.valid for item in grounding)
    summary["grounding_rejections"] = {
        reason: sum(item.reason == reason for item in grounding)
        for reason in sorted({item.reason for item in grounding if not item.valid})
    }

    summary["patient_name"] = simplified.patient.name
    summary["patient_name_accuracy"] = (
        1.0 if simplified.patient.name == "TEST PATIENT" else 0.0
    )
    summary["document_date"] = simplified.patient.date
    summary["document_date_accuracy"] = (
        1.0 if simplified.patient.date == "15 SEP 2026" else 0.0
    )

    expected_labs = {
        "Hemoglobin": ("13.5", "g/dL"),
        "Platelet Count": ("291", "x10^3/uL"),
        "WBC Count": ("7.4", "x10^3/uL"),
    }
    lab_results: dict[str, object] = {}
    test_matches = value_matches = unit_matches = tuple_matches = 0
    for name, (expected_value, expected_unit) in expected_labs.items():
        matching_name = [lab for lab in simplified.labs if norm(lab.test_name) == norm(name)]
        test_matches += int(bool(matching_name))
        value_match = any(lab.value == expected_value for lab in matching_name)
        unit_match = any(lab.unit == expected_unit for lab in matching_name)
        tuple_match = any(
            lab.value == expected_value and lab.unit == expected_unit
            for lab in matching_name
        )
        value_matches += int(value_match)
        unit_matches += int(unit_match)
        tuple_matches += int(tuple_match)
        first = matching_name[0] if matching_name else None
        lab_results[name] = {
            "found": first is not None,
            "value": first.value if first else None,
            "unit": first.unit if first else None,
            "exact_tuple": tuple_match,
        }
    summary["lab_results"] = lab_results
    summary["lab_test_name_accuracy"] = test_matches / 3
    summary["lab_value_accuracy"] = value_matches / 3
    summary["lab_unit_accuracy"] = unit_matches / 3
    summary["lab_tuple_accuracy"] = tuple_matches / 3

    anemia = [item for item in simplified.diagnoses if "anemia" in norm(item.name)]
    correct_negation = bool(anemia) and all(item.assertion == "absent" for item in anemia)
    summary["negation"] = {
        "expected": "anemia assertion absent",
        "extracted": [item.assertion for item in anemia],
    }
    summary["negation_accuracy"] = 1.0 if correct_negation else 0.0
    summary["medication_hallucination"] = {
        "expected_count": 0,
        "extracted_count": len(simplified.medications),
    }

    supported = 0
    supported += int(simplified.patient.name == "TEST PATIENT")
    supported += int(simplified.patient.date == "15 SEP 2026")
    supported += tuple_matches
    supported += int(correct_negation)
    predicted = (
        int(simplified.patient.name is not None)
        + int(simplified.patient.date is not None)
        + len(simplified.labs)
        + len(simplified.diagnoses)
        + len(simplified.medications)
    )
    summary["hallucination_count"] = max(0, predicted - supported)

    other_errors: list[str] = []
    if len(simplified.labs) != 3:
        other_errors.append(f"LAB_COUNT_{len(simplified.labs)}")
    if len(anemia) != 1:
        other_errors.append(f"ANEMIA_FACT_COUNT_{len(anemia)}")
    if summary["patient_name_accuracy"] != 1.0:
        other_errors.append("PATIENT_NAME_MISMATCH")
    if summary["document_date_accuracy"] != 1.0:
        other_errors.append("DOCUMENT_DATE_MISMATCH")
    summary["other_extraction_errors"] = other_errors

    passed = bool(
        summary["raw_vlm_json_valid"]
        and summary["raw_vlm_schema_valid"]
        and summary["canonical_schema_valid"]
        and summary["grounding_valid"]
        and summary["patient_name_accuracy"] == 1.0
        and summary["document_date_accuracy"] == 1.0
        and summary["lab_tuple_accuracy"] == 1.0
        and summary["negation_accuracy"] == 1.0
        and len(simplified.medications) == 0
        and summary["hallucination_count"] == 0
    )
    summary["decision"] = "A" if passed else "B"
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    return 0 if passed else 5


if __name__ == "__main__":
    raise SystemExit(main())
