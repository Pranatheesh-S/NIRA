"""
routes/daily_quiz.py
Daily MCQ quiz — AI generation, publishing, submission (server-side scoring), teacher reports.

POST /api/daily-quiz/generate     — AI generates MCQ questions for a topic
POST /api/daily-quiz/publish      — save + publish quiz to students
POST /api/daily-quiz/submit       — student submits selected options (scored server-side)
GET  /api/daily-quiz/active       — active quizzes for a given studentId
GET  /teacher/daily-quiz/list     — teacher's quiz history
GET  /teacher/daily-quiz/report   — full response report for one quiz
"""

from firebase_admin import firestore
from firebase_service import db
from flask import Blueprint, request, jsonify
from services.openrouter_service import safe_llm_call, parse_json_safe

daily_quiz_bp = Blueprint("daily_quiz", __name__)

_OPTION_LETTERS = ["A", "B", "C", "D"]

# ── LLM prompt ────────────────────────────────────────────────────────────────

_GENERATE_PROMPT = """\
You are an expert teacher creating a multiple-choice quiz for students.

Topic: {topic}
Difficulty: {difficulty}
Number of questions: {count}

Difficulty guide:
  easy   — straightforward recall; distractors are clearly different from the correct answer
  medium — requires understanding; distractors are plausible but distinguishable
  hard   — requires deep analysis; all four options seem plausible at first glance

Rules:
- Each question MUST have EXACTLY 4 options (A, B, C, D)
- Only ONE option is correct
- Distractors must be realistic and relevant — never obviously wrong
- Write a short explanation (1-2 sentences) of why the correct answer is right
- All text must be plain strings — no sub-questions, no bullet points inside options
- Use formal academic language
- Vary question starters: What, Which, How, Why, Define, Identify…

Return ONLY this JSON — no markdown, no explanation:
{{
  "questions": [
    {{
      "id": "q1",
      "text": "Plain question text here?",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correct": "B",
      "explanation": "B is correct because…",
      "marks": 1
    }}
  ]
}}
"""

# ── Routes ─────────────────────────────────────────────────────────────────────

@daily_quiz_bp.route("/api/daily-quiz/generate", methods=["POST"])
def generate_quiz():
    body       = request.get_json(silent=True) or {}
    topic      = (body.get("topic") or "").strip()
    count      = min(max(int(body.get("count") or 5), 1), 20)
    difficulty = (body.get("difficulty") or "medium").strip().lower()

    if not topic:
        return jsonify({"error": "topic is required"}), 400
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"

    try:
        raw    = safe_llm_call(
            _GENERATE_PROMPT.format(topic=topic, count=count, difficulty=difficulty)
        )
        parsed = parse_json_safe(raw)
    except Exception as exc:
        print(f"[daily-quiz/generate] LLM error: {exc}")
        return jsonify({"error": "AI service unavailable. Try again."}), 503

    questions = _clean_questions(parsed.get("questions") or [])
    if not questions:
        return jsonify({"error": "AI returned no questions. Try again."}), 503

    return jsonify({"questions": questions})


@daily_quiz_bp.route("/api/daily-quiz/publish", methods=["POST"])
def publish_quiz():
    body       = request.get_json(silent=True) or {}
    teacher_id = (body.get("teacherId") or "").strip()
    topic      = (body.get("topic") or "").strip()
    difficulty = (body.get("difficulty") or "medium").strip()
    questions  = body.get("questions") or []
    due_date   = (body.get("dueDate") or "").strip() or None

    if not teacher_id or not topic or not questions:
        return jsonify({"error": "teacherId, topic, and questions are required"}), 400

    doc_ref = db.collection("daily_quizzes").document()
    doc_ref.set({
        "teacherId":   teacher_id,
        "topic":       topic,
        "difficulty":  difficulty,
        "questions":   questions,
        "isPublished": True,
        "dueDate":     due_date,
        "createdAt":   firestore.SERVER_TIMESTAMP,
    })

    return jsonify({"quizId": doc_ref.id, "published": True})


