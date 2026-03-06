"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import Image from "next/image";

export default function Navbar() {
  const { user, loading, loginWithGoogle, logout } = useAuth();

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
      <Link href="/" className="text-xl font-bold text-blue-600">
        🎣 Fishnet
      </Link>

      <div className="flex items-center gap-4">
        <Link href="/mapa" className="text-sm text-gray-600 hover:text-blue-600">Mapa</Link>
        <Link href="/feed" className="text-sm text-gray-600 hover:text-blue-600">Feed</Link>

        {loading ? null : user ? (
          <div className="flex items-center gap-2">
            <Link href="/profil">
              {user.photoURL ? (
                <Image
                  src={user.photoURL}
                  alt="avatar"
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm">
                  {user.displayName?.[0] ?? "W"}
                </div>
              )}
            </Link>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-red-500"
            >
              Wyloguj
            </button>
          </div>
        ) : (
          <button
            onClick={loginWithGoogle}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Zaloguj przez Google
          </button>
        )}
      </div>
    </nav>
  );
}
