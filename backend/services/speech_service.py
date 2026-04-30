"""
speech_service.py
Transcription priority:
  1. Browser liveTranscript (Web Speech API) — zero latency, already processed
  2. Whisper local model — used when no browser transcript is available
  3. Manually typed text — final fallback

Whisper is lazy-loaded on first use (~100 MB download on first call).
Set WHISPER_MODEL env var to choose model size: tiny | base | small | medium (default: base)
Whisper requires ffmpeg on the system PATH.
"""

import os
import logging
import tempfile

logger = logging.getLogger(__name__)

_whisper_model = None


def transcribe(
    live_transcript: str,
    text_input: str = "",
    audio_bytes: bytes | None = None,
    audio_present: bool = False,
) -> dict:
    """
    Args:
        live_transcript: text captured by Web Speech API on the client
        text_input:      manually typed fallback text
        audio_bytes:     raw audio bytes (webm) for Whisper transcription
        audio_present:   True if an audio blob was uploaded (for quality flagging)

    Returns:
        {
            "text":           str,
            "language":       str   (ISO 639-1, e.g. "en"),
            "source":         str   ("browser" | "whisper" | "text" | "none"),
            "no_speech_prob": float (1.0 when audio sent but no transcript found)
        }
    """
    # Priority 1: browser live transcript
    if live_transcript and live_transcript.strip():
        return {
            "text":           live_transcript.strip(),
            "language":       "en",
            "source":         "browser",
            "no_speech_prob": 0.0,
        }

    # Priority 2: Whisper from audio bytes
    if audio_bytes and len(audio_bytes) > 1_000:
        try:
            result = _whisper_transcribe(audio_bytes)
            if result["text"]:
                return result
        except Exception as exc:
            logger.warning(f"[speech] Whisper failed: {exc}")

    # Priority 3: typed text
    if text_input and text_input.strip():
        return {
            "text":           text_input.strip(),
            "language":       "en",
            "source":         "text",
            "no_speech_prob": 0.0,
        }

    return {
        "text":           "",
        "language":       "en",
        "source":         "none",
        "no_speech_prob": 1.0 if audio_present else 0.0,
    }


def _whisper_transcribe(audio_bytes: bytes) -> dict:
    global _whisper_model
    if _whisper_model is None:
        import whisper
        model_size = os.environ.get("WHISPER_MODEL", "base")
        logger.info(f"[speech] Loading Whisper model '{model_size}' (first-use download may take a moment)")
        _whisper_model = whisper.load_model(model_size)

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        result = _whisper_model.transcribe(tmp_path, fp16=False)
        segments = result.get("segments") or []
        no_speech = float(segments[0].get("no_speech_prob", 0.0)) if segments else 0.0
        return {
            "text":           result.get("text", "").strip(),
            "language":       result.get("language", "en"),
            "source":         "whisper",
            "no_speech_prob": no_speech,
        }
    finally:
        os.unlink(tmp_path)
