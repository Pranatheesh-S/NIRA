import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

const STATUS_STYLES = {
  correct: { badge: "bg-emerald-100 text-emerald-700", icon: "✓" },
  weak:    { badge: "bg-yellow-100  text-yellow-700",  icon: "~" },
  wrong:   { badge: "bg-red-100     text-red-700",     icon: "✗" },
};

const FLAG_LABELS = {
  isReading:      { label: "Reading from notes", style: "bg-orange-100 text-orange-700"  },
  lowQuality:     { label: "Low audio quality",  style: "bg-red-100    text-red-700"     },
  imageMismatch:  { label: "Image mismatch",     style: "bg-purple-100 text-purple-700"  },
};

export default function StudentList({ lessonId }) {
  const [students, setStudents]           = useState([]);
  const [loading, setLoading]             = useState(false);
  const [expandedId, setExpandedId]       = useState(null);
  const [drillData, setDrillData]         = useState({});   // { [studentId]: {...} }
  const [drillLoading, setDrillLoading]   = useState({});
  const [error, setError]                 = useState("");

  // ── Load unique students who submitted for this lesson ──────────────────
  useEffect(() => {
    if (!lessonId) return;
    setLoading(true);
    setError("");
    setExpandedId(null);
    setDrillData({});

    async function loadStudents() {
      try {
        const q = query(
          collection(db, "submissions"),
          where("lessonId", "==", lessonId)
        );
        const snap = await getDocs(q);

        // Unique student IDs
        const uniqueIds = [...new Set(snap.docs.map((d) => d.data().studentId).filter(Boolean))];

        // Fetch user names from Firestore
        const userDocs = await Promise.all(
          uniqueIds.map((id) => getDoc(doc(db, "users", id)))
        );

        const list = uniqueIds.map((id, i) => ({
          id,
          name: userDocs[i].exists() ? (userDocs[i].data().name || id) : id,
        }));

        setStudents(list);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    loadStudents();
  }, [lessonId]);

  // ── Load drill-down data for a student on expand ─────────────────────────
  async function handleExpand(studentId) {
    if (expandedId === studentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(studentId);

    if (drillData[studentId]) return; // already fetched

    setDrillLoading((prev) => ({ ...prev, [studentId]: true }));
    try {
      const res  = await fetch(`/teacher/student/${studentId}?lessonId=${lessonId}`);
      const data = await res.json();
      setDrillData((prev) => ({ ...prev, [studentId]: data }));
    } catch (e) {
      setDrillData((prev) => ({ ...prev, [studentId]: { error: e.message } }));
    } finally {
      setDrillLoading((prev) => ({ ...prev, [studentId]: false }));
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <span className="text-lg">👥</span>
        <h2 className="text-base font-semibold text-gray-900">Student Drill-Down</h2>
        <span className="ml-auto text-xs text-gray-400">
          {students.length} student{students.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="divide-y divide-gray-100">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <p className="mx-6 my-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {!loading && !error && students.length === 0 && (
          <p className="text-sm text-gray-400 italic text-center py-8 px-6">
            No student submissions found for this lesson.
          </p>
        )}

        {!loading && !error && students.map((student) => {
          const isOpen  = expandedId === student.id;
          const drill   = drillData[student.id];
          const loading = drillLoading[student.id];

          return (
            <div key={student.id}>
              {/* ── Student row ────────────────────────────────────── */}
              <button
                onClick={() => handleExpand(student.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors text-left cursor-pointer"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{student.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    {student.id.slice(0, 16)}…
                  </p>
                </div>
                <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
              </button>

              {/* ── Drill-down panel ────────────────────────────────── */}
              {isOpen && (
                <div className="px-6 pb-6 pt-2 bg-gray-50 border-t border-gray-100 space-y-5">
                  {loading && (
                    <div className="flex justify-center py-6">
                      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}

                  {drill?.error && (
                    <p className="text-sm text-red-600">Error: {drill.error}</p>
                  )}

                  {drill && !drill.error && (
                    <>
                      {/* Flags */}
                      {drill.flags && Object.keys(drill.flags).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(drill.flags).map(([key, val]) =>
                            val && FLAG_LABELS[key] ? (
                              <span
                                key={key}
                                className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${FLAG_LABELS[key].style}`}
                              >
                                {FLAG_LABELS[key].label}
                              </span>
                            ) : null
                          )}
                        </div>
                      )}

                      {/* Concept map */}
                      {drill.concepts.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                            Concept Status
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {drill.concepts.map((c) => {
                              const s = STATUS_STYLES[c.status] || STATUS_STYLES.weak;
                              return (
                                <span
                                  key={c.name}
                                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${s.badge}`}
                                >
                                  {s.icon} {c.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">
                          No concept data available.
                        </p>
                      )}

                      {/* Transcript */}
                      {drill.transcript && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                            Transcript
                          </p>
                          <p className="text-sm text-gray-700 leading-relaxed bg-white rounded-xl border border-gray-200 px-4 py-3">
                            {drill.transcript}
                          </p>
                        </div>
                      )}

                      {/* Audio */}
                      {drill.audioUrl && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
                            Audio Recording
                          </p>
                          <audio
                            controls
                            src={drill.audioUrl}
                            className="w-full rounded-lg"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
