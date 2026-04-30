import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import AudioRecorder    from "../components/student/AudioRecorder";
import ImageUpload      from "../components/student/ImageUpload";
import SubmissionResult from "../components/student/SubmissionResult";
import { createImagePreview } from "../services/ocrService";

// ── Constants ─────────────────────────────────────────────────────────────────

const LETTERS = ["A", "B", "C", "D"];

const MODES = [
  { id: "voice",      icon: "🎙",  label: "Voice / Text"  },
  { id: "multimodal", icon: "🖼️", label: "Image + Voice" },
];

const CARD_PALETTES = [
  { strip: "from-violet-500 to-purple-600", icon: "bg-gradient-to-br from-violet-500 to-purple-600", accent: "text-violet-600", border: "border-violet-100", hover: "hover:border-violet-300", emoji: "🔬" },
  { strip: "from-blue-500 to-indigo-600",   icon: "bg-gradient-to-br from-blue-500 to-indigo-600",   accent: "text-blue-600",   border: "border-blue-100",   hover: "hover:border-blue-300",   emoji: "📐" },
  { strip: "from-emerald-500 to-teal-600",  icon: "bg-gradient-to-br from-emerald-500 to-teal-600",  accent: "text-emerald-600", border: "border-emerald-100", hover: "hover:border-emerald-300", emoji: "🌿" },
  { strip: "from-orange-500 to-amber-500",  icon: "bg-gradient-to-br from-orange-500 to-amber-500",  accent: "text-orange-600", border: "border-orange-100", hover: "hover:border-orange-300", emoji: "⚡" },
  { strip: "from-pink-500 to-rose-600",     icon: "bg-gradient-to-br from-pink-500 to-rose-600",     accent: "text-pink-600",   border: "border-pink-100",   hover: "hover:border-pink-300",   emoji: "🎯" },
  { strip: "from-cyan-500 to-sky-600",      icon: "bg-gradient-to-br from-cyan-500 to-sky-600",      accent: "text-cyan-600",   border: "border-cyan-100",   hover: "hover:border-cyan-300",   emoji: "🌊" },
];

