import { useState, useEffect } from "react";

const STATUS = {
  green:  {
    barGradient: "bg-gradient-to-r from-emerald-400 to-teal-500",
    badge:       "bg-emerald-50 border-emerald-200 text-emerald-700",
    label:       "Strong",
    icon:        "✅",
    ring:        "ring-emerald-200",
  },
  yellow: {
    barGradient: "bg-gradient-to-r from-amber-400 to-orange-400",
    badge:       "bg-amber-50 border-amber-200 text-amber-700",
    label:       "Needs Review",
    icon:        "⚠️",
    ring:        "ring-amber-200",
  },
  red: {
    barGradient: "bg-gradient-to-r from-red-500 to-rose-600",
    badge:       "bg-red-50 border-red-200 text-red-700",
    label:       "Critical",
    icon:        "🔴",
    ring:        "ring-red-200",
  },
};

export default function HeatmapPanel({ lessonId }) {
  const [concepts, setConcepts] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (!lessonId) return;
    setLoading(true);
    setError("");
    fetch(`/teacher/heatmap?lessonId=${lessonId}`)
      .then((r) => r.json())
      .then((d) => { setConcepts(d.concepts || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [lessonId]);

  const strongCount   = concepts.filter((c) => c.status === "green").length;
  const reviewCount   = concepts.filter((c) => c.status === "yellow").length;
  const criticalCount = concepts.filter((c) => c.status === "red").length;

  return (
    <Panel
      icon="🌡️"
      title="Class Misconception Heatmap"
      badge={concepts.length > 0 ? `${concepts.length} concepts` : null}
      badgeStyle="bg-gray-100 text-gray-600"
    >
      {loading && <PanelSpinner />}
      {error   && <PanelError msg={error} />}

      {!loading && !error && concepts.length === 0 && (
        <PanelEmpty text="No submissions yet for this lesson." />
      )}

      {!loading && !error && concepts.length > 0 && (
        <div className="space-y-5">

          {/* Summary pills */}
          <div className="flex flex-wrap gap-2">
            <SummaryPill count={strongCount}   label="Strong"       color="bg-emerald-50 border-emerald-200 text-emerald-700" icon="✅" />
            <SummaryPill count={reviewCount}   label="Needs Review" color="bg-amber-50 border-amber-200 text-amber-700"       icon="⚠️" />
            <SummaryPill count={criticalCount} label="Critical"     color="bg-red-50 border-red-200 text-red-700"             icon="🔴" />
          </div>

          {/* Concept bars */}
          <div className="space-y-4">
            {concepts.map((c) => {
              const s = STATUS[c.status] || STATUS.yellow;
              return (
                <div key={c.name} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      <span className="text-base leading-none">{s.icon}</span>
                      {c.name}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${s.badge}`}>
                        {s.label}
                      </span>
                      <span className="text-sm font-bold text-gray-700 w-10 text-right tabular-nums">{c.pct}%</span>
                    </div>
                  </div>

                  {/* Bar */}
                  <div className="relative w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-700 bar-animate ${s.barGradient}`}
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>

                  <div className="flex justify-between mt-1.5">
                    <p className="text-xs text-gray-400">
                      <span className="text-emerald-600 font-medium">{c.correct} understood</span>
                      {" · "}
                      <span className="text-red-500 font-medium">{c.incorrect} struggled</span>
                    </p>
                    <p className="text-xs text-gray-400">{c.correct + c.incorrect} students</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

function SummaryPill({ count, label, color, icon }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${color}`}>
      <span>{icon}</span>
      {count} {label}
    </span>
  );
}

// ── Shared panel shell ───────────────────────────────────────────────────────

export function Panel({ icon, title, badge, badgeStyle, children }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2.5">
        <span className="text-xl">{icon}</span>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {badge && (
          <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${badgeStyle}`}>{badge}</span>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

export function PanelSpinner() {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-gray-400">
      <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      Loading…
    </div>
  );
}

export function PanelError({ msg }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{msg}</p>
  );
}

export function PanelEmpty({ text }) {
  return (
    <p className="text-sm text-gray-400 text-center py-10 italic">{text}</p>
  );
}
