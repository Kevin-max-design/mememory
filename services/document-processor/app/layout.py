"""Geometry-based row reconstruction and conservative extraction-region labeling."""

import re
from collections import Counter
from statistics import median

from app.schemas import BoundingBox, PageAnalysis, TextBlock

DISCLAIMER = re.compile(
    r"(?:verified by|approved by|results? (?:relate|apply) only|not for medico|disclaimer)",
    re.IGNORECASE,
)
CONTACT = re.compile(r"(?:www\.|@|\bphone\b|\btel\b|\bemail\b|\+?\d[\d\s()-]{7,})", re.IGNORECASE)


def reconstruct_rows(blocks: list[TextBlock]) -> list[TextBlock]:
    """Group OCR cells on the same visual row without crossing vertical neighbors."""
    if len(blocks) < 2:
        return blocks
    heights = [max(1.0, block.bbox.y1 - block.bbox.y0) for block in blocks]
    tolerance = max(3.0, min(16.0, median(heights) * 0.45))
    rows: list[list[TextBlock]] = []
    for block in sorted(blocks, key=lambda item: ((item.bbox.y0 + item.bbox.y1) / 2, item.bbox.x0)):
        center = (block.bbox.y0 + block.bbox.y1) / 2
        target = next(
            (row for row in rows if abs(center - median((item.bbox.y0 + item.bbox.y1) / 2 for item in row)) <= tolerance),
            None,
        )
        if target is None:
            rows.append([block])
        else:
            target.append(block)
    rebuilt: list[TextBlock] = []
    for index, row in enumerate(rows):
        ordered = sorted(row, key=lambda item: item.bbox.x0)
        confidences = [item.confidence for item in ordered if item.confidence is not None]
        rebuilt.append(TextBlock(
            id=f"{ordered[0].id}-row-{index}",
            text="  ".join(item.text for item in ordered),
            confidence=sum(confidences) / len(confidences) if confidences else None,
            bbox=BoundingBox(
                x0=min(item.bbox.x0 for item in ordered), y0=min(item.bbox.y0 for item in ordered),
                x1=max(item.bbox.x1 for item in ordered), y1=max(item.bbox.y1 for item in ordered),
            ),
            region="main_content",
        ))
    return rebuilt


def classify_document_regions(pages: list[PageAnalysis]) -> None:
    """Label likely noise but retain every raw block in the response."""
    edge_texts: Counter[str] = Counter()
    for page in pages:
        for block in page.blocks:
            normalized = " ".join(block.text.lower().split())
            if normalized and (block.bbox.y1 <= page.height * 0.16 or block.bbox.y0 >= page.height * 0.86):
                edge_texts[normalized] += 1
    repeated = {text for text, count in edge_texts.items() if count >= 2}
    for page in pages:
        for block in page.blocks:
            normalized = " ".join(block.text.lower().split())
            if DISCLAIMER.search(block.text):
                block.region = "disclaimer"
            elif normalized in repeated or block.bbox.y1 <= page.height * 0.08:
                block.region = "likely_header"
            elif block.bbox.y0 >= page.height * 0.92 or re.fullmatch(r"(?:page\s*)?\d+(?:\s*(?:of|/)\s*\d+)?", normalized):
                block.region = "likely_footer"
            elif CONTACT.search(block.text) and block.bbox.y1 <= page.height * 0.2:
                block.region = "likely_header"
            else:
                block.region = "main_content"
