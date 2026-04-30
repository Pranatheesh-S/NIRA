import { useState, useEffect, useRef } from "react";
import { createRecorder, createLiveTranscript, formatDuration } from "../../services/speechService";

export default function AudioRecorder({ onRecordingComplete, disabled = false }) {
  const [phase, setPhase]               = useState("idle");
  const [seconds, setSeconds]           = useState(0);
  const [liveTranscript, setTranscript] = useState("");
  const [audioUrl, setAudioUrl]         = useState(null);
  const [micError, setMicError]         = useState("");

  const recorderRef = useRef(null);
  const liveRef     = useRef(null);
  const timerRef    = useRef(null);
  const blobUrlRef  = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  async function handleStart() {
    setMicError("");
    setTranscript("");
    setAudioUrl(null);
    setSeconds(0);
    try {
      recorderRef.current = createRecorder();
      await recorderRef.current.start();
    } catch {
      setMicError("Microphone access denied. Please allow microphone permissions.");
      return;
    }
    liveRef.current = createLiveTranscript((text) => setTranscript(text));
    liveRef.current?.start();
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    setPhase("recording");
  }

  async function handleStop() {
    clearInterval(timerRef.current);
    liveRef.current?.stop();
    const blob = await recorderRef.current.stop();
    const url  = URL.createObjectURL(blob);
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = url;
    setAudioUrl(url);
    setPhase("done");
    onRecordingComplete?.(blob, liveRef.current?.getTranscript() ?? liveTranscript);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">

        {phase !== "recording" ? (
          <button
            type="button"
            onClick={handleStart}
            disabled={disabled}
            className={`inline-flex items-center gap-2.5 rounded-xl font-semibold px-5 py-3 text-sm transition-all shadow-sm cursor-pointer disabled:opacity-50 ${
              phase === "done"
                ? "bg-gray-100 hover:bg-gray-200 text-gray-700"
                : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-500/20"
            }`}
          >
            <span className="text-base">🎙</span>
            {phase === "done" ? "Record Again" : "Start Recording"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStop}
            className="inline-flex items-center gap-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-3 text-sm transition-colors shadow-sm shadow-red-500/20 cursor-pointer"
          >
            <span className="w-3 h-3 rounded-sm bg-white inline-block shrink-0" />
            Stop Recording
          </button>
        )}

        {phase === "recording" && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
            <span className="text-sm font-bold text-red-600 font-mono">{formatDuration(seconds)}</span>
          </div>
        )}

        {phase === "done" && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
            <span>✓</span> Recorded
          </div>
        )}
      </div>

      {micError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-red-400 shrink-0">⚠</span>
          <p className="text-sm text-red-700">{micError}</p>
        </div>
      )}

      {/* Live transcript */}
      {phase === "recording" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 min-h-16">
          <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1.5">Live Transcript</p>
          <p className="text-sm text-emerald-900 leading-relaxed">
            {liveTranscript || <span className="italic text-emerald-400">Listening…</span>}
          </p>
        </div>
      )}

      {/* Playback */}
      {phase === "done" && audioUrl && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Review Recording</p>
          <audio controls src={audioUrl} className="w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
