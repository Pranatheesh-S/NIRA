/**
 * speechService.js
 *
 * Two independent concerns:
 *   1. createRecorder()      — MediaRecorder-based audio capture
 *   2. createLiveTranscript()— Web Speech API real-time subtitles (Feature 4)
 */

// ── Helper: pick a MIME type the browser supports ────────────────────────────
function getSupportedMimeType() {
  const candidates = ["audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

// ── Feature 1 + 2 — Audio recorder ───────────────────────────────────────────

/**
 * Returns a recorder object with start() / stop() / isRecording.
 *
 * Usage:
 *   const recorder = createRecorder();
 *   await recorder.start();
 *   const blob = await recorder.stop();
 */
export function createRecorder() {
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  const mimeType = getSupportedMimeType();

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.start(200); // slice every 200 ms so we always get data
    },

    stop() {
      return new Promise((resolve, reject) => {
        if (!mediaRecorder) return reject(new Error("Recorder not started"));
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          stream?.getTracks().forEach((t) => t.stop());
          resolve(blob);
        };
        mediaRecorder.stop();
      });
    },

    get isRecording() {
      return mediaRecorder?.state === "recording";
    },

    /** Release microphone without saving */
    cancel() {
      try {
        mediaRecorder?.stop();
      } catch (_) {}
      stream?.getTracks().forEach((t) => t.stop());
    },
  };
}

// ── Feature 4 — Live transcript (Web Speech API) ─────────────────────────────

/**
 * Creates a live-transcript controller.
 *
 * @param {(text: string) => void} onUpdate   called on every interim/final result
 * @param {(text: string) => void} [onEnd]    called when recognition stops
 *
 * @returns {{ start, stop, getTranscript } | null}
 *   null if the browser doesn't support SpeechRecognition.
 */
export function createLiveTranscript(onUpdate, onEnd) {
  const SR =
    window.SpeechRecognition ?? window.webkitSpeechRecognition;

  if (!SR) {
    console.warn("[speechService] SpeechRecognition not supported in this browser.");
    return null;
  }

  const recognition = new SR();
  recognition.continuous     = true;
  recognition.interimResults = true;
  // Empty string = auto-detect language (browser uses the OS locale as a hint)
  recognition.lang = "";

  let finalTranscript = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += chunk + " ";
      } else {
        interim += chunk;
      }
    }
    onUpdate((finalTranscript + interim).trim());
  };

  recognition.onerror = (e) => {
    // "no-speech" is expected during pauses — don't log it
    if (e.error !== "no-speech") {
      console.warn("[speechService] SpeechRecognition error:", e.error);
    }
  };

  recognition.onend = () => {
    onEnd?.(finalTranscript.trim());
  };

  return {
    start() {
      finalTranscript = "";
      try { recognition.start(); } catch (_) {}
    },
    stop() {
      try { recognition.stop(); } catch (_) {}
    },
    getTranscript() {
      return finalTranscript.trim();
    },
  };
}

/** Format seconds → MM:SS */
export function formatDuration(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}
