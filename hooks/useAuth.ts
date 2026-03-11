"use client";

import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";

const isMobile = () =>
  typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

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
    // Obsłuż wynik redirect po powrocie na stronę
    getRedirectResult(auth).then((result) => {
      if (result?.user) saveUserIfNew(result.user);
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function loginWithGoogle() {
    if (isMobile()) {
      await signInWithRedirect(auth, googleProvider);
    } else {
      const result = await signInWithPopup(auth, googleProvider);
      await saveUserIfNew(result.user);
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return { user, loading, loginWithGoogle, logout };
}
