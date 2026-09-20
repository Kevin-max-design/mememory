"""Strict VLM JSON parsing with no semantic repair."""

from __future__ import annotations

import json

from pydantic import ValidationError

from .models import CanonicalExtraction


class StructuredOutputError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def parse_structured_output(raw: str) -> CanonicalExtraction:
    """Parse exact JSON and validate it; reject markdown and prose wrappers."""

    candidate = raw.strip()
    if not candidate or candidate.startswith("```"):
        raise StructuredOutputError("MALFORMED_JSON")
    try:
        decoded = json.loads(candidate)
    except json.JSONDecodeError as error:
        raise StructuredOutputError("MALFORMED_JSON") from error
    try:
        return CanonicalExtraction.model_validate(decoded)
    except ValidationError as error:
        raise StructuredOutputError("SCHEMA_INVALID") from error
