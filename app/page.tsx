"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

export default function Home() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
      <h1 className="text-5xl font-bold text-blue-600 mb-4">🎣 Fishnet</h1>
      <p className="text-xl text-gray-600 mb-8 max-w-md">{t.home.subtitle}</p>
      <div className="flex gap-4">
        <Link href="/mapa" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition">
          {t.home.openMap}
        </Link>
        <Link href="/feed" className="border border-blue-600 text-blue-600 px-6 py-3 rounded-xl font-medium hover:bg-blue-50 transition">
          {t.home.seeFeed}
        </Link>
      </div>
    </div>
  );
}
