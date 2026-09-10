import numpy as np
from PIL import Image

from app.preprocessing import preprocess_image


def test_exif_orientation_is_corrected_without_geometry_loss():
    image = Image.new("RGB", (80, 40), "white")
    exif = image.getexif()
    exif[274] = 6
    image.info["exif"] = exif.tobytes()

    result = preprocess_image(image)

    assert result.original.size == (40, 80)
    assert result.normalized.shape == (80, 40)
    assert "exif_orientation" in result.operations


def test_preprocessing_preserves_canvas_dimensions():
    pixels = np.full((120, 300, 3), 255, dtype=np.uint8)
    result = preprocess_image(Image.fromarray(pixels))
    assert result.normalized.shape == (120, 300)
