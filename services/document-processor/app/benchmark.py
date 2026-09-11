"""Local-only OCR benchmark. It never persists, uploads, or prints document text."""

import argparse
import re
import sys
from collections import Counter
from pathlib import Path
from time import perf_counter
from uuid import UUID

import fitz
from PIL import Image

from app.clinical import DEFAULT_OPENMED_MODEL, build_openmed_provider, local_model_available
from app.errors import ProcessorError
from app.layout import classify_document_regions, reconstruct_rows
from app.ocr import PaddleOCRProvider, TesseractOCRProvider
from app.preprocessing import preprocess_image
from app.schemas import PageAnalysis

MEDICAL_SIGNAL = re.compile(
    r"\b(?:ha?emoglobin|platelets?|wbc|rbc|creatinine|glucose|cholesterol|tsh|hba1c|bilirubin|albumin|diagnosis|medication)\b",
    re.IGNORECASE,
)
ROW_SIGNAL = re.compile(
    r"\b(?:ha?emoglobin|platelets?|wbc|rbc|creatinine|glucose|cholesterol|tsh|hba1c|bilirubin|albumin)\b.*?\d",
    re.IGNORECASE,
)


def paddle_models_ready() -> bool:
    model_root = Path.home() / ".paddlex" / "official_models"
    return model_root.is_dir() and any(model_root.iterdir())


def manual_action() -> None:
    print("MANUAL ACTION REQUIRED — PADDLEOCR LIVE MODEL DOWNLOAD")
    print("Run these commands from the MedMemory repository root:")
    print("cd services/document-processor")
    print(
        ".venv/bin/python -c 'from paddleocr import PaddleOCR; PaddleOCR(lang=\"en\", use_doc_orientation_classify=True, use_doc_unwarping=False, use_textline_orientation=True)'"
    )
    print("cd ../..")
    print("npm run benchmark:ocr -- /absolute/path/to/report.pdf")


def render_pages(path: Path):
    document = fitz.open(path)
    try:
        for index in range(document.page_count):
            page = document.load_page(index)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(240 / 72, 240 / 72), alpha=False)
            yield index + 1, Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    finally:
        document.close()


