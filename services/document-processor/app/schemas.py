"""Versioned request and response contracts for the stateless processor."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AnalysisOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    render_dpi: int = Field(default=240, ge=150, le=300)
    native_text_min_characters: int = Field(default=24, ge=8, le=500)
    max_pages: int = Field(default=100, ge=1, le=250)


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


class ProviderMetadata(BaseModel):
    name: str
    version: str
    preprocessing: list[str] = Field(default_factory=list)


class PageAnalysis(BaseModel):
    page_number: int = Field(ge=1)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    rotation: int
    source: Literal["native_pdf", "ocr"]
    full_text: str
    blocks: list[TextBlock]
    provider: ProviderMetadata


class DocumentAnalysis(BaseModel):
    document_id: UUID
    mime_type: Literal["application/pdf", "image/jpeg", "image/png", "image/webp"]
    page_count: int = Field(ge=1)
    pages: list[PageAnalysis]


class AnalyzeResponse(BaseModel):
    ok: Literal[True] = True
    data: DocumentAnalysis


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    ok: Literal[False] = False
    error: ErrorDetail
