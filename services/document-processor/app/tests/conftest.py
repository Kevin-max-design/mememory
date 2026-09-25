import base64
import os
from collections.abc import Iterator

import cv2
import fitz
import numpy as np
import pytest
from fastapi.testclient import TestClient

# Keep the default-provider tests independent from a developer's local .env.
# PaddleOCR has dedicated adapter tests; end-to-end processor tests exercise the
# documented default Tesseract path unless they explicitly inject another provider.
os.environ["ENABLE_PADDLEOCR"] = "false"
os.environ["OCR_PRIMARY_PROVIDER"] = "tesseract"
os.environ["OCR_FALLBACK_PROVIDER"] = "tesseract"

from app.main import app

TEST_SECRET = "synthetic-test-secret-with-32-characters"


@pytest.fixture
def client(monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setenv("DOCUMENT_PROCESSOR_SECRET", TEST_SECRET)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def headers() -> dict[str, str]:
    return {"x-service-secret": TEST_SECRET}


@pytest.fixture
def synthetic_image() -> bytes:
    canvas = np.full((420, 1600, 3), 255, dtype=np.uint8)
    cv2.putText(
        canvas,
        "SYNTHETIC OCR CHECK 4827",
        (60, 235),
        cv2.FONT_HERSHEY_SIMPLEX,
        2.1,
        (0, 0, 0),
        5,
        cv2.LINE_AA,
    )
    encoded, buffer = cv2.imencode(".png", canvas)
    assert encoded
    return buffer.tobytes()


@pytest.fixture
def native_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text(
        (72, 100),
        "Synthetic native PDF sentence with enough text for direct extraction.",
        fontsize=14,
    )
    content = document.tobytes()
    document.close()
    return content


@pytest.fixture
def scanned_pdf(synthetic_image: bytes) -> bytes:
    document = fitz.open()
    page = document.new_page(width=800, height=210)
    page.insert_image(page.rect, stream=synthetic_image)
    content = document.tobytes()
    document.close()
    return content


@pytest.fixture
def mixed_pdf(synthetic_image: bytes) -> bytes:
    document = fitz.open()
    native_page = document.new_page()
    native_page.insert_text(
        (72, 100),
        "Synthetic native page remains separate from the scanned page OCR decision.",
        fontsize=14,
    )
    scanned_page = document.new_page(width=800, height=210)
    scanned_page.insert_image(scanned_page.rect, stream=synthetic_image)
    content = document.tobytes()
    document.close()
    return content


def analyze_payload(document_id: str, mime_type: str, content: bytes) -> dict[str, str]:
    return {
        "document_id": document_id,
        "mime_type": mime_type,
        "content_base64": base64.b64encode(content).decode("ascii"),
    }