@daily_quiz_bp.route("/api/daily-quiz/active", methods=["GET"])
def active_quizzes():
    """Published quizzes; marks answered=true for ones the student already submitted."""
    student_id = (request.args.get("studentId") or "").strip()

    docs = db.collection("daily_quizzes").where("isPublished", "==", True).stream()
    quizzes = []
    for d in docs:
        data       = d.to_dict()
        data["id"] = d.id
        # Strip correct answers before sending to students
        for q in data.get("questions", []):
            q.pop("correct",      None)
            q.pop("explanation",  None)
        _coerce_ts(data, "createdAt")
        quizzes.append(data)

    quizzes.sort(key=lambda x: x.get("createdAt") or "", reverse=True)

    if student_id:
        answered = {
            r.to_dict().get("quizId")
            for r in db.collection("daily_quiz_responses")
                       .where("studentId", "==", student_id)
                       .stream()
        }
        for q in quizzes:
            q["answered"] = q["id"] in answered

    return jsonify({"quizzes": quizzes})


@daily_quiz_bp.route("/api/daily-quiz/submit", methods=["POST"])
def submit_answers():
    """
    Score MCQ answers server-side by comparing selected option with
    the correct answer stored in Firestore (never sent to the client).
    """
    body         = request.get_json(silent=True) or {}
    quiz_id      = (body.get("quizId")      or "").strip()
    student_id   = (body.get("studentId")   or "").strip()
    student_name = (body.get("studentName") or "Student").strip()
    answers      = body.get("answers") or []   # [{questionId, selected}]

    if not quiz_id or not student_id or not answers:
        return jsonify({"error": "quizId, studentId, and answers are required"}), 400

    # Prevent duplicate submissions
    if list(
        db.collection("daily_quiz_responses")
          .where("quizId",    "==", quiz_id)
          .where("studentId", "==", student_id)
          .limit(1).stream()
    ):
        return jsonify({"error": "You have already submitted this quiz."}), 409

    # Fetch quiz to score server-side
    snap = db.collection("daily_quizzes").document(quiz_id).get()
    if not snap.exists:
        return jsonify({"error": "Quiz not found"}), 404

    quiz_data     = snap.to_dict()
    questions_map = {q["id"]: q for q in (quiz_data.get("questions") or [])}

    evaluated   = []
    total_score = 0
    max_score   = 0

    for ans in answers:
        q_id     = (ans.get("questionId") or "").strip()
        selected = (ans.get("selected")   or "").strip().upper()

        q_data      = questions_map.get(q_id, {})
        q_text      = q_data.get("text",        "")
        marks       = int(q_data.get("marks",   1))
        correct     = (q_data.get("correct")    or "").strip().upper()
        options     = q_data.get("options",     [])
        explanation = q_data.get("explanation", "")

        max_score  += marks
        is_correct  = bool(selected) and selected == correct
        score       = marks if is_correct else 0
        total_score += score

        # Build human-readable feedback
        if not selected:
            feedback = "No option selected."
        elif is_correct:
            feedback = f"Correct! {explanation}".strip()
        else:
            correct_idx  = _OPTION_LETTERS.index(correct) if correct in _OPTION_LETTERS else -1
            correct_text = options[correct_idx] if 0 <= correct_idx < len(options) else correct
            feedback = f"Incorrect. The correct answer is {correct}: {correct_text}. {explanation}".strip()

        evaluated.append({
            "questionId":  q_id,
            "questionText": q_text,
            "options":     options,
            "selected":    selected,
            "correct":     correct,
            "isCorrect":   is_correct,
            "explanation": explanation,
            "feedback":    feedback,
            "marks":       marks,
            "score":       score,
        })

    doc_ref = db.collection("daily_quiz_responses").document()
    doc_ref.set({
        "quizId":      quiz_id,
        "studentId":   student_id,
        "studentName": student_name,
        "answers":     evaluated,
        "totalScore":  total_score,
        "maxScore":    max_score,
        "submittedAt": firestore.SERVER_TIMESTAMP,
    })

    return jsonify({
        "responseId": doc_ref.id,
        "evaluated":  evaluated,
        "totalScore": total_score,
        "maxScore":   max_score,
    })


