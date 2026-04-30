import { useState, useRef } from "react";

const PART_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const DEFAULT_SCHEME = [
  { id: 1, marks: 2,  count: 5, label: "Short Answer"  },
  { id: 2, marks: 5,  count: 3, label: "Descriptive"   },
  { id: 3, marks: 10, count: 2, label: "Essay"          },
];

// ── Exam paper HTML builder ────────────────────────────────────────────────────

function buildExamHTML({ meta, sections }) {
  const computedTotal = sections.reduce(
    (sum, s) => sum + s.marks * s.questions.length, 0
  );

  const partsHTML = sections.map((section, idx) => {
    const partLabel = PART_LABELS[idx] || String(idx + 1);
    const sectionTotal = section.marks * section.questions.length;

    const rowsHTML = section.questions
      .map(
        (q, qi) => `
      <tr>
        <td class="qnum">${qi + 1}.</td>
        <td class="qtext">${q}</td>
        <td class="qmarks">(${section.marks})</td>
      </tr>`
      )
      .join("");

    return `
    <div class="section">
      <div class="section-header">PART ${partLabel} — ${section.label.toUpperCase()}</div>
      <div class="section-meta">
        Answer all ${section.questions.length} question${section.questions.length !== 1 ? "s" : ""}.
        &nbsp;&nbsp;
        [${section.marks} × ${section.questions.length} = ${sectionTotal} marks]
      </div>
      <table class="questions-table">
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>`;
  }).join("\n");

  const instrLines = (meta.instructions || "")
    .split("\n")
    .filter(Boolean)
    .map((l) => `<li>${l.replace(/^\d+\.\s*/, "")}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${meta.subject || "Exam"} — Question Paper</title>
  <style>
    @page { size: A4; margin: 2.2cm 2cm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 11.5pt;
      color: #000;
      line-height: 1.45;
    }
    .header { text-align: center; margin-bottom: 10px; }
    .institution {
      font-size: 15pt; font-weight: bold;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;
    }
    .exam-name  { font-size: 12.5pt; font-weight: bold; margin: 3px 0; }
    .subject    { font-size: 11.5pt; margin: 3px 0; }
    hr.dbl { border: none; border-top: 3px double #000; margin: 10px 0; }
    hr.sng { border: none; border-top: 1px solid #000; margin: 6px 0; }
    .meta-row {
      display: flex; justify-content: space-between;
      font-size: 10.5pt; margin: 6px 0;
    }
    .total-marks-line {
      text-align: right; font-weight: bold;
      font-size: 11pt; margin: 8px 0 12px;
    }
    .instructions-box {
      border: 1px solid #000; padding: 7px 12px; margin: 12px 0;
    }
    .instructions-box .title {
      font-weight: bold; font-size: 10.5pt; margin-bottom: 4px;
    }
    .instructions-box ol {
      padding-left: 18px; font-size: 10pt;
    }
    .instructions-box li { margin: 2px 0; }
    .section { margin-bottom: 20px; }
    .section-header {
      font-weight: bold; font-size: 11pt;
      text-decoration: underline; text-transform: uppercase;
      margin-bottom: 3px;
    }
    .section-meta { font-size: 10pt; color: #333; margin-bottom: 8px; font-style: italic; }
    .questions-table { width: 100%; border-collapse: collapse; }
    .questions-table .qnum {
      width: 26px; vertical-align: top;
      font-weight: bold; padding: 4px 4px 4px 0;
    }
    .questions-table .qtext {
      vertical-align: top; padding: 4px 8px 6px 0; line-height: 1.5;
    }
    .questions-table .qmarks {
      width: 38px; text-align: right; vertical-align: top;
      padding: 4px 0; font-style: italic; white-space: nowrap;
    }
    .footer {
      text-align: center; margin-top: 20px;
      font-style: italic; font-size: 10pt;
      border-top: 1px solid #000; padding-top: 8px;
    }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${meta.institution ? `<div class="institution">${meta.institution}</div>` : ""}
    <div class="exam-name">${meta.examName || "Examination"}</div>
    ${meta.subject ? `<div class="subject"><strong>${meta.subject}</strong></div>` : ""}
  </div>

  <hr class="dbl" />

  <div class="meta-row">
    <span>Date: <strong>${meta.date || "___________"}</strong></span>
    <span>Session: <strong>${meta.time || "___________"}</strong></span>
    <span>Duration: <strong>${meta.duration || "___________"}</strong></span>
  </div>

  <div class="total-marks-line">Maximum Marks: ${computedTotal}</div>

  <hr class="sng" />

  ${instrLines ? `
  <div class="instructions-box">
    <div class="title">Instructions to Candidates:</div>
    <ol>${instrLines}</ol>
  </div>` : ""}

  ${partsHTML}

  <div class="footer">*** END OF QUESTION PAPER ***</div>
</body>
</html>`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function QuestionPaperGenerator() {
  const fileInputRef = useRef(null);

  const [file, setFile]         = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const [meta, setMeta] = useState({
    institution:  "",
    examName:     "Internal Assessment",
    subject:      "",
    date:         "",
    time:         "FN / AN",
    duration:     "3 Hours",
    instructions: "Answer ALL questions.\nWrite clearly and legibly.\nMobile phones are not permitted in the examination hall.",
  });

  const [markScheme, setMarkScheme] = useState(DEFAULT_SCHEME);
  const [nextId, setNextId]         = useState(4);

  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState("");
  const [result, setResult]         = useState(null);

  const totalMarks     = markScheme.reduce((s, r) => s + r.marks * r.count, 0);
  const totalQuestions = markScheme.reduce((s, r) => s + r.count, 0);

  // ── File handling ────────────────────────────────────────────────────────────

  function handleFileSelect(f) {
    if (!f) return;
    const ok = /\.(pdf|docx?|txt|md)$/i.test(f.name);
    if (!ok) {
      setError("Only PDF, DOCX, or TXT files are supported.");
      return;
    }
    setError("");
    setFile(f);
    setResult(null);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files[0]);
  }

  // ── Mark scheme management ───────────────────────────────────────────────────

  function addSection() {
    setMarkScheme((prev) => [
      ...prev,
      { id: nextId, marks: 5, count: 3, label: "New Section" },
    ]);
    setNextId((n) => n + 1);
  }

  function removeSection(id) {
    setMarkScheme((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSection(id, field, raw) {
    setMarkScheme((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              [field]:
                field === "marks" || field === "count"
                  ? Math.max(1, parseInt(raw, 10) || 1)
                  : raw,
            }
          : s
      )
    );
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!file) { setError("Please upload a PDF or document first."); return; }
    if (markScheme.length === 0) { setError("Add at least one mark section."); return; }

    setError("");
    setGenerating(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append(
        "mark_scheme",
        JSON.stringify(
          markScheme.map(({ marks, count, label }) => ({ marks, count, label }))
        )
      );

      const res  = await fetch("/api/generate-question-paper", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setResult({ ...data, meta: { ...meta } });
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Download ─────────────────────────────────────────────────────────────────

  function downloadAsPDF() {
    if (!result) return;
    const html = buildExamHTML(result);
    const win  = window.open("", "_blank", "width=960,height=700");
    if (!win) { alert("Allow pop-ups to download the question paper."); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 300);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* ── Section header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xl shadow-sm">
          📋
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Question Paper Generator</h2>
          <p className="text-xs text-gray-400">Upload study material → set your mark scheme → download a ready-to-print exam paper</p>
        </div>
      </div>

      {/* ══ Setup form (hidden once result is showing) ════════════════════════ */}
      {!result && (
        <>
          {/* ── Upload + Exam Details ─────────────────────────────────────── */}
          <div className="grid gap-5 lg:grid-cols-2">

            {/* Upload */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span className="text-base">📄</span> Study Material
              </h3>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-all ${
                  dragOver
                    ? "border-violet-400 bg-violet-50"
                    : file
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-gray-200 bg-gray-50 hover:border-violet-300 hover:bg-violet-50/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                />
                {file ? (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-2xl">📑</div>
                    <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
                    <p className="text-xs text-emerald-500">{(file.size / 1024).toFixed(1)} KB · Click to replace</p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center text-2xl">☁️</div>
                    <p className="text-sm font-semibold text-gray-700">Drag & drop or click to upload</p>
                    <p className="text-xs text-gray-400">PDF, DOCX, or TXT · Max 20 MB</p>
                  </>
                )}
              </div>
            </div>

            {/* Exam Details */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-3">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-1">
                <span className="text-base">🏫</span> Exam Details
              </h3>
              {[
                { key: "institution", label: "Institution / School",  placeholder: "e.g. St. Joseph's Higher Secondary School" },
                { key: "examName",    label: "Exam Name",             placeholder: "e.g. Half-Yearly Examination" },
                { key: "subject",     label: "Subject",               placeholder: "e.g. Physics — Class XII" },
                { key: "date",        label: "Date",                  placeholder: "e.g. 15 November 2025" },
                { key: "time",        label: "Session",               placeholder: "FN / AN" },
                { key: "duration",    label: "Duration",              placeholder: "3 Hours" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <input
                    type="text"
                    value={meta[key]}
                    onChange={(e) => setMeta((m) => ({ ...m, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15 transition"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Mark Scheme Builder ────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span className="text-base">🎯</span> Mark Scheme
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 text-xs font-medium text-gray-500 bg-gray-50 rounded-xl px-4 py-2 border border-gray-100">
                  <span><strong className="text-gray-800">{totalQuestions}</strong> questions</span>
                  <span className="text-gray-300">|</span>
                  <span><strong className="text-violet-600">{totalMarks}</strong> total marks</span>
                </div>
                <button
                  onClick={addSection}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 border border-violet-200 bg-violet-50 hover:bg-violet-100 px-3 py-2 rounded-xl transition cursor-pointer"
                >
                  + Add Section
                </button>
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-12 gap-3 mb-2 px-1">
              <div className="col-span-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Part</div>
              <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Marks each</div>
              <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">No. of Qs</div>
              <div className="col-span-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Section Label</div>
              <div className="col-span-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Subtotal</div>
              <div className="col-span-1" />
            </div>

            <div className="space-y-2">
              {markScheme.map((row, idx) => (
                <div
                  key={row.id}
                  className="grid grid-cols-12 gap-3 items-center bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100 hover:border-violet-200 transition-colors"
                >
                  {/* Part label */}
                  <div className="col-span-1">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-bold shadow-sm">
                      {PART_LABELS[idx] || String(idx + 1)}
                    </span>
                  </div>

                  {/* Marks per question */}
                  <div className="col-span-2">
                    <input
                      type="number" min="1" max="100"
                      value={row.marks}
                      onChange={(e) => updateSection(row.id, "marks", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-center font-semibold outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15 transition"
                    />
                  </div>

                  {/* Count */}
                  <div className="col-span-2">
                    <input
                      type="number" min="1" max="50"
                      value={row.count}
                      onChange={(e) => updateSection(row.id, "count", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-center font-semibold outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15 transition"
                    />
                  </div>

                  {/* Label */}
                  <div className="col-span-4">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => updateSection(row.id, "label", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15 transition"
                    />
                  </div>

                  {/* Subtotal */}
                  <div className="col-span-2">
                    <span className="text-sm font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 block text-center">
                      {row.marks * row.count} marks
                    </span>
                  </div>

                  {/* Remove */}
                  <div className="col-span-1 flex justify-center">
                    <button
                      onClick={() => removeSection(row.id)}
                      disabled={markScheme.length === 1}
                      className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center text-lg leading-none"
                      title="Remove section"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Instructions field */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Instructions to Candidates <span className="font-normal text-gray-400">(one per line)</span>
              </label>
              <textarea
                value={meta.instructions}
                onChange={(e) => setMeta((m) => ({ ...m, instructions: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 leading-relaxed outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/15 resize-none transition"
              />
            </div>
          </div>

          {/* ── Error + Generate button ───────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <span className="shrink-0 mt-0.5">⚠</span>
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !file}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 text-white font-bold text-base shadow-lg shadow-violet-500/25 transition-all hover:-translate-y-0.5 cursor-pointer disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-3">
                <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Generating question paper…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>✨</span>
                Generate Question Paper
                {file && <span className="opacity-70 font-normal text-sm ml-1">· {totalQuestions} questions, {totalMarks} marks</span>}
              </span>
            )}
          </button>
        </>
      )}

      {/* ══ Generated result ══════════════════════════════════════════════════ */}
      {result && (
        <div className="space-y-5 animate-fade-in-up">

          {/* Success banner */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-2xl px-6 py-4 shadow-lg shadow-violet-500/20">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-bold text-base">Question Paper Generated!</p>
                <p className="text-violet-200 text-xs">
                  {result.sections.reduce((s, sec) => s + sec.questions.length, 0)} questions
                  &nbsp;·&nbsp;
                  {result.sections.reduce((s, sec) => s + sec.marks * sec.questions.length, 0)} marks
                  &nbsp;·&nbsp;
                  {result.wordCount?.toLocaleString()} words processed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadAsPDF}
                className="inline-flex items-center gap-2 bg-white text-violet-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-violet-50 transition-colors shadow-sm cursor-pointer"
              >
                <span>⬇️</span> Download PDF
              </button>
              <button
                onClick={() => { setResult(null); setError(""); }}
                className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                ↺ Regenerate
              </button>
            </div>
          </div>

          {/* Paper preview */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview</span>
              <button
                onClick={downloadAsPDF}
                className="text-xs font-semibold text-violet-600 hover:text-violet-700 cursor-pointer transition-colors"
              >
                Open print view →
              </button>
            </div>

            {/* Exam paper content */}
            <div className="px-8 py-8 font-serif" style={{ fontFamily: "'Times New Roman', Times, serif" }}>

              {/* Header */}
              <div className="text-center border-b-2 border-black pb-4 mb-4">
                {result.meta.institution && (
                  <p className="text-lg font-bold uppercase tracking-wide">{result.meta.institution}</p>
                )}
                <p className="text-base font-bold mt-1">{result.meta.examName || "Examination"}</p>
                {result.meta.subject && (
                  <p className="text-sm font-semibold mt-0.5">{result.meta.subject}</p>
                )}
              </div>

              <div className="flex justify-between text-sm mb-2">
                <span>Date: <strong>{result.meta.date || "___________"}</strong></span>
                <span>Session: <strong>{result.meta.time || "___________"}</strong></span>
                <span>Duration: <strong>{result.meta.duration || "___________"}</strong></span>
              </div>
              <div className="text-right text-sm font-bold mb-3">
                Maximum Marks:{" "}
                {result.sections.reduce((s, sec) => s + sec.marks * sec.questions.length, 0)}
              </div>

              {result.meta.instructions && (
                <div className="border border-gray-400 px-4 py-3 mb-5 text-sm">
                  <p className="font-bold mb-1">Instructions to Candidates:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-gray-700">
                    {result.meta.instructions.split("\n").filter(Boolean).map((l, i) => (
                      <li key={i}>{l.replace(/^\d+\.\s*/, "")}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Sections */}
              {result.sections.map((section, idx) => {
                const partLabel  = PART_LABELS[idx] || String(idx + 1);
                const secTotal   = section.marks * section.questions.length;
                return (
                  <div key={idx} className="mb-7">
                    <p className="text-sm font-bold underline uppercase mb-1">
                      Part {partLabel} — {section.label}
                    </p>
                    <p className="text-xs text-gray-500 italic mb-3">
                      Answer all {section.questions.length} question{section.questions.length !== 1 ? "s" : ""}.
                      &nbsp;&nbsp;[{section.marks} × {section.questions.length} = {secTotal} marks]
                    </p>
                    <table className="w-full">
                      <tbody>
                        {section.questions.map((q, qi) => (
                          <tr key={qi} className="align-top">
                            <td className="pr-2 font-bold text-sm w-6 py-1">{qi + 1}.</td>
                            <td className="text-sm leading-relaxed py-1 pr-4">{q}</td>
                            <td className="text-sm italic text-right whitespace-nowrap py-1 w-10">({section.marks})</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              <div className="text-center text-xs italic border-t border-gray-300 pt-3 mt-6 text-gray-500">
                *** END OF QUESTION PAPER ***
              </div>
            </div>
          </div>

          {/* Bottom download button */}
          <button
            onClick={downloadAsPDF}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-sm shadow-lg shadow-violet-500/20 transition-all hover:-translate-y-0.5 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>⬇️</span> Download as PDF
          </button>
        </div>
      )}
    </div>
  );
}
