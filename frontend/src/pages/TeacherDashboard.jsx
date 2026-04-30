import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import LessonCard from "../components/LessonCard";
import HeatmapPanel       from "../components/teacher/HeatmapPanel";
import MisconceptionAlerts from "../components/teacher/MisconceptionAlerts";
import StruggleAlerts      from "../components/teacher/StruggleAlerts";
import StudentList         from "../components/teacher/StudentList";
import QuestionPaperGenerator from "./QuestionPaperGenerator";
import DailyQuizPanel        from "../components/teacher/DailyQuizPanel";

const TABS = [
  { id: "lessons",    label: "Lessons",        icon: "📚" },
  { id: "insights",   label: "Class Insights",  icon: "📊" },
  { id: "dailyquiz",  label: "Daily Quiz",      icon: "❓" },
  { id: "qpaper",     label: "Question Paper",  icon: "📋" },
];

export default function TeacherDashboard() {
  const { user, userDoc } = useAuth();
  const navigate = useNavigate();

  const [lessons, setLessons]         = useState([]);
  const [loadingLessons, setLoading]  = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [form, setForm]               = useState({ title: "", content: "" });
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState("");
  const [activeTab, setActiveTab]     = useState("lessons");
  const [selectedLessonId, setSelectedLessonId] = useState("");

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "lessons"), where("teacherId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLessons(docs);
      setLoading(false);
      if (docs.length > 0 && !selectedLessonId) setSelectedLessonId(docs[0].id);
    });
    return unsub;
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateLesson(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setCreateError("Both title and content are required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await addDoc(collection(db, "lessons"), {
        title: form.title.trim(),
        content: form.content.trim(),
        teacherId: user.uid,
        isPublished: false,
        createdAt: serverTimestamp(),
      });
      setForm({ title: "", content: "" });
      setShowCreate(false);
    } catch {
      setCreateError("Failed to save lesson. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    navigate("/login", { replace: true });
  }

  const selectedLesson   = lessons.find((l) => l.id === selectedLessonId);
  const initials         = (userDoc?.name || "T").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const publishedCount   = lessons.filter((l) => l.isPublished).length;
  const draftCount       = lessons.length - publishedCount;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 shadow-lg shadow-indigo-900/20 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)" }}>

        {/* Decorative background shapes */}
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute top-2 right-52 w-28 h-28 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute -bottom-14 left-1/4 w-40 h-40 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/3 w-20 h-20 bg-white/5 rounded-full pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="flex items-center justify-between py-4">

            {/* Brand */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center font-bold text-white text-sm border border-white/25 backdrop-blur-sm shadow-inner">
                  N
                </div>
                <span className="text-white font-bold text-lg tracking-tight hidden sm:block">NIRA</span>
              </div>
              <div className="h-5 w-px bg-white/20 hidden sm:block" />
              <div className="hidden sm:block">
                <p className="text-indigo-200 text-xs font-medium">Teacher Dashboard</p>
                <p className="text-white font-semibold text-sm leading-none mt-0.5">{userDoc?.name ?? "Teacher"}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {activeTab === "lessons" && !showCreate && (
                <button
                  onClick={() => { setShowCreate(true); setCreateError(""); setForm({ title: "", content: "" }); }}
                  className="inline-flex items-center gap-1.5 bg-white text-indigo-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-indigo-50 transition-colors shadow-sm cursor-pointer"
                >
                  <span className="text-base leading-none">+</span> New Lesson
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 text-indigo-200 hover:text-white text-sm font-medium transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-xs font-bold text-white border border-white/20">
                  {initials}
                </div>
                <span className="hidden sm:block">Sign out</span>
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-t-xl transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-slate-50 text-indigo-700 shadow-sm"
                    : "text-indigo-200 hover:text-white hover:bg-white/10"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Stats row (only on lessons + insights tabs) ─────────────────── */}
        {!loadingLessons && !showCreate && activeTab !== "qpaper" && activeTab !== "dailyquiz" && (
          <div className="grid grid-cols-3 gap-4 mb-7 animate-fade-in-up">
            <StatCard
              icon="📚" value={lessons.length}
              label="Total Lessons"
              gradient="from-indigo-500 to-violet-600"
              shadow="shadow-indigo-400/30"
              decoration="📚"
            />
            <StatCard
              icon="🚀" value={publishedCount}
              label="Live to Students"
              gradient="from-emerald-500 to-teal-500"
              shadow="shadow-emerald-400/30"
              decoration="🚀"
            />
            <StatCard
              icon="📝" value={draftCount}
              label="Drafts"
              gradient="from-amber-400 to-orange-500"
              shadow="shadow-amber-400/30"
              decoration="📝"
            />
          </div>
        )}

        {/* ══ TAB: Lessons ══════════════════════════════════════════════════ */}
        {activeTab === "lessons" && (
          <div className="space-y-5">

            {/* Create form */}
            {showCreate && (
              <form onSubmit={handleCreateLesson}
                className="bg-white rounded-2xl border border-indigo-100 shadow-lg shadow-indigo-500/5 p-6 space-y-5 animate-fade-in-up"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">New Lesson</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Add lesson content — NIRA will generate a student prompt from it</p>
                  </div>
                  <button type="button" onClick={() => setShowCreate(false)}
                    className="text-gray-400 hover:text-gray-600 text-sm font-medium cursor-pointer transition-colors">
                    ✕ Cancel
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
                  <input
                    type="text" value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Introduction to Photosynthesis"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Lesson Content</label>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    rows={6} placeholder="Paste or type your lesson material here…"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 resize-none transition shadow-sm"
                  />
                </div>

                {createError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{createError}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button type="submit" disabled={creating}
                    className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-500/20 cursor-pointer">
                    {creating ? "Saving…" : "Save Lesson"}
                  </button>
                  <button type="button" onClick={() => setShowCreate(false)}
                    className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium text-sm px-5 py-2.5 rounded-xl transition-colors cursor-pointer">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {loadingLessons ? (
              <div className="flex justify-center py-20">
                <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : lessons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border-2 border-dashed border-indigo-200">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-3xl flex items-center justify-center text-5xl mb-5 shadow-inner animate-pop-in">
                  📝
                </div>
                <p className="text-gray-800 font-bold text-xl mb-2">No lessons yet</p>
                <p className="text-gray-400 text-sm mb-6 max-w-xs">
                  Create your first lesson and NIRA will generate AI-powered explanation questions for your students.
                </p>
                <button
                  onClick={() => { setShowCreate(true); setCreateError(""); }}
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-lg shadow-indigo-500/25 cursor-pointer transition-all hover:-translate-y-0.5"
                >
                  + Create First Lesson
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {lessons.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: Daily Quiz ══════════════════════════════════════════════ */}
        {activeTab === "dailyquiz" && (
          <DailyQuizPanel />
        )}

        {/* ══ TAB: Question Paper ══════════════════════════════════════════ */}
        {activeTab === "qpaper" && (
          <QuestionPaperGenerator />
        )}

        {/* ══ TAB: Insights ════════════════════════════════════════════════ */}
        {activeTab === "insights" && (
          <div className="space-y-5">

            {/* Lesson selector */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 shrink-0">
                <span className="text-lg">🔭</span>
                Viewing insights for:
              </div>
              {lessons.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No lessons yet — create one in the Lessons tab.</p>
              ) : (
                <select
                  value={selectedLessonId}
                  onChange={(e) => setSelectedLessonId(e.target.value)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition min-w-52 shadow-sm"
                >
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </select>
              )}
              {selectedLesson?.isPublished && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                </span>
              )}
            </div>

            {selectedLessonId ? (
              <>
                <HeatmapPanel        lessonId={selectedLessonId} />
                <MisconceptionAlerts lessonId={selectedLessonId} />
                <StruggleAlerts      lessonId={selectedLessonId} />
                <StudentList         lessonId={selectedLessonId} />
              </>
            ) : (
              <EmptyState icon="📊" title="Select a lesson above" sub="Class insights will appear here" />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, value, label, gradient, shadow, decoration }) {
  return (
    <div className={`relative bg-gradient-to-br ${gradient} rounded-2xl p-5 shadow-lg ${shadow} text-white overflow-hidden`}>
      {/* Background circle decoration */}
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />
      <div className="absolute -bottom-4 -right-2 text-5xl opacity-15 pointer-events-none select-none">{decoration}</div>

      <p className="text-4xl font-extrabold mb-1 relative leading-none">{value}</p>
      <p className="text-xs font-semibold opacity-80 relative flex items-center gap-1.5">
        <span>{icon}</span> {label}
      </p>
    </div>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl mb-4">{icon}</div>
      <p className="text-gray-800 font-semibold text-base mb-1">{title}</p>
      <p className="text-gray-400 text-sm">{sub}</p>
    </div>
  );
}
