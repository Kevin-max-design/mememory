"""Adapter boundaries shared by the baseline and local VLM runners."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from .models import CanonicalExtraction


@dataclass(frozen=True, slots=True)
class RenderedPage:
    page_number: int
    image_path: Path
    width: int
    height: int
    dpi: int
    # Optional local text is used only by the provenance evaluator. It must
    # never be written to benchmark logs.
    local_reference_text: str | None = field(default=None, repr=False)


@dataclass(frozen=True, slots=True)
class DocumentInput:
    document_id: str
    pages: tuple[RenderedPage, ...]


@dataclass(frozen=True, slots=True)
class AdapterResult:
    extraction: CanonicalExtraction
    model_id: str
    model_revision: str
    latency_seconds: float
    peak_ram_bytes: int | None = None
    peak_vram_bytes: int | None = None
    output_tokens: int | None = None


class ExtractionAdapter(Protocol):
    name: str

    def extract(self, document: DocumentInput) -> AdapterResult: ...


class ModelNotInstalled(RuntimeError):
    """Safe failure raised before Phase 2 model installation."""

    code = "VLM_MODEL_NOT_INSTALLED"

    def __init__(self) -> None:
        super().__init__(self.code)
