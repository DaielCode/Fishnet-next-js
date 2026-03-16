/**
 * RootLayout — główny layout całej aplikacji Next.js App Router.
 *
 * Opakowuje każdą stronę w:
 * - `LanguageProvider` — kontekst i18n (PL/EN/UA), język z localStorage
 * - `Navbar`          — nawigacja top (desktop) + bottom tabs (mobile)
 * - `PWARegister`     — rejestracja service workera dla trybu offline PWA
 *
 * CSS custom property `--map-bottom-offset` (z globals.css) kompensuje
 * wysokość dolnego paska nawigacji na mobile, żeby mapa nie była zasłonięta.
 *
 * Metadata definiuje tytuł/opis strony i konfigurację PWA:
 * - manifest.json — ikony, kolory, tryb standalone na telefonie
 * - appleWebApp   — meta tagi dla "Dodaj do ekranu głównego" na iOS
 */
import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/ui/Navbar";
import { LanguageProvider } from "@/context/LanguageContext";
import PWARegister from "@/components/ui/PWARegister";

export const metadata: Metadata = {
  title: "Fishnet — Mapa Łowisk",
  description: "Społeczność wędkarzy. Mapa łowisk, stanowiska, połowy.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fishnet",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <head>
        <meta name="theme-color" content="#2563eb" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
      </head>
      <body className="bg-gray-50 min-h-screen" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
        <LanguageProvider>
          <Navbar />
          <main style={{ paddingBottom: "var(--map-bottom-offset)" }}>{children}</main>
        </LanguageProvider>
        <PWARegister />
      </body>
    </html>
  );
}
