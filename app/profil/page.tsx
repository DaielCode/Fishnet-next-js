"use client";

import { useAuth } from "@/hooks/useAuth";
import Image from "next/image";
import Link from "next/link";

export default function ProfilPage() {
  const { user, loading, loginWithGoogle } = useAuth();

  if (loading) return <div className="text-center py-16 text-gray-400">Ładowanie...</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-gray-600">Zaloguj się aby zobaczyć profil</p>
        <button
          onClick={loginWithGoogle}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700"
        >
          Zaloguj przez Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        {user.photoURL ? (
          <Image
            src={user.photoURL}
            alt="avatar"
            width={80}
            height={80}
            className="rounded-full"
          />
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
        <Link
          href="/mapa"
          className="bg-blue-600 text-white py-3 rounded-xl text-center font-medium hover:bg-blue-700"
        >
          Idź na mapę
        </Link>
        <Link
          href="/feed"
          className="border border-gray-200 py-3 rounded-xl text-center font-medium hover:bg-gray-50"
        >
          Zobacz feed
        </Link>
      </div>
    </div>
  );
}
