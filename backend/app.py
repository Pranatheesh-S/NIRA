from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

CORS(app, resources={
    r"/api/*":     {"origins": ["http://localhost:5173"]},
    r"/teacher/*": {"origins": ["http://localhost:5173"]},
    r"/student/*": {"origins": ["http://localhost:5173"]},
})

import firebase_service  # noqa: F401 — initialises Admin SDK on startup
from firebase_service import db
from services.openrouter_service    import safe_llm_call, parse_json_safe
from services.knowledge_graph_service import build_graph
from routes.teacher            import teacher_bp
from routes.submissions        import submissions_bp
from routes.question_generator import question_gen_bp
from routes.daily_quiz         import daily_quiz_bp
from routes.handwriting        import handwriting_bp

app.register_blueprint(teacher_bp)
app.register_blueprint(submissions_bp)
app.register_blueprint(question_gen_bp)
app.register_blueprint(daily_quiz_bp)
app.register_blueprint(handwriting_bp)


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_GRAPH_PROMPT = """\
Extract all key concepts and their relationships from the lesson content below.

Return ONLY this exact JSON structure — no explanation, no markdown, no extra text:
{{
  "concepts": ["<concept>", "..."],
  "relationships": [
    {{"from": "<concept>", "to": "<concept>"}},
    "..."
  ]
}}

Lesson content:
{content}"""


_STUDENT_PROMPT_LLM = """\
You are an educational AI assistant helping teachers design engaging classroom activities.

Based on the lesson content below, generate ONE open-ended explanation prompt for students.

Rules:
- Ask the student to explain the concept in their own words
- Encourage step-by-step thinking (e.g. "Walk us through...", "Explain how...")
- Do NOT create multiple choice or yes/no questions
- Use simple, age-appropriate language
- Make it feel like a natural question a teacher would ask in class

Return ONLY this JSON — no markdown, no explanation, no extra text:
{{
  "prompt": "<the complete question for the student>"
}}

Lesson content:
{content}"""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api/generate-knowledge-graph", methods=["POST"])
def generate_knowledge_graph():
    body = request.get_json(silent=True) or {}
    lesson_id = (body.get("lessonId") or "").strip()
    lesson_content = (body.get("lessonContent") or "").strip()

    if not lesson_id or not lesson_content:
        return jsonify({"error": "lessonId and lessonContent are required"}), 400

    try:
        graph = build_graph(lesson_id, lesson_content)
    except Exception as exc:
        print(f"[generate-knowledge-graph] Error: {exc}")
        return jsonify({"error": "LLM service unavailable"}), 503

    db.collection("lessons").document(lesson_id).set(
        {
            "knowledgeGraph": graph,
            # Store truncated material so reading detection can use it later
            "lessonContent":  lesson_content[:4000],
        },
        merge=True,
    )
    return jsonify({"lessonId": lesson_id, "knowledgeGraph": graph})


@app.route("/api/generate-student-prompt", methods=["POST"])
def generate_student_prompt():
    body = request.get_json(silent=True) or {}
    lesson_id = (body.get("lessonId") or "").strip()
    lesson_content = (body.get("lessonContent") or "").strip()

    if not lesson_id or not lesson_content:
        return jsonify({"error": "lessonId and lessonContent are required"}), 400

    try:
        raw = safe_llm_call(_STUDENT_PROMPT_LLM.format(content=lesson_content))
    except Exception as exc:
        print(f"[generate-student-prompt] LLM error: {exc}")
        return jsonify({"error": "LLM service unavailable"}), 503

    parsed = parse_json_safe(raw)
    generated_prompt = (parsed.get("prompt") or raw).strip()

    db.collection("lessons").document(lesson_id).set(
        {"generatedPrompt": generated_prompt}, merge=True
    )
    return jsonify({"lessonId": lesson_id, "generatedPrompt": generated_prompt})


@app.route("/api/publish-prompt", methods=["POST"])
def publish_prompt():
    body = request.get_json(silent=True) or {}
    lesson_id = (body.get("lessonId") or "").strip()
    final_prompt = (body.get("finalPrompt") or "").strip()

    if not lesson_id or not final_prompt:
        return jsonify({"error": "lessonId and finalPrompt are required"}), 400

    db.collection("lessons").document(lesson_id).set(
        {"studentPrompt": final_prompt, "isPublished": True}, merge=True
    )
    return jsonify({"lessonId": lesson_id, "studentPrompt": final_prompt, "isPublished": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
