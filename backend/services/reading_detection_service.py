"""
reading_detection_service.py
Detects whether a student is reading from material vs. speaking naturally.

Uses only stdlib (math, re, collections) — no new dependencies required.

Signals:
  text_similarity     — TF-IDF cosine similarity between transcript and source material
  vocabulary_overlap  — fraction of transcript words that appear in source material
  formality_score     — long words + low contractions = formal/written register
  avg_sentence_length — reading tends to produce longer, more complete sentences
  filler_word_rate    — natural speech has more "um", "uh", "like", etc.

Confidence ≥ 0.55 → reading_detected = True
"""

import re
import math
from collections import Counter

_FILLERS = {
    "um", "uh", "like", "basically", "right", "so", "actually",
    "kind", "sort", "yeah", "you", "know",
}

_CONTRACTIONS = re.compile(
    r"\b(don't|can't|won't|I'm|it's|they're|we're|you're|I've|I'd|that's|there's)\b",
    re.IGNORECASE,
)


def detect_reading(transcript: str, source_material: str = "") -> dict:
    """
    Args:
        transcript:      student's spoken/typed explanation
        source_material: original lesson text (optional but improves accuracy)

    Returns:
        {
            "reading_detected": bool,
            "confidence":       float [0.0 – 1.0],
            "signals":          dict  (individual signal values for debugging)
        }
    """
    if not transcript or len(transcript.split()) < 15:
        return {"reading_detected": False, "confidence": 0.0, "signals": {}}

    has_material = bool(source_material.strip())
    signals: dict = {}

    sim     = _cosine_sim(transcript, source_material) if has_material else 0.0
    overlap = _vocab_overlap(transcript, source_material) if has_material else 0.0
    signals["text_similarity"]     = round(sim, 3)
    signals["vocabulary_overlap"]  = round(overlap, 3)

    formality = _formality(transcript)
    avg_sent  = _avg_sentence_len(transcript)
    filler    = _filler_rate(transcript)
    signals["formality_score"]      = round(formality, 3)
    signals["avg_sentence_length"]  = round(avg_sent, 1)
    signals["filler_word_rate"]     = round(filler, 3)

    # Weighted combination — weights tuned for spoken-explanation context
    confidence = (
        sim       * 0.35 +
        formality * 0.25 +
        min(avg_sent / 25.0, 1.0) * 0.20 +
        (1.0 - filler) * 0.10 +
        overlap   * 0.10
    )
    confidence = round(max(0.0, min(confidence, 1.0)), 3)

    return {
        "reading_detected": confidence >= 0.55,
        "confidence": confidence,
        "signals": signals,
    }


# ── Private helpers ───────────────────────────────────────────────────────────

def _tokenize(text: str) -> list:
    return re.findall(r"\b[a-z]+\b", text.lower())


def _tf_vector(tokens: list) -> dict:
    n = len(tokens) or 1
    return {w: c / n for w, c in Counter(tokens).items()}


def _cosine_sim(a: str, b: str) -> float:
    ta, tb = _tokenize(a), _tokenize(b)
    if not ta or not tb:
        return 0.0
    va, vb = _tf_vector(ta), _tf_vector(tb)
    vocab = set(va) | set(vb)
    dot = sum(va.get(w, 0) * vb.get(w, 0) for w in vocab)
    mag = (
        math.sqrt(sum(v ** 2 for v in va.values())) *
        math.sqrt(sum(v ** 2 for v in vb.values()))
    )
    return dot / mag if mag else 0.0


def _vocab_overlap(transcript: str, material: str) -> float:
    tw = set(_tokenize(transcript))
    mw = set(_tokenize(material))
    return len(tw & mw) / len(tw) if tw else 0.0


def _formality(text: str) -> float:
    tokens = _tokenize(text)
    if not tokens:
        return 0.0
    long_ratio         = sum(1 for t in tokens if len(t) >= 8) / len(tokens)
    contraction_ratio  = len(_CONTRACTIONS.findall(text)) / len(tokens)
    return max(0.0, min(long_ratio * 1.6 - contraction_ratio * 2.0 + 0.25, 1.0))


def _avg_sentence_len(text: str) -> float:
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    if not sentences:
        return 0.0
    return sum(len(_tokenize(s)) for s in sentences) / len(sentences)


def _filler_rate(text: str) -> float:
    tokens = _tokenize(text)
    if not tokens:
        return 0.0
    return sum(1 for t in tokens if t in _FILLERS) / len(tokens)
