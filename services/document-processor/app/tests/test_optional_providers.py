from uuid import uuid4

import numpy as np
import pytest

from app.clinical import (
    CompositeClinicalNlpProvider,
    NoopClinicalNlpProvider,
    OpenMedClinicalNlpProvider,
)
from app.ocr import CompositeOCRProvider, OCRResult, PaddleOCRProvider
from app.schemas import BoundingBox, ProviderMetadata, TextBlock


class FakePaddle:
    received = None

    def predict(self, image):
        self.received = image
        return [{
            "rec_polys": [
                [[100, 50], [190, 50], [190, 70], [100, 70]],
                [[10, 10], [90, 10], [90, 30], [10, 30]],
            ],
            "rec_texts": ["second", "first"],
            "rec_scores": [0.8, 0.95],
        }]


class Unavailable:
    def extract(self, image, page_number, preprocessing):
        del image, page_number, preprocessing
        raise RuntimeError("unavailable")

    def enhance(self, text):
        del text
        raise RuntimeError("unavailable")

    def analyze(self, document_id, pages):
        del document_id, pages
        raise RuntimeError("unavailable")


class Fallback:
    def extract(self, image, page_number, preprocessing):
        del image, preprocessing
        block = TextBlock(id=f"p{page_number}-fallback", text="fallback text", confidence=0.9,
            bbox=BoundingBox(x0=0, y0=0, x1=20, y1=10))
        return OCRResult(block.text, [block], ProviderMetadata(name="fallback", version="1"))


def test_paddle_maps_bbox_confidence_and_reading_order():
    engine = FakePaddle()
    result = PaddleOCRProvider(engine).extract(np.zeros((100, 200), dtype=np.uint8), 1, ["gray"])
    assert engine.received.shape == (100, 200, 3)
    assert engine.received.dtype == np.uint8
    assert engine.received.flags.c_contiguous
    assert [block.text for block in result.blocks] == ["first", "second"]
    assert result.blocks[0].confidence == 0.95
    assert result.blocks[0].bbox.x1 == 90
    assert result.provider.name == "paddleocr"
    assert result.provider.quality_label in {"low", "medium", "high"}


def test_composite_falls_back_with_explicit_status():
    result = CompositeOCRProvider(Unavailable(), Fallback()).extract(np.zeros((5, 5)), 1, [])
    assert result.provider.name == "fallback"
    assert result.provider.fallback_reason == "primary_unavailable"


def test_openmed_verified_unit_api_and_noop_fallback():
    result = OpenMedClinicalNlpProvider().enhance("Glucose 99 mg/dL")
    assert result.provider == "openmed"
    assert result.version == "2.3.0"
    fallback = CompositeClinicalNlpProvider(Unavailable(), NoopClinicalNlpProvider()).enhance("safe")
    assert fallback.status == "disabled"


def test_openmed_brain_unavailable_falls_back_without_candidates():
    result = CompositeClinicalNlpProvider(Unavailable(), NoopClinicalNlpProvider()).analyze(
        uuid4(), []
    )
    assert result.candidates == ()
    assert result.metadata.invoked is False
    assert result.metadata.warnings == ["openmed_unavailable_fallback"]


@pytest.mark.parametrize(
    ("image", "expected_pixel"),
    [
        (np.zeros((4, 5), dtype=np.uint8), 0),
        (np.zeros((4, 5, 1), dtype=np.uint8), 0),
        (np.dstack([np.full((4, 5), 7, dtype=np.uint8)] * 3 + [np.full((4, 5), 255, dtype=np.uint8)]), 7),
        (np.full((4, 5, 3), 11, dtype=np.uint8), 11),
        (np.ones((4, 5), dtype=np.float32), 255),
        (np.full((4, 5), 300.0, dtype=np.float32), 255),
    ],
)
def test_prepare_paddle_image_is_rgb_uint8_contiguous(image, expected_pixel):
    original = image.copy()
    prepared = PaddleOCRProvider.prepare_image(image)
    assert prepared.shape == (4, 5, 3)
    assert prepared.dtype == np.uint8
    assert prepared.flags.c_contiguous
    assert prepared[0, 0, 0] == expected_pixel
    assert np.array_equal(image, original)


@pytest.mark.parametrize("image", [np.zeros(5), np.zeros((2, 3, 5))])
def test_prepare_paddle_image_rejects_invalid_shapes(image):
    with pytest.raises(Exception) as raised:
        PaddleOCRProvider.prepare_image(image)
    assert getattr(raised.value, "code", None) == "OCR_INVALID_IMAGE"
    assert "shape=" in getattr(raised.value, "message", "")


def test_paddle_maps_rec_boxes_and_missing_confidence_without_faking_it():
    class BoxesOnly:
        def predict(self, image):
            assert image.shape == (10, 20, 3)
            return [{"rec_texts": ["safe"], "rec_scores": [], "rec_boxes": [[1, 2, 8, 9]]}]

    result = PaddleOCRProvider(BoxesOnly()).extract(np.zeros((10, 20)), 2, [])
    assert result.blocks[0].text == "safe"
    assert result.blocks[0].confidence is None
    assert result.blocks[0].bbox.model_dump() == {"x0": 1.0, "y0": 2.0, "x1": 8.0, "y1": 9.0}
