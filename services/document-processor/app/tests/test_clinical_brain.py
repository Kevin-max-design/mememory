from uuid import uuid4

from app.clinical import OpenMedClinicalNlpProvider
from app.schemas import BoundingBox, PageAnalysis, ProviderMetadata, TextBlock


def page_with(*texts: tuple[str, str]):
    blocks = [TextBlock(id=identifier, text=text, confidence=0.9,
        bbox=BoundingBox(x0=10, y0=100 + index * 30, x1=500, y1=120 + index * 30))
        for index, (identifier, text) in enumerate(texts)]
    return PageAnalysis(page_number=1, width=600, height=800, rotation=0, skew_angle=0,
        source="ocr", full_text="\n".join(block.text for block in blocks), blocks=blocks,
        provider=ProviderMetadata(name="paddleocr", version="3.7.0"))


def test_openmed_brain_uses_verified_measurement_apis_with_provenance():
    result = OpenMedClinicalNlpProvider().analyze(uuid4(), [page_with(
        ("hgb", "Haemoglobin 13.5 gm% 13.0-17.0"),
        ("plt", "Platelet Count 291 x10^3/uL 150-400"),
        ("tsh", "TSH 1.56 uIU/mL"),
    )])
    assert result.metadata.invoked is True
    assert result.metadata.model_backed is False
    assert result.metadata.candidates_before_validation == 3
    assert result.candidates[0].source_block_ids == ["hgb"]
    assert result.candidates[0].source_text == "Haemoglobin 13.5 gm% 13.0-17.0"
    assert result.candidates[0].data["numeric_value"] == 13.5
    assert result.candidates[1].data["numeric_value"] == 291
    assert result.candidates[2].data["unit"] == "uiu/ml"


def test_openmed_brain_rejects_non_main_content_and_missing_same_row_value():
    page = page_with(("header", "TSH 1.56 uIU/mL"), ("missing", "Creatinine"))
    page.blocks[0].region = "likely_header"
    result = OpenMedClinicalNlpProvider().analyze(uuid4(), [page])
    assert result.candidates == ()
    assert result.metadata.rejected_reasons == {
        "likely_header_footer": 1,
        "no_same_row_value": 1,
    }