const DIFF_STYLE = {
  easy:   "bg-emerald-50 border-emerald-200 text-emerald-700",
  medium: "bg-blue-50 border-blue-200 text-blue-700",
  hard:   "bg-red-50 border-red-200 text-red-700",
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function StudentDashboard() {
  const { user, userDoc } = useAuth();
  const navigate = useNavigate();

  // Top-level mode
  const [mainTab, setMainTab] = useState("lessons"); // "lessons" | "quiz"

  // ── Lessons state ─────────────────────────────────────────────────────────
  const [lessons, setLessons]         = useState([]);
  const [loadingLessons, setLoading]  = useState(true);
  const [selectedLesson, setSelected] = useState(null);
  const [mode, setMode]               = useState("voice");
  const [audioBlob, setAudioBlob]     = useState(null);
  const [liveTranscript, setLiveTx]   = useState("");
  const [textInput, setTextInput]     = useState("");
  const [imageFile, setImageFile]     = useState(null);
  const [imagePreview, setImgPreview] = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult]           = useState(null);

  // ── Daily Quiz state ──────────────────────────────────────────────────────
  const [quizzes,        setQuizzes]        = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [pendingCount,   setPendingCount]   = useState(0);
  const [activeQuiz,     setActiveQuiz]     = useState(null);   // quiz object user is answering
  const [quizAnswers,    setQuizAnswers]    = useState({});     // {questionId: answerText}
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [quizError,      setQuizError]      = useState("");
  const [quizResult,     setQuizResult]     = useState(null);   // {evaluated, totalScore, maxScore}

  // ── Load lessons ──────────────────────────────────────────────────────────

  useEffect(() => {
    const q = query(collection(db, "lessons"), where("isPublished", "==", true));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setLessons(docs);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Load daily quizzes ────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    fetchQuizzes();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchQuizzes() {
    if (!user) return;
    setLoadingQuizzes(true);
    try {
      const res  = await fetch(`/api/daily-quiz/active?studentId=${user.uid}`);
      const data = await res.json();
      const list = data.quizzes || [];
      setQuizzes(list);
      setPendingCount(list.filter((q) => !q.answered).length);
    } catch {
      /* silently fail — badge just won't show */
    } finally {
      setLoadingQuizzes(false);
    }
  }

  // ── Lessons helpers ───────────────────────────────────────────────────────

  function selectLesson(lesson) { setSelected(lesson); resetForm(); }

  function resetForm() {
    setAudioBlob(null); setLiveTx(""); setTextInput("");
    setImageFile(null); setImgPreview(null);
    setSubmitError(""); setResult(null);
  }

  function handleRecordingComplete(blob, transcript) {
    setAudioBlob(blob); setLiveTx(transcript);
  }

  async function handleImageSelect(file) {
    setImageFile(file);
    setImgPreview(file ? await createImagePreview(file) : null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");
    if (!audioBlob && !textInput.trim()) {
      setSubmitError("Please record audio or type your explanation before submitting.");
      return;
    }
    if (mode === "multimodal" && !imageFile) {
      setSubmitError("Please upload an image for the image + voice submission.");
      return;
    }
    const formData = new FormData();
    formData.append("studentId", user.uid);
    formData.append("lessonId",  selectedLesson.id);
    if (textInput.trim())      formData.append("text",           textInput.trim());
    if (liveTranscript.trim()) formData.append("liveTranscript", liveTranscript.trim());
    if (audioBlob)             formData.append("audio", audioBlob, "recording.webm");
    if (mode === "multimodal" && imageFile) formData.append("image", imageFile);
    const endpoint = mode === "multimodal" ? "/api/submissions/image-explain" : "/api/submissions/explain";
    setSubmitting(true);
    try {
      const res  = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setResult(data);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Daily Quiz helpers ────────────────────────────────────────────────────

  function openQuiz(quiz) {
    const initial = {};
    (quiz.questions || []).forEach((q) => { initial[q.id] = null; });
    setQuizAnswers(initial);
    setActiveQuiz(quiz);
    setQuizResult(null);
    setQuizError("");
  }

  function closeQuiz() {
    setActiveQuiz(null);
    setQuizResult(null);
    setQuizError("");
  }

  async function handleQuizSubmit(e) {
    e.preventDefault();
    setQuizError("");

    const answers = (activeQuiz.questions || []).map((q) => ({
      questionId: q.id,
      selected:   quizAnswers[q.id] || "",
    }));

    setSubmittingQuiz(true);
    try {
      const res  = await fetch("/api/daily-quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId:      activeQuiz.id,
          studentId:   user.uid,
          studentName: userDoc?.name || "Student",
          answers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setQuizResult(data);
      fetchQuizzes(); // refresh pending count
    } catch (err) {
      setQuizError(err.message);
    } finally {
      setSubmittingQuiz(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    navigate("/login", { replace: true });
  }

  const firstName = (userDoc?.name || "Student").split(" ")[0];
  const initials  = (userDoc?.name || "S").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 shadow-lg shadow-emerald-900/20 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #059669 0%, #0d9488 100%)" }}>
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute top-3 right-44 w-24 h-24 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute -bottom-10 left-1/3 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />

        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between relative">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center font-bold text-white text-sm border border-white/25 backdrop-blur-sm">N</div>
              <span className="text-white font-bold text-lg tracking-tight hidden sm:block">NIRA</span>
            </div>
            <div className="h-5 w-px bg-white/20 hidden sm:block" />
            <div className="hidden sm:block">
              <p className="text-emerald-100 text-xs font-medium">Student Dashboard</p>
              <p className="text-white font-semibold text-sm leading-none mt-0.5">{userDoc?.name ?? "Student"}</p>
            </div>
          </div>

          {(selectedLesson || activeQuiz) ? (
            <button
              onClick={() => { setSelected(null); resetForm(); closeQuiz(); }}
              className="inline-flex items-center gap-1.5 text-emerald-100 hover:text-white text-sm font-medium transition-colors cursor-pointer bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl"
            >
              ← Back
            </button>
          ) : (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-emerald-200 hover:text-white text-sm font-medium transition-colors cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-xs font-bold text-white border border-white/20">{initials}</div>
              <span className="hidden sm:block">Sign out</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">

        {/* ══ Top-level tabs (only on home views) ══════════════════════════ */}
        {!selectedLesson && !activeQuiz && !quizResult && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
            <button
              onClick={() => setMainTab("lessons")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                mainTab === "lessons" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              📚 Lessons
            </button>
            <button
              onClick={() => setMainTab("quiz")}
              className={`relative flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                mainTab === "quiz" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              ❓ Daily Quiz
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            LESSONS TAB
            ══════════════════════════════════════════════════════════════ */}
        {mainTab === "lessons" && (
          <>
            {/* ── Lesson grid ──────────────────────────────────────────────── */}
            {!selectedLesson && (
              <>
                {/* Welcome banner */}
                <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 mb-6 text-white overflow-hidden shadow-lg shadow-emerald-500/20 animate-fade-in-up">
                  <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
                  <div className="absolute bottom-0 right-12 text-7xl opacity-15 pointer-events-none select-none">🎓</div>
                  <p className="text-emerald-100 text-xs font-semibold uppercase tracking-widest mb-1">Welcome back</p>
                  <h2 className="text-2xl font-extrabold mb-1 relative">{firstName}!</h2>
                  <p className="text-emerald-100 text-sm relative">Pick a lesson below and explain it to get instant AI feedback.</p>
                </div>

                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-bold text-gray-900">Available Lessons</h3>
                  {!loadingLessons && (
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                      {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}
                    </span>
                  )}
                </div>

                {loadingLessons ? (
                  <div className="flex justify-center py-20">
                    <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : lessons.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-2xl border-2 border-dashed border-emerald-200">
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-3xl flex items-center justify-center text-5xl mb-5 animate-pop-in">📚</div>
                    <p className="text-gray-700 font-bold text-lg mb-1">No lessons yet</p>
                    <p className="text-gray-400 text-sm">Check back soon — your teacher will publish lessons here.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {lessons.map((lesson, idx) => {
                      const palette = CARD_PALETTES[idx % CARD_PALETTES.length];
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => selectLesson(lesson)}
                          className={`text-left bg-white rounded-2xl border ${palette.border} ${palette.hover} shadow-sm hover:shadow-lg hover:-translate-y-1 overflow-hidden transition-all duration-200 cursor-pointer group animate-fade-in-up stagger-${Math.min(idx + 1, 6)}`}
                        >
                          <div className={`h-1.5 w-full bg-gradient-to-r ${palette.strip}`} />
                          <div className="p-5">
                            <div className="flex items-start gap-3 mb-3">
                              <div className={`w-11 h-11 rounded-xl ${palette.icon} flex items-center justify-center text-white text-xl shadow-sm shrink-0`}>
                                {palette.emoji}
                              </div>
                              <h3 className="text-sm font-bold text-gray-900 group-hover:text-gray-700 transition-colors leading-snug flex-1 mt-1">
                                {lesson.title}
                              </h3>
                            </div>
                            <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-4">
                              {lesson.studentPrompt || lesson.content}
                            </p>
                            <span className={`text-xs font-bold ${palette.accent} flex items-center gap-1`}>
                              Start explaining <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── Submission form ──────────────────────────────────────────── */}
            {selectedLesson && !result && (
              <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in-up">
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl px-5 py-4">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">Your Question</p>
                  <p className="text-base text-emerald-900 font-semibold leading-relaxed">
                    {selectedLesson.studentPrompt || selectedLesson.title}
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex border-b border-gray-100">
                    {MODES.map((m) => (
                      <button key={m.id} type="button"
                        onClick={() => { setMode(m.id); resetForm(); }}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition-colors cursor-pointer ${
                          mode === m.id ? "bg-emerald-50 text-emerald-700 border-b-2 border-emerald-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span>{m.icon}</span> {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="p-6 space-y-6">
                    {mode === "multimodal" && <ImageUpload onSelect={handleImageSelect} preview={imagePreview} />}
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                        Record Your Explanation <span className="ml-2 font-normal normal-case text-gray-400">(or type below)</span>
                      </p>
                      <AudioRecorder onRecordingComplete={handleRecordingComplete} disabled={submitting} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                        Type Your Explanation <span className="ml-2 font-normal normal-case text-gray-400">(optional)</span>
                      </label>
                      <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} rows={4}
                        placeholder={mode === "multimodal" ? "Describe what you see in the image…" : "Type your explanation here…"}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 leading-relaxed outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 resize-none transition"
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700 border border-blue-100">
                      <span className="text-base">🌐</span>
                      <p>Speak or type in <strong>any language</strong> — NIRA will auto-detect and evaluate it.</p>
                    </div>
                    {submitError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{submitError}</p>}
                    <button type="submit" disabled={submitting}
                      className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-semibold py-3.5 text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer hover:-translate-y-0.5">
                      {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Analysing your explanation…
                        </span>
                      ) : "Submit Explanation →"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* ── Lesson result ─────────────────────────────────────────────── */}
            {selectedLesson && result && (
              <div className="space-y-4 animate-fade-in-up">
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl px-5 py-3">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-0.5">Lesson</p>
                  <p className="text-sm text-emerald-900 font-semibold">{selectedLesson.title}</p>
                </div>
                <SubmissionResult result={result} onTryAgain={() => { setResult(null); resetForm(); }} />
                <div className="text-center pt-2">
                  <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">Sign out</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            DAILY QUIZ TAB
            ══════════════════════════════════════════════════════════════ */}
        {mainTab === "quiz" && (
          <>
            {/* ── Quiz list ─────────────────────────────────────────────────── */}
            {!activeQuiz && !quizResult && (
              <div className="animate-fade-in-up">
                {/* Banner */}
                <div className="relative bg-gradient-to-br from-fuchsia-500 to-pink-600 rounded-2xl p-6 mb-6 text-white overflow-hidden shadow-lg shadow-fuchsia-500/20">
                  <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
                  <div className="absolute bottom-0 right-12 text-7xl opacity-15 pointer-events-none select-none">❓</div>
                  <p className="text-fuchsia-100 text-xs font-semibold uppercase tracking-widest mb-1">Daily Quiz</p>
                  <h2 className="text-2xl font-extrabold mb-1 relative">Test Your Knowledge</h2>
                  <p className="text-fuchsia-100 text-sm relative">
                    Answer your teacher's multiple-choice questions and see your score instantly.
                  </p>
                </div>

                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-bold text-gray-900">Available Quizzes</h3>
                  {!loadingQuizzes && (
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                      {pendingCount} pending
                    </span>
                  )}
                </div>

                {loadingQuizzes ? (
                  <div className="flex justify-center py-20">
                    <div className="w-7 h-7 border-2 border-fuchsia-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : quizzes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-2xl border-2 border-dashed border-fuchsia-200">
                    <div className="w-20 h-20 bg-gradient-to-br from-fuchsia-100 to-pink-100 rounded-3xl flex items-center justify-center text-5xl mb-5 animate-pop-in">❓</div>
                    <p className="text-gray-700 font-bold text-lg mb-1">No quizzes yet</p>
                    <p className="text-gray-400 text-sm">Your teacher hasn't published any daily quizzes yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {quizzes.map((quiz, idx) => {
                      const diffStyle = DIFF_STYLE[quiz.difficulty] || DIFF_STYLE.medium;
                      const totalM    = (quiz.questions || []).reduce((s, q) => s + (q.marks || 0), 0);
                      return (
                        <div
                          key={quiz.id}
                          className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all animate-fade-in-up stagger-${Math.min(idx + 1, 6)} ${
                            quiz.answered ? "border-gray-100 opacity-70" : "border-fuchsia-100 hover:border-fuchsia-300 hover:shadow-md"
                          }`}
                        >
                          <div className={`h-1.5 w-full bg-gradient-to-r ${quiz.answered ? "from-gray-200 to-gray-300" : "from-fuchsia-500 to-pink-500"}`} />
                          <div className="p-5 flex items-start gap-4">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-sm shrink-0 ${
                              quiz.answered
                                ? "bg-gray-100 text-gray-400"
                                : "bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white"
                            }`}>
                              {quiz.answered ? "✓" : "❓"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="text-sm font-bold text-gray-900 truncate">{quiz.topic}</h3>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${diffStyle}`}>
                                  {quiz.difficulty || "medium"}
                                </span>
                                {quiz.answered && (
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500">
                                    Completed
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">
                                {(quiz.questions || []).length} questions · {totalM} marks
                                {quiz.dueDate && ` · Due ${quiz.dueDate}`}
                              </p>
                            </div>
                            {!quiz.answered && (
                              <button
                                onClick={() => openQuiz(quiz)}
                                className="shrink-0 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-700 hover:to-pink-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm shadow-fuchsia-500/20 cursor-pointer"
                              >
                                Start →
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Quiz form ─────────────────────────────────────────────────── */}
            {activeQuiz && !quizResult && (
              <form onSubmit={handleQuizSubmit} className="space-y-5 animate-fade-in-up">
                {/* Quiz header */}
                <div className="bg-gradient-to-br from-fuchsia-50 to-pink-50 border border-fuchsia-200 rounded-2xl px-5 py-4">
                  <p className="text-xs font-semibold text-fuchsia-600 uppercase tracking-widest mb-1">Daily Quiz</p>
                  <h3 className="text-base text-fuchsia-900 font-bold">{activeQuiz.topic}</h3>
                  <p className="text-xs text-fuchsia-500 mt-0.5">
                    {(activeQuiz.questions || []).length} questions ·{" "}
                    {(activeQuiz.questions || []).reduce((s, q) => s + (q.marks || 0), 0)} total marks
                  </p>
                </div>

                {/* Questions — MCQ */}
                <div className="space-y-4">
                  {(activeQuiz.questions || []).map((q, idx) => {
                    const selected = quizAnswers[q.id];
                    return (
                      <div key={q.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <span className="w-6 h-6 rounded-lg bg-fuchsia-100 text-fuchsia-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <p className="text-sm font-semibold text-gray-800 leading-snug">{q.text}</p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-fuchsia-600 bg-fuchsia-50 border border-fuchsia-200 rounded-full px-2.5 py-0.5">
                            {q.marks} {q.marks === 1 ? "mark" : "marks"}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {LETTERS.map((letter, i) => {
                            const optText = (q.options || [])[i] || "";
                            const isChosen = selected === letter;
                            return (
                              <button
                                key={letter}
                                type="button"
                                onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: letter }))}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all cursor-pointer ${
                                  isChosen
                                    ? "border-fuchsia-400 bg-fuchsia-50 shadow-sm shadow-fuchsia-200"
                                    : "border-gray-200 bg-gray-50 hover:border-fuchsia-200 hover:bg-fuchsia-50/40"
                                }`}
                              >
                                <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                                  isChosen
                                    ? "bg-fuchsia-600 text-white"
                                    : "bg-gray-200 text-gray-600"
                                }`}>
                                  {letter}
                                </span>
                                <span className={`text-sm leading-snug ${isChosen ? "text-fuchsia-800 font-semibold" : "text-gray-700"}`}>
                                  {optText || <span className="italic text-gray-400">—</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {quizError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">⚠ {quizError}</p>
                )}

                <button
                  type="submit"
                  disabled={submittingQuiz}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-700 hover:to-pink-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-fuchsia-500/20 transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                  {submittingQuiz ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Submitting…
                    </span>
                  ) : "Submit Answers →"}
                </button>
              </form>
            )}

            {/* ── Quiz result ───────────────────────────────────────────────── */}
            {quizResult && (
              <div className="space-y-4 animate-fade-in-up">
                {/* Score hero */}
                {(() => {
                  const pct = quizResult.maxScore > 0
                    ? Math.round((quizResult.totalScore / quizResult.maxScore) * 100) : 0;
                  const heroGrad = pct >= 80 ? "from-emerald-500 to-teal-500" : pct >= 50 ? "from-amber-400 to-orange-400" : "from-red-500 to-rose-500";
                  const heroLabel = pct >= 80 ? "Excellent work! 🌟" : pct >= 50 ? "Good effort! Keep going 💪" : "Keep practising! 📚";
                  return (
                    <div className={`bg-gradient-to-br ${heroGrad} rounded-2xl px-6 py-6 text-white relative overflow-hidden`}>
                      <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full pointer-events-none" />
                      <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Quiz Result · {activeQuiz?.topic}</p>
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-4xl font-extrabold">{quizResult.totalScore}<span className="text-xl font-semibold opacity-70">/{quizResult.maxScore}</span></p>
                          <p className="text-white/80 text-sm mt-0.5">{heroLabel}</p>
                        </div>
                        {/* Mini gauge */}
                        <div className="relative w-16 h-16 ml-auto">
                          <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3"
                              strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">{pct}%</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Per-question MCQ breakdown */}
                <div className="space-y-3">
                  {(quizResult.evaluated || []).map((ans, idx) => {
                    const isCorrect  = ans.isCorrect;
                    const rowBorder  = isCorrect ? "border-emerald-200" : "border-red-200";
                    const badgeColor = isCorrect
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-red-50 border-red-200 text-red-700";
                    return (
                      <div key={idx} className={`bg-white rounded-2xl border ${rowBorder} shadow-sm p-5 space-y-3`}>
                        {/* Question header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <span className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                              {idx + 1}
                            </span>
                            <p className="text-sm font-semibold text-gray-800 leading-snug">{ans.questionText}</p>
                          </div>
                          <span className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full border ${badgeColor}`}>
                            {ans.score}/{ans.marks}
                          </span>
                        </div>

                        {/* Options grid */}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {LETTERS.map((letter, i) => {
                            const optText    = (ans.options || [])[i] || "";
                            const isAnswerCorrect = letter === ans.correct;
                            const wasSelected     = letter === ans.selected;
                            const isWrongPick     = wasSelected && !isAnswerCorrect;

                            let optStyle, badgeStyle;
                            if (isAnswerCorrect) {
                              optStyle   = "border-emerald-400 bg-emerald-50";
                              badgeStyle = "bg-emerald-600 text-white";
                            } else if (isWrongPick) {
                              optStyle   = "border-red-400 bg-red-50";
                              badgeStyle = "bg-red-500 text-white";
                            } else {
                              optStyle   = "border-gray-200 bg-gray-50 opacity-60";
                              badgeStyle = "bg-gray-200 text-gray-500";
                            }

                            return (
                              <div
                                key={letter}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${optStyle}`}
                              >
                                <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${badgeStyle}`}>
                                  {letter}
                                </span>
                                <span className="text-sm text-gray-700 leading-snug flex-1">
                                  {optText || "—"}
                                </span>
                                {isAnswerCorrect && (
                                  <span className="text-emerald-500 text-base shrink-0">✓</span>
                                )}
                                {isWrongPick && (
                                  <span className="text-red-500 text-base shrink-0">✗</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Explanation */}
                        {ans.explanation && (
                          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                            <span className="shrink-0 text-sm">💡</span>
                            <p className="text-xs text-blue-700 leading-relaxed">{ans.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => { setQuizResult(null); setActiveQuiz(null); }}
                  className="w-full py-3.5 rounded-xl border-2 border-fuchsia-200 text-fuchsia-700 font-bold text-sm hover:bg-fuchsia-50 transition cursor-pointer"
                >
                  ← Back to Quizzes
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
