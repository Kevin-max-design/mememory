"""Deterministic OCR quality scoring that never logs document text."""

import re
from collections import Counter
from dataclasses import dataclass

from app.schemas import TextBlock

MEDICAL_WORDS = {
    "albumin", "allergy", "blood", "cholesterol", "creatinine", "diagnosis",
    "glucose", "haemoglobin", "hemoglobin", "medication", "platelet", "pulse",
    "serum", "sodium", "specimen", "thyroid", "urine", "wbc",
}
UNIT_PATTERN = re.compile(
    r"(?:mg|g|mmol|meq|iu|u|fl|pg)\s*/\s*(?:dl|l|ml)|%|x\s*10\^?\d\s*/\s*[uµμ]l",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class QualityScore:
    score: float
    label: str
    mean_confidence: float | None
    meaningful_words: int
    medical_keywords: int
    numeric_unit_patterns: int
    garbage_ratio: float


def score_ocr(blocks: list[TextBlock]) -> QualityScore:
    tokens = re.findall(r"\S+", " ".join(block.text for block in blocks))
    words = [token.strip(".,:;()[]{}") for token in tokens]
    meaningful = [word for word in words if len(word) >= 2 and any(c.isalnum() for c in word)]
    confidences = [block.confidence for block in blocks if block.confidence is not None]
    mean_confidence = sum(confidences) / len(confidences) if confidences else None
    medical = sum(word.lower() in MEDICAL_WORDS for word in meaningful)
    unit_count = len(UNIT_PATTERN.findall(" ".join(words)))
    punctuation = sum(not any(c.isalnum() for c in token) for token in tokens)
    nonsense = sum(
        len(word) > 4 and (sum(c.isalpha() for c in word) / len(word) < 0.35)
        for word in meaningful
    )
    repeats = sum(count - 3 for count in Counter(word.lower() for word in meaningful).values() if count > 3)
    garbage_ratio = (punctuation + nonsense + repeats) / max(len(tokens), 1)
    confidence_part = (mean_confidence if mean_confidence is not None else 0.55) * 0.55
    word_part = min(len(meaningful) / 20, 1) * 0.2
    signal_part = min((medical + unit_count) / 4, 1) * 0.2
    score = max(0.0, min(1.0, confidence_part + word_part + signal_part - garbage_ratio * 0.35))
    label = "high" if score >= 0.72 else "medium" if score >= 0.45 else "low"
    return QualityScore(round(score, 4), label, mean_confidence, len(meaningful), medical, unit_count, round(garbage_ratio, 4))
