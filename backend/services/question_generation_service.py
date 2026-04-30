"""
question_generation_service.py
Extracts text from study material and generates exam-quality questions via LLM.

Supported input formats:
  PDF   — PyMuPDF (primary), pdfplumber (fallback)
  DOCX  — python-docx
  Image — EasyOCR (reuses existing ocr_service)
  Text  — plain passthrough

Question output categories:
  two_mark     — short recall / definition
  five_mark    — explanation / process
  sixteen_mark — deep analysis / multi-concept
"""

import io
import re
import logging

from services.ocr_service        import extract_text as ocr_extract
from services.openrouter_service import safe_llm_call, parse_json_safe

logger = logging.getLogger(__name__)

_IMAGE_EXTS  = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tiff"}
_MAX_CHARS   = 12_000   # ~3 k tokens — keeps LLM calls fast and predictable

_QUESTION_PROMPT = """\
You are an expert academic question paper setter.

Your task is to generate exam questions from the given study material.

Instructions:
- Carefully understand the content.
- Identify all key concepts and topics.
- Generate questions in three categories:

2-Mark Questions:
  - Very short, definition-based or factual
  - No explanation required
  - Generate at least 6 questions

5-Mark Questions:
  - Require short explanations
  - Ask "how", "why", or "describe"
  - Cover processes or relationships
  - Generate at least 4 questions

16-Mark Questions:
  - Require deep understanding
  - Multi-step or analytical answers
  - Cover complete topics or multiple concepts
  - Generate at least 2 questions

Rules:
- Do NOT repeat questions
- Ensure full syllabus coverage
- Use clear, exam-style language
- Avoid vague questions
- Keep questions precise and meaningful

Output Format — STRICT JSON only, no markdown, no explanation:
{{
  "two_mark": [],
  "five_mark": [],
  "sixteen_mark": []
}}

Study Material:
{text}"""


# ── Public API ────────────────────────────────────────────────────────────────

def extract_text(file_bytes: bytes, filename: str, content_type: str = "") -> str:
    """
    Dispatch to the correct extractor based on file extension / content-type.
    Returns plain text or "" on failure.
    """
    fname = (filename or "").lower()
    ctype = (content_type or "").lower()

    if fname.endswith(".pdf") or "pdf" in ctype:
        return _extract_pdf(file_bytes)

    if fname.endswith(".docx") or "wordprocessingml" in ctype:
        return _extract_docx(file_bytes)

    if fname.endswith(".txt") or fname.endswith(".md") or "text/plain" in ctype:
        return file_bytes.decode("utf-8", errors="ignore")

    ext = "." + fname.rsplit(".", 1)[-1] if "." in fname else ""
    if ext in _IMAGE_EXTS or "image/" in ctype:
        return ocr_extract(file_bytes)

    # Unknown type — attempt UTF-8 text, fall back to OCR
    try:
        decoded = file_bytes.decode("utf-8")
        if len(decoded.split()) > 10:
            return decoded
    except UnicodeDecodeError:
        pass
    return ocr_extract(file_bytes)


def clean_text(raw: str) -> str:
    """
    Strip page numbers, repeated short lines (headers/footers), and noise.
    Merge broken sentences into coherent paragraphs.
    """
    lines = raw.splitlines()
    cleaned: list[str] = []
    seen: set[str] = set()

    for line in lines:
        line = line.strip()

        if not line:
            cleaned.append("")
            continue

        # Drop pure page numbers: "1", "12", "Page 3 of 10"
        if re.fullmatch(r"(page\s*\d+(\s*of\s*\d+)?|\d{1,4})", line, re.IGNORECASE):
            continue

        # Drop short lines that repeat (typical header/footer)
        if len(line) < 60 and line in seen:
            continue

        seen.add(line)
        cleaned.append(line)

    text = "\n".join(cleaned)

    # Collapse 3+ blank lines → single blank line
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Merge broken mid-sentence line wraps (no terminal punctuation, next char is lowercase)
    text = re.sub(r"(?<![.!?:])\n(?=[a-z\(])", " ", text)

    return text.strip()


def generate_questions(text: str) -> dict:
    """
    Send cleaned study material to the LLM and return structured questions.

    Returns:
        {
            "two_mark":     [str, ...],
            "five_mark":    [str, ...],
            "sixteen_mark": [str, ...]
        }
    """
    truncated = text[:_MAX_CHARS]
    prompt    = _QUESTION_PROMPT.format(text=truncated)

    raw    = safe_llm_call(prompt)
    result = parse_json_safe(raw)

    return {
        "two_mark":     _to_str_list(result.get("two_mark")),
        "five_mark":    _to_str_list(result.get("five_mark")),
        "sixteen_mark": _to_str_list(result.get("sixteen_mark")),
    }


