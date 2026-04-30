import { useState } from "react";

export default function LessonCard({ lesson }) {
  const [editedPrompt, setEditedPrompt] = useState(
    lesson.studentPrompt || lesson.generatedPrompt || ""
  );
  const [generating, setGenerating]     = useState(false);
  const [publishing, setPublishing]     = useState(false);
  const [publishedNow, setPublishedNow] = useState(false);
  const [error, setError]               = useState("");

  const hasPrompt   = Boolean(editedPrompt);
  const isPublished = lesson.isPublished || publishedNow;

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    setPublishedNow(false);
    try {
      const res  = await fetch("/api/generate-student-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, lessonContent: lesson.content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setEditedPrompt(data.generatedPrompt);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (!editedPrompt.trim()) return;
    setPublishing(true);
    setError("");
    try {
      const res  = await fetch("/api/publish-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, finalPrompt: editedPrompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      setPublishedNow(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${
      isPublished ? "border-emerald-200" : "border-gray-200"
    }`}>

      {/* Top accent strip */}
      <div className={`h-1.5 w-full ${
        isPublished
          ? "bg-gradient-to-r from-emerald-400 to-teal-500"
          : "bg-gradient-to-r from-indigo-400 to-violet-500"
      }`} />

      {/* Header */}
      <div className="px-6 pt-5 pb-4 flex items-start gap-4">
        {/* Icon badge */}
        <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-sm ${
          isPublished
            ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white"
            : "bg-gradient-to-br from-indigo-400 to-violet-500 text-white"
        }`}>
          {isPublished ? "🚀" : "📝"}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-bold text-gray-900 truncate">{lesson.title}</h2>
          </div>
          <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">{lesson.content}</p>
        </div>

        {isPublished ? (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Published
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500">
            Draft
          </span>
        )}
      </div>

      {/* Prompt area */}
      <div className="px-6 pb-6 space-y-4">
        <div className="h-px bg-gray-100" />

        {generating ? (
          <div className="flex items-center gap-3 py-4 text-sm text-indigo-600 bg-indigo-50 rounded-xl px-4">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
            Generating AI student prompt…
          </div>
        ) : hasPrompt ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Student Prompt
            </label>
            <textarea
              value={editedPrompt}
              onChange={(e) => { setEditedPrompt(e.target.value); setPublishedNow(false); }}
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm text-gray-800 leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 resize-none transition"
            />
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-5 py-5 text-center">
            <div className="text-3xl mb-2">✨</div>
            <p className="text-sm text-gray-500">
              Click <span className="font-semibold text-indigo-600">Generate Prompt</span> — NIRA will craft an AI-powered explanation question for students.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
        )}

        {publishedNow && !error && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
            <span>✓</span> Prompt published — students can now respond!
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleGenerate}
            disabled={generating || publishing}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 transition-all shadow-sm shadow-indigo-500/20 cursor-pointer"
          >
            <span>✨</span>
            {hasPrompt ? "Regenerate" : "Generate Prompt"}
          </button>

          {hasPrompt && (
            <button
              onClick={handlePublish}
              disabled={generating || publishing || !editedPrompt.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 transition-all shadow-sm shadow-emerald-500/20 cursor-pointer"
            >
              <span>🚀</span>
              {publishing ? "Publishing…" : isPublished ? "Re-publish" : "Publish"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
