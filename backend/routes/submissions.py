"""
routes/submissions.py
Student submission endpoints.

POST /api/submissions/explain       — audio + optional text
POST /api/submissions/image-explain — image + audio + optional text
"""

import uuid
import urllib.parse

from firebase_admin import firestore as fb_firestore
from flask import Blueprint, request, jsonify

from firebase_service import db, get_bucket
from services.speech_service          import transcribe
from services.translation_service     import detect_and_translate
from services.ocr_service             import extract_text as ocr_extract
from services.evaluation_service      import analyze_explanation, analyze_multimodal
from services.reading_detection_service import detect_reading
from middleware.quality_gate          import quality_gate

submissions_bp = Blueprint("submissions", __name__, url_prefix="/api/submissions")


# ── Storage helper ────────────────────────────────────────────────────────────

def _upload(file_bytes: bytes, path: str, content_type: str) -> str:
    """
    Upload bytes to Firebase Storage.
    Returns a permanent download URL with an embedded access token.
    Returns "" on failure (non-fatal — submission continues without URL).
    """
    try:
        bucket = get_bucket()
        blob   = bucket.blob(path)
        token  = str(uuid.uuid4())

        blob.upload_from_string(file_bytes, content_type=content_type)
        blob.metadata = {"firebaseStorageDownloadTokens": token}
        blob.patch()

        encoded = urllib.parse.quote(path, safe="")
        return (
            f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}"
            f"/o/{encoded}?alt=media&token={token}"
        )
    except Exception as exc:
        print(f"[submissions] Storage upload failed: {exc}")
        return ""


# ── Feature 1 + 2 — Audio / Text explanation ─────────────────────────────────

@submissions_bp.route("/explain", methods=["POST"])
@quality_gate
def explain():
    """
    Accepts audio file (primary) and/or plain text (fallback).
    Pipeline: upload → transcribe (Whisper) → detect language → translate → evaluate → store.

    Form fields:
      studentId   string (required)
      lessonId    string (required)
      text        string (optional fallback)
      audio       file   (optional, e.g. audio/webm)
    """
    student_id  = (request.form.get("studentId") or "").strip()
    lesson_id   = (request.form.get("lessonId")  or "").strip()
    text_input  = (request.form.get("text")      or "").strip()
    audio_file  = request.files.get("audio")

    live_tx     = (request.form.get("liveTranscript") or "").strip()

    if not student_id or not lesson_id:
        return jsonify({"error": "studentId and lessonId are required"}), 400
    if not audio_file and not text_input and not live_tx:
        return jsonify({"error": "Provide audio recording or text explanation"}), 400

    sub_id      = str(uuid.uuid4())
    audio_url   = ""
    audio_bytes = None
    transcript  = text_input
    original    = text_input
    translated  = text_input
    language    = "en"
    flags = {"isReading": False, "lowQuality": False, "imageMismatch": False}

    # ── 1. Upload audio + resolve transcript ─────────────────────────────
    if audio_file:
        audio_bytes = audio_file.read()
        audio_url = _upload(
            audio_bytes,
            f"submissions/{sub_id}/audio.webm",
            "audio/webm",
        )

    w = transcribe(live_tx, text_input, audio_bytes=audio_bytes, audio_present=bool(audio_file))
    transcript = w["text"]
    original   = transcript
    flags["lowQuality"] = w["no_speech_prob"] > 0.5

    # ── 2. Language detection + translation ──────────────────────────────
    working_text = transcript or text_input

    # ── 3. Fetch lesson context for evaluation ───────────────────────────
    lesson_snap = db.collection("lessons").document(lesson_id).get()
    lesson_data = lesson_snap.to_dict() if lesson_snap.exists else {}
    expected    = (lesson_data.get("knowledgeGraph") or {}).get("concepts", [])

    if working_text:
        try:
            tl = detect_and_translate(working_text)
            language   = tl["language"]
            translated = tl["translatedText"]
        except Exception as exc:
            print(f"[submissions] Translation failed: {exc}")
            translated = working_text

        # Reading detection — compare against lesson material when available
        source_material = lesson_data.get("lessonContent", "")
        rd = detect_reading(working_text, source_material)
        flags["isReading"]         = rd["reading_detected"]
        flags["readingDetection"]  = rd

    # ── 4. AI evaluation ─────────────────────────────────────────────────
    evaluation = analyze_explanation(
        transcript        = translated or working_text,
        lesson_title      = lesson_data.get("title", ""),
        expected_concepts = expected,
    )

    # ── 5. Persist to Firestore ───────────────────────────────────────────
    db.collection("submissions").document(sub_id).set({
        "studentId":      student_id,
        "lessonId":       lesson_id,
        "type":           "audio" if audio_file else "text",
        "transcript":     translated or working_text,
        "originalText":   original,
        "translatedText": translated,
        "language":       language,
        "textInput":      text_input,
        "audioUrl":       audio_url,
        "imageUrl":       "",
        "ocrText":        "",
        "evaluation":     evaluation,
        "flags":          flags,
        "createdAt":      fb_firestore.SERVER_TIMESTAMP,
    })

    return jsonify({
        "submissionId": sub_id,
        "transcript":   translated or working_text,
        "originalText": original,
        "language":     language,
        "evaluation":   evaluation,
        "flags":        flags,
        "audioUrl":     audio_url,
    })


