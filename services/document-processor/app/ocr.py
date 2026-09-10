"""OCR provider abstraction and local Tesseract implementation."""

from dataclasses import dataclass
from typing import Protocol

import numpy as np
import pytesseract
from pytesseract import Output, TesseractError, TesseractNotFoundError

from app.errors import ocr_failed_error, ocr_unavailable_error
from app.schemas import BoundingBox, ProviderMetadata, TextBlock


@dataclass(slots=True)
class OCRResult:
    full_text: str
    blocks: list[TextBlock]
    provider: ProviderMetadata


class OCRProvider(Protocol):
    def extract(
        self, image: np.ndarray, page_number: int, preprocessing: list[str]
    ) -> OCRResult: ...


class TesseractOCRProvider:
    name = "tesseract"

    def _version(self) -> str:
        try:
            return str(pytesseract.get_tesseract_version()).splitlines()[0]
        except TesseractNotFoundError as error:
            raise ocr_unavailable_error() from error

    def extract(
        self, image: np.ndarray, page_number: int, preprocessing: list[str]
    ) -> OCRResult:
        version = self._version()
        try:
            data = pytesseract.image_to_data(
                image,
                output_type=Output.DICT,
                config="--oem 3 --psm 6",
            )
        except TesseractNotFoundError as error:
            raise ocr_unavailable_error() from error
        except (TesseractError, RuntimeError, OSError) as error:
            raise ocr_failed_error() from error

        grouped: dict[tuple[int, int, int], list[int]] = {}
        for index, raw_text in enumerate(data["text"]):
            text = raw_text.strip()
            confidence = float(data["conf"][index])
            if text and confidence >= 0:
                key = (
                    int(data["block_num"][index]),
                    int(data["par_num"][index]),
                    int(data["line_num"][index]),
                )
                grouped.setdefault(key, []).append(index)

        blocks: list[TextBlock] = []
        for block_index, indices in enumerate(grouped.values()):
            left = min(int(data["left"][index]) for index in indices)
            top = min(int(data["top"][index]) for index in indices)
            right = max(
                int(data["left"][index]) + int(data["width"][index])
                for index in indices
            )
            bottom = max(
                int(data["top"][index]) + int(data["height"][index])
                for index in indices
            )
            text = " ".join(data["text"][index].strip() for index in indices)
            confidence = sum(float(data["conf"][index]) for index in indices) / len(indices)
            blocks.append(
                TextBlock(
                    id=f"p{page_number}-ocr-{block_index}",
                    text=text,
                    confidence=max(0.0, min(confidence / 100, 1.0)),
                    bbox=BoundingBox(x0=left, y0=top, x1=right, y1=bottom),
                )
            )

        return OCRResult(
            full_text="\n".join(block.text for block in blocks),
            blocks=blocks,
            provider=ProviderMetadata(
                name=self.name,
                version=version,
                preprocessing=preprocessing,
            ),
        )
