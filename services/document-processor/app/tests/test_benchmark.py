from pathlib import Path

import numpy as np
from PIL import Image

from app import benchmark
from app.errors import ocr_failed_error
from app.ocr import OCRResult
from app.schemas import BoundingBox, ProviderMetadata, TextBlock


class FailingPaddle:
    name = "paddleocr"

    def extract(self, image, page_number, preprocessing):
        del image, page_number, preprocessing
        raise ocr_failed_error()


class SafeTesseract:
    name = "tesseract"

    def extract(self, image, page_number, preprocessing):
        del image, preprocessing
        block = TextBlock(
            id="safe",
            text="private synthetic marker",
            confidence=0.8,
            bbox=BoundingBox(x0=0, y0=0, x1=10, y1=10),
        )
        return OCRResult(
            block.text,
            [block],
            ProviderMetadata(
                name="tesseract",
                version="test",
                quality_score=0.7,
                quality_label="medium",
                selected_variant="test",
                preprocessing=[],
            ),
        )


def test_benchmark_reports_provider_failure_and_continues_without_raw_text(monkeypatch, capsys):
    monkeypatch.setattr(
        benchmark,
        "render_pages",
        lambda path: iter([(1, Image.fromarray(np.zeros((20, 30, 3), dtype=np.uint8)))]),
    )
    status = benchmark.run_benchmark(Path("synthetic.pdf"), [FailingPaddle(), SafeTesseract()])
    output = capsys.readouterr().out
    assert status == 0
    assert "provider=paddleocr status=failed error_code=OCR_PROCESSING_FAILED" in output
    assert "provider=tesseract status=succeeded fallback_attempted=true" in output
    assert "private synthetic marker" not in output
    assert "benchmark_complete pages=1" in output
