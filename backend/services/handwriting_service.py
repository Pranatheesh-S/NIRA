"""
handwriting_service.py
Rates handwriting quality from an image:
  1. EasyOCR extracts text + per-region confidence scores
  2. Metrics derived: avg confidence, std deviation, low-confidence region count
  3. OpenRouter LLM generates a rating and actionable suggestions
"""

import io
import numpy as np
from services.openrouter_service import safe_llm_call, parse_json_safe

_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _reader


def _score_to_grade(score: int) -> str:
    if score >= 9:
        return "Excellent"
    if score >= 7:
        return "Good"
    if score >= 5:
        return "Average"
    if score >= 3:
        return "Needs Practice"
    return "Poor"


_ANALYSIS_PROMPT = """\
You are an experienced handwriting coach evaluating a student's handwriting sample.

The student's handwriting was analysed by OCR software with these metrics:

Extracted text  : {extracted_text}
Avg OCR confidence (0–1): {avg_confidence:.2f}   (higher = more legible)
Legibility score (1–10) : {legibility_score}
Low-confidence regions  : {low_conf_count} of {total_count} detected regions
Confidence std deviation: {conf_std:.3f}   (lower = more consistent letterforms)

Provide clear, encouraging, and actionable handwriting feedback for a student.

Return ONLY this JSON — no markdown fences, no extra text:
{{
  "rating": <integer 1–10>,
  "grade": "<Excellent|Good|Average|Needs Practice|Poor>",
  "summary": "<2-sentence overall impression of the handwriting>",
  "strengths": ["<observed strength 1>", "<observed strength 2>"],
  "suggestions": [
    "<specific actionable improvement tip 1>",
    "<specific actionable improvement tip 2>",
    "<specific actionable improvement tip 3>",
    "<specific actionable improvement tip 4>"
  ],
  "focus_area": "<the single most impactful thing to practise first>"
}}
"""


def analyse_handwriting(image_bytes: bytes) -> dict:
    """
    Analyse handwriting in image_bytes.

    Returns a dict with:
      rating, grade, summary, strengths, suggestions, focus_area,
      extracted_text, legibility_score, avg_confidence
    """
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(img)

    reader = _get_reader()
    results = reader.readtext(img_array)   # [(bbox, text, confidence), ...]

    if not results:
        return {
            "rating":           1,
            "grade":            "Poor",
            "summary":          (
                "No handwritten text could be detected in this image. "
                "Please upload a clearer photo of your handwriting."
            ),
            "strengths":        [],
            "suggestions": [
                "Ensure the image is well-lit with no shadows over the text.",
                "Write with a dark pen or pencil on plain white paper.",
                "Hold the camera directly above the page to avoid distortion.",
                "Make sure the entire writing area is within the frame.",
            ],
            "focus_area":       "Image quality — retake the photo in better lighting.",
            "extracted_text":   "",
            "legibility_score": 1,
            "avg_confidence":   0.0,
        }

    confidences  = [conf for (_, _, conf) in results]
    texts        = [text for (_, text, conf) in results if conf >= 0.25]
    extracted    = " ".join(texts).strip()

    avg_conf     = float(np.mean(confidences))
    conf_std     = float(np.std(confidences))
    low_conf_cnt = sum(1 for c in confidences if c < 0.5)
    total_cnt    = len(confidences)

    legibility = max(1, min(10, round(avg_conf * 10)))

    prompt = _ANALYSIS_PROMPT.format(
        extracted_text=extracted[:800] or "(no text extracted)",
        avg_confidence=avg_conf,
        legibility_score=legibility,
        low_conf_count=low_conf_cnt,
        total_count=total_cnt,
        conf_std=conf_std,
    )

    try:
        raw    = safe_llm_call(prompt)
        parsed = parse_json_safe(raw)
    except Exception as exc:
        print(f"[handwriting_service] LLM error: {exc}")
        parsed = {}

    return {
        "rating":           int(parsed.get("rating")   or legibility),
        "grade":            str(parsed.get("grade")    or _score_to_grade(legibility)),
        "summary":          str(parsed.get("summary")  or "Handwriting analysis complete."),
        "strengths":        list(parsed.get("strengths")   or []),
        "suggestions":      list(parsed.get("suggestions") or []),
        "focus_area":       str(parsed.get("focus_area")   or ""),
        "extracted_text":   extracted,
        "legibility_score": legibility,
        "avg_confidence":   round(avg_conf, 3),
    }
