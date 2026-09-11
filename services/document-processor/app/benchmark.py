"""Local-only OCR benchmark. It never persists, uploads, or prints document text."""

import argparse
import re
import sys
from pathlib import Path
from time import perf_counter

import fitz
from PIL import Image

from app.errors import ProcessorError
from app.layout import reconstruct_rows
from app.ocr import PaddleOCRProvider, TesseractOCRProvider
from app.preprocessing import preprocess_image

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
    print(".venv/bin/python -c 'from paddleocr import PaddleOCR; PaddleOCR(lang=\"en\", use_doc_orientation_classify=True, use_doc_unwarping=False, use_textline_orientation=True)'")
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
    print("OCR benchmark: local-only, no persistence, no document text output", flush=True)
    page_count = 0
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
                useful_blocks = sum(bool(MEDICAL_SIGNAL.search(block.text)) for block in result.blocks)
                extraction_blocks = (
                    reconstruct_rows(result.blocks)
                    if metadata.name == "paddleocr"
                    else result.blocks
                )
                candidate_count = sum(bool(ROW_SIGNAL.search(block.text)) for block in extraction_blocks)
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
