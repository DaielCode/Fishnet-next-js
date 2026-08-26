/**
 * Inicjalizacja Firebase — singleton dla całej aplikacji.
 *
 * Eksportuje gotowe instancje serwisów:
 * - `auth`    — Firebase Authentication (Google OAuth)
 * - `db`      — Firestore (baza danych)
 *
 * Inicjalizacja jest opóźniona (lazy) — pomija SSR jeśli brak zmiennych .env.local,
 * zapobiegając błędom podczas budowania Next.js.
 *
 * Wszystkie zmienne środowiskowe muszą zaczynać się od `NEXT_PUBLIC_` —
 * są one bezpieczne do użycia po stronie klienta (nie zawierają sekretów serwera).
 */
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// Inicjalizuj tylko jeśli mamy klucze (unikamy błędu SSR bez .env.local)
function getFirebaseApp() {
  if (!firebaseConfig.apiKey) return null;
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
}

const app = getFirebaseApp();

export const auth = app ? getAuth(app) : null!;
export const db = app ? getFirestore(app) : null!;
export const googleProvider = new GoogleAuthProvider();
