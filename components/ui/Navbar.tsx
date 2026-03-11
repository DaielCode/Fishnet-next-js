"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/context/LanguageContext";
import type { Lang } from "@/lib/i18n/translations";
import Image from "next/image";
import dynamic from "next/dynamic";

const DodajPostFeedModal = dynamic(() => import("@/components/feed/DodajPostFeedModal"), { ssr: false });

const LANGS: { lang: Lang; code: string; label: string; colors: string }[] = [
  { lang: "pl", code: "PL", label: "Polski",      colors: "bg-red-500 text-white" },
  { lang: "en", code: "EN", label: "English",     colors: "bg-blue-700 text-white" },
  { lang: "uk", code: "UA", label: "Українська",  colors: "bg-yellow-400 text-blue-800" },
];

interface DropdownPos { top: number; right: number }

export default function Navbar() {
  const { user, loading, loginWithGoogle, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [langPos, setLangPos] = useState<DropdownPos>({ top: 56, right: 16 });

  function openLang(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setLangPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    setLangOpen((v) => !v);
  }

  const currentLang = LANGS.find((l) => l.lang === lang);

  return (
    <>
      {/* Top navbar */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="text-xl font-bold text-blue-600">
          🎣 Fishnet
        </Link>

        <div className="flex items-center gap-2">
          {/* Mapa i Feed — tylko desktop */}
          <Link href="/mapa" className={`hidden sm:block text-sm px-3 py-1.5 rounded-lg transition-colors ${pathname === "/mapa" ? "text-blue-600 bg-blue-50 font-medium" : "text-gray-600 hover:text-blue-600 hover:bg-gray-50"}`}>
            {t.nav.map}
          </Link>
          <Link href="/feed" className={`hidden sm:block text-sm px-3 py-1.5 rounded-lg transition-colors ${pathname === "/feed" ? "text-blue-600 bg-blue-50 font-medium" : "text-gray-600 hover:text-blue-600 hover:bg-gray-50"}`}>
            {t.nav.feed}
          </Link>

          {/* + Dodaj post */}
          {user && (
            <button
              onClick={() => setModalOpen(true)}
              className="bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 cursor-pointer font-bold flex items-center justify-center sm:px-3 sm:py-1.5 w-8 h-8 sm:w-auto sm:h-auto"
            >
              <span className="sm:hidden">+</span>
              <span className="hidden sm:inline">{t.feed.addPost}</span>
            </button>
          )}

          {/* Przełącznik języka */}
          <button
            onClick={openLang}
            className={`text-xs font-bold w-8 h-8 rounded-lg cursor-pointer transition-all hover:opacity-90 flex items-center justify-center ${currentLang?.colors}`}
          >
            {currentLang?.code}
          </button>

          {/* Avatar + Wyloguj — tylko desktop */}
          {loading ? null : user ? (
            <div className="flex items-center gap-2">
              <Link href="/profil" className="hidden sm:block">
                {user.photoURL ? (
                  <Image src={user.photoURL} alt="avatar" width={32} height={32} className="rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm">
                    {user.displayName?.[0] ?? "W"}
                  </div>
                )}
              </Link>
              <button onClick={logout} className="hidden sm:block text-sm text-gray-500 hover:text-red-500 cursor-pointer">
                {t.nav.logout}
              </button>
            </div>
          ) : (
            <button onClick={loginWithGoogle} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer">
              {t.nav.login}
            </button>
          )}
        </div>
      </nav>

      {/* Language dropdown — poza nav, żeby uniknąć stacking context */}
      {langOpen && (
        <>
          <div
            className="fixed inset-0 z-[998]"
            onClick={() => setLangOpen(false)}
          />
          <div
            style={{ position: "fixed", top: langPos.top, right: langPos.right, zIndex: 9999 }}
            className="bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden min-w-[160px]"
          >
            {LANGS.map(({ lang: l, code, label, colors }) => {
              const active = lang === l;
              return (
                <button
                  key={l}
                  onClick={(e) => { e.stopPropagation(); setLang(l); setLangOpen(false); }}
                  className={`flex items-center gap-3 w-full px-4 py-3 text-sm cursor-pointer transition-colors ${active ? "bg-gray-100" : "hover:bg-gray-50"}`}
                >
                  <span className={`text-xs font-bold w-9 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${colors}`}>{code}</span>
                  <span className={`flex-1 text-left ${active ? "font-semibold text-gray-900" : "text-gray-600"}`}>{label}</span>
                  {active && (
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {modalOpen && <DodajPostFeedModal onClose={() => setModalOpen(false)} />}

      {/* Bottom navigation — tylko mobile */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 flex">
        <Link
          href="/mapa"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors ${
            pathname === "/mapa" ? "text-blue-600" : "text-gray-500"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          {t.nav.map}
        </Link>

        <Link
          href="/feed"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors ${
            pathname === "/feed" ? "text-blue-600" : "text-gray-500"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          {t.nav.feed}
        </Link>

        <Link
          href="/profil"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs font-medium transition-colors ${
            pathname === "/profil" ? "text-blue-600" : "text-gray-500"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {t.nav.profile}
        </Link>
      </nav>

    </>
  );
}
