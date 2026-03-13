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
