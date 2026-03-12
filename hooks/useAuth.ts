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
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        setIsAdmin(snap.data()?.isAdmin === true);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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

  async function logout() {
    await signOut(auth);
    setIsAdmin(false);
  }

  return { user, loading, loginWithGoogle, logout, isAdmin };
}