# ── Flexible question generation (custom mark scheme) ────────────────────────

_FLEXIBLE_PROMPT = """\
You are an expert academic question paper setter.

Generate exam questions from the study material below according to this exact mark scheme:

{sections_spec}

Important rules:
- Generate EXACTLY the number of questions specified for each section.
- Each question MUST be a plain string — just the question text itself.
  DO NOT wrap questions in objects like {{"question": "..."}} or {{"text": "..."}}.
- Match question complexity to mark value:
    * 1-2 marks  → single-fact recall or short definition
    * 3-5 marks  → explanation, comparison, or process description
    * 6-10 marks → detailed analysis covering multiple concepts
    * 11+ marks  → comprehensive essay covering multiple aspects
- Do NOT repeat questions across sections.
- Cover all major topics from the material.
- Use formal, exam-style academic language.

Return ONLY this JSON — no markdown, no explanation, no extra text.
Every element inside a "questions" array must be a plain string:

{{
  "sections": [
{json_template}
  ]
}}

Study Material:
{text}
"""


def generate_questions_flexible(text: str, mark_scheme: list) -> dict:
    """
    Generate questions according to a custom mark scheme.

    Args:
        text: cleaned study material
        mark_scheme: [{"marks": int, "count": int, "label": str}, ...]

    Returns:
        {"sections": [{"marks": int, "label": str, "questions": [str, ...]}, ...]}
    """
    spec_lines  = []
    json_lines  = []

    for i, section in enumerate(mark_scheme):
        marks = int(section.get("marks", 2))
        count = int(section.get("count", 3))
        label = str(section.get("label", f"{marks}-Mark")).strip()

        spec_lines.append(
            f"Section {i + 1}: {label} ({marks} marks each) — generate exactly {count} questions"
        )
        json_lines.append(
            f'    {{"marks": {marks}, "label": "{label}", "questions": ["Question text here", "..."]}}'
        )

    sections_spec = "\n".join(spec_lines)
    json_template = ",\n".join(json_lines)
    truncated     = text[:_MAX_CHARS]

    prompt = _FLEXIBLE_PROMPT.format(
        sections_spec=sections_spec,
        json_template=json_template,
        text=truncated,
    )

    raw    = safe_llm_call(prompt)
    result = parse_json_safe(raw)

    raw_sections = result.get("sections", [])
    if not isinstance(raw_sections, list):
        raw_sections = []

    output = []
    for i, section in enumerate(mark_scheme):
        marks = int(section.get("marks", 2))
        count = int(section.get("count", 3))
        label = str(section.get("label", f"{marks}-Mark")).strip()

        # Find the matching LLM section by marks + label, or fall back by index
        match = next(
            (s for s in raw_sections
             if s.get("marks") == marks and s.get("label") == label),
            raw_sections[i] if i < len(raw_sections) else {},
        )

        questions = _to_str_list(match.get("questions", []))
        output.append({
            "marks":     marks,
            "label":     label,
            "questions": questions[:count],  # cap at requested count
        })

    return {"sections": output}


# ── Private extractors ────────────────────────────────────────────────────────

def _extract_pdf(file_bytes: bytes) -> str:
    # Try PyMuPDF first — fastest and most accurate
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text
    except ImportError:
        pass
    except Exception as exc:
        logger.warning(f"[question_gen] PyMuPDF failed: {exc}")

    # Fallback: pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except ImportError:
        pass
    except Exception as exc:
        logger.warning(f"[question_gen] pdfplumber failed: {exc}")

    logger.error("[question_gen] No PDF library available. Run: pip install pymupdf")
    return ""


def _extract_docx(file_bytes: bytes) -> str:
    try:
        import docx
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        logger.error("[question_gen] python-docx not installed. Run: pip install python-docx")
        return ""
    except Exception as exc:
        logger.warning(f"[question_gen] DOCX extraction failed: {exc}")
        return ""


def _to_str_list(val) -> list:
    if not isinstance(val, list):
        return []
    result = []
    for q in val:
        if isinstance(q, dict):
            # LLM sometimes wraps questions as {"question": "..."} — unwrap any key
            text = (
                q.get("question") or q.get("text") or q.get("q")
                or q.get("content") or next(iter(q.values()), "")
            )
        else:
            text = q
        text = str(text).strip()
        if text:
            result.append(text)
    return result
