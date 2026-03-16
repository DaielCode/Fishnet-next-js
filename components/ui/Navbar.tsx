"use client";

/**
 * Navbar — nawigacja aplikacji.
 *
 * Zawiera dwie warstwy nawigacji:
 * 1. **Top bar** (desktop + mobile) — logo, linki do sekcji, przełącznik języka,
 *    avatar użytkownika, przycisk logowania/wylogowania
 * 2. **Bottom tab bar** (tylko mobile, `sm:hidden`) — zakładki z ikonami outline/filled
 *    zmieniającymi się w zależności od aktywnej ścieżki
 *
 * Obsługuje:
 * - Warunkowe renderowanie zakładki "Admin" (tylko gdy `isAdmin === true`)
 * - Przełącznik języka (PL/EN/UA) z dropdown pozycjonowanym relative do przycisku
 * - Otwieranie modalu "Dodaj post" bezpośrednio z navbaru
 * - Ikony SVG inline (brak zewnętrznych zależności od biblioteki ikon)
 */
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

// ── Ikony outline (nieaktywne) ─────────────────────────────────────────────
const IconMapOutline = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconFeedOutline = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);
const IconProfilOutline = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconAdminOutline = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

// ── Ikony filled (aktywne) ─────────────────────────────────────────────────
const IconMapFilled = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-2.003 3.5-4.697 3.5-8.327a8 8 0 10-16 0c0 3.63 1.556 6.326 3.5 8.327a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
);
const IconFeedFilled = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.625 1.5H9a3.75 3.75 0 013.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 013.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 01-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875zM9.75 17.25a.75.75 0 00-1.5 0V18a.75.75 0 001.5 0v-.75zm2.25-3a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3a.75.75 0 01.75-.75zm3.75-1.5a.75.75 0 00-1.5 0V18a.75.75 0 001.5 0v-4.5z" />
    <path d="M14.25 5.25a5.23 5.23 0 00-1.279-3.434 9.768 9.768 0 016.963 6.963A5.23 5.23 0 0016.5 7.5h-1.875a.375.375 0 01-.375-.375V5.25z" />
  </svg>
);
const IconProfilFilled = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clipRule="evenodd" />
  </svg>
);
const IconAdminFilled = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
  </svg>
);

