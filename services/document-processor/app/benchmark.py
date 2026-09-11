"""Local-only OCR benchmark. It never persists, uploads, or prints document text."""

import argparse
import sys
from pathlib import Path
from time import perf_counter

import fitz
from PIL import Image

from app.ocr import PaddleOCRProvider, TesseractOCRProvider
from app.preprocessing import preprocess_image


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
        return 2

    providers = [PaddleOCRProvider(), TesseractOCRProvider()]
    print("OCR benchmark: local-only, no persistence, no document text output")
    for page_number, image in render_pages(path):
        prepared = preprocess_image(image)
        for provider in providers:
            started = perf_counter()
            result = provider.extract(prepared.normalized, page_number, prepared.operations)
            elapsed = perf_counter() - started
            metadata = result.provider
            main_blocks = sum(block.region == "main_content" for block in result.blocks)
            print(
                f"page={page_number} provider={metadata.name} fallback={metadata.fallback_reason or 'none'} "
                f"variant={metadata.selected_variant or 'default'} quality={metadata.quality_score or 0:.3f} "
                f"label={metadata.quality_label or 'unknown'} blocks={len(result.blocks)} "
                f"main_blocks={main_blocks} runtime_seconds={elapsed:.3f} "
                f"low_reason={metadata.quality_reason or 'none'}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
