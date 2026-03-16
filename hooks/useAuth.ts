"use client";

import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";

/**
 * Tworzy dokument użytkownika w Firestore przy pierwszym logowaniu.
 * Jeśli dokument już istnieje — nic nie robi (idempotentne).
 *
 * @param user - Obiekt użytkownika Firebase Auth
 */
async function saveUserIfNew(user: User) {
  const { uid, displayName, photoURL } = user;
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      nick: displayName ?? "Wędkarz",
      avatar: photoURL ?? "",
      bio: "",
      followers_count: 0,
      following_count: 0,
    });
  }
}

/**
 * Hook zarządzający stanem autentykacji Firebase.
 *
 * Obsługuje:
 * - Śledzenie zalogowanego użytkownika przez `onAuthStateChanged`
 * - Logowanie przez Google OAuth (popup)
 * - Wylogowanie
 * - Sprawdzanie uprawnień admina (pole `isAdmin` w Firestore `users/{uid}`)
 *
 * @example
 * ```tsx
 * const { user, loading, loginWithGoogle, logout, isAdmin } = useAuth();
 *
 * if (loading) return <Spinner />;
 * if (!user) return <button onClick={loginWithGoogle}>Zaloguj</button>;
 * return <p>Witaj, {user.displayName}!</p>;
 * ```
 *
 * @returns
 * - `user` — zalogowany użytkownik Firebase (null = niezalogowany)
 * - `loading` — true podczas inicjalizacji Auth; renderuj UI dopiero po false
 * - `isAdmin` — true jeśli `users/{uid}.isAdmin === true` w Firestore
 * - `loginWithGoogle` — otwiera popup Google OAuth; przy nowym koncie tworzy dokument w Firestore
 * - `logout` — wylogowuje i resetuje stan
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        getDoc(doc(db, "users", firebaseUser.uid))
          .then((snap) => setIsAdmin(snap.data()?.isAdmin === true))
          .catch(() => setIsAdmin(false));
      } else {
        setIsAdmin(false);
      }
    });
    return unsubscribe;
  }, []);

  /** Loguje przez Google OAuth popup. Przy nowym koncie tworzy dokument w `users/{uid}`. */
  async function loginWithGoogle() {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await saveUserIfNew(result.user);
      const snap = await getDoc(doc(db, "users", result.user.uid));
      setIsAdmin(snap.data()?.isAdmin === true);
    } catch (err: any) {
      console.error("loginWithGoogle error:", err?.code, err?.message);
    }
  }

  /** Wylogowuje użytkownika i resetuje flagę isAdmin. */
  async function logout() {
    await signOut(auth);
    setIsAdmin(false);
  }

  return { user, loading, loginWithGoogle, logout, isAdmin };
}
