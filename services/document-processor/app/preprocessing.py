"""Conservative, geometry-preserving normalization for local OCR."""

from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps


@dataclass(slots=True)
class PreprocessedImage:
    original: Image.Image
    normalized: np.ndarray
    operations: list[str]
    skew_angle: float


@dataclass(slots=True)
class ImageVariant:
    name: str
    image: np.ndarray
    operations: list[str]


def _deskew(gray: np.ndarray) -> tuple[np.ndarray, float]:
    inverted = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coordinates = np.column_stack(np.where(inverted > 0))
    if len(coordinates) < 25:
        return gray, 0.0

    angle = cv2.minAreaRect(coordinates.astype(np.float32))[-1]
    angle = -(90 + angle) if angle < -45 else -angle
    if abs(angle) < 0.35 or abs(angle) > 12:
        return gray, 0.0

    height, width = gray.shape
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    corrected = cv2.warpAffine(
        gray,
        matrix,
        (width, height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return corrected, float(angle)


def preprocess_image(image: Image.Image) -> PreprocessedImage:
    orientation = image.getexif().get(274, 1)
    original = ImageOps.exif_transpose(image).convert("RGB")
    operations = ["exif_orientation"] if orientation not in (None, 1) else []

    rgb = np.asarray(original)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    operations.append("grayscale")

    if float(gray.std()) < 48:
        gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
        operations.append("clahe")

    corrected, angle = _deskew(gray)
    if angle:
        operations.append("deskew")

    return PreprocessedImage(
        original=original,
        normalized=corrected,
        operations=operations,
        skew_angle=angle,
    )


def preprocessing_variants(image: Image.Image) -> tuple[Image.Image, list[ImageVariant], float]:
    """Return conservative, geometry-preserving alternatives for provider scoring."""
    original = ImageOps.exif_transpose(image).convert("RGB")
    rgb = np.asarray(original)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    threshold = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    denoised = cv2.fastNlMeansDenoising(gray, None, 7, 7, 21)
    deskewed, angle = _deskew(gray)
    deskew_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(deskewed)
    deskew_threshold = cv2.adaptiveThreshold(
        deskewed, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    variants = [
        ImageVariant("original", rgb, []),
        ImageVariant("grayscale", gray, ["grayscale"]),
        ImageVariant("clahe", clahe, ["grayscale", "clahe"]),
        ImageVariant("adaptive_threshold", threshold, ["grayscale", "adaptive_threshold"]),
        ImageVariant("denoise", denoised, ["grayscale", "denoise"]),
        ImageVariant("deskew", deskewed, ["grayscale", "deskew"] if angle else ["grayscale"]),
        ImageVariant("deskew_clahe", deskew_clahe, ["grayscale", "deskew", "clahe"] if angle else ["grayscale", "clahe"]),
        ImageVariant("deskew_threshold", deskew_threshold, ["grayscale", "deskew", "adaptive_threshold"] if angle else ["grayscale", "adaptive_threshold"]),
    ]
    return original, variants, angle
