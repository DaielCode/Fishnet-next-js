"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function loginWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    const { uid, displayName, photoURL } = result.user;

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

  async function logout() {
    await signOut(auth);
  }

  return { user, loading, loginWithGoogle, logout };
}
