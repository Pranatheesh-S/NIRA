"""
evaluation_service.py
AI-powered evaluation of student explanations.
Uses the OpenRouter LLM to grade transcripts against lesson knowledge graphs.
"""

from services.openrouter_service import safe_llm_call, parse_json_safe

# ── Prompt templates ─────────────────────────────────────────────────────────

_EVAL_PROMPT = """\
You are an educational AI evaluating a student's verbal explanation.

Lesson title: {lesson_title}
Key concepts the student should cover: {expected_concepts}
Student explanation: \"\"\"{transcript}\"\"\"

Assess how well the student demonstrated understanding.

Return ONLY this JSON — no markdown, no explanation, no extra text:
{{
  "correct":         ["concepts the student explained accurately"],
  "incorrect":       ["concepts the student explained wrongly or with misconceptions"],
  "missing":         ["important concepts the student completely omitted"],
  "confidenceScore": <float 0.0–1.0 representing overall understanding quality>,
  "feedback":        "<1–2 sentences of constructive, encouraging feedback>"
}}"""

_MULTIMODAL_EVAL_PROMPT = """\
You are evaluating a student's verbal explanation of an image or diagram.

Text extracted from the image via OCR:
\"\"\"{ocr_text}\"\"\"

Student's verbal explanation:
\"\"\"{transcript}\"\"\"

Check whether the student's explanation correctly describes what is shown in the image.
Identify matching elements, errors, and omissions.

Return ONLY this JSON — no markdown, no explanation:
{{
  "correct":         ["image elements the student described accurately"],
  "incorrect":       ["elements described incorrectly"],
  "missing":         ["image elements not mentioned at all"],
  "confidenceScore": <float 0.0–1.0>,
  "feedback":        "<1–2 sentences of constructive feedback>",
  "imageMismatch":   <true if the explanation seems to describe a completely different image>
}}"""

_EMPTY_RESULT = {
    "correct": [],
    "incorrect": [],
    "missing": [],
    "confidenceScore": 0.0,
    "feedback": "No explanation was provided.",
}


# ── Public functions ──────────────────────────────────────────────────────────

def analyze_explanation(
    transcript: str,
    lesson_title: str = "",
    expected_concepts: list | None = None,
) -> dict:
    """
    Evaluate a text/audio explanation against the lesson.

    Returns a dict with keys: correct, incorrect, missing,
    confidenceScore (0-1), feedback.
    """
    if not transcript or not transcript.strip():
        return _EMPTY_RESULT.copy()

    concepts_str = (
        ", ".join(expected_concepts) if expected_concepts
        else "the general concepts of the lesson"
    )

    try:
        raw = safe_llm_call(_EVAL_PROMPT.format(
            lesson_title=lesson_title or "the lesson",
            expected_concepts=concepts_str,
            transcript=transcript[:2000],
        ))
        result = parse_json_safe(raw)
        return _normalise(result)
    except Exception:
        return _EMPTY_RESULT.copy()


def analyze_multimodal(ocr_text: str, transcript: str) -> dict:
    """
    Evaluate a student's verbal explanation of an image.

    Returns the same dict as analyze_explanation, plus imageMismatch (bool).
    """
    try:
        raw = safe_llm_call(_MULTIMODAL_EVAL_PROMPT.format(
            ocr_text=(ocr_text or "(no text found in image)")[:1000],
            transcript=(transcript or "(no explanation provided)")[:2000],
        ))
        result = parse_json_safe(raw)
        base = _normalise(result)
        base["imageMismatch"] = bool(result.get("imageMismatch", False))
        return base
    except Exception:
        result = _EMPTY_RESULT.copy()
        result["imageMismatch"] = False
        return result


def _normalise(raw: dict) -> dict:
    """Ensure all expected keys exist and values are the right types."""
    return {
        "correct":         list(raw.get("correct",  []) or []),
        "incorrect":       list(raw.get("incorrect", []) or []),
        "missing":         list(raw.get("missing",  []) or []),
        "confidenceScore": max(0.0, min(1.0, float(raw.get("confidenceScore", 0.5) or 0.5))),
        "feedback":        str(raw.get("feedback", "") or ""),
    }
