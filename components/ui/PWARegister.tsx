"use client";

/**
 * PWARegister — rejestracja service workera aplikacji PWA.
 *
 * Montowany w RootLayout, nie renderuje żadnego HTML (zwraca null).
 * Rejestruje `/sw.js` który obsługuje cache offline i instalację na telefonie.
 *
 * Sprawdzenie `"serviceWorker" in navigator` jest wymagane bo:
 * - Next.js renderuje komponenty server-side gdzie `navigator` nie istnieje
 * - Starsze przeglądarki mogą nie obsługiwać Service Worker API
 */
import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);
  return null;
}
