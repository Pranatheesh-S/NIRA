import { useState, useRef } from "react";

const GRADE_CONFIG = {
  Excellent:       { color: "from-emerald-500 to-teal-500",    badge: "bg-emerald-100 text-emerald-700 border-emerald-300",    icon: "🌟" },
  Good:            { color: "from-blue-500 to-indigo-500",     badge: "bg-blue-100 text-blue-700 border-blue-300",            icon: "👍" },
  Average:         { color: "from-amber-400 to-orange-400",    badge: "bg-amber-100 text-amber-700 border-amber-300",         icon: "✏️" },
  "Needs Practice":{ color: "from-orange-500 to-red-400",      badge: "bg-orange-100 text-orange-700 border-orange-300",      icon: "💪" },
  Poor:            { color: "from-red-500 to-rose-600",        badge: "bg-red-100 text-red-700 border-red-300",               icon: "📖" },
};

export default function HandwritingAnalysis() {
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [analysing,    setAnalysing]    = useState(false);
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState("");
  const [dragging,     setDragging]     = useState(false);
  const [showText,     setShowText]     = useState(false);
  const inputRef = useRef(null);

  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please select a valid image file (JPEG, PNG, or WebP).");
      return;
    }
    setError("");
    setResult(null);
    setShowText(false);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  }

  function onInputChange(e) { handleFile(e.target.files?.[0]); }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  function reset() {
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setError("");
    setShowText(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function analyse() {
    if (!imageFile) return;
    setError("");
    setAnalysing(true);
    try {
      const form = new FormData();
      form.append("image", imageFile);
      const res  = await fetch("/api/handwriting/analyse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalysing(false);
    }
  }

  const cfg = result ? (GRADE_CONFIG[result.grade] || GRADE_CONFIG["Average"]) : null;

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* ── Banner ─────────────────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-6 text-white overflow-hidden shadow-lg shadow-violet-500/20">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-10 text-7xl opacity-15 pointer-events-none select-none">✍️</div>
        <p className="text-violet-100 text-xs font-semibold uppercase tracking-widest mb-1">AI Handwriting Coach</p>
        <h2 className="text-2xl font-extrabold mb-1 relative">Improve Your Writing</h2>
        <p className="text-violet-100 text-sm relative">
          Upload a photo of your handwriting and get an instant score with personalised tips.
        </p>
      </div>

      {/* ── Upload area ────────────────────────────────────────────────────── */}
      {!result && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">Upload Handwriting Sample</h3>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-all cursor-pointer py-10
              ${dragging
                ? "border-violet-400 bg-violet-50"
                : imagePreview
                  ? "border-violet-300 bg-violet-50/40"
                  : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/30"
              }`}
          >
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Handwriting preview"
                className="max-h-64 rounded-xl object-contain shadow-sm pointer-events-none"
              />
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center text-3xl shadow-inner">
                  ✍️
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">Drop your image here</p>
                  <p className="text-xs text-gray-400 mt-0.5">or click to browse — JPEG, PNG, WebP accepted</p>
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={onInputChange}
              className="hidden"
            />
          </div>

          {imagePreview && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="flex-1 truncate font-medium text-gray-700">{imageFile?.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); reset(); }}
                className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer font-medium"
              >
                ✕ Remove
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">⚠ {error}</p>
          )}

          <button
            onClick={analyse}
            disabled={!imageFile || analysing}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-40 text-white font-bold text-sm shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 cursor-pointer disabled:cursor-not-allowed"
          >
            {analysing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Analysing your handwriting…
              </span>
            ) : "Analyse Handwriting →"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Tips: use good lighting, hold the camera directly above the page, avoid blurry shots.
          </p>
        </div>
      )}

      {/* ── Result ─────────────────────────────────────────────────────────── */}
      {result && cfg && (
        <div className="space-y-4 animate-fade-in-up">

          {/* Score hero */}
          <div className={`relative bg-gradient-to-br ${cfg.color} rounded-2xl p-6 text-white overflow-hidden shadow-lg`}>
            <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-8 text-6xl opacity-15 pointer-events-none select-none">{cfg.icon}</div>

            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-2">Handwriting Score</p>

            <div className="flex items-center gap-5">
              {/* Circular gauge */}
              <div className="relative w-20 h-20 shrink-0">
                <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3"
                    strokeDasharray={`${result.rating * 10} ${100 - result.rating * 10}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-extrabold leading-none">{result.rating}</span>
                  <span className="text-white/70 text-xs leading-none">/10</span>
                </div>
              </div>

              <div>
                <p className="text-3xl font-extrabold leading-none mb-1">{result.grade}</p>
                <p className="text-white/80 text-sm leading-snug max-w-xs">{result.summary}</p>
              </div>
            </div>
          </div>

          {/* Strengths */}
          {result.strengths?.length > 0 && (
            <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
              <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 text-base flex items-center justify-center">✓</span>
                What You're Doing Well
              </h4>
              <ul className="space-y-2">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {result.suggestions?.length > 0 && (
            <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
              <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 text-base flex items-center justify-center">💡</span>
                Improvement Tips
              </h4>
              <ul className="space-y-2.5">
                {result.suggestions.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-sm text-gray-700 leading-snug">{tip}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Focus area */}
          {result.focus_area && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
              <span className="text-2xl shrink-0">🎯</span>
              <div>
                <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-0.5">Top Priority</p>
                <p className="text-sm text-amber-900 font-medium leading-snug">{result.focus_area}</p>
              </div>
            </div>
          )}

          {/* Extracted text (collapsed by default) */}
          {result.extracted_text && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setShowText((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">📄</span> Text extracted by OCR
                </span>
                <span className="text-gray-400 text-xs">{showText ? "▲ Hide" : "▼ Show"}</span>
              </button>
              {showText && (
                <div className="px-5 pb-4">
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3 leading-relaxed font-mono">
                    {result.extracted_text}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Confidence metric (small) */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-2xl border border-gray-100 px-5 py-3">
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-500 mb-1">OCR Legibility Confidence</p>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 bar-animate"
                  style={{ width: `${Math.round(result.avg_confidence * 100)}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-bold text-gray-700 shrink-0">
              {Math.round(result.avg_confidence * 100)}%
            </span>
          </div>

          {/* Image thumbnail + try again */}
          <div className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            {imagePreview && (
              <img src={imagePreview} alt="Submitted sample" className="w-16 h-16 rounded-xl object-cover border border-gray-200 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 truncate">{imageFile?.name}</p>
              <p className="text-xs text-gray-400">Analysed sample</p>
            </div>
            <button
              onClick={reset}
              className="shrink-0 text-sm font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-4 py-2 rounded-xl transition cursor-pointer"
            >
              Try Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
