from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))


@pytest.fixture
def fixture_dir() -> Path:
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def gold_payload(fixture_dir: Path) -> dict:
    return json.loads((fixture_dir / "synthetic_gold.json").read_text(encoding="utf-8"))


@pytest.fixture
def prediction_payload(fixture_dir: Path) -> dict:
    return json.loads((fixture_dir / "synthetic_prediction.json").read_text(encoding="utf-8"))
