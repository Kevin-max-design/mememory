"""Regenerate tracked JSON Schema contracts without touching production code."""

from __future__ import annotations

import json
from pathlib import Path

from .models import CanonicalExtraction, GoldAnnotation


def export(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    contracts = {
        "canonical-extraction.schema.json": CanonicalExtraction.model_json_schema(),
        "gold-annotation.schema.json": GoldAnnotation.model_json_schema(),
    }
    for filename, schema in contracts.items():
        (directory / filename).write_text(
            json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )


if __name__ == "__main__":
    export(Path(__file__).resolve().parents[2] / "schemas")
