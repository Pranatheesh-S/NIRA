import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let docUnsub = null;

    const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
      // Cancel any previous Firestore listener
      if (docUnsub) { docUnsub(); docUnsub = null; }

      if (firebaseUser) {
        setUser(firebaseUser);
        // onSnapshot fires immediately with cached/local data, then again on
        // server confirmation — this ensures we pick up the role written by
        // Register.jsx before navigate() is called.
        docUnsub = onSnapshot(
          doc(db, "users", firebaseUser.uid),
          (snap) => {
            setUserDoc(snap.exists() ? snap.data() : null);
            setLoading(false);
          },
          (err) => {
            console.error("[AuthContext] Firestore read failed:", err.code, err.message);
            setUserDoc(null);
            setLoading(false);
          },
        );
      } else {
        setUser(null);
        setUserDoc(null);
        setLoading(false);
      }
    });

    return () => {
      authUnsub();
      if (docUnsub) docUnsub();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userDoc, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
