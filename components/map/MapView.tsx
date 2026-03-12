"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import { useSearchParams } from "next/navigation";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { collection, getDocs, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLanguage } from "@/context/LanguageContext";
import type { Stanowisko, Lowisko, Post } from "@/types";

// Fix domyślnych ikon Leaflet
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Ikona dla pinów postów
const ikonaPosta = L.divIcon({
  html: `<div style="
    background:#2563eb;color:white;border-radius:50%;width:32px;height:32px;
    display:flex;align-items:center;justify-content:center;font-size:16px;
    border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);
  ">🎣</div>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Wszystkie warstwy GeoJSON z QGIS
const WARSTWY = [
  { id: "uroczysko_karpiowe",  plik: "/geojson/uroczysko_karpiowe.geojson",  kolor: "#1d4ed8" },
  { id: "karpiowe_rezerwacje", plik: "/geojson/karpiowe_rezerwacje.geojson", kolor: "#7c3aed" },
  { id: "obok_uroczyska",      plik: "/geojson/obok_uroczyska.geojson",      kolor: "#0284c7" },
  { id: "zbiorniki_ligota",    plik: "/geojson/zbiorniki_ligota.geojson",    kolor: "#0369a1" },
];


interface WarstwaGeo {
  id: string;
  kolor: string;
  data: GeoJSON.FeatureCollection;
}

interface LowiskoKlik {
  nazwa: string;
  lowisko_id: string;
  lat: number;
  lng: number;
}

// ─── Centrowanie na lokalizacji użytkownika przy starcie ─────────────────────

function GeolocateOnMount() {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Ignoruj wynik jeśli dokładność gorsza niż 5km (IP-based, np. Starlink)
        if (pos.coords.accuracy > 5000) return;
        map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      },
      () => {},
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 }
    );
  }, [map]);
  return null;
}

// ─── Kontroler wyszukiwania lokalizacji ──────────────────────────────────────

function SearchFlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const prev = useRef<string>("");
  useEffect(() => {
    if (!target) return;
    const key = `${target[0]},${target[1]}`;
    if (prev.current === key) return;
    prev.current = key;
    map.flyTo(target, 13, { duration: 1.2 });
  }, [target, map]);
  return null;
}

function MapController() {
  const map = useMap();
  const params = useSearchParams();
  const lat = parseFloat(params.get("lat") ?? "");
  const lng = parseFloat(params.get("lng") ?? "");

  useEffect(() => {
    if (isNaN(lat) || isNaN(lng)) return;
    map.flyTo([lat, lng], 17, { duration: 1.2 });
  }, [lat, lng, map]);

  return null;
}

interface Props {
  onStanowiskoClick?: (stanowisko: Stanowisko, lowisko: Lowisko) => void;
  onLowiskoClick?: (info: LowiskoKlik) => void;
}

export default function MapView({ onStanowiskoClick, onLowiskoClick }: Props) {
  const [stanowiska, setStanowiska] = useState<Stanowisko[]>([]);
  const [lowiska, setLowiska] = useState<Lowisko[]>([]);
  const [warstwy, setWarstwy] = useState<WarstwaGeo[]>([]);
  const [postyZPinami, setPostyZPinami] = useState<Post[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState<[number, number] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const { t } = useLanguage();

  async function handleMapSearch() {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    setSearching(true);
    setSearchNotFound(false);
    try {
      // Najpierw szukaj po nazwie łowiska
      const trafione = lowiska.find((l) => l.nazwa.toLowerCase().includes(q));
      if (trafione?.lokalizacja) {
        setSearchTarget([trafione.lokalizacja.latitude, trafione.lokalizacja.longitude]);
        return;
      }
      // Fallback: Nominatim (tylko miejscowości w Polsce)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=pl,ua,cz,hu,at,be,bg,cy,de,dk,ee,es,fi,fr,gr,hr,ie,it,lt,lu,lv,mt,nl,pt,ro,se,si,sk`,
        { headers: { "Accept-Language": "pl" } }
      );
      const data = await res.json();
      const miejscowosc = data.find((r: { class: string }) => r.class === "place");
      if (miejscowosc) {
        setSearchTarget([parseFloat(miejscowosc.lat), parseFloat(miejscowosc.lon)]);
      } else {
        setSearchNotFound(true);
      }
    } catch { /* cicho pomiń */ }
    finally { setSearching(false); }
  }

  useEffect(() => {
    async function fetchAll() {
      // GeoJSON warstwy statyczne z /public/
      const staticWarstwy = await Promise.all(
        WARSTWY.map(async ({ id, plik, kolor }) => {
          try {
            const res = await fetch(plik);
            if (!res.ok) return null;
            return { id, kolor, data: await res.json() } as WarstwaGeo;
          } catch {
            return null;
          }
        })
      );

      // Lowiska + stanowiska z Firestore
      const snap = await getDocs(collection(db, "lowiska"));
      const lowiskaData = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lowisko));
      setLowiska(lowiskaData);

      const all: Stanowisko[] = [];
      for (const l of lowiskaData) {
        const s = await getDocs(collection(db, "lowiska", l.id, "stanowiska"));
        s.docs.forEach((d) => all.push({ id: d.id, lowisko_id: l.id, ...d.data() } as Stanowisko));
      }
      setStanowiska(all);

      // GeoJSON z Firestore (łowiska dodane przez admina) — przechowywane jako JSON string
      const firestoreWarstwy = lowiskaData
        .filter((l) => l.geojson_data)
        .map((l) => {
          let data: GeoJSON.FeatureCollection;
          try {
            data = typeof l.geojson_data === "string"
              ? JSON.parse(l.geojson_data)
              : (l.geojson_data as unknown as GeoJSON.FeatureCollection);
          } catch {
            return null;
          }
          return { id: `fs_${l.id}`, kolor: l.kolor ?? "#1d4ed8", data };
        })
        .filter(Boolean) as WarstwaGeo[];

      setWarstwy([...(staticWarstwy.filter(Boolean) as WarstwaGeo[]), ...firestoreWarstwy]);
    }

    // Posty z pinami (mają lat/lng)
    const q = query(collection(db, "posty"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const posty = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Post))
        .filter((p) => p.lat != null && p.lng != null);
      setPostyZPinami(posty);
    });

    fetchAll();
    return unsub;
  }, []);

  return (
    <>
    <div className="relative w-full h-full" style={{ minHeight: 0 }}>

      {/* ── Wyszukiwarka lokalizacji (overlay) ── */}
      <div
        style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 1000, width: "min(340px, calc(100% - 24px))" }}
      >
        <div className="flex gap-1.5 bg-white rounded-2xl shadow-lg border border-gray-200 p-1.5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchNotFound(false); }}
            onKeyDown={(e) => e.key === "Enter" && handleMapSearch()}
            placeholder="Szukaj łowiska lub miejscowości..."
            className="flex-1 px-3 py-1.5 text-sm text-gray-900 bg-transparent placeholder:text-gray-400 outline-none"
          />
          <button
            onClick={handleMapSearch}
            disabled={searching}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {searching ? "..." : "Szukaj"}
          </button>
        </div>
        {searchNotFound && (
          <p className="text-xs text-red-500 bg-white rounded-xl px-3 py-1.5 mt-1 shadow text-center">
            Nie znaleziono łowiska ani miejscowości
          </p>
        )}
      </div>

    <MapContainer
      center={[49.8877, 18.9510]}
      zoom={15}
      className="w-full h-full"
      style={{ minHeight: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeolocateOnMount />
      <MapController />
      <SearchFlyTo target={searchTarget} />

      {/* Wszystkie warstwy GeoJSON */}
      {warstwy.map((w) => (
        <GeoJSON
          key={w.id}
          data={w.data}
          style={{
            color: w.kolor,
            weight: 2,
            fillColor: w.kolor,
            fillOpacity: 0.2,
          }}
          onEachFeature={(feature, layer) => {
            const firestoreNazwa = w.id.startsWith("fs_")
              ? lowiska.find((l) => l.id === w.id.slice(3))?.nazwa
              : undefined;
            const nazwa = firestoreNazwa ?? feature.properties?.name ?? t.map.fishingSpot;
            layer.on({
              click: (e) => {
                onLowiskoClick?.({
                  nazwa,
                  lowisko_id: w.id,
                  lat: e.latlng.lat,
                  lng: e.latlng.lng,
                });
                L.DomEvent.stopPropagation(e);
              },
              mouseover: (e) => {
                e.target.setStyle({ weight: 3, fillOpacity: 0.45 });
                e.target._map?.getContainer().style.setProperty("cursor", "pointer");
              },
              mouseout: (e) => {
                e.target.setStyle({ weight: 2, fillOpacity: 0.2 });
                e.target._map?.getContainer().style.setProperty("cursor", "");
              },
            });
          }}
        />
      ))}

      {/* Markery stanowisk */}
      <MarkerClusterGroup chunkedLoading showCoverageOnHover={false}>
        {stanowiska.map((s) => {
          const lowisko = lowiska.find((l) => l.id === s.lowisko_id);
          return (
            <Marker key={s.id} position={[s.wspolrzedne.latitude, s.wspolrzedne.longitude]}>
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">{t.map.station} {s.numer}</p>
                  <p className="text-gray-600">{lowisko?.nazwa}</p>
                  {s.opis && <p className="mt-1">{s.opis}</p>}
                  {onStanowiskoClick && lowisko && (
                    <button
                      onClick={() => onStanowiskoClick(s, lowisko)}
                      className="mt-2 w-full bg-blue-600 text-white text-xs py-1 px-2 rounded hover:bg-blue-700"
                    >
                      {t.map.addCatch}
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MarkerClusterGroup>

      {/* Piny postów */}
      <MarkerClusterGroup
        chunkedLoading
        showCoverageOnHover={false}
        iconCreateFunction={(cluster: { getChildCount: () => number }) => L.divIcon({
          html: `<div style="background:#2563eb;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${cluster.getChildCount()}</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })}
      >
      {postyZPinami.map((post) => (
          <Marker key={post.id} position={[post.lat!, post.lng!]} icon={ikonaPosta}>
            <Tooltip direction="top" offset={[0, -20]} opacity={1} interactive>
              <div style={{ fontSize: 13, minWidth: 180 }}>
                {post.zdjecia?.[0] && (
                  <img
                    src={post.zdjecia[0]}
                    alt="połów"
                    onClick={() => setLightbox(post.zdjecia[0])}
                    style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6, marginBottom: 8, cursor: "zoom-in" }}
                  />
                )}
                <p style={{ fontWeight: 700, margin: "0 0 4px" }}>
                  {post.typ_ryby}{post.nazwa_ryby ? ` — ${post.nazwa_ryby}` : ""}
                </p>
                {post.waga_kg && <p style={{ color: "#6b7280", margin: "2px 0" }}>⚖️ {post.waga_kg} kg</p>}
                {post.dlugosc_cm && <p style={{ color: "#6b7280", margin: "2px 0" }}>📏 {post.dlugosc_cm} cm</p>}
                {post.opis && (
                  <p style={{ color: "#374151", margin: "6px 0" }}>{post.opis}</p>
                )}
                <a
                  href={`/feed?post=${post.id}`}
                  style={{ display: "block", marginTop: 8, background: "#2563eb", color: "#fff", textAlign: "center", padding: "6px 8px", borderRadius: 6, textDecoration: "none", fontSize: 12, fontWeight: 600 }}
                >
                  {t.map.seePost}
                </a>
                <button
                  onClick={() => onLowiskoClick?.({ nazwa: post.lokalizacja_nazwa || t.map.fishingSpot, lowisko_id: post.lowisko_id, lat: post.lat!, lng: post.lng! })}
                  style={{ display: "block", width: "100%", marginTop: 6, background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac", textAlign: "center", padding: "6px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  {t.map.addPostHere}
                </button>
              </div>
            </Tooltip>
            <Popup>
              <div style={{ fontSize: 13, minWidth: 180 }}>
                {post.zdjecia?.[0] && (
                  <img
                    src={post.zdjecia[0]}
                    alt="połów"
                    onClick={() => setLightbox(post.zdjecia[0])}
                    style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6, marginBottom: 8, cursor: "zoom-in" }}
                  />
                )}
                <p style={{ fontWeight: 700, margin: "0 0 4px" }}>
                  {post.typ_ryby}{post.nazwa_ryby ? ` — ${post.nazwa_ryby}` : ""}
                </p>
                {post.waga_kg && <p style={{ color: "#6b7280", margin: "2px 0" }}>⚖️ {post.waga_kg} kg</p>}
                {post.dlugosc_cm && <p style={{ color: "#6b7280", margin: "2px 0" }}>📏 {post.dlugosc_cm} cm</p>}
                {post.opis && (
                  <p style={{ color: "#374151", margin: "6px 0" }}>{post.opis}</p>
                )}
                <a
                  href={`/feed?post=${post.id}`}
                  style={{ display: "block", marginTop: 8, background: "#2563eb", color: "#fff", textAlign: "center", padding: "6px 8px", borderRadius: 6, textDecoration: "none", fontSize: 12, fontWeight: 600 }}
                >
                  {t.map.seePost}
                </a>
                <button
                  onClick={() => onLowiskoClick?.({ nazwa: post.lokalizacja_nazwa || t.map.fishingSpot, lowisko_id: post.lowisko_id, lat: post.lat!, lng: post.lng! })}
                  style={{ display: "block", width: "100%", marginTop: 6, background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac", textAlign: "center", padding: "6px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  {t.map.addPostHere}
                </button>
              </div>
            </Popup>
          </Marker>
      ))}
      </MarkerClusterGroup>
    </MapContainer>
    </div>

      {lightbox && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Zdjęcie połowu"
            style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 12, objectFit: "contain" }}
          />
        </div>
      )}
    </>
  );
}
