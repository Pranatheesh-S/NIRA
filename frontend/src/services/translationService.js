/**
 * translationService.js
 *
 * Client-side language utilities.
 * Actual detection + translation is done server-side via the OpenRouter LLM.
 * This file only provides display helpers.
 */

const LANGUAGE_NAMES = {
  en: "English",  ta: "Tamil",    hi: "Hindi",    fr: "French",
  es: "Spanish",  de: "German",   zh: "Chinese",  ar: "Arabic",
  pt: "Portuguese", ru: "Russian", ja: "Japanese", ko: "Korean",
  it: "Italian",  nl: "Dutch",    pl: "Polish",   tr: "Turkish",
  vi: "Vietnamese", th: "Thai",   id: "Indonesian",
};

/**
 * Return the human-readable name for an ISO 639-1 language code.
 * Falls back to the uppercase code if unknown.
 */
export function getLanguageName(code) {
  if (!code) return "Unknown";
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

/**
 * Return the browser's preferred language code (e.g. "en", "ta").
 * Used as a hint — actual detection happens on the backend.
 */
export function getBrowserLanguage() {
  return (navigator.language ?? "en").split("-")[0];
}

/** True if the code likely needs translation (i.e. is not English). */
export function needsTranslation(langCode) {
  return langCode && langCode.toLowerCase() !== "en";
}
