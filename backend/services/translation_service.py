"""
translation_service.py
Detects the language of a text and translates it to English.
Uses the OpenRouter LLM already configured in openrouter_service.py.
No external translation API needed.
"""

from services.openrouter_service import safe_llm_call, parse_json_safe

_PROMPT = """\
Detect the language of the text below and translate it to English if it is not already in English.

Text:
\"\"\"{text}\"\"\"

Return ONLY this JSON — no markdown, no explanation:
{{
  "language":     "<ISO 639-1 code, e.g. en, ta, hi, fr, es, de, zh, ar>",
  "languageName": "<full English name of the language>",
  "translatedText": "<English translation — copy original text if it is already English>",
  "isEnglish":    <true or false>
}}"""


def detect_and_translate(text: str) -> dict:
    """
    Detect language and translate to English.

    Returns:
        {
            "language":      str  — ISO 639-1 code,
            "languageName":  str  — human-readable name,
            "translatedText":str  — English version of the text,
            "isEnglish":     bool
        }
    """
    if not text or not text.strip():
        return {
            "language": "en",
            "languageName": "English",
            "translatedText": text,
            "isEnglish": True,
        }

    # Limit input length to stay within token budget
    raw = safe_llm_call(_PROMPT.format(text=text[:1500]))
    parsed = parse_json_safe(raw)

    return {
        "language":      parsed.get("language", "en") or "en",
        "languageName":  parsed.get("languageName", "English") or "English",
        "translatedText":parsed.get("translatedText", text) or text,
        "isEnglish":     bool(parsed.get("isEnglish", True)),
    }
