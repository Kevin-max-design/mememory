"""Local-only VLM adapter boundary; Phase 1 deliberately ships no runtime."""

from __future__ import annotations

from collections.abc import Callable
from time import perf_counter

from .interfaces import AdapterResult, DocumentInput, ModelNotInstalled
from .parser import parse_structured_output


class UnavailableVLMAdapter:
    name = "compact-vlm-unavailable"

    def extract(self, document: DocumentInput) -> AdapterResult:
        del document
        raise ModelNotInstalled()


class LocalStructuredVLMAdapter:
    """Adapter for a caller-supplied local generator added in Phase 2.

    ``generate`` receives only local image paths and the extraction prompt.
    Network clients are deliberately outside this interface.
    """

    name = "compact-vlm-local"

    def __init__(
        self,
        *,
        model_id: str,
        model_revision: str,
        prompt: str,
        generate: Callable[[tuple[str, ...], str], str] | None = None,
    ) -> None:
        self.model_id = model_id
        self.model_revision = model_revision
        self.prompt = prompt
        self.generate = generate

    def extract(self, document: DocumentInput) -> AdapterResult:
        if self.generate is None:
            raise ModelNotInstalled()
        started = perf_counter()
        image_paths = tuple(str(page.image_path.resolve()) for page in document.pages)
        raw = self.generate(image_paths, self.prompt)
        extraction = parse_structured_output(raw)
        if extraction.document_id != document.document_id:
            raise ValueError("DOCUMENT_ID_MISMATCH")
        return AdapterResult(
            extraction=extraction,
            model_id=self.model_id,
            model_revision=self.model_revision,
            latency_seconds=perf_counter() - started,
        )
