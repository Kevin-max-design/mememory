from app.layout import classify_document_regions, reconstruct_rows
from app.schemas import BoundingBox, PageAnalysis, ProviderMetadata, TextBlock


def text_block(identifier: str, text: str, x0: float, y0: float, x1: float, y1: float):
    return TextBlock(id=identifier, text=text, confidence=0.9, bbox=BoundingBox(x0=x0, y0=y0, x1=x1, y1=y1))


def test_table_cells_reconstruct_by_row_without_neighbor_contamination():
    blocks = [
        text_block("h", "Haemoglobin", 10, 100, 90, 115),
        text_block("hv", "13.5 gm%", 120, 101, 180, 116),
        text_block("p", "Platelet Count", 10, 140, 100, 155),
        text_block("pv", "291 x10^3/uL", 120, 141, 210, 156),
    ]
    rows = reconstruct_rows(blocks)
    assert len(rows) == 2
    assert rows[0].text == "Haemoglobin  13.5 gm%"
    assert "291" not in rows[0].text
    assert rows[1].text == "Platelet Count  291 x10^3/uL"


def test_repeated_page_edges_and_disclaimer_are_labeled_but_retained():
    pages = []
    for page_number in (1, 2):
        blocks = [
            text_block(f"h{page_number}", "Synthetic Hospital", 10, 10, 150, 30),
            text_block(f"m{page_number}", "TSH 1.56 uIU/ml", 10, 300, 180, 320),
            text_block(f"d{page_number}", "Results relate only to this sample", 10, 900, 250, 920),
        ]
        pages.append(PageAnalysis(page_number=page_number, width=600, height=1000, rotation=0,
            skew_angle=0, source="ocr", full_text="\n".join(block.text for block in blocks),
            blocks=blocks, provider=ProviderMetadata(name="test", version="1")))
    classify_document_regions(pages)
    assert pages[0].blocks[0].region == "likely_header"
    assert pages[0].blocks[1].region == "main_content"
    assert pages[0].blocks[2].region == "disclaimer"
    assert len(pages[0].blocks) == 3
