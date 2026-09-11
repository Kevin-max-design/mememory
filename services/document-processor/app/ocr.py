"""Optional local OCR providers with scored fallback behavior."""

from dataclasses import dataclass
from importlib import metadata
from typing import Any, Protocol

import cv2
import numpy as np
import pytesseract
from pytesseract import Output, TesseractError, TesseractNotFoundError

from app.errors import ProcessorError, ocr_failed_error, ocr_unavailable_error
from app.quality import score_ocr
from app.schemas import BoundingBox, ProviderMetadata, TextBlock


@dataclass(slots=True)
class OCRResult:
    full_text: str
    blocks: list[TextBlock]
    provider: ProviderMetadata


class OCRProvider(Protocol):
    def extract(self, image: np.ndarray, page_number: int, preprocessing: list[str]) -> OCRResult: ...


def _with_quality(result: OCRResult) -> OCRResult:
    quality = score_ocr(result.blocks)
    result.provider.quality_score = quality.score
    result.provider.quality_label = quality.label  # type: ignore[assignment]
    return result


class TesseractOCRProvider:
    name = "tesseract"

    def _version(self) -> str:
        try:
            return str(pytesseract.get_tesseract_version()).splitlines()[0]
        except TesseractNotFoundError as error:
            raise ocr_unavailable_error() from error

    def _extract_mode(self, image: np.ndarray, page_number: int, preprocessing: list[str], psm: int) -> OCRResult:
        version = self._version()
        try:
            data = pytesseract.image_to_data(image, output_type=Output.DICT, config=f"--oem 3 --psm {psm}")
        except TesseractNotFoundError as error:
            raise ocr_unavailable_error() from error
        except (TesseractError, RuntimeError, OSError) as error:
            raise ocr_failed_error() from error
        grouped: dict[tuple[int, int, int], list[int]] = {}
        for index, raw_text in enumerate(data["text"]):
            text = raw_text.strip()
            confidence = float(data["conf"][index])
            if text and confidence >= 0:
                key = (int(data["block_num"][index]), int(data["par_num"][index]), int(data["line_num"][index]))
                grouped.setdefault(key, []).append(index)
        blocks: list[TextBlock] = []
        for block_index, indices in enumerate(grouped.values()):
            left = min(int(data["left"][i]) for i in indices)
            top = min(int(data["top"][i]) for i in indices)
            right = max(int(data["left"][i]) + int(data["width"][i]) for i in indices)
            bottom = max(int(data["top"][i]) + int(data["height"][i]) for i in indices)
            text = " ".join(data["text"][i].strip() for i in indices)
            confidence = sum(float(data["conf"][i]) for i in indices) / len(indices)
            blocks.append(TextBlock(id=f"p{page_number}-ocr-{block_index}", text=text,
                confidence=max(0.0, min(confidence / 100, 1.0)),
                bbox=BoundingBox(x0=left, y0=top, x1=right, y1=bottom)))
        return _with_quality(OCRResult("\n".join(b.text for b in blocks), blocks,
            ProviderMetadata(name=self.name, version=version, preprocessing=preprocessing, selected_variant=f"psm_{psm}")))

    def extract(self, image: np.ndarray, page_number: int, preprocessing: list[str]) -> OCRResult:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if image.ndim == 3 else image
        variants = {
            "grayscale": gray,
            "clahe": cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray),
            "adaptive_threshold": cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
            ),
            "denoise": cv2.fastNlMeansDenoising(gray, None, 7, 7, 21),
            "sharpen": cv2.filter2D(
                gray, -1, np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
            ),
        }
        results: list[OCRResult] = []
        for variant_name, variant in variants.items():
            for psm in (6, 4, 11):
                result = self._extract_mode(
                    variant, page_number, [*preprocessing, variant_name], psm
                )
                result.provider.selected_variant = f"{variant_name}_psm_{psm}"
                results.append(result)
        return max(results, key=lambda result: result.provider.quality_score or 0)


class PaddleOCRProvider:
    """Lazy PaddleOCR adapter. Import and model initialization happen only when enabled."""

    name = "paddleocr"

    def __init__(self, engine: Any | None = None):
        self._engine = engine

    def _load(self) -> Any:
        if self._engine is not None:
            return self._engine
        try:
            from paddleocr import PaddleOCR  # type: ignore[import-not-found]
            self._engine = PaddleOCR(
                lang="en",
                use_doc_orientation_classify=True,
                use_doc_unwarping=False,
                use_textline_orientation=True,
            )
            return self._engine
        except (ImportError, ModuleNotFoundError, RuntimeError, OSError) as error:
            raise ocr_unavailable_error() from error

    def extract(self, image: np.ndarray, page_number: int, preprocessing: list[str]) -> OCRResult:
        try:
            engine = self._load()
            raw = engine.predict(image) if hasattr(engine, "predict") else engine.ocr(image, cls=True)
        except ProcessorError:
            raise
        except Exception as error:
            raise ocr_failed_error() from error
        if raw and hasattr(raw[0], "get") and raw[0].get("rec_texts") is not None:
            result = raw[0]
            texts = result.get("rec_texts", [])
            scores = result.get("rec_scores", [])
            polygons = result.get("rec_polys", result.get("dt_polys", []))
            lines = [[box, [text, score]] for box, text, score in zip(polygons, texts, scores)]
        else:
            lines = raw[0] if raw and isinstance(raw[0], list) else raw
        parsed: list[tuple[float, float, TextBlock]] = []
        for index, item in enumerate(lines or []):
            if not isinstance(item, (list, tuple)) or len(item) < 2:
                continue
            box, value = item[0], item[1]
            if not isinstance(value, (list, tuple)) or len(value) < 2 or not str(value[0]).strip():
                continue
            xs, ys = [float(point[0]) for point in box], [float(point[1]) for point in box]
            block = TextBlock(id=f"p{page_number}-ocr-{index}", text=str(value[0]).strip(),
                confidence=max(0.0, min(float(value[1]), 1.0)),
                bbox=BoundingBox(x0=min(xs), y0=min(ys), x1=max(xs), y1=max(ys)))
            parsed.append((min(ys), min(xs), block))
        blocks = [item[2] for item in sorted(parsed, key=lambda item: (round(item[0] / 10), item[1]))]
        try:
            version = metadata.version("paddleocr")
        except metadata.PackageNotFoundError:
            version = "injected"
        return _with_quality(OCRResult("\n".join(b.text for b in blocks), blocks,
            ProviderMetadata(name=self.name, version=version, preprocessing=preprocessing, selected_variant="paddle_default")))


class CompositeOCRProvider:
    def __init__(self, primary: OCRProvider, fallback: OCRProvider):
        self.primary, self.fallback = primary, fallback

    def extract(self, image: np.ndarray, page_number: int, preprocessing: list[str]) -> OCRResult:
        try:
            result = self.primary.extract(image, page_number, preprocessing)
            if result.blocks:
                return result
            reason = "primary_returned_no_text"
        except ProcessorError as error:
            reason = error.code
        except (ImportError, ModuleNotFoundError, RuntimeError, OSError):
            reason = "primary_unavailable"
        result = self.fallback.extract(image, page_number, preprocessing)
        result.provider.fallback_reason = reason
        return result
