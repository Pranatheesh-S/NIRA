import json
import os
import re

import requests
from dotenv import load_dotenv

_URL = "https://openrouter.ai/api/v1/chat/completions"


def _get_config():
    load_dotenv(override=True)   # re-read .env on every call so restarts aren't needed
    return (
        os.getenv("OPENROUTER_API_KEY", ""),
        os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
    )

# System prompt forces the model to return raw JSON only
_SYSTEM = (
    "You are a structured data extractor. "
    "Always respond with ONLY valid JSON — no markdown fences, no explanation, no extra text."
)


def call_llm(prompt: str) -> str:
    """POST prompt to OpenRouter and return the raw response text."""
    api_key, model = _get_config()

    if not api_key or api_key == "your_openrouter_key":
        raise EnvironmentError("OPENROUTER_API_KEY is not set in backend/.env")

    resp = requests.post(
        _URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=30,
    )

    if not resp.ok:
        print(f"[openrouter] HTTP {resp.status_code}: {resp.text[:300]}")
        resp.raise_for_status()

    return resp.json()["choices"][0]["message"]["content"]


def safe_llm_call(prompt: str) -> str:
    """Call the LLM; retry once on any failure."""
    try:
        return call_llm(prompt)
    except Exception as exc:
        print(f"[openrouter] First attempt failed: {exc}. Retrying…")
        return call_llm(prompt)


def parse_json_safe(text: str) -> dict:
    """Parse LLM output as JSON; fall back to regex extraction on failure."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Model occasionally wraps output in markdown fences — strip to bare JSON
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return {}
