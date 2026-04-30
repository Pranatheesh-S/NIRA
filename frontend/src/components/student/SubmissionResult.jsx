import { getLanguageName, needsTranslation } from "../../services/translationService";

const FLAGS = {
  isReading:     { label: "Possible reading from notes", cls: "bg-orange-50 border-orange-200 text-orange-700" },
  lowQuality:    { label: "Low audio quality",           cls: "bg-red-50    border-red-200    text-red-700"    },
  imageMismatch: { label: "Image mismatch",              cls: "bg-purple-50 border-purple-200 text-purple-700" },
};

export default function SubmissionResult({ result, onTryAgain }) {
  if (!result) return null;

  const { evaluation = {}, language, originalText, transcript, flags = {}, ocrText } = result;
  const { correct = [], incorrect = [], missing = [], confidenceScore = 0, feedback = "" } = evaluation;

  const score      = Math.round(confidenceScore * 100);
  const scoreColor = score >= 70 ? "from-emerald-500 to-teal-500"
                   : score >= 40 ? "from-amber-400 to-orange-400"
                   :               "from-red-500 to-rose-500";
  const scoreLabel = score >= 70 ? "Strong understanding" : score >= 40 ? "Developing" : "Needs work";
  const scoreBg    = score >= 70 ? "text-emerald-700" : score >= 40 ? "text-amber-700" : "text-red-700";
  const activeFlags = Object.entries(flags).filter(([, v]) => v);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* Score hero */}
      <div className={`bg-gradient-to-br ${scoreColor} px-6 py-6 text-white`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">
              AI Evaluation Result
            </p>
            <h3 className="text-2xl font-bold">{score}%</h3>
            <p className="text-white/80 text-sm mt-0.5">{scoreLabel}</p>
          </div>

          {/* Circular-ish gauge */}
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeDasharray={`${score} ${100 - score}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white font-bold text-sm">{score}%</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 bg-white/20 rounded-full h-2 overflow-hidden">
          <div
            className="bg-white h-full rounded-full transition-all duration-700"
            style={{ width: `${score}%` }}
          />
        </div>

        {/* Language badge */}
        {language && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
              🌐 {getLanguageName(language)}
              {needsTranslation(language) && " → English"}
            </span>
          </div>
        )}
      </div>

      <div className="px-6 py-5 space-y-5">

        {/* Concepts */}
        {(correct.length > 0 || incorrect.length > 0 || missing.length > 0) && (
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Concept Breakdown</p>
            <div className="space-y-3">
              {correct.length > 0   && <ConceptRow label="Mastered"     items={correct}    cls="bg-emerald-50 border-emerald-200 text-emerald-700" icon="✓" />}
              {incorrect.length > 0 && <ConceptRow label="Needs Work"   items={incorrect}  cls="bg-amber-50   border-amber-200   text-amber-700"   icon="~" />}
              {missing.length > 0   && <ConceptRow label="Not Covered"  items={missing}    cls="bg-red-50     border-red-200     text-red-700"     icon="✗" />}
            </div>
          </div>
        )}

        {/* AI Feedback */}
        {feedback && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-4 flex gap-3">
            <span className="text-xl shrink-0">💡</span>
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">AI Feedback</p>
              <p className="text-sm text-blue-800 leading-relaxed">{feedback}</p>
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcript && (
          <details className="group">
            <summary className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest cursor-pointer select-none hover:text-gray-600 transition-colors list-none">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              Processed Transcript
            </summary>
            <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              <p className="text-sm text-gray-700 leading-relaxed">{transcript}</p>
              {needsTranslation(language) && originalText && originalText !== transcript && (
                <p className="mt-2 text-xs text-gray-400 italic border-t border-gray-200 pt-2">
                  Original ({getLanguageName(language)}): {originalText}
                </p>
              )}
            </div>
          </details>
        )}

        {/* OCR text */}
        {ocrText && (
          <details className="group">
            <summary className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest cursor-pointer select-none hover:text-gray-600 transition-colors list-none">
              <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
              Extracted Image Text
            </summary>
            <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              <p className="text-sm text-gray-700 font-mono leading-relaxed whitespace-pre-wrap">{ocrText}</p>
            </div>
          </details>
        )}

        {/* Flags */}
        {activeFlags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFlags.map(([key]) =>
              FLAGS[key] ? (
                <span key={key} className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full border px-3 py-1 ${FLAGS[key].cls}`}>
                  ⚑ {FLAGS[key].label}
                </span>
              ) : null
            )}
          </div>
        )}

        {/* Try again */}
        {onTryAgain && (
          <button
            onClick={onTryAgain}
            className="w-full rounded-xl border-2 border-dashed border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-sm font-semibold text-gray-400 hover:text-emerald-700 py-3.5 transition-all cursor-pointer"
          >
            ↺ Try Again
          </button>
        )}
      </div>
    </div>
  );
}

function ConceptRow({ label, items, cls, icon }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((name) => (
          <span key={name} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
            {icon} {name}
          </span>
        ))}
      </div>
    </div>
  );
}
