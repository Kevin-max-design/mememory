"""Versioned request and response contracts for the stateless processor."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AnalysisOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    render_dpi: int = Field(default=240, ge=150, le=300)
    native_text_min_characters: int = Field(default=24, ge=8, le=500)
    max_pages: int = Field(default=50, ge=1, le=50)


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_id: UUID
    mime_type: str = Field(min_length=1, max_length=100)
    content_base64: str = Field(max_length=28_000_000)
    options: AnalysisOptions = Field(default_factory=AnalysisOptions)


class BoundingBox(BaseModel):
    x0: float = Field(ge=0)
    y0: float = Field(ge=0)
    x1: float = Field(ge=0)
    y1: float = Field(ge=0)


class TextBlock(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1)
    confidence: float | None = Field(default=None, ge=0, le=1)
    bbox: BoundingBox
    region: Literal["main_content", "likely_header", "likely_footer", "disclaimer"] = "main_content"


class ProviderMetadata(BaseModel):
    name: str
    version: str
    preprocessing: list[str] = Field(default_factory=list)
    selected_variant: str | None = None
    quality_score: float | None = Field(default=None, ge=0, le=1)
    quality_label: Literal["high", "medium", "low"] | None = None
    quality_reason: str | None = None
    fallback_reason: str | None = None


class PageAnalysis(BaseModel):
    page_number: int = Field(ge=1)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    rotation: int
    skew_angle: float = Field(ge=-12, le=12)
    source: Literal["native_pdf", "ocr"]
    full_text: str
    blocks: list[TextBlock]
    provider: ProviderMetadata


class BrainCandidate(BaseModel):
    record_type: Literal[
        "lab", "medication", "diagnosis", "allergy", "vital", "procedure", "doctor_note"
    ]
    source_page_number: int = Field(ge=1)
    source_block_ids: list[str] = Field(min_length=1)
    source_text: str = Field(min_length=1)
    confidence: Literal["high", "medium", "low"]
    data: dict[str, str | float | int | None]
    source_start: int | None = Field(default=None, ge=0)
    source_end: int | None = Field(default=None, ge=0)
    entity_text: str | None = None
    normalized_name: str | None = None
    assertion: dict[str, str] = Field(default_factory=dict)
    provider: str = "openmed"
    provider_version: str = "unavailable"
    model_name: str | None = None
    model_confidence: float | None = Field(default=None, ge=0, le=1)


class ClinicalBrainMetadata(BaseModel):
    name: str = "none"
    version: str = "unavailable"
    invoked: bool = False
    model_backed: bool = False
    model_name: str | None = None
    apis_used: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    candidates_before_validation: int = 0
    candidates_after_validation: int = 0
    rejected_reasons: dict[str, int] = Field(default_factory=dict)
    raw_proposals_by_category: dict[str, int] = Field(default_factory=dict)
    accepted_by_category: dict[str, int] = Field(default_factory=dict)
    ner_blocks_evaluated: int = 0
    section_headings_detected: dict[str, int] = Field(default_factory=dict)
    proposals_with_section_context: int = 0


class DocumentAnalysis(BaseModel):
    document_id: UUID
    mime_type: Literal["application/pdf", "image/jpeg", "image/png", "image/webp"]
    page_count: int = Field(ge=1)
    pages: list[PageAnalysis]
    clinical_provider: ProviderMetadata = Field(
        default_factory=lambda: ProviderMetadata(name="none", version="unavailable")
    )
    clinical_brain: ClinicalBrainMetadata = Field(default_factory=ClinicalBrainMetadata)
    clinical_candidates: list[BrainCandidate] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    ok: Literal[True] = True
    data: DocumentAnalysis


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    ok: Literal[False] = False
    error: ErrorDetail