@daily_quiz_bp.route("/teacher/daily-quiz/list", methods=["GET"])
def list_quizzes():
    teacher_id = (request.args.get("teacherId") or "").strip()
    if not teacher_id:
        return jsonify({"error": "teacherId is required"}), 400

    docs = (
        db.collection("daily_quizzes")
          .where("teacherId", "==", teacher_id)
          .stream()
    )
    quizzes = []
    for d in docs:
        data       = d.to_dict()
        data["id"] = d.id
        _coerce_ts(data, "createdAt")
        quizzes.append(data)

    quizzes.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return jsonify({"quizzes": quizzes})


@daily_quiz_bp.route("/teacher/daily-quiz/report", methods=["GET"])
def quiz_report():
    quiz_id = (request.args.get("quizId") or "").strip()
    if not quiz_id:
        return jsonify({"error": "quizId is required"}), 400

    snap = db.collection("daily_quizzes").document(quiz_id).get()
    if not snap.exists:
        return jsonify({"error": "Quiz not found"}), 404

    quiz       = snap.to_dict()
    quiz["id"] = quiz_id
    _coerce_ts(quiz, "createdAt")

    resp_docs = (
        db.collection("daily_quiz_responses")
          .where("quizId", "==", quiz_id)
          .stream()
    )
    responses = []
    for d in resp_docs:
        data       = d.to_dict()
        data["id"] = d.id
        _coerce_ts(data, "submittedAt")
        responses.append(data)

    responses.sort(key=lambda x: x.get("submittedAt") or "")

    max_score   = sum(q.get("marks", 1) for q in quiz.get("questions", []))
    total_q     = len(quiz.get("questions", []))
    avg_score   = (
        round(sum(r.get("totalScore", 0) for r in responses) / len(responses), 1)
        if responses else 0
    )
    avg_correct = (
        round(
            sum(
                sum(1 for a in r.get("answers", []) if a.get("isCorrect"))
                for r in responses
            ) / len(responses),
            1,
        )
        if responses else 0
    )

    return jsonify({
        "quiz":      quiz,
        "responses": responses,
        "stats": {
            "totalResponses": len(responses),
            "maxScore":       max_score,
            "totalQuestions": total_q,
            "avgScore":       avg_score,
            "avgCorrect":     avg_correct,
        },
    })


# ── Helpers ────────────────────────────────────────────────────────────────────

def _clean_questions(raw: list) -> list:
    """Normalise LLM MCQ output to [{id, text, options, correct, explanation, marks}]."""
    result = []
    for i, q in enumerate(raw):
        if not isinstance(q, dict):
            continue

        text        = (q.get("text") or q.get("question") or q.get("q") or "").strip()
        correct     = (q.get("correct") or q.get("answer") or "A").strip().upper()
        explanation = (q.get("explanation") or "").strip()
        marks       = max(int(q.get("marks") or 1), 1)
        qid         = (q.get("id") or f"q{i + 1}").strip()

        # Normalise options to a list of exactly 4 strings
        raw_opts = q.get("options") or []
        if isinstance(raw_opts, dict):
            # Some LLMs return {"A": "...", "B": "...", ...}
            raw_opts = [raw_opts.get(l, "") for l in _OPTION_LETTERS]
        options = [str(o).strip() for o in raw_opts]
        while len(options) < 4:
            options.append("")
        options = options[:4]

        if correct not in _OPTION_LETTERS:
            correct = "A"

        if text:
            result.append({
                "id":          qid,
                "text":        text,
                "options":     options,
                "correct":     correct,
                "explanation": explanation,
                "marks":       marks,
            })
    return result


def _coerce_ts(d: dict, key: str) -> None:
    val = d.get(key)
    if val is None:
        return
    try:
        d[key] = val.isoformat()
    except AttributeError:
        d[key] = str(val)