# ── Feature 3 — Image + Voice explanation ────────────────────────────────────

@submissions_bp.route("/image-explain", methods=["POST"])
@quality_gate
def image_explain():
    """
    Accepts image (required) + audio (optional) + text (optional).
    Pipeline: OCR image → upload files → transcribe audio → translate → multimodal eval → store.

    Form fields:
      studentId   string (required)
      lessonId    string (required)
      image       file   (required)
      audio       file   (optional)
      text        string (optional)
    """
    student_id  = (request.form.get("studentId")      or "").strip()
    lesson_id   = (request.form.get("lessonId")       or "").strip()
    text_input  = (request.form.get("text")           or "").strip()
    live_tx     = (request.form.get("liveTranscript") or "").strip()
    audio_file  = request.files.get("audio")
    image_file  = request.files.get("image")

    if not student_id or not lesson_id:
        return jsonify({"error": "studentId and lessonId are required"}), 400
    if not image_file:
        return jsonify({"error": "image is required"}), 400

    sub_id      = str(uuid.uuid4())
    audio_url   = ""
    audio_bytes = None
    image_url   = ""
    transcript  = text_input
    original    = text_input
    translated  = text_input
    language    = "en"
    ocr_text    = ""
    flags = {"isReading": False, "lowQuality": False, "imageMismatch": False}

    # ── 1. Process image (OCR + upload) ──────────────────────────────────
    image_bytes = image_file.read()
    ext = (image_file.filename or "image.jpg").rsplit(".", 1)[-1].lower()
    image_url = _upload(
        image_bytes,
        f"submissions/{sub_id}/image.{ext}",
        image_file.content_type or "image/jpeg",
    )

    ocr_text = ocr_extract(image_bytes)   # "" on failure — non-fatal

    # ── 2. Process audio ─────────────────────────────────────────────────
    if audio_file:
        audio_bytes = audio_file.read()
        audio_url = _upload(
            audio_bytes,
            f"submissions/{sub_id}/audio.webm",
            "audio/webm",
        )

    w = transcribe(live_tx, text_input, audio_bytes=audio_bytes, audio_present=bool(audio_file))
    transcript = w["text"]
    original   = transcript
    flags["lowQuality"] = w["no_speech_prob"] > 0.5

    # ── 3. Language detection + translation ──────────────────────────────
    working_text = transcript or text_input
    if working_text:
        try:
            tl = detect_and_translate(working_text)
            language   = tl["language"]
            translated = tl["translatedText"]
        except Exception as exc:
            print(f"[submissions] Translation failed: {exc}")
            translated = working_text

        # Reading detection against OCR text (image content is the source material here)
        rd = detect_reading(working_text, ocr_text)
        flags["isReading"]        = rd["reading_detected"]
        flags["readingDetection"] = rd

    # ── 4. Multimodal evaluation ─────────────────────────────────────────
    evaluation = analyze_multimodal(
        ocr_text   = ocr_text,
        transcript = translated or working_text,
    )
    flags["imageMismatch"] = evaluation.pop("imageMismatch", False)

    # ── 5. Persist to Firestore ───────────────────────────────────────────
    db.collection("submissions").document(sub_id).set({
        "studentId":      student_id,
        "lessonId":       lesson_id,
        "type":           "multimodal",
        "transcript":     translated or working_text,
        "originalText":   original,
        "translatedText": translated,
        "language":       language,
        "textInput":      text_input,
        "audioUrl":       audio_url,
        "imageUrl":       image_url,
        "ocrText":        ocr_text,
        "evaluation":     evaluation,
        "flags":          flags,
        "createdAt":      fb_firestore.SERVER_TIMESTAMP,
    })

    return jsonify({
        "submissionId": sub_id,
        "transcript":   translated or working_text,
        "originalText": original,
        "language":     language,
        "ocrText":      ocr_text,
        "evaluation":   evaluation,
        "flags":        flags,
        "imageUrl":     image_url,
        "audioUrl":     audio_url,
    })
