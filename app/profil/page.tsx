"use client";

/**
 * ProfilPage — strona profilu zalogowanego użytkownika (/profil).
 *
 * Stany renderowania:
 * 1. `loading === true`  → spinner z tekstem (Auth jeszcze się inicjalizuje)
 * 2. `user === null`     → prompt do zalogowania przez Google
 * 3. `user !== null`     → profil: avatar, nazwa, email + linki do sekcji
 *
 * Avatar pochodzi z Google (photoURL) — wyświetlany przez next/image z
 * `remotePatterns` w next.config.ts dla `lh3.googleusercontent.com`.
 * Fallback: kolorowe kółko z pierwszą literą displayName.
 *
 * Przycisk wylogowania jest widoczny tylko na mobile (`sm:hidden`),
 * bo na desktopie wylogowanie jest w Navbar.
 */
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/context/LanguageContext";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ProfilPage() {
  const { user, loading, loginWithGoogle, logout } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  if (loading) return <div className="text-center py-16 text-gray-400">{t.profile.loading}</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-gray-600">{t.profile.notLoggedIn}</p>
        <button
          onClick={loginWithGoogle}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700"
        >
          {t.profile.loginGoogle}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        {user.photoURL ? (
          <Image src={user.photoURL} alt="avatar" width={80} height={80} className="rounded-full" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl">
            {user.displayName?.[0] ?? "W"}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold">{user.displayName}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/mapa" className="bg-blue-600 text-white py-3 rounded-xl text-center font-medium hover:bg-blue-700">
          {t.profile.goToMap}
        </Link>
        <Link href="/feed" className="border border-gray-200 py-3 rounded-xl text-center font-medium hover:bg-gray-50">
          {t.profile.seeFeed}
        </Link>
      </div>

      <button
        onClick={async () => { await logout(); router.push("/"); }}
        className="sm:hidden mt-4 w-full py-3 rounded-xl text-red-500 border border-red-200 font-medium hover:bg-red-50"
      >
        {t.nav.logout}
      </button>
    </div>
  );
}
