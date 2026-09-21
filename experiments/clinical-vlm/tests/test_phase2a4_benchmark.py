from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageStat

from clinical_vlm.vlm_canonical_adapter import adapt_vlm_extraction
from clinical_vlm.vlm_schema import VLMExtraction


def _load_generator():
    import importlib.util

    path = Path(__file__).parents[1] / "benchmark/phase2a4_generator.py"
    spec = importlib.util.spec_from_file_location("phase2a4_generator", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_phase2a4_generator_is_deterministic_and_gold_is_valid(tmp_path: Path) -> None:
    generator = _load_generator()
    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    first = generator.generate(first_dir)
    second = generator.generate(second_dir)

    assert first == second
    assert len(first["documents"]) == 30
    assert sum(item["page_count"] for item in first["documents"]) == 30
    assert Counter(item["difficulty"] for item in first["documents"]) == {
        "easy": 10,
        "medium": 10,
        "hard": 10,
    }
    assert set(Counter(item["family"] for item in first["documents"])) == {
        "laboratory",
        "medication",
        "imaging",
        "discharge",
        "mixed",
    }

    for item in first["documents"]:
        document_id = item["document_id"]
        first_image = first_dir / "pages" / f"{document_id}.png"
        second_image = second_dir / "pages" / f"{document_id}.png"
        first_gold = first_dir / "gold" / f"{document_id}.json"
        second_gold = second_dir / "gold" / f"{document_id}.json"
        assert _sha256(first_image) == _sha256(second_image) == item["image_sha256"]
        assert _sha256(first_gold) == _sha256(second_gold) == item["gold_sha256"]

        with Image.open(first_image) as image:
            image.verify()
        with Image.open(first_image) as image:
            assert image.size == generator.PAGE_SIZE
            assert ImageStat.Stat(image.convert("L")).var[0] > 100

        gold = json.loads(first_gold.read_text())
        parsed = VLMExtraction.model_validate(gold["expected_envelope"])
        canonical = adapt_vlm_extraction(parsed, document_id=document_id)
        expected_fact_count = (
            int(parsed.patient.name is not None)
            + int(parsed.patient.date is not None)
            + len(parsed.labs)
            + len(parsed.diagnoses)
            + len(parsed.medications)
            + len(parsed.allergies)
        )
        assert len(canonical.facts) == expected_fact_count
        assert all(token not in gold["reference_text"] for token in ("test_name:", "source_text:", "assertion:"))


def test_phase2a4_manifest_contains_safe_metadata_only(tmp_path: Path) -> None:
    generator = _load_generator()
    output = tmp_path / "benchmark"
    manifest = generator.generate(output)
    assert set(manifest) == {"benchmark_version", "seed", "documents"}
    expected_keys = {
        "document_id",
        "family",
        "difficulty",
        "page_count",
        "expected_candidate_counts",
        "image_sha256",
        "gold_sha256",
    }
    assert all(set(item) == expected_keys for item in manifest["documents"])
    serialized = json.dumps(manifest)
    assert "source_text" not in serialized
    assert "patient" in serialized  # count-key only; no patient values are present
