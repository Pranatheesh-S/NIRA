"""
routes/handwriting.py
POST /api/handwriting/analyse  — image → handwriting quality report
"""

from flask import Blueprint, request, jsonify
from services.handwriting_service import analyse_handwriting

handwriting_bp = Blueprint("handwriting", __name__)

_ALLOWED_MIME = {
    "image/jpeg", "image/jpg", "image/png",
    "image/webp", "image/bmp", "image/tiff",
}


@handwriting_bp.route("/api/handwriting/analyse", methods=["POST"])
def analyse():
    image_file = request.files.get("image")
    if not image_file:
        return jsonify({"error": "An image file is required."}), 400

    if image_file.mimetype not in _ALLOWED_MIME:
        return jsonify({"error": "Unsupported file type. Please upload a JPEG, PNG, or WebP image."}), 400

    try:
        result = analyse_handwriting(image_file.read())
    except Exception as exc:
        print(f"[handwriting/analyse] Error: {exc}")
        return jsonify({"error": "Analysis failed. Please try again with a clearer image."}), 500

    return jsonify(result)