export default function Navbar() {
  const { user, loading, loginWithGoogle, logout, isAdmin } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const rawPathname = usePathname();
  const pathname = rawPathname.replace(/\/$/, "") || "/";
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

  const navTabs = [
    {
      href: "/mapa",
      label: t.nav.map,
      active: pathname === "/mapa",
      color: "blue" as const,
      IconOutline: IconMapOutline,
      IconFilled: IconMapFilled,
    },
    {
      href: "/feed",
      label: t.nav.feed,
      active: pathname === "/feed",
      color: "blue" as const,
      IconOutline: IconFeedOutline,
      IconFilled: IconFeedFilled,
    },
    {
      href: "/profil",
      label: t.nav.profile,
      active: pathname === "/profil",
      color: "blue" as const,
      IconOutline: IconProfilOutline,
      IconFilled: IconProfilFilled,
    },
    ...(isAdmin
      ? [{
          href: "/admin",
          label: t.nav.admin,
          active: pathname === "/admin",
          color: "purple" as const,
          IconOutline: IconAdminOutline,
          IconFilled: IconAdminFilled,
        }]
      : []),
  ];

  return (
    <>
      {/* ── Top navbar ─────────────────────────────────────────────────────── */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="text-xl font-bold text-blue-600 flex items-center gap-1.5">
          🎣 Fishnet
        </Link>

        <div className="flex items-center gap-1.5">
          {/* Desktop nav links z ikonami */}
          {[
            { href: "/mapa",  label: t.nav.map,   Icon: IconMapOutline,   color: "blue"   },
            { href: "/feed",  label: t.nav.feed,  Icon: IconFeedOutline,  color: "blue"   },
            ...(isAdmin ? [{ href: "/admin", label: t.nav.admin, Icon: IconAdminOutline, color: "purple" }] : []),
          ].map(({ href, label, Icon, color }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`hidden sm:flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-all duration-200 font-medium ${
                  active
                    ? color === "purple"
                      ? "bg-purple-600 text-white shadow-sm"
                      : "bg-blue-600 text-white shadow-sm"
                    : color === "purple"
                      ? "text-gray-500 hover:text-purple-600 hover:bg-purple-50"
                      : "text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                }`}
              >
                <Icon />
                {label}
              </Link>
            );
          })}


          {/* Dodaj post */}
          {loading ? (
            <div className="w-24 h-8 rounded-lg bg-gray-200 animate-pulse" />
          ) : user ? (
            <button
              onClick={() => setModalOpen(true)}
              className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 cursor-pointer font-medium"
            >
              {t.feed.addPost}
            </button>
          ) : null}

          {/* Przełącznik języka */}
          <button
            onClick={openLang}
            className={`text-xs font-bold w-8 h-8 rounded-lg cursor-pointer transition-all hover:opacity-90 flex items-center justify-center ${currentLang?.colors}`}
          >
            {currentLang?.code}
          </button>

          {/* Avatar + Wyloguj — desktop */}
          {loading ? null : user ? (
            <div className="flex items-center gap-2">
              <Link href="/profil" className="hidden sm:block">
                {user.photoURL ? (
                  <Image src={user.photoURL} alt="avatar" width={32} height={32} className="rounded-full ring-2 ring-gray-100" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                    {user.displayName?.[0] ?? "W"}
                  </div>
                )}
              </Link>
              <button onClick={logout} className="hidden sm:block text-sm text-gray-400 hover:text-red-500 cursor-pointer transition-colors">
                {t.nav.logout}
              </button>
            </div>
          ) : (
            <button onClick={loginWithGoogle} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer font-medium">
              {t.nav.login}
            </button>
          )}
        </div>
      </nav>

      {/* Language dropdown */}
      {langOpen && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setLangOpen(false)} />
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

      {/* ── Bottom navigation — mobile ────────────────────────────────────── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-[1001]"
        style={{ transform: "translateZ(0)", WebkitTransform: "translateZ(0)" }}
      >
        <div
          className="bg-white flex items-stretch"
          style={{
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            boxShadow: "0 -4px 24px -4px rgba(0,0,0,0.08), 0 -1px 0 0 #f1f5f9",
          }}
        >
          {navTabs.map(({ href, label, active, color, IconOutline, IconFilled }) => (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center pt-2.5 pb-2 gap-1 group"
            >
              {/* Ikona z tłem */}
              <div
                className={`flex items-center justify-center w-14 h-8 rounded-2xl transition-all duration-200 ${
                  active
                    ? color === "purple"
                      ? "bg-purple-600 shadow-lg shadow-purple-200"
                      : "bg-blue-600 shadow-lg shadow-blue-200"
                    : color === "purple"
                      ? "group-hover:bg-purple-50"
                      : "group-hover:bg-blue-50"
                }`}
              >
                <span
                  className={`transition-all duration-200 ${
                    active
                      ? "text-white"
                      : color === "purple"
                        ? "text-gray-400 group-hover:text-purple-500"
                        : "text-gray-400 group-hover:text-blue-500"
                  }`}
                >
                  {active ? <IconFilled /> : <IconOutline />}
                </span>
              </div>
              {/* Label */}
              <span
                className={`text-[10px] font-semibold leading-none transition-colors duration-200 ${
                  active
                    ? color === "purple" ? "text-purple-600" : "text-blue-600"
                    : color === "purple"
                      ? "text-gray-400 group-hover:text-purple-500"
                      : "text-gray-400 group-hover:text-blue-500"
                }`}
              >
                {label}
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
