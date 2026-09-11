import numpy as np

from app.clinical import (
    CompositeClinicalNlpProvider,
    NoopClinicalNlpProvider,
    OpenMedClinicalNlpProvider,
)
from app.ocr import CompositeOCRProvider, OCRResult, PaddleOCRProvider
from app.schemas import BoundingBox, ProviderMetadata, TextBlock


class FakePaddle:
    def predict(self, image):
        del image
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


class Fallback:
    def extract(self, image, page_number, preprocessing):
        del image, preprocessing
        block = TextBlock(id=f"p{page_number}-fallback", text="fallback text", confidence=0.9,
            bbox=BoundingBox(x0=0, y0=0, x1=20, y1=10))
        return OCRResult(block.text, [block], ProviderMetadata(name="fallback", version="1"))


def test_paddle_maps_bbox_confidence_and_reading_order():
    result = PaddleOCRProvider(FakePaddle()).extract(np.zeros((100, 200), dtype=np.uint8), 1, ["gray"])
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
