"""Deterministic fact merge that preserves distinct clinical context."""

from __future__ import annotations

import json
import re

from .models import ClinicalFact


def _text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def fact_key(fact: ClinicalFact) -> tuple[object, ...]:
    return (
        fact.type.value,
        _text(fact.value),
        fact.page,
        _text(fact.source_text),
        fact.context.subject.value,
        fact.context.negation.value,
        fact.context.certainty.value,
        fact.context.temporality.value,
        json.dumps(fact.data, sort_keys=True, separators=(",", ":"), default=str).casefold(),
    )


def deduplicate_facts(facts: list[ClinicalFact]) -> list[ClinicalFact]:
    unique: dict[tuple[object, ...], ClinicalFact] = {}
    for fact in facts:
        key = fact_key(fact)
        existing = unique.get(key)
        if existing is None or fact.confidence > existing.confidence:
            unique[key] = fact
    return list(unique.values())
