"""Page-aware native PDF extraction and OCR fallback orchestration."""

import base64
import binascii
from io import BytesIO

import fitz
from PIL import Image, UnidentifiedImageError

from app.clinical import ClinicalNlpProvider, NoopClinicalNlpProvider
from app.errors import (
    ProcessorError,
    empty_file_error,
    invalid_file_error,
    pdf_render_error,
    unsupported_type_error,
)
from app.ocr import OCRProvider, TesseractOCRProvider
from app.preprocessing import preprocess_image
from app.schemas import (
    AnalyzeRequest,
    BoundingBox,
    DocumentAnalysis,
    PageAnalysis,
    ProviderMetadata,
    TextBlock,
)

SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_DECODED_BYTES = 20 * 1024 * 1024
MAX_RENDERED_PIXELS = 40_000_000


def decode_payload(request: AnalyzeRequest) -> bytes:
    try:
        content = base64.b64decode(request.content_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise invalid_file_error() from error
    if not content:
        raise empty_file_error()
    if len(content) > MAX_DECODED_BYTES:
        raise ProcessorError("UPLOAD_FILE_TOO_LARGE", "The document exceeds 20 MB.", 413)
    return content


def _usable_native_text(text: str, minimum_characters: int) -> bool:
    compact = "".join(text.split())
    if len(compact) < minimum_characters:
        return False
    alphanumeric = sum(character.isalnum() for character in compact)
    return alphanumeric / len(compact) >= 0.6 and len(text.split()) >= 3


def _native_page(page: fitz.Page, page_number: int) -> PageAnalysis:
    blocks: list[TextBlock] = []
    for block_index, block in enumerate(page.get_text("blocks")):
        text = str(block[4]).strip()
        if not text:
            continue
        blocks.append(
            TextBlock(
                id=f"p{page_number}-native-{block_index}",
                text=text,
                confidence=None,
                bbox=BoundingBox(x0=block[0], y0=block[1], x1=block[2], y1=block[3]),
            )
        )
    rectangle = page.rect
    return PageAnalysis(
        page_number=page_number,
        width=max(1, round(rectangle.width)),
        height=max(1, round(rectangle.height)),
        rotation=page.rotation,
        skew_angle=0,
        source="native_pdf",
        full_text="\n".join(block.text for block in blocks),
        blocks=blocks,
        provider=ProviderMetadata(
            name="pymupdf",
            version=fitz.version[0],
            preprocessing=[],
        ),
    )


class DocumentProcessor:
    def __init__(
        self,
        ocr_provider: OCRProvider | None = None,
        clinical_provider: ClinicalNlpProvider | None = None,
    ):
        self.ocr_provider = ocr_provider or TesseractOCRProvider()
        self.clinical_provider = clinical_provider or NoopClinicalNlpProvider()

    def _ocr_image(self, image: Image.Image, page_number: int, rotation: int = 0) -> PageAnalysis:
        prepared = preprocess_image(image)
        result = self.ocr_provider.extract(
            prepared.normalized, page_number, prepared.operations
        )
        return PageAnalysis(
            page_number=page_number,
            width=prepared.original.width,
            height=prepared.original.height,
            rotation=rotation,
            skew_angle=prepared.skew_angle,
            source="ocr",
            full_text=result.full_text,
            blocks=result.blocks,
            provider=result.provider,
        )

    def _analyze_pdf(self, content: bytes, request: AnalyzeRequest) -> list[PageAnalysis]:
        try:
            document = fitz.open(stream=content, filetype="pdf")
        except (fitz.FileDataError, RuntimeError, ValueError) as error:
            raise invalid_file_error() from error

        try:
            if document.page_count == 0:
                raise invalid_file_error()
            if document.page_count > request.options.max_pages:
                raise ProcessorError(
                    "PROCESSING_PAGE_LIMIT_EXCEEDED",
                    "The document has too many pages.",
                    413,
                )

            pages: list[PageAnalysis] = []
            for page_index in range(document.page_count):
                page = document.load_page(page_index)
                native_text = page.get_text("text")
                page_number = page_index + 1
                if _usable_native_text(
                    native_text, request.options.native_text_min_characters
                ):
                    pages.append(_native_page(page, page_number))
                    continue

                try:
                    scale = request.options.render_dpi / 72
                    rendered_width = round(page.rect.width * scale)
                    rendered_height = round(page.rect.height * scale)
                    if rendered_width * rendered_height > MAX_RENDERED_PIXELS:
                        raise ProcessorError(
                            "PROCESSING_IMAGE_TOO_LARGE",
                            "A rendered page exceeds the safe image limit.",
                            413,
                        )
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
                except ProcessorError:
                    raise
                except (RuntimeError, ValueError, OSError) as error:
                    raise pdf_render_error() from error
                pages.append(self._ocr_image(image, page_number, page.rotation))
            return pages
        finally:
            document.close()

    def _analyze_image(self, content: bytes, mime_type: str) -> list[PageAnalysis]:
        try:
            image = Image.open(BytesIO(content))
            expected_format = {
                "image/jpeg": "JPEG",
                "image/png": "PNG",
                "image/webp": "WEBP",
            }[mime_type]
            if image.format != expected_format:
                raise invalid_file_error()
            if image.width * image.height > MAX_RENDERED_PIXELS:
                raise ProcessorError(
                    "PROCESSING_IMAGE_TOO_LARGE",
                    "The image exceeds the safe pixel limit.",
                    413,
                )
            image.load()
        except ProcessorError:
            raise
        except (UnidentifiedImageError, OSError, ValueError) as error:
            raise invalid_file_error() from error
        return [self._ocr_image(image, 1)]

    def analyze(self, request: AnalyzeRequest) -> DocumentAnalysis:
        if request.mime_type not in SUPPORTED_MIME_TYPES:
            raise unsupported_type_error()
        content = decode_payload(request)
        try:
            pages = (
                self._analyze_pdf(content, request)
                if request.mime_type == "application/pdf"
                else self._analyze_image(content, request.mime_type)
            )
        except ProcessorError:
            raise
        except Exception as error:
            raise invalid_file_error() from error

        enhancement = self.clinical_provider.enhance(
            "\n".join(page.full_text for page in pages)
        )
        return DocumentAnalysis(
            document_id=request.document_id,
            mime_type=request.mime_type,
            page_count=len(pages),
            pages=pages,
            clinical_provider=ProviderMetadata(
                name=enhancement.provider,
                version=enhancement.version,
                preprocessing=[enhancement.status],
            ),
        )
