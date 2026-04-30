"""
routes/question_generator.py
Exam question generation endpoints.

POST /api/generate-questions
  Legacy endpoint — fixed 2/5/16-mark structure.
  Accepts study material as a file upload or raw text.

POST /api/generate-question-paper
  Flexible endpoint — teacher-defined mark scheme.
  Accepts a file + JSON mark_scheme, returns sections[] with custom marks/labels.
"""

import json as _json

from flask import Blueprint, request, jsonify

from services.question_generation_service import (
    extract_text,
    clean_text,
    generate_questions,
    generate_questions_flexible,
)

question_gen_bp = Blueprint("question_generator", __name__, url_prefix="/api")

_MIN_WORDS = 20


# ── Legacy endpoint ────────────────────────────────────────────────────────────

@question_gen_bp.route("/generate-questions", methods=["POST"])
def generate_questions_route():
    """
    Form fields (multipart/form-data):
      file  — study material (PDF, DOCX, image, or plain text file)
      text  — raw text, accepted as form field OR JSON body key

    Response 200:
      {
        "wordCount": int,
        "questions": {
          "two_mark":     [str, ...],
          "five_mark":    [str, ...],
          "sixteen_mark": [str, ...]
        }
      }
    """
    uploaded_file = request.files.get("file")
    raw_text      = (request.form.get("text") or "").strip()

    if not uploaded_file and not raw_text:
        body     = request.get_json(silent=True) or {}
        raw_text = (body.get("text") or "").strip()

    if not uploaded_file and not raw_text:
        return jsonify({"error": "Provide a 'file' upload or a 'text' field"}), 400

    if uploaded_file:
        file_bytes = uploaded_file.read()
        extracted  = extract_text(
            file_bytes,
            filename     = uploaded_file.filename or "",
            content_type = uploaded_file.content_type or "",
        )
    else:
        extracted = raw_text

    if not extracted or len(extracted.split()) < _MIN_WORDS:
        return jsonify({
            "error": "Could not extract enough content. "
                     "Provide a richer document or more text."
        }), 422

    cleaned   = clean_text(extracted)
    questions = generate_questions(cleaned)

    total = (
        len(questions["two_mark"]) +
        len(questions["five_mark"]) +
        len(questions["sixteen_mark"])
    )

    if total == 0:
        return jsonify({"error": "LLM returned no questions. Try again."}), 503

    return jsonify({
        "wordCount": len(cleaned.split()),
        "questions": questions,
    })


# ── Flexible / custom mark-scheme endpoint ─────────────────────────────────────

@question_gen_bp.route("/generate-question-paper", methods=["POST"])
def generate_question_paper():
    """
    Generate a question paper with a teacher-defined mark scheme.

    Multipart form fields:
      file        — PDF / DOCX / TXT study material
      text        — raw text (alternative to file)
      mark_scheme — JSON string:
                    [{"marks": int, "count": int, "label": str}, ...]

    Response 200:
      {
        "wordCount": int,
        "sections": [
          {"marks": int, "label": str, "questions": [str, ...]},
          ...
        ]
      }
    """
    uploaded_file    = request.files.get("file")
    raw_text         = (request.form.get("text") or "").strip()
    mark_scheme_str  = (request.form.get("mark_scheme") or "").strip()

    # Also accept JSON body
    if not uploaded_file and not raw_text and not mark_scheme_str:
        body            = request.get_json(silent=True) or {}
        raw_text        = (body.get("text") or "").strip()
        mark_scheme_str = _json.dumps(body.get("mark_scheme") or [])

    # Parse mark scheme
    try:
        mark_scheme = _json.loads(mark_scheme_str) if mark_scheme_str else []
    except Exception:
        mark_scheme = []

    if not isinstance(mark_scheme, list) or len(mark_scheme) == 0:
        mark_scheme = [
            {"marks": 2,  "count": 5, "label": "Short Answer"},
            {"marks": 5,  "count": 3, "label": "Descriptive"},
            {"marks": 10, "count": 2, "label": "Essay"},
        ]

    if not uploaded_file and not raw_text:
        return jsonify({"error": "Provide a 'file' upload or a 'text' field"}), 400

    if uploaded_file:
        file_bytes = uploaded_file.read()
        extracted  = extract_text(
            file_bytes,
            filename     = uploaded_file.filename or "",
            content_type = uploaded_file.content_type or "",
        )
    else:
        extracted = raw_text

    if not extracted or len(extracted.split()) < _MIN_WORDS:
        return jsonify({
            "error": "Could not extract enough content from the file. "
                     "Try a richer document."
        }), 422

    cleaned = clean_text(extracted)
    result  = generate_questions_flexible(cleaned, mark_scheme)

    total_q = sum(len(s["questions"]) for s in result["sections"])
    if total_q == 0:
        return jsonify({"error": "LLM returned no questions. Please try again."}), 503

    return jsonify({
        "wordCount": len(cleaned.split()),
        "sections":  result["sections"],
    })
