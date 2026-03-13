"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import {
  collection, getDocs, doc, updateDoc, deleteDoc, addDoc,
  GeoPoint, query, orderBy, onSnapshot,
} from "firebase/firestore";
import "leaflet/dist/leaflet.css";
import type { Post, Lowisko, LowiskoPropozycja } from "@/types";
import type { OsmZbiornik } from "./OsmLowiskoPicker";

const OsmLowiskoPickerDynamic = dynamic(() => import("./OsmLowiskoPicker"), {
  ssr: false,
  loading: () => (
    <div className="text-center py-10 text-sm text-gray-400">Ładowanie mapy...</div>
  ),
});

interface AdminUser {
  uid: string;
  nick: string;
  avatar: string;
  isAdmin?: boolean;
}

type Tab = "uzytkownicy" | "lowiska" | "posty" | "propozycje";

export default function AdminPanel() {
  const { user, isAdmin, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("uzytkownicy");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(collection(db, "lowiska_propozycje"), (snap) => {
      setPendingCount(snap.docs.filter((d) => d.data().status === "oczekuje").length);
    });
    return unsub;
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Ładowanie...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Musisz być zalogowany.
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🚫</div>
        <p className="font-semibold text-gray-800">Brak dostępu</p>
        <p className="text-sm text-gray-400 mt-1">Tylko administratorzy mogą tu wchodzić.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "uzytkownicy", label: "Użytkownicy" },
    { key: "lowiska", label: "Łowiska" },
    { key: "posty", label: "Posty" },
    { key: "propozycje", label: "Propozycje", badge: pendingCount },
  ];

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Panel admina</h1>
        <p className="text-sm text-gray-400 mt-0.5">Witaj, {user.displayName}</p>
      </div>

      <div className="flex gap-0 mb-5 border-b border-gray-200">
        {tabs.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 sm:flex-none px-2 sm:px-5 py-2.5 text-xs sm:text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px text-center flex items-center justify-center gap-1.5 ${
              tab === key
                ? "text-purple-600 border-purple-600"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            {label}
            {badge != null && badge > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "uzytkownicy" && <UzytkownicyTab />}
      {tab === "lowiska" && <LowiskaTab />}
      {tab === "posty" && <PostyTab />}
      {tab === "propozycje" && <PropozycjeTab />}
    </div>
  );
}

// ─── Tab: Użytkownicy ────────────────────────────────────────────────────────

function UzytkownicyTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    getDocs(collection(db, "users")).then((snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AdminUser)));
      setLoading(false);
    });
  }, []);

  async function toggleAdmin(uid: string, current: boolean) {
    setSaving(uid);
    await updateDoc(doc(db, "users", uid), { isAdmin: !current });
    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, isAdmin: !current } : u))
    );
    setSaving(null);
  }

  const filtered = users.filter(
    (u) =>
      u.nick?.toLowerCase().includes(search.toLowerCase()) ||
      u.uid.includes(search)
  );

  if (loading) {
    return <div className="text-gray-400 py-8 text-center text-sm">Ładowanie...</div>;
  }

  return (
    <div>
      <input
        type="text"
        placeholder="Szukaj po nicku lub UID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400 mb-4 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
      />
      <div className="space-y-2">
        {filtered.map((u) => (
          <div
            key={u.uid}
            className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 sm:px-4 py-3 shadow-sm"
          >
            {u.avatar ? (
              <img src={u.avatar} alt={u.nick} referrerPolicy="no-referrer" className="w-9 h-9 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                {u.nick?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-gray-900 truncate">{u.nick}</p>
              <p className="text-xs text-gray-400 font-mono truncate">{u.uid}</p>
            </div>
            <button
              onClick={() => toggleAdmin(u.uid, !!u.isAdmin)}
              disabled={saving === u.uid}
              className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                u.isAdmin
                  ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600"
                  : "bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700"
              }`}
            >
              {saving === u.uid ? "..." : u.isAdmin ? "Admin ✓" : "Nadaj admina"}
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Brak wyników</p>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Łowiska ────────────────────────────────────────────────────────────

type OsmStep = "idle" | "picking" | "form";

function LowiskaTab() {
  const [lowiska, setLowiska] = useState<Lowisko[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Pola formularza
  const [nazwa, setNazwa] = useState("");
  const [opis, setOpis] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [kolor, setKolor] = useState("#1d4ed8");
  const [geojsonFile, setGeojsonFile] = useState<File | null>(null);

  // Flow OSM
  const [osmStep, setOsmStep] = useState<OsmStep>("idle");
  const [osmGeojson, setOsmGeojson] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    getDocs(collection(db, "lowiska")).then((snap) => {
      setLowiska(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lowisko)));
      setLoadingList(false);
    });
  }, []);

  function handleOsmConfirm(zbiornik: OsmZbiornik, autoName: string) {
    setNazwa(autoName);
    setLat(String(zbiornik.centroid[0]));
    setLng(String(zbiornik.centroid[1]));
    setOsmGeojson({ type: "FeatureCollection", features: [zbiornik.geojson] });
    setOsmStep("form");
  }

  function resetForm() {
    setNazwa("");
    setOpis("");
    setLat("");
    setLng("");
    setKolor("#1d4ed8");
    setGeojsonFile(null);
    setOsmGeojson(null);
    setOsmStep("idle");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nazwa.trim()) return setError("Podaj nazwę łowiska.");

    let geojson_data: GeoJSON.FeatureCollection | undefined;
    if (osmGeojson) {
      geojson_data = osmGeojson;
    } else if (geojsonFile) {
      try {
        const text = await geojsonFile.text();
        geojson_data = JSON.parse(text);
      } catch {
        return setError("Niepoprawny plik GeoJSON — sprawdź czy to prawidłowy JSON.");
      }
    }

    const latNum = parseFloat(lat.replace(",", "."));
    const lngNum = parseFloat(lng.replace(",", "."));
    if (isNaN(latNum) || isNaN(lngNum)) return setError("Podaj poprawne współrzędne (np. 49.8877).");

    setSaving(true);
    try {
      const docData: Record<string, unknown> = {
        nazwa: nazwa.trim(),
        opis: opis.trim(),
        lokalizacja: new GeoPoint(latNum, lngNum),
        kolor,
      };
      // Firestore nie obsługuje zagnieżdżonych tablic — GeoJSON musi być stringiem
      if (geojson_data) docData.geojson_data = JSON.stringify(geojson_data);

      const ref = await addDoc(collection(db, "lowiska"), docData);
      setLowiska((prev) => [...prev, { id: ref.id, ...docData } as Lowisko]);
      resetForm();
    } catch (err: unknown) {
      console.error("Błąd zapisu łowiska:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Błąd zapisu: ${msg}`);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Usunąć to łowisko? Tej operacji nie można cofnąć.")) return;
    setDeleting(id);
    await deleteDoc(doc(db, "lowiska", id));
    setLowiska((prev) => prev.filter((l) => l.id !== id));
    setDeleting(null);
  }

  return (
    <div className="space-y-6">
      {/* Sekcja dodawania */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">

        {/* ── Krok 1: wybór metody ── */}
        {osmStep === "idle" && (
          <>
            <h2 className="font-semibold text-base mb-4 text-gray-900">Dodaj nowe łowisko</h2>
            <div className="space-y-3">
              <button
                onClick={() => setOsmStep("picking")}
                className="w-full bg-blue-600 text-white text-sm px-5 py-3 rounded-xl hover:bg-blue-700 cursor-pointer font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>🗺️</span>
                <span>Wyszukaj zbiornik w OpenStreetMap</span>
              </button>
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">lub</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <button
                onClick={() => setOsmStep("form")}
                className="w-full border border-gray-200 text-gray-600 text-sm px-5 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer font-medium transition-colors"
              >
                Dodaj ręcznie (własne współrzędne / plik GeoJSON)
              </button>
            </div>
          </>
        )}

        {/* ── Krok 2: picker OSM ── */}
        {osmStep === "picking" && (
          <>
            <h2 className="font-semibold text-base mb-4 text-gray-900">Wybierz zbiornik z OSM</h2>
            <OsmLowiskoPickerDynamic
              onConfirm={handleOsmConfirm}
              onCancel={() => setOsmStep("idle")}
            />
          </>
        )}

        {/* ── Krok 3: formularz potwierdzenia ── */}
        {osmStep === "form" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base text-gray-900">
                {osmGeojson ? "Zatwierdź łowisko" : "Dodaj łowisko ręcznie"}
              </h2>
              <button
                onClick={resetForm}
                className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                ✕ Anuluj
              </button>
            </div>

            {osmGeojson && (
              <div className="flex items-center gap-2 mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span>✓</span>
                <span>Geometria pobrana z OpenStreetMap</span>
                <button
                  onClick={() => setOsmStep("picking")}
                  className="ml-auto text-blue-600 hover:underline cursor-pointer"
                >
                  Zmień
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                placeholder="Nazwa łowiska *"
                value={nazwa}
                onChange={(e) => setNazwa(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
              />
              <textarea
                placeholder="Opis (opcjonalnie)"
                value={opis}
                onChange={(e) => setOpis(e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all resize-none"
              />

              {/* Współrzędne — tylko w trybie ręcznym */}
              {!osmGeojson && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Szerokość (lat) *"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                  />
                  <input
                    type="text"
                    placeholder="Długość (lng) *"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-500">Kolor na mapie:</label>
                <input
                  type="color"
                  value={kolor}
                  onChange={(e) => setKolor(e.target.value)}
                  className="w-10 h-8 rounded-lg cursor-pointer border border-gray-200"
                />
                <span className="text-xs text-gray-400 font-mono">{kolor}</span>
              </div>

              {/* Upload pliku — tylko w trybie ręcznym */}
              {!osmGeojson && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    Plik GeoJSON{" "}
                    <span className="text-gray-400">(opcjonalnie — obszar łowiska)</span>
                  </label>
                  <input
                    type="file"
                    accept=".geojson,.json"
                    onChange={(e) => setGeojsonFile(e.target.files?.[0] ?? null)}
                    className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-600 hover:file:bg-purple-100 cursor-pointer"
                  />
                  {geojsonFile && (
                    <p className="text-xs text-green-600 mt-1">Wybrano: {geojsonFile.name}</p>
                  )}
                </div>
              )}

              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-purple-600 text-white text-sm px-5 py-2 rounded-xl hover:bg-purple-700 disabled:opacity-50 cursor-pointer font-medium transition-colors"
              >
                {saving ? "Zapisywanie..." : "Dodaj łowisko"}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Lista istniejących */}
      <div>
        <h2 className="font-semibold text-base mb-3 text-gray-900">
          Łowiska w Firestore ({lowiska.length})
        </h2>
        {loadingList ? (
          <div className="text-gray-400 text-sm text-center py-6">Ładowanie...</div>
        ) : (
          <div className="space-y-2">
            {lowiska.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 border border-white shadow-sm"
                    style={{ background: l.kolor ?? "#1d4ed8" }}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{l.nazwa}</p>
                    <p className="text-xs text-gray-400">
                      {l.geojson_data ? "GeoJSON ✓" : "Bez GeoJSON"} ·{" "}
                      {l.lokalizacja?.latitude?.toFixed(4)},{" "}
                      {l.lokalizacja?.longitude?.toFixed(4)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(l.id)}
                  disabled={deleting === l.id}
                  className="flex-shrink-0 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {deleting === l.id ? "..." : "Usuń"}
                </button>
              </div>
            ))}
            {lowiska.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-6">
                Brak łowisk w Firestore. Dodaj pierwsze powyżej.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Posty ──────────────────────────────────────────────────────────────

function PostyTab() {
  const [posty, setPosty] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "posty"), orderBy("timestamp", "desc"));
    getDocs(q).then((snap) => {
      setPosty(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post)));
      setLoading(false);
    });
  }, []);

  async function handleDelete(post: Post) {
    if (!window.confirm("Usunąć ten post?")) return;
    setDeleting(post.id);
    try {
      await deleteDoc(doc(db, "posty", post.id));
      setPosty((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err) {
      console.error(err);
    }
    setDeleting(null);
  }

  if (loading) {
    return <div className="text-gray-400 py-8 text-center text-sm">Ładowanie...</div>;
  }

  return (
    <div>
      <p className="text-sm text-gray-400 mb-4">{posty.length} postów</p>
      <div className="space-y-2">
        {posty.map((post) => {
          const date =
            post.timestamp?.toDate?.()?.toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }) ?? "";

          return (
            <div
              key={post.id}
              className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {post.zdjecia?.[0] && (
                  <img
                    src={post.zdjecia[0]}
                    alt="połów"
                    referrerPolicy="no-referrer"
                    className="w-20 rounded-lg object-contain flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {post.typ_ryby}
                    {post.nazwa_ryby ? ` — ${post.nazwa_ryby}` : ""}
                    {post.waga_kg ? ` · ${post.waga_kg} kg` : ""}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    <span className="font-mono">{post.user_id.slice(0, 12)}…</span> · {date}
                  </p>
                  {post.opis && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{post.opis}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(post)}
                disabled={deleting === post.id}
                className="flex-shrink-0 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting === post.id ? "..." : "Usuń"}
              </button>
            </div>
          );
        })}
        {posty.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Brak postów</p>
        )}
      </div>
    </div>
  );
}

// ─── Mini podgląd mapy ───────────────────────────────────────────────────────

function MiniMapPreview({ lat, lng, geojsonData, kolor }: {
  lat: number;
  lng: number;
  geojsonData?: string;
  kolor?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      setTimeout(() => { if (!cancelled) map.invalidateSize(); }, 50);

      if (geojsonData) {
        try {
          const geojson = JSON.parse(geojsonData);
          const layer = L.geoJSON(geojson, {
            style: {
              color: kolor ?? "#1d4ed8",
              weight: 2,
              fillOpacity: 0.25,
              fillColor: kolor ?? "#1d4ed8",
            },
          }).addTo(map);
          map.fitBounds(layer.getBounds(), { padding: [12, 12] });
        } catch {
          L.circleMarker([lat, lng], {
            radius: 10,
            color: kolor ?? "#1d4ed8",
            fillColor: kolor ?? "#1d4ed8",
            fillOpacity: 0.5,
            weight: 2,
          }).addTo(map);
        }
      } else {
        L.circleMarker([lat, lng], {
          radius: 10,
          color: kolor ?? "#1d4ed8",
          fillColor: kolor ?? "#1d4ed8",
          fillOpacity: 0.5,
          weight: 2,
        }).addTo(map);
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng, geojsonData, kolor]);

  return (
    <div
      ref={containerRef}
      style={{ height: 160, borderRadius: 12, overflow: "hidden", background: "#e5e7eb" }}
    />
  );
}

// ─── Tab: Propozycje łowisk ───────────────────────────────────────────────────

function PropozycjeTab() {
  const [propozycje, setPropozycje] = useState<LowiskoPropozycja[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "lowiska_propozycje"), (snap) => {
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as LowiskoPropozycja))
        .filter((p) => p.status === "oczekuje")
        .sort((a, b) => b.timestamp?.toMillis?.() - a.timestamp?.toMillis?.());
      setPropozycje(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleAccept(p: LowiskoPropozycja) {
    setProcessing(p.id);
    try {
      const docData: Record<string, unknown> = {
        nazwa: p.nazwa,
        opis: p.opis,
        lokalizacja: p.lokalizacja,
        kolor: p.kolor,
      };
      if (p.geojson_data) docData.geojson_data = p.geojson_data;
      await addDoc(collection(db, "lowiska"), docData);
      await updateDoc(doc(db, "lowiska_propozycje", p.id), { status: "zaakceptowane" });
    } catch (err) {
      console.error(err);
    }
    setProcessing(null);
  }

  async function handleReject(id: string) {
    setProcessing(id);
    try {
      await updateDoc(doc(db, "lowiska_propozycje", id), { status: "odrzucone" });
    } catch (err) {
      console.error(err);
    }
    setProcessing(null);
  }

  if (loading) return <div className="text-gray-400 py-8 text-center text-sm">Ładowanie...</div>;

  return (
    <div>
      <p className="text-sm text-gray-400 mb-4">
        {propozycje.length === 0 ? "Brak oczekujących propozycji" : `${propozycje.length} oczekujących propozycji`}
      </p>
      <div className="space-y-3">
        {propozycje.map((p) => {
          const date = p.timestamp?.toDate?.()?.toLocaleDateString("pl-PL", {
            day: "numeric", month: "short", year: "numeric",
          }) ?? "";
          const lat = p.lokalizacja?.latitude;
          const lng = p.lokalizacja?.longitude;
          return (
            <div
              key={p.id}
              className="bg-white border border-gray-100 rounded-2xl px-4 py-4 shadow-sm space-y-3"
            >
              {lat != null && lng != null && (
                <MiniMapPreview
                  lat={lat}
                  lng={lng}
                  geojsonData={p.geojson_data}
                  kolor={p.kolor}
                />
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 border border-white shadow-sm"
                      style={{ background: p.kolor ?? "#1d4ed8" }}
                    />
                    <p className="font-semibold text-sm text-gray-900 truncate">{p.nazwa}</p>
                  </div>
                  {p.opis && <p className="text-xs text-gray-500 mb-1">{p.opis}</p>}
                  <p className="text-xs text-gray-400 font-mono">
                    {lat?.toFixed(4)}, {lng?.toFixed(4)}
                    {p.geojson_data ? " · GeoJSON ✓" : ""}
                  </p>
                  <p className="text-xs text-gray-300 mt-0.5">
                    Zgłoszone: {date} · <span className="font-mono">{p.user_id?.slice(0, 12)}…</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(p)}
                  disabled={processing === p.id}
                  className="flex-1 bg-green-600 text-white text-sm font-medium py-2 rounded-xl hover:bg-green-700 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {processing === p.id ? "..." : "✓ Akceptuj"}
                </button>
                <button
                  onClick={() => handleReject(p.id)}
                  disabled={processing === p.id}
                  className="flex-1 border border-red-200 text-red-500 text-sm font-medium py-2 rounded-xl hover:bg-red-50 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {processing === p.id ? "..." : "✕ Odrzuć"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
