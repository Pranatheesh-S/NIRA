import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, userDoc, loading } = useAuth();
  const [docTimedOut, setDocTimedOut] = useState(false);

  // If the user is authenticated but their Firestore doc hasn't arrived yet,
  // wait up to 5 s before giving up (handles Firestore rules issues).
  useEffect(() => {
    if (!loading && user && !userDoc) {
      const t = setTimeout(() => setDocTimedOut(true), 5000);
      return () => clearTimeout(t);
    }
    setDocTimedOut(false);
  }, [loading, user, userDoc]);

  // Still waiting for auth or user doc
  if (loading || (user && !userDoc && !docTimedOut)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Auth user exists but no Firestore doc after timeout → broken account, force logout
  if (docTimedOut && user && !userDoc) {
    signOut(auth);
    return <Navigate to="/login" replace />;
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRole && userDoc?.role !== allowedRole) {
    return <Navigate to={userDoc?.role === "teacher" ? "/teacher" : "/student"} replace />;
  }

  return children;
}
