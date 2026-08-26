/**
 * next.config.ts — konfiguracja Next.js dla aplikacji Fishnet.
 *
 * Eksportowana konfiguracja jest opakowana przez `withSentryConfig` który:
 * - dodaje automatyczne instrumentowanie błędów
 * - pomija generowanie source map (disable: true) — zmniejsza rozmiar buildu
 * - wycisza logi Sentry podczas budowania (silent: true)
 */
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Generuj statyczne pliki HTML zamiast serwera Node.js
  // Wymagane dla Firebase Hosting (serwuje tylko pliki statyczne)
  output: "export",
  async headers() {
    return [
      {
        source: "/(.*)", // dotyczy wszystkich ścieżek
        headers: [
          // COOP (Cross-Origin-Opener-Policy) ustawione na "unsafe-none"
          // Wymagane dla Google OAuth popup — domyślne "same-origin" blokuje
          // komunikację między oknem aplikacji a popupem Google Sign-In
          { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
        ],
      },
    ];
  },

  images: {
    // Wyłącza optymalizację obrazów Next.js (Image Optimization API)
    // Wymagane przy `output: "export"` — optymalizacja wymaga serwera
    unoptimized: true,

    // Dozwolone zewnętrzne domeny dla komponentu <Image>
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com", // avatary Google (photoURL z Firebase Auth)
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com", // nowe zdjęcia (Cloudinary)
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com", // stare zdjęcia sprzed migracji na Cloudinary
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,          // nie pokazuj logów Sentry w trakcie budowania
  telemetry: false,      // wyłącz telemetrię Sentry CLI
  sourcemaps: { disable: true }, // nie generuj source map — zmniejsza rozmiar buildu
  bundleSizeOptimizations: { excludeDebugStatements: true }, // usuń debug code z produkcji
});
