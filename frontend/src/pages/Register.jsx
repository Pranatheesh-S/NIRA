import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile, deleteUser } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { BrandLogo, inputCls, ErrorBanner, Spinner } from "./Login";

const ROLES = [
  {
    id: "teacher",
    icon: "🎓",
    label: "Teacher",
    desc: "Create lessons & monitor class understanding",
    color: "indigo",
  },
  {
    id: "student",
    icon: "📚",
    label: "Student",
    desc: "Explain concepts and get instant AI feedback",
    color: "emerald",
  },
];

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!role) { setError("Please select a role to continue."); return; }

    setLoading(true);
    let createdUser = null;
    try {
      const { user } = await createUserWithEmailAndPassword(auth, form.email, form.password);
      createdUser = user;
      await updateProfile(user, { displayName: form.name });
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid, name: form.name, email: form.email, role,
        createdAt: serverTimestamp(),
      });
      navigate(role === "teacher" ? "/teacher" : "/student", { replace: true });
    } catch (err) {
      if (createdUser && err.code !== "auth/email-already-in-use") {
        try { await deleteUser(createdUser); } catch (_) { /* best-effort */ }
      }
      console.error("[Register]", err.code, err.message);
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Brand panel ─────────────────────────────────────────────────── */}
      <div className="hidden lg:flex w-[46%] bg-gradient-to-br from-violet-600 via-indigo-700 to-indigo-800 flex-col justify-between p-12 relative overflow-hidden shrink-0">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-white/10 rounded-full" />
        <div className="absolute -bottom-32 -left-16 w-96 h-96 bg-white/5 rounded-full" />

        <div className="relative">
          <BrandLogo />
          <h1 className="text-4xl font-bold text-white leading-tight mt-10 mb-3">
            Start your journey<br />with NIRA
          </h1>
          <p className="text-indigo-200 text-base leading-relaxed">
            Join teachers and students already using AI-powered explanations to learn better.
          </p>
        </div>

        <div className="relative">
          <div className="bg-white/10 rounded-2xl p-5 backdrop-blur-sm">
            <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-4">
              How it works
            </p>
            <div className="space-y-4">
              {[
                { step: "1", text: "Teacher creates & publishes a lesson" },
                { step: "2", text: "Student explains in their own words (voice or text)" },
                { step: "3", text: "AI evaluates and highlights knowledge gaps" },
                { step: "4", text: "Teacher sees class-wide insights in real time" },
              ].map((s) => (
                <div key={s.step} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/20 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {s.step}
                  </span>
                  <p className="text-indigo-100 text-sm">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Form panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-sm">

          <div className="lg:hidden mb-8">
            <BrandLogo dark />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Create your account</h2>
          <p className="text-gray-500 text-sm mb-7">
            Already have one?{" "}
            <Link to="/login" className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">
              Sign in
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Role selector */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">I am a…</p>
              <div className="grid grid-cols-2 gap-3">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    className={`flex flex-col items-center text-center gap-1.5 rounded-2xl border-2 py-4 px-3 transition-all cursor-pointer ${
                      role === r.id
                        ? r.id === "teacher"
                          ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100"
                          : "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-2xl">{r.icon}</span>
                    <span className={`text-sm font-semibold ${role === r.id ? (r.id === "teacher" ? "text-indigo-700" : "text-emerald-700") : "text-gray-700"}`}>
                      {r.label}
                    </span>
                    <span className="text-xs text-gray-400 leading-tight">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
              <input type="text" name="name" required value={form.name} onChange={handleChange}
                placeholder="Jane Smith" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" name="email" required value={form.email} onChange={handleChange}
                placeholder="you@example.com" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input type="password" name="password" required minLength={6} value={form.password} onChange={handleChange}
                placeholder="Min. 6 characters" className={inputCls} />
            </div>

            {error && <ErrorBanner msg={error} />}

            <button
              type="submit" disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
            >
              {loading ? <Spinner label="Creating account…" /> : "Create account →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function friendlyError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled in Firebase Console → Authentication.";
    case "permission-denied":
      return "Database permission denied. Check Firestore security rules in Firebase Console.";
    default:
      return `Sign-up failed (${code ?? "unknown"}). Check the browser console for details.`;
  }
}
