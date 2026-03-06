import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
      <h1 className="text-5xl font-bold text-blue-600 mb-4">🎣 Fishnet</h1>
      <p className="text-xl text-gray-600 mb-8 max-w-md">
        Społeczność wędkarzy. Odkryj łowiska, dodaj swój połów i śledź innych wędkarzy.
      </p>
      <div className="flex gap-4">
        <Link
          href="/mapa"
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition"
        >
          Otwórz Mapę
        </Link>
        <Link
          href="/feed"
          className="border border-blue-600 text-blue-600 px-6 py-3 rounded-xl font-medium hover:bg-blue-50 transition"
        >
          Zobacz Feed
        </Link>
      </div>
    </div>
  );
}
