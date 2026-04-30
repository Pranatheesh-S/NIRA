import { useState, useEffect } from "react";
import { Panel, PanelSpinner, PanelError, PanelEmpty } from "./HeatmapPanel";

const TREND = {
  improving: { cls: "bg-emerald-50 border-emerald-200 text-emerald-700", icon: "↑", label: "Improving" },
  stagnant:  { cls: "bg-gray-100  border-gray-200   text-gray-600",    icon: "→", label: "Stagnant"  },
  declining: { cls: "bg-red-50    border-red-200    text-red-700",     icon: "↓", label: "Declining" },
};

export default function StruggleAlerts({ lessonId }) {
  const [struggles, setStruggles] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    if (!lessonId) return;
    setLoading(true);
    setError("");
    fetch(`/teacher/struggles?lessonId=${lessonId}`)
      .then((r) => r.json())
      .then((d) => { setStruggles(Array.isArray(d) ? d : []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [lessonId]);

  return (
    <Panel
      icon="⚠️"
      title="Silent Struggle Detection"
      badge={struggles.length > 0 ? `${struggles.length} at risk` : null}
      badgeStyle="bg-orange-50 border border-orange-200 text-orange-700"
    >
      {loading && <PanelSpinner />}
      {error   && <PanelError msg={error} />}

      {!loading && !error && struggles.length === 0 && (
        <PanelEmpty text="No students flagged as struggling." />
      )}

      {!loading && !error && struggles.length > 0 && (
        <div className="space-y-2">
          {struggles.map((s) => {
            const t = TREND[s.trend] || TREND.stagnant;
            return (
              <div key={s.studentId} className="flex items-center gap-3 bg-gray-50 hover:bg-gray-100 rounded-xl px-4 py-3 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-sm shrink-0">
                  😕
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700 font-mono truncate">
                    {s.studentId.slice(0, 14)}…
                  </p>
                  <p className="text-xs text-gray-500 capitalize">{s.issue}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400 font-medium">{s.submissionCount} tries</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${t.cls}`}>
                    {t.icon} {t.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
