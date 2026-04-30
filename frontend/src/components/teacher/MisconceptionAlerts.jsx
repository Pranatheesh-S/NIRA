import { useState, useEffect } from "react";
import { Panel, PanelError, PanelEmpty } from "./HeatmapPanel";

export default function MisconceptionAlerts({ lessonId }) {
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!lessonId) return;
    setLoading(true);
    setError("");
    fetch(`/teacher/misconceptions?lessonId=${lessonId}`)
      .then((r) => r.json())
      .then((d) => { setAlerts(Array.isArray(d) ? d : []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [lessonId]);

  return (
    <Panel
      icon="🔔"
      title="Misconception Alerts"
      badge={alerts.length > 0 ? `${alerts.length} flagged` : null}
      badgeStyle="bg-red-50 border border-red-200 text-red-700"
    >
      {loading && (
        <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-indigo-600">
          <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          Generating AI fix suggestions…
        </div>
      )}
      {error && <PanelError msg={error} />}

      {!loading && !error && alerts.length === 0 && (
        <PanelEmpty text="No class-wide misconceptions detected yet." />
      )}

      {!loading && !error && alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.concept} className="rounded-xl bg-red-50 border border-red-100 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <h3 className="text-sm font-bold text-red-800">{alert.concept}</h3>
                </div>
                <span className="shrink-0 text-xs font-semibold bg-white border border-red-200 text-red-600 rounded-full px-2.5 py-0.5">
                  {alert.count} students
                </span>
              </div>
              {alert.suggestion && (
                <div className="flex gap-2 bg-white border border-orange-100 rounded-lg px-3 py-2.5 mt-2">
                  <span className="shrink-0 text-base">💡</span>
                  <p className="text-sm text-gray-700 leading-relaxed">{alert.suggestion}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
