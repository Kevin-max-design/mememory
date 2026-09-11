from app.quality import score_ocr
from app.schemas import BoundingBox, TextBlock


def block(text: str, confidence: float):
    return TextBlock(id="b", text=text, confidence=confidence, bbox=BoundingBox(x0=0, y0=0, x1=10, y1=10))


def test_quality_prefers_medical_signal_over_garbage():
    clean = score_ocr([block("Hemoglobin 13.5 g/dL platelet 291 x10^3/uL", 0.92)])
    garbage = score_ocr([block("::: ||| xq9$ z8@# z8@# z8@# z8@#", 0.45)])
    assert clean.score > garbage.score
    assert garbage.label == "low"
