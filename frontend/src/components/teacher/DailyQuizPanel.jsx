import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";

const LETTERS = ["A", "B", "C", "D"];

const DIFF_META = {
  easy:   { label: "Easy",   color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  medium: { label: "Medium", color: "bg-blue-50 border-blue-200 text-blue-700"          },
  hard:   { label: "Hard",   color: "bg-red-50 border-red-200 text-red-700"             },
};

function pctBadge(score, max) {
  const p = max > 0 ? (score / max) * 100 : 0;
  if (p >= 80) return "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (p >= 50) return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-red-50 border-red-200 text-red-700";
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function DailyQuizPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState("generate");

  // ── Generate state ──────────────────────────────────────────────────────────
  const [genStep,    setGenStep]    = useState("configure");
  const [genForm,    setGenForm]    = useState({ topic: "", difficulty: "medium", count: 5 });
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState("");
  const [questions,  setQuestions]  = useState([]);
  const [dueDate,    setDueDate]    = useState("");
  const [publishing, setPublishing] = useState(false);
  const [pubResult,  setPubResult]  = useState(null);

  // ── Reports state ───────────────────────────────────────────────────────────
  const [quizList,      setQuizList]      = useState([]);
  const [loadingList,   setLoadingList]   = useState(false);
  const [listError,     setListError]     = useState("");
  const [reportData,    setReportData]    = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError,   setReportError]   = useState("");
  const [expandedRow,   setExpandedRow]   = useState(null);

  useEffect(() => {
    if (tab !== "reports" || !user) return;
    setLoadingList(true);
    setListError("");
    setReportData(null);
    fetch(`/teacher/daily-quiz/list?teacherId=${user.uid}`)
      .then((r) => r.json())
      .then((d) => setQuizList(d.quizzes || []))
      .catch((e) => setListError(e.message))
      .finally(() => setLoadingList(false));
  }, [tab, user]);

  // ── Generate actions ─────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!genForm.topic.trim()) { setGenError("Please enter a topic."); return; }
    setGenError("");
    setGenerating(true);
    try {
      const res  = await fetch("/api/daily-quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: genForm.topic.trim(), difficulty: genForm.difficulty, count: genForm.count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setQuestions(data.questions);
      setGenStep("preview");
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (questions.length === 0) return;
    setPublishing(true); setGenError("");
    try {
      const res  = await fetch("/api/daily-quiz/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: user.uid, topic: genForm.topic.trim(), difficulty: genForm.difficulty, questions, dueDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      setPubResult({ quizId: data.quizId, topic: genForm.topic.trim(), totalQ: questions.length, totalMarks: questions.reduce((s, q) => s + q.marks, 0) });
      setGenStep("published");
    } catch (err) {
      setGenError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  function resetGenerate() {
    setGenStep("configure"); setGenForm({ topic: "", difficulty: "medium", count: 5 });
    setQuestions([]); setDueDate(""); setGenError(""); setPubResult(null);
  }

  function updateQText(id, val)   { setQuestions((p) => p.map((q) => q.id === id ? { ...q, text: val } : q)); }
  function updateOption(id, i, v) { setQuestions((p) => p.map((q) => q.id === id ? { ...q, options: q.options.map((o, j) => j === i ? v : o) } : q)); }
  function setCorrect(id, ltr)    { setQuestions((p) => p.map((q) => q.id === id ? { ...q, correct: ltr } : q)); }
  function updateExplan(id, val)  { setQuestions((p) => p.map((q) => q.id === id ? { ...q, explanation: val } : q)); }
  function removeQ(id)            { setQuestions((p) => p.filter((q) => q.id !== id)); }

  // ── Report actions ───────────────────────────────────────────────────────────

  async function loadReport(quizId) {
    setLoadingReport(true); setReportError(""); setExpandedRow(null);
    try {
      const res  = await fetch(`/teacher/daily-quiz/report?quizId=${quizId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load report");
      setReportData(data);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setLoadingReport(false);
    }
  }

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);

  return (
    <div className="space-y-5 animate-fade-in-up">

      {/* ── Panel header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 flex items-center justify-center text-white text-xl shadow-sm">❓</div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Daily Quiz — MCQ</h2>
          <p className="text-xs text-gray-400">Generate AI multiple-choice questions and track student scores</p>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[{ id: "generate", icon: "✨", label: "Generate & Publish" }, { id: "reports", icon: "📊", label: "View Reports" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer ${tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════
          GENERATE TAB
          ════════════════════════════════════════════════════ */}
      {tab === "generate" && (
        <>
          {/* ── Step: Configure ─────────────────────────────────────────────── */}
          {genStep === "configure" && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
              <h3 className="text-sm font-bold text-gray-800">Quiz Settings</h3>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Topic *</label>
                <input type="text" value={genForm.topic}
                  onChange={(e) => setGenForm((f) => ({ ...f, topic: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                  placeholder="e.g. Photosynthesis, Newton's Laws, French Revolution…"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/15 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Difficulty</label>
                  <select value={genForm.difficulty} onChange={(e) => setGenForm((f) => ({ ...f, difficulty: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/15 transition">
                    <option value="easy">Easy — recall &amp; definitions</option>
                    <option value="medium">Medium — understanding required</option>
                    <option value="hard">Hard — deep analysis</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Number of Questions</label>
                  <input type="number" min="1" max="20" value={genForm.count}
                    onChange={(e) => setGenForm((f) => ({ ...f, count: Math.min(20, Math.max(1, parseInt(e.target.value) || 1)) }))}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-center font-semibold outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/15 transition"
                  />
                </div>
              </div>

              {genError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2"><span>⚠</span>{genError}</p>}

              <button onClick={handleGenerate} disabled={generating || !genForm.topic.trim()}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-700 hover:to-pink-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-fuchsia-500/20 transition-all hover:-translate-y-0.5 cursor-pointer disabled:cursor-not-allowed disabled:hover:translate-y-0">
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Generating MCQ questions…
                  </span>
                ) : "✨ Generate MCQ Questions"}
              </button>
            </div>
          )}

          {/* ── Step: Preview ────────────────────────────────────────────────── */}
          {genStep === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Review &amp; Edit Questions</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{questions.length} questions · {totalMarks} marks · Edit before publishing</p>
                </div>
                <button onClick={() => { setGenStep("configure"); setGenError(""); }}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                  ← Back
                </button>
              </div>

              {/* Question cards */}
              <div className="space-y-4">
                {questions.map((q, idx) => (
                  <div key={q.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                    {/* Q header */}
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-fuchsia-100 text-fuchsia-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">Question {idx + 1}</span>
                      {questions.length > 1 && (
                        <button onClick={() => removeQ(q.id)}
                          className="text-gray-300 hover:text-red-400 text-xl leading-none cursor-pointer transition-colors" title="Remove">×</button>
                      )}
                    </div>

                    {/* Question text */}
                    <textarea value={q.text} onChange={(e) => updateQText(q.id, e.target.value)} rows={2}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 leading-relaxed outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/15 resize-none transition"
                      placeholder="Question text…"
                    />

                    {/* Options */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Options</p>
                      {LETTERS.map((ltr, i) => (
                        <div key={ltr} className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                          q.correct === ltr ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50"
                        }`}>
                          {/* Correct answer radio */}
                          <button type="button" onClick={() => setCorrect(q.id, ltr)}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                              q.correct === ltr ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 hover:border-emerald-400"
                            }`}>
                            {q.correct === ltr && <span className="text-xs font-bold">✓</span>}
                          </button>

                          <span className={`text-xs font-bold w-5 shrink-0 ${q.correct === ltr ? "text-emerald-700" : "text-gray-400"}`}>{ltr}</span>

                          <input type="text" value={q.options[i] || ""}
                            onChange={(e) => updateOption(q.id, i, e.target.value)}
                            placeholder={`Option ${ltr}…`}
                            className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-300"
                          />
                        </div>
                      ))}
                      <p className="text-xs text-gray-400">Click the circle next to an option to mark it as correct</p>
                    </div>

                    {/* Explanation */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Explanation</label>
                      <input type="text" value={q.explanation || ""}
                        onChange={(e) => updateExplan(q.id, e.target.value)}
                        placeholder="Why is this answer correct? (shown to students after submission)"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/15 transition text-gray-700"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Due date + publish */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Due Date <span className="font-normal normal-case text-gray-400">(optional)</span>
                  </label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-400/15 transition"
                  />
                </div>
                {genError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">⚠ {genError}</p>}
                <button onClick={handlePublish} disabled={publishing || questions.length === 0}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-700 hover:to-pink-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-fuchsia-500/20 transition-all hover:-translate-y-0.5 cursor-pointer">
                  {publishing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Publishing…
                    </span>
                  ) : `🚀 Publish Quiz · ${questions.length} MCQs · ${totalMarks} marks`}
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Published ──────────────────────────────────────────────── */}
          {genStep === "published" && pubResult && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-fuchsia-500 to-pink-600 px-6 py-8 text-white text-center">
                <div className="text-4xl mb-3">🎉</div>
                <h3 className="text-xl font-bold mb-1">Quiz Published!</h3>
                <p className="text-fuchsia-100 text-sm">Students can now answer the daily MCQ quiz</p>
              </div>
              <div className="px-6 py-5 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <InfoChip label="Topic"       value={pubResult.topic}      />
                  <InfoChip label="Questions"   value={pubResult.totalQ}     />
                  <InfoChip label="Total Marks" value={pubResult.totalMarks} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setTab("reports")}
                    className="flex-1 py-2.5 rounded-xl border-2 border-fuchsia-200 text-fuchsia-700 font-semibold text-sm hover:bg-fuchsia-50 transition cursor-pointer">
                    📊 View Responses
                  </button>
                  <button onClick={resetGenerate}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white font-semibold text-sm hover:from-fuchsia-700 hover:to-pink-700 transition cursor-pointer shadow-md shadow-fuchsia-500/20">
                    + Create Another
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          REPORTS TAB
          ════════════════════════════════════════════════════ */}
      {tab === "reports" && (
        <div className="space-y-4">

          {/* ── Quiz list ─────────────────────────────────────────────────────── */}
          {!reportData && (
            <>
              <h3 className="text-sm font-bold text-gray-800">Your Published Quizzes</h3>
              {loadingList && <Spinner />}
              {listError  && <ErrBox msg={listError} />}

              {!loadingList && !listError && quizList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border-2 border-dashed border-fuchsia-200 text-center">
                  <div className="w-16 h-16 bg-fuchsia-50 rounded-2xl flex items-center justify-center text-3xl mb-4">❓</div>
                  <p className="text-gray-700 font-bold mb-1">No quizzes yet</p>
                  <p className="text-gray-400 text-sm mb-4">Publish a quiz to see student responses here.</p>
                  <button onClick={() => setTab("generate")}
                    className="text-sm font-semibold text-fuchsia-600 hover:text-fuchsia-700 cursor-pointer">✨ Generate first quiz →</button>
                </div>
              )}

              {!loadingList && quizList.length > 0 && (
                <div className="space-y-3">
                  {quizList.map((quiz) => {
                    const diff   = DIFF_META[quiz.difficulty] || DIFF_META.medium;
                    const totalQ = (quiz.questions || []).length;
                    const totalM = (quiz.questions || []).reduce((s, q) => s + (q.marks || 1), 0);
                    return (
                      <button key={quiz.id} onClick={() => loadReport(quiz.id)}
                        className="w-full text-left bg-white rounded-2xl border border-gray-200 shadow-sm hover:border-fuchsia-200 hover:shadow-md transition-all p-5 cursor-pointer group">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <h4 className="text-sm font-bold text-gray-900 group-hover:text-fuchsia-700 transition-colors">{quiz.topic}</h4>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${diff.color}`}>{diff.label}</span>
                              {quiz.dueDate && <span className="text-xs text-gray-400">Due {quiz.dueDate}</span>}
                            </div>
                            <p className="text-xs text-gray-400">{totalQ} MCQs · {totalM} marks · Published {fmtDate(quiz.createdAt)}</p>
                          </div>
                          <span className="text-fuchsia-500 text-lg group-hover:translate-x-1 transition-transform shrink-0">→</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Report view ───────────────────────────────────────────────────── */}
          {reportData && (
            <div className="space-y-5">
              <button onClick={() => { setReportData(null); setExpandedRow(null); }}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-1.5 cursor-pointer transition-colors">
                ← All Quizzes
              </button>

              {loadingReport && <Spinner />}
              {reportError   && <ErrBox msg={reportError} />}

              {!loadingReport && reportData && (
                <>
                  {/* Quiz header */}
                  <div className="bg-gradient-to-r from-fuchsia-500 to-pink-600 rounded-2xl px-6 py-5 text-white">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-fuchsia-100 text-xs font-semibold uppercase tracking-wide mb-1">MCQ Report</p>
                        <h3 className="text-xl font-bold">{reportData.quiz.topic}</h3>
                        <p className="text-fuchsia-100 text-sm mt-1">
                          {reportData.stats.totalQuestions} questions · {reportData.stats.maxScore} marks · {fmtDate(reportData.quiz.createdAt)}
                        </p>
                      </div>
                      <div className="flex gap-5">
                        <div className="text-center">
                          <p className="text-2xl font-extrabold">{reportData.stats.totalResponses}</p>
                          <p className="text-fuchsia-200 text-xs">Responses</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-extrabold">{reportData.stats.avgCorrect}</p>
                          <p className="text-fuchsia-200 text-xs">Avg Correct</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-extrabold">{reportData.stats.avgScore}</p>
                          <p className="text-fuchsia-200 text-xs">Avg Score</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {reportData.responses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm text-center">
                      <div className="text-4xl mb-3">⏳</div>
                      <p className="text-gray-700 font-bold mb-1">No responses yet</p>
                      <p className="text-gray-400 text-sm">Students haven't submitted yet. Check back soon.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {reportData.responses.length} student{reportData.responses.length !== 1 ? "s" : ""} responded
                        </span>
                      </div>

                      <div className="divide-y divide-gray-100">
                        {reportData.responses.map((resp) => {
                          const correctCount = (resp.answers || []).filter((a) => a.isCorrect).length;
                          const total        = reportData.stats.totalQuestions;
                          const pct          = total > 0 ? Math.round((correctCount / total) * 100) : 0;
                          const isExpanded   = expandedRow === resp.id;

                          return (
                            <div key={resp.id}>
                              {/* Summary row */}
                              <button onClick={() => setExpandedRow(isExpanded ? null : resp.id)}
                                className="w-full text-left px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-400 to-pink-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                                      {(resp.studentName || "S").charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-gray-800 truncate">{resp.studentName}</p>
                                      <p className="text-xs text-gray-400">{fmtDate(resp.submittedAt)}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${pctBadge(correctCount, total)}`}>
                                      {correctCount}/{total} correct
                                    </span>
                                    <div className="hidden sm:block w-24 bg-gray-100 rounded-full h-2 overflow-hidden">
                                      <div className={`h-2 rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-500"}`}
                                        style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                                    <span className={`text-gray-400 text-sm transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                                  </div>
                                </div>
                              </button>

                              {/* Expanded MCQ breakdown */}
                              {isExpanded && (
                                <div className="px-6 pb-5 pt-1 bg-gray-50 border-t border-gray-100 space-y-3">
                                  {(resp.answers || []).map((ans, idx) => (
                                    <div key={idx} className={`bg-white rounded-xl border p-4 space-y-2 ${ans.isCorrect ? "border-emerald-100" : "border-red-100"}`}>
                                      <p className="text-xs font-bold text-gray-600">Q{idx + 1}. {ans.questionText}</p>
                                      {/* Options */}
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {LETTERS.map((ltr, i) => {
                                          const isCorrect  = ltr === ans.correct;
                                          const isSelected = ltr === ans.selected;
                                          return (
                                            <div key={ltr} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
                                              isCorrect  ? "bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold" :
                                              isSelected && !isCorrect ? "bg-red-50 border border-red-200 text-red-700" :
                                              "text-gray-400"
                                            }`}>
                                              <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                                isCorrect  ? "bg-emerald-500 text-white" :
                                                isSelected && !isCorrect ? "bg-red-400 text-white" :
                                                "bg-gray-100 text-gray-400"
                                              }`}>{ltr}</span>
                                              <span className="truncate">{(ans.options || [])[i] || "—"}</span>
                                              {isCorrect && !isSelected && <span className="ml-auto shrink-0 text-emerald-600">✓</span>}
                                              {isSelected && isCorrect  && <span className="ml-auto shrink-0 text-emerald-600">✓</span>}
                                              {isSelected && !isCorrect && <span className="ml-auto shrink-0 text-red-500">✗</span>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {ans.explanation && (
                                        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                                          <span className="shrink-0 text-sm">💡</span>
                                          <p className="text-xs text-blue-700 leading-relaxed">{ans.explanation}</p>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoChip({ label, value }) {
  return (
    <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-xl px-4 py-3 text-center">
      <p className="text-xs text-fuchsia-500 font-medium mb-0.5">{label}</p>
      <p className="text-base font-bold text-fuchsia-900 truncate">{value}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
      <span className="w-5 h-5 border-2 border-fuchsia-400 border-t-transparent rounded-full animate-spin" />Loading…
    </div>
  );
}

function ErrBox({ msg }) {
  return <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">⚠ {msg}</p>;
}
