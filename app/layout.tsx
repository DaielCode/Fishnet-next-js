import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/ui/Navbar";
import { LanguageProvider } from "@/context/LanguageContext";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fishnet — Mapa Łowisk",
  description: "Społeczność wędkarzy. Mapa łowisk, stanowiska, połowy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className={`${geist.className} bg-gray-50 min-h-screen`}>
        <LanguageProvider>
          <Navbar />
          <main className="sm:pb-0 pb-16">{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
