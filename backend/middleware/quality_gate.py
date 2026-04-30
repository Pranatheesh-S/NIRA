"""
middleware/quality_gate.py
Validates explanation quality before the expensive AI evaluation pipeline.

Apply as a decorator on any Flask route that receives a student explanation:
    @quality_gate
    def explain(): ...

The decorator reads liveTranscript / text and optional duration directly from
the current Flask request form, so no changes to route signatures are needed.

Gates (all configurable at module level):
  1. Minimum word count          — rejects submissions too short to evaluate
  2. Minimum recording duration  — only enforced when client sends 'duration'
  3. Speech rate (WPM) range     — catches suspiciously fast or slow recordings
"""

import re
from functools import wraps
from flask import request, jsonify

MIN_WORDS         = 30   # minimum words for a meaningful explanation
MIN_DURATION_SECS = 5    # minimum recording length in seconds
MIN_WPM           = 40   # below this → suspiciously slow / silent pauses
MAX_WPM           = 230  # above this → suspiciously fast / reading aloud quickly


def quality_gate(f):
    """Decorator: reject submissions that fail basic quality checks."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        transcript = (
            request.form.get("liveTranscript", "")
            or request.form.get("text", "")
        ).strip()

        words = len(re.findall(r"\b\w+\b", transcript))

        if words < MIN_WORDS:
            return jsonify({
                "error":    "quality_gate",
                "reason":   "too_short",
                "message":  f"Explanation too short ({words} words). Please use at least {MIN_WORDS} words.",
                "words":    words,
                "minWords": MIN_WORDS,
            }), 422

        try:
            duration = float(request.form.get("duration") or 0)
        except ValueError:
            duration = 0.0

        if duration > 0:
            if duration < MIN_DURATION_SECS:
                return jsonify({
                    "error":    "quality_gate",
                    "reason":   "too_brief",
                    "message":  f"Recording too short ({duration:.1f}s). Please speak for at least {MIN_DURATION_SECS}s.",
                    "duration": duration,
                }), 422

            wpm = (words / duration) * 60
            if wpm > MAX_WPM:
                return jsonify({
                    "error":   "quality_gate",
                    "reason":  "suspiciously_fast",
                    "message": f"Speech rate too high ({wpm:.0f} wpm). Please speak naturally.",
                    "wpm":     round(wpm, 1),
                }), 422
            if wpm < MIN_WPM:
                return jsonify({
                    "error":   "quality_gate",
                    "reason":  "suspiciously_slow",
                    "message": f"Speech rate too low ({wpm:.0f} wpm). Please speak naturally.",
                    "wpm":     round(wpm, 1),
                }), 422

        return f(*args, **kwargs)
    return wrapper
