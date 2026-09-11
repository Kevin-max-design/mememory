"""Stateless internal document processing service; never logs request bodies."""

import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.clinical import (
    DEFAULT_OPENMED_MODEL,
    NoopClinicalNlpProvider,
    build_openmed_provider,
)
from app.errors import ProcessorError
from app.ocr import CompositeOCRProvider, PaddleOCRProvider, TesseractOCRProvider
from app.processor import DocumentProcessor
from app.schemas import AnalyzeRequest, AnalyzeResponse

logger = logging.getLogger("medmemory.processor")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    document_processor_secret: SecretStr = Field(min_length=32)
    enable_paddleocr: bool = False
    ocr_primary_provider: str = "paddleocr"
    ocr_fallback_provider: str = "tesseract"
    enable_openmed: bool = False
    openmed_local_only: bool = True
    openmed_model_dir: str = ""
    openmed_disease_model: str = DEFAULT_OPENMED_MODEL
    openmed_drug_model: str = ""
    openmed_pii_model: str = ""
    enable_ocr_debug: bool = False
    enable_docling: bool = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.settings = Settings()
    fallback = TesseractOCRProvider()
    provider = (
        CompositeOCRProvider(PaddleOCRProvider(), fallback)
        if app.state.settings.enable_paddleocr
        and app.state.settings.ocr_primary_provider == "paddleocr"
        else fallback
    )
    clinical = (
        build_openmed_provider(app.state.settings.openmed_disease_model)
        if app.state.settings.enable_openmed and app.state.settings.openmed_local_only
        else NoopClinicalNlpProvider()
    )
    app.state.processor = DocumentProcessor(provider, clinical)
    yield


app = FastAPI(title="MedMemory internal processor", lifespan=lifespan)


@app.exception_handler(ProcessorError)
def handle_processor_error(_request: Request, error: ProcessorError):
    return JSONResponse(
        status_code=error.status_code,
        content={"ok": False, "error": {"code": error.code, "message": error.message}},
    )


@app.exception_handler(RequestValidationError)
def handle_request_validation(_request: Request, _error: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "ok": False,
            "error": {"code": "INVALID_REQUEST", "message": "The request is invalid."},
        },
    )


def authenticate(x_service_secret: str = Header(default="")) -> None:
    expected = app.state.settings.document_processor_secret.get_secret_value()
    if not secrets.compare_digest(x_service_secret, expected):
        raise ProcessorError("AUTH_REQUIRED", "Internal authentication is required.", 401)


@app.get("/health", dependencies=[Depends(authenticate)])
def health():
    return {"ok": True, "data": {"service": "document-processor", "status": "healthy"}}


@app.post(
    "/v1/documents/analyze",
    response_model=AnalyzeResponse,
    dependencies=[Depends(authenticate)],
)
def analyze_document(payload: AnalyzeRequest, request: Request):
    analysis = request.app.state.processor.analyze(payload)
    if request.app.state.settings.enable_ocr_debug:
        for page in analysis.pages:
            logger.info(
                "ocr_diagnostic document_id=%s page=%s provider=%s fallback=%s variant=%s "
                "quality=%s blocks=%s low_reason=%s",
                analysis.document_id,
                page.page_number,
                page.provider.name,
                page.provider.fallback_reason or "none",
                page.provider.selected_variant or "default",
                page.provider.quality_score
                if page.provider.quality_score is not None
                else "native",
                len(page.blocks),
                page.provider.quality_reason or "none",
            )
    return AnalyzeResponse(data=analysis)
