import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, form.email, form.password);
      const snap = await getDoc(doc(db, "users", user.uid));
      const role = snap.data()?.role;
      navigate(role === "teacher" ? "/teacher" : "/student", { replace: true });
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Brand panel (desktop only) ──────────────────────────────────── */}
      <div className="hidden lg:flex w-[46%] bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 flex-col justify-between p-12 relative overflow-hidden shrink-0">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-white/10 rounded-full" />
        <div className="absolute -bottom-32 -left-16 w-96 h-96 bg-white/5 rounded-full" />

        <div className="relative">
          <BrandLogo />
          <h1 className="text-4xl font-bold text-white leading-tight mt-10 mb-3">
            AI-Powered<br />Learning Platform
          </h1>
          <p className="text-indigo-200 text-base leading-relaxed">
            Real-time AI insights that bridge the gap between teaching and understanding.
          </p>
        </div>

        <div className="relative space-y-3">
          {[
            { icon: "🧠", title: "Instant AI Evaluation",   desc: "Scores student explanations in real time" },
            { icon: "📊", title: "Class Misconception Map", desc: "Spots concept gaps across the whole class" },
            { icon: "🌐", title: "Any Language",            desc: "Auto-detects and translates 100+ languages" },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3 bg-white/10 rounded-2xl px-4 py-3.5 backdrop-blur-sm">
              <span className="text-xl mt-0.5 shrink-0">{f.icon}</span>
              <div>
                <p className="text-white font-semibold text-sm">{f.title}</p>
                <p className="text-indigo-200 text-xs mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Form panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-sm">

          <div className="lg:hidden mb-8">
            <BrandLogo dark />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
          <p className="text-gray-500 text-sm mb-8">
            New here?{" "}
            <Link to="/register" className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">
              Create an account
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email">
              <input
                type="email" name="email" required
                value={form.email} onChange={handleChange}
                placeholder="you@example.com"
                className={inputCls}
              />
            </Field>

            <Field label="Password">
              <input
                type="password" name="password" required
                value={form.password} onChange={handleChange}
                placeholder="••••••••"
                className={inputCls}
              />
            </Field>

            {error && <ErrorBanner msg={error} />}

            <button
              type="submit" disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
            >
              {loading ? <Spinner label="Signing in…" /> : "Sign in →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function friendlyError(code) {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// ── Shared small components ─────────────────────────────────────────────────

export function BrandLogo({ dark = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm ${dark ? "bg-indigo-600 text-white" : "bg-white/20 text-white"}`}>
        N
      </div>
      <span className={`text-xl font-bold tracking-tight ${dark ? "text-gray-900" : "text-white"}`}>
        NIRA
      </span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition placeholder:text-gray-400 shadow-sm";

export function ErrorBanner({ msg }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <span className="text-red-400 shrink-0">⚠</span>
      <p className="text-sm text-red-700">{msg}</p>
    </div>
  );
}

export function Spinner({ label = "" }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      {label}
    </span>
  );
}