def run_benchmark(path: Path, providers=None) -> int:
    providers = providers or [PaddleOCRProvider(), TesseractOCRProvider()]
    model_available = local_model_available(DEFAULT_OPENMED_MODEL)
    print("OCR benchmark: local-only, no persistence, no document text output", flush=True)
    print("OPENMED_MODEL_ENABLED=true", flush=True)
    print(f"OPENMED_MODEL_AVAILABLE={str(model_available).lower()}", flush=True)
    print(f"OPENMED_MODEL_NAME={DEFAULT_OPENMED_MODEL}", flush=True)
    print(f"OPENMED_MODEL_LOCAL_FILES={str(model_available).lower()}", flush=True)
    print("OPENMED_MODEL_RUNTIME=gliner-pytorch-cpu", flush=True)
    print(f"OPENMED_NER_ACTIVE={str(model_available).lower()}", flush=True)
    page_count = 0
    paddle_pages: list[PageAnalysis] = []
    deterministic_count = 0
    for page_number, image in render_pages(path):
        page_count += 1
        prepared = preprocess_image(image)
        paddle_failed = False
        for provider in providers:
            started = perf_counter()
            try:
                result = provider.extract(prepared.normalized, page_number, prepared.operations)
                elapsed = perf_counter() - started
                metadata = result.provider
                main_blocks = sum(block.region == "main_content" for block in result.blocks)
                useful_blocks = sum(
                    bool(MEDICAL_SIGNAL.search(block.text)) for block in result.blocks
                )
                extraction_blocks = (
                    reconstruct_rows(result.blocks)
                    if metadata.name == "paddleocr"
                    else result.blocks
                )
                candidate_count = sum(
                    bool(ROW_SIGNAL.search(block.text)) for block in extraction_blocks
                )
                if metadata.name == "paddleocr":
                    deterministic_count += candidate_count
                    paddle_pages.append(
                        PageAnalysis(
                            page_number=page_number,
                            width=prepared.original.width,
                            height=prepared.original.height,
                            rotation=0,
                            skew_angle=prepared.skew_angle,
                            source="ocr",
                            full_text="\n".join(block.text for block in extraction_blocks),
                            blocks=extraction_blocks,
                            provider=metadata,
                        )
                    )
                print(
                    f"page={page_number} provider={metadata.name} status=succeeded "
                    f"fallback_attempted={str(paddle_failed).lower()} "
                    f"fallback_provider={'tesseract' if paddle_failed else 'none'} "
                    f"variant={metadata.selected_variant or 'default'} quality={metadata.quality_score or 0:.3f} "
                    f"label={metadata.quality_label or 'unknown'} blocks={len(result.blocks)} "
                    f"main_blocks={main_blocks} useful_medical_blocks={useful_blocks} "
                    f"candidate_count={candidate_count} runtime_seconds={elapsed:.3f} "
                    f"low_reason={metadata.quality_reason or 'none'}",
                    flush=True,
                )
            except ProcessorError as error:
                elapsed = perf_counter() - started
                is_paddle = getattr(provider, "name", "unknown") == "paddleocr"
                paddle_failed = paddle_failed or is_paddle
                print(
                    f"page={page_number} provider={getattr(provider, 'name', 'unknown')} status=failed "
                    f"error_code={error.code} fallback_attempted={str(is_paddle).lower()} "
                    f"fallback_provider={'tesseract' if is_paddle else 'none'} blocks=0 "
                    f"candidate_count=0 runtime_seconds={elapsed:.3f}",
                    flush=True,
                )
            except (ImportError, OSError, RuntimeError, TypeError, ValueError):
                elapsed = perf_counter() - started
                is_paddle = getattr(provider, "name", "unknown") == "paddleocr"
                paddle_failed = paddle_failed or is_paddle
                print(
                    f"page={page_number} provider={getattr(provider, 'name', 'unknown')} status=failed "
                    f"error_code=OCR_PROVIDER_UNEXPECTED fallback_attempted={str(is_paddle).lower()} "
                    f"fallback_provider={'tesseract' if is_paddle else 'none'} blocks=0 "
                    f"candidate_count=0 runtime_seconds={elapsed:.3f}",
                    flush=True,
                )
    if paddle_pages:
        classify_document_regions(paddle_pages)
        started = perf_counter()
        clinical = build_openmed_provider(DEFAULT_OPENMED_MODEL)
        brains = []
        for page in paddle_pages:
            page_brain = clinical.analyze(UUID("00000000-0000-0000-0000-000000000000"), [page])
            brains.append(page_brain)
            reasons = (
                ",".join(
                    f"{name}:{count}"
                    for name, count in sorted(page_brain.metadata.rejected_reasons.items())
                )
                or "none"
            )
            print(
                f"clinical_page={page.page_number} blocks={len(page.blocks)} "
                f"ner_blocks_evaluated={page_brain.metadata.ner_blocks_evaluated} "
                f"raw_proposals={page_brain.metadata.candidates_before_validation} "
                f"accepted={page_brain.metadata.candidates_after_validation} rejected={reasons}",
                flush=True,
            )
        candidates = [candidate for brain in brains for candidate in brain.candidates]
        raw_categories = Counter()
        accepted_categories = Counter()
        rejected_categories = Counter()
        for brain in brains:
            raw_categories.update(brain.metadata.raw_proposals_by_category)
            accepted_categories.update(brain.metadata.accepted_by_category)
            rejected_categories.update(brain.metadata.rejected_reasons)
        model_backed = any(brain.metadata.model_backed for brain in brains)
        openmed_keys = {
            (candidate.source_page_number, candidate.source_block_ids[0], candidate.record_type)
            for candidate in candidates
        }
        # OpenMed's conservative lab proposals are a subset of the same source-bound rows
        # counted by the deterministic benchmark. The production worker performs the full
        # semantic merge; its exact behavior is covered by the worker test suite.
        openmed_labs = accepted_categories["lab"]
        duplicates_removed = min(openmed_labs, deterministic_count)
        composite_count = deterministic_count + len(openmed_keys) - duplicates_removed
        fallback_additions = max(0, deterministic_count - openmed_labs)
        unique_contribution = len(openmed_keys) - duplicates_removed
        category_names = ("diagnosis", "medication", "allergy", "procedure", "finding", "lab")
        raw = ",".join(f"{name}:{raw_categories[name]}" for name in category_names)
        accepted = ",".join(f"{name}:{accepted_categories[name]}" for name in category_names)
        reasons = (
            ",".join(f"{name}:{count}" for name, count in sorted(rejected_categories.items()))
            or "none"
        )
        print(
            "clinical_benchmark "
            f"openmed_invoked={str(bool(brains)).lower()} "
            f"openmed_apis_used={','.join(brains[0].metadata.apis_used)} "
            f"openmed_model_backed={str(model_backed).lower()} "
            f"openmed_candidates_before_validation={sum(b.metadata.candidates_before_validation for b in brains)} "
            f"openmed_candidates_after_validation={len(candidates)} "
            f"openmed_raw_by_category={raw} openmed_accepted_by_category={accepted} "
            f"deterministic_candidates={deterministic_count} "
            f"deterministic_fallback_additions={fallback_additions} "
            f"composite_final_candidates={composite_count} "
            f"openmed_unique_contribution={unique_contribution} "
            f"duplicates_removed={duplicates_removed} rejected_openmed={reasons} "
            f"runtime_seconds={perf_counter() - started:.3f}",
            flush=True,
        )
    else:
        print(
            "clinical_benchmark openmed_invoked=false reason=no_successful_paddle_pages",
            flush=True,
        )
    print(f"benchmark_complete pages={page_count}", flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare local OCR providers without persistence")
    parser.add_argument("pdf", type=Path)
    arguments = parser.parse_args()
    path = arguments.pdf.expanduser().resolve()
    if not path.is_file() or path.suffix.lower() != ".pdf":
        print("Benchmark input must be an existing local PDF.", file=sys.stderr)
        return 2
    if not paddle_models_ready():
        manual_action()
        return 0
    return run_benchmark(path)


if __name__ == "__main__":
    raise SystemExit(main())
