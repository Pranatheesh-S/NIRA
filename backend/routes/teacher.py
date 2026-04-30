"""
Teacher monitoring endpoints — all read-only aggregations over Firestore submissions.

Routes:
  GET /teacher/heatmap?lessonId=...
  GET /teacher/student/<studentId>?lessonId=...
  GET /teacher/misconceptions?lessonId=...
  GET /teacher/struggles?lessonId=...
"""

from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Blueprint, request, jsonify

from firebase_service import db
from services.openrouter_service import safe_llm_call, parse_json_safe

teacher_bp = Blueprint("teacher", __name__, url_prefix="/teacher")

# A misconception must appear in more than this many submissions to surface
MISCONCEPTION_THRESHOLD = 2

_FIX_PROMPT = """\
Students in a class have a recurring misconception about: "{concept}"

Suggest ONE concise, practical teaching fix a teacher can use immediately in class.

Return ONLY this JSON — no markdown, no explanation, no extra text:
{{
  "suggestion": "<practical teaching fix in 1-2 sentences>"
}}"""


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------

def _submissions_for_lesson(lesson_id: str) -> list[dict]:
    """Stream all submissions for a lesson and return as plain dicts."""
    docs = (
        db.collection("submissions")
        .where("lessonId", "==", lesson_id)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


# ---------------------------------------------------------------------------
# Feature 1 — Class Misconception Heatmap
# ---------------------------------------------------------------------------

@teacher_bp.route("/heatmap")
def heatmap():
    lesson_id = request.args.get("lessonId", "").strip()
    if not lesson_id:
        return jsonify({"error": "lessonId is required"}), 400

    submissions = _submissions_for_lesson(lesson_id)
    if not submissions:
        return jsonify({"concepts": []})

    # Aggregate per-concept correct / incorrect counts across all submissions
    stats: dict[str, dict] = defaultdict(lambda: {"correct": 0, "incorrect": 0})

    for sub in submissions:
        ev = sub.get("evaluation") or {}
        for c in ev.get("correct", []):
            stats[c]["correct"] += 1
        for c in ev.get("incorrect", []):
            stats[c]["incorrect"] += 1
        # "missing" means the student never mentioned it → counts as incorrect
        for c in ev.get("missing", []):
            stats[c]["incorrect"] += 1

    concepts = []
    for name, counts in stats.items():
        total = counts["correct"] + counts["incorrect"]
        pct = (counts["correct"] / total * 100) if total else 0

        if pct > 70:
            status = "green"
        elif pct >= 40:
            status = "yellow"
        else:
            status = "red"

        concepts.append({
            "name": name,
            "correct": counts["correct"],
            "incorrect": counts["incorrect"],
            "total": total,
            "pct": round(pct),
            "status": status,
        })

    # Worst-first so teacher sees problems immediately
    concepts.sort(key=lambda x: x["pct"])
    return jsonify({"concepts": concepts})


# ---------------------------------------------------------------------------
# Feature 2 — Individual Student Drill-Down
# ---------------------------------------------------------------------------

@teacher_bp.route("/student/<student_id>")
def student_drilldown(student_id: str):
    lesson_id = request.args.get("lessonId", "").strip()
    if not lesson_id:
        return jsonify({"error": "lessonId is required"}), 400

    docs = (
        db.collection("submissions")
        .where("studentId", "==", student_id)
        .where("lessonId", "==", lesson_id)
        .stream()
    )
    subs = [{"id": d.id, **d.to_dict()} for d in docs]

    if not subs:
        return jsonify({"concepts": [], "audioUrl": None, "transcript": "", "flags": {}})

    # Most recent submission wins
    subs.sort(key=lambda x: x.get("createdAt") or 0, reverse=True)
    latest = subs[0]
    ev = latest.get("evaluation") or {}

    concepts = []
    for c in ev.get("correct", []):
        concepts.append({"name": c, "status": "correct"})
    for c in ev.get("incorrect", []):
        concepts.append({"name": c, "status": "weak"})
    for c in ev.get("missing", []):
        concepts.append({"name": c, "status": "wrong"})

    return jsonify({
        "concepts": concepts,
        "audioUrl": latest.get("audioUrl"),
        "transcript": latest.get("transcript", ""),
        "flags": latest.get("flags") or {},
        "submissionCount": len(subs),
    })


# ---------------------------------------------------------------------------
# Feature 3 — Shared Misconception Alerts + AI Teaching Fix
# ---------------------------------------------------------------------------

def _get_suggestion(concept: str) -> str:
    """Call OpenRouter for a teaching fix; returns fallback on any failure."""
    try:
        raw = safe_llm_call(_FIX_PROMPT.format(concept=concept))
        parsed = parse_json_safe(raw)
        return parsed.get("suggestion") or "Review this concept with additional worked examples."
    except Exception:
        return "Review this concept with additional worked examples."


@teacher_bp.route("/misconceptions")
def misconceptions():
    lesson_id = request.args.get("lessonId", "").strip()
    if not lesson_id:
        return jsonify({"error": "lessonId is required"}), 400

    submissions = _submissions_for_lesson(lesson_id)
    concept_counts: Counter = Counter()

    for sub in submissions:
        ev = sub.get("evaluation") or {}
        concept_counts.update(ev.get("incorrect", []))
        concept_counts.update(ev.get("missing", []))

    # Only surface concepts that appear often enough to be a class-wide problem
    frequent = {c: n for c, n in concept_counts.items() if n > MISCONCEPTION_THRESHOLD}
    if not frequent:
        return jsonify([])

    # Fetch AI suggestions in parallel (up to 5 at a time) to keep latency low
    alerts: list[dict] = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        future_to_concept = {
            pool.submit(_get_suggestion, concept): (concept, count)
            for concept, count in frequent.items()
        }
        for future in as_completed(future_to_concept):
            concept, count = future_to_concept[future]
            alerts.append({
                "concept": concept,
                "count": count,
                "suggestion": future.result(),
            })

    alerts.sort(key=lambda x: -x["count"])
    return jsonify(alerts)


# ---------------------------------------------------------------------------
# Feature 4 — Silent Struggle Detection + Trend
# ---------------------------------------------------------------------------

@teacher_bp.route("/struggles")
def struggles():
    lesson_id = request.args.get("lessonId", "").strip()
    if not lesson_id:
        return jsonify({"error": "lessonId is required"}), 400

    submissions = _submissions_for_lesson(lesson_id)

    # Group by student
    by_student: dict[str, list] = defaultdict(list)
    for sub in submissions:
        sid = sub.get("studentId")
        if sid:
            by_student[sid].append(sub)

    result = []
    for student_id, subs in by_student.items():

        # Chronological order for trend analysis
        subs.sort(key=lambda x: (x.get("createdAt") or 0))

        # Per-submission error count (incorrect + missing)
        error_counts = [
            len((sub.get("evaluation") or {}).get("incorrect", []))
            + len((sub.get("evaluation") or {}).get("missing", []))
            for sub in subs
        ]

        # Detect repeated misconceptions (same wrong concept in >1 submission)
        all_incorrect: Counter = Counter()
        for sub in subs:
            ev = sub.get("evaluation") or {}
            all_incorrect.update(ev.get("incorrect", []))
            all_incorrect.update(ev.get("missing", []))
        has_repeated_errors = any(v > 1 for v in all_incorrect.values())

        # Detect repeated low-quality submissions
        low_quality_count = sum(
            1 for sub in subs if (sub.get("flags") or {}).get("lowQuality")
        )

        # Skip students who are not actually struggling
        if not has_repeated_errors and low_quality_count < 2:
            continue

        # Trend: compare average error count in first half vs second half
        n = len(error_counts)
        if n >= 2:
            mid = n // 2
            first_avg = sum(error_counts[:mid]) / mid
            second_avg = sum(error_counts[mid:]) / (n - mid)
            if second_avg < first_avg - 0.5:
                trend = "improving"
            elif second_avg > first_avg + 0.5:
                trend = "declining"
            else:
                trend = "stagnant"
        else:
            trend = "stagnant"

        issue = (
            "consistent misunderstanding"
            if has_repeated_errors
            else "repeated low quality submissions"
        )

        result.append({
            "studentId": student_id,
            "issue": issue,
            "trend": trend,
            "submissionCount": n,
            "lowQualityCount": low_quality_count,
        })

    # Declining students shown first
    trend_order = {"declining": 0, "stagnant": 1, "improving": 2}
    result.sort(key=lambda x: trend_order.get(x["trend"], 1))

    return jsonify(result)
