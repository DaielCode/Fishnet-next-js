"use client";

import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";

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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) saveUserIfNew(result.user);
      })
      .catch((err) => console.error("getRedirectResult error:", err));

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function loginWithGoogle() {
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error("signInWithRedirect error:", err);
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return { user, loading, loginWithGoogle, logout };
}
