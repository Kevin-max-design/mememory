import base64
from uuid import uuid4

import fitz
import pytest

from app.errors import ProcessorError, ocr_unavailable_error
from app.ocr import OCRResult
from app.processor import DocumentProcessor
from app.schemas import AnalyzeRequest, AnalyzeResponse, ProviderMetadata
from app.tests.conftest import analyze_payload


def test_native_text_pdf_extraction(client, headers, native_pdf):
    response = client.post(
        "/v1/documents/analyze",
        headers=headers,
        json=analyze_payload(str(uuid4()), "application/pdf", native_pdf),
    )

    assert response.status_code == 200
    body = AnalyzeResponse.model_validate(response.json())
    page = body.data.pages[0]
    assert page.source == "native_pdf"
    assert page.provider.name == "pymupdf"
    assert "Synthetic native PDF sentence" in page.full_text
    assert page.blocks and page.blocks[0].confidence is None


def test_mixed_pdf_makes_page_by_page_decisions(client, headers, mixed_pdf):
    response = client.post(
        "/v1/documents/analyze",
        headers=headers,
        json=analyze_payload(str(uuid4()), "application/pdf", mixed_pdf),
    )

    assert response.status_code == 200
    pages = response.json()["data"]["pages"]
    assert [page["source"] for page in pages] == ["native_pdf", "ocr"]
    assert pages[0]["provider"]["name"] == "pymupdf"
    assert pages[1]["provider"]["name"] == "tesseract"


@pytest.mark.parametrize(
    ("fixture_name", "mime_type"),
    [("synthetic_image", "image/png"), ("scanned_pdf", "application/pdf")],
)
def test_image_and_scanned_pdf_use_ocr(
    request, client, headers, fixture_name, mime_type
):
    content = request.getfixturevalue(fixture_name)
    response = client.post(
        "/v1/documents/analyze",
        headers=headers,
        json=analyze_payload(str(uuid4()), mime_type, content),
    )

    assert response.status_code == 200
    page = response.json()["data"]["pages"][0]
    assert page["source"] == "ocr"
    assert page["provider"]["name"] == "tesseract"
    assert "SYNTHETIC" in page["full_text"].upper()
    assert page["blocks"]
    assert 0 <= page["blocks"][0]["confidence"] <= 1
    assert page["blocks"][0]["bbox"]["x1"] > page["blocks"][0]["bbox"]["x0"]


def test_unsupported_file_rejection(client, headers):
    response = client.post(
        "/v1/documents/analyze",
        headers=headers,
        json=analyze_payload(str(uuid4()), "text/plain", b"synthetic text"),
    )
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UPLOAD_UNSUPPORTED_TYPE"


def test_malformed_pdf_handling(client, headers):
    response = client.post(
        "/v1/documents/analyze",
        headers=headers,
        json=analyze_payload(str(uuid4()), "application/pdf", b"%PDF-not-valid"),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UPLOAD_INVALID_FILE"


def test_zero_byte_handling(client, headers):
    response = client.post(
        "/v1/documents/analyze",
        headers=headers,
        json={
            "document_id": str(uuid4()),
            "mime_type": "image/png",
            "content_base64": base64.b64encode(b"").decode("ascii"),
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UPLOAD_EMPTY_FILE"


class UnavailableOCR:
    def extract(self, image, page_number, preprocessing):
        raise ocr_unavailable_error()


def test_provider_unavailable_handling(client, headers, synthetic_image):
    original = client.app.state.processor
    client.app.state.processor = DocumentProcessor(UnavailableOCR())
    try:
        response = client.post(
            "/v1/documents/analyze",
            headers=headers,
            json=analyze_payload(str(uuid4()), "image/png", synthetic_image),
        )
    finally:
        client.app.state.processor = original

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "LOCAL_OCR_UNAVAILABLE"


def test_response_contains_no_canned_medical_data(client, headers, native_pdf):
    response = client.post(
        "/v1/documents/analyze",
        headers=headers,
        json=analyze_payload(str(uuid4()), "application/pdf", native_pdf),
    )
    serialized = response.text.lower()
    assert "diagnosis" not in serialized
    assert "medication" not in serialized
    assert "patient name" not in serialized
    assert "synthetic native pdf sentence" in serialized


def test_analyze_requires_internal_auth(client, native_pdf):
    response = client.post(
        "/v1/documents/analyze",
        json=analyze_payload(str(uuid4()), "application/pdf", native_pdf),
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_REQUIRED"


def test_image_mime_mismatch_is_rejected(client, headers, synthetic_image):
    response = client.post(
        "/v1/documents/analyze",
        headers=headers,
        json=analyze_payload(str(uuid4()), "image/jpeg", synthetic_image),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "UPLOAD_INVALID_FILE"


class CountingOCR:
    def __init__(self):
        self.calls = 0

    def extract(self, image, page_number, preprocessing):
        self.calls += 1
        return OCRResult(
            full_text="",
            blocks=[],
            provider=ProviderMetadata(name="synthetic", version="1", preprocessing=[]),
        )


def test_document_wide_ocr_work_is_bounded():
    document = fitz.open()
    for _ in range(26):
        document.new_page()
    content = document.tobytes()
    document.close()
    provider = CountingOCR()
    request = AnalyzeRequest.model_validate(
        {
            **analyze_payload(str(uuid4()), "application/pdf", content),
            "options": {"max_pages": 50},
        }
    )

    with pytest.raises(ProcessorError) as raised:
        DocumentProcessor(provider).analyze(request)

    assert raised.value.code == "PROCESSING_WORK_LIMIT_EXCEEDED"
    assert raised.value.status_code == 413
    assert provider.calls <= 25
