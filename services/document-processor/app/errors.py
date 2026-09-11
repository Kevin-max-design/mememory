"""Stable processor errors that never expose document contents or provider details."""

from dataclasses import dataclass


@dataclass(slots=True)
class ProcessorError(Exception):
    code: str
    message: str
    status_code: int


def empty_file_error() -> ProcessorError:
    return ProcessorError("UPLOAD_EMPTY_FILE", "The document is empty.", 400)


def invalid_file_error() -> ProcessorError:
    return ProcessorError("UPLOAD_INVALID_FILE", "The document could not be decoded.", 400)


def unsupported_type_error() -> ProcessorError:
    return ProcessorError(
        "UPLOAD_UNSUPPORTED_TYPE", "The document type is not supported.", 415
    )


def ocr_unavailable_error() -> ProcessorError:
    return ProcessorError(
        "LOCAL_OCR_UNAVAILABLE", "The local OCR provider is unavailable.", 503
    )


def ocr_failed_error() -> ProcessorError:
    return ProcessorError("OCR_PROCESSING_FAILED", "OCR processing failed.", 422)


def invalid_ocr_image_error(shape: tuple[int, ...], dtype: str) -> ProcessorError:
    return ProcessorError(
        "OCR_INVALID_IMAGE",
        f"OCR image has unsupported shape={shape} dtype={dtype}.",
        422,
    )


def pdf_render_error() -> ProcessorError:
    return ProcessorError("PDF_RENDER_FAILED", "A PDF page could not be rendered.", 422)
