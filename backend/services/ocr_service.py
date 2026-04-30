"""
ocr_service.py
Extracts text from images using EasyOCR.
The reader is initialised lazily on first use (EasyOCR downloads ~100 MB of
model weights on first call — this is normal and expected).
"""

import io
import numpy as np

_reader = None


def _get_reader():
    """Lazily initialise the EasyOCR reader (downloads models on first call)."""
    global _reader
    if _reader is None:
        import easyocr  # imported here so the app starts fast even if easyocr is slow
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _reader


def extract_text(image_bytes: bytes, min_confidence: float = 0.3) -> str:
    """
    Run OCR on raw image bytes and return extracted text as a single string.

    Args:
        image_bytes:    Raw bytes of the image file (JPEG / PNG / BMP / etc.)
        min_confidence: Discard detections below this confidence threshold.

    Returns:
        Extracted text joined by spaces, or "" on failure.
    """
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(img)

        reader = _get_reader()
        results = reader.readtext(img_array)

        texts = [text for (_bbox, text, conf) in results if conf >= min_confidence]
        return " ".join(texts).strip()

    except Exception as exc:
        # Non-fatal: return empty string so the submission still proceeds
        print(f"[ocr_service] OCR failed: {exc}")
        return ""
