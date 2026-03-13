"use client";

import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import { POLSKIE_MIASTA } from "@/lib/miejscowosci";
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

// ─── Przycisk "Zlokalizuj mnie" ──────────────────────────────────────────────

function LocateButton() {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      L.DomEvent.disableClickPropagation(containerRef.current);
    }
  }, []);

  function handleLocate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    setDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 1.2 });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setDenied(true);
        setTimeout(() => setDenied(false), 3000);
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
    );
  }

  return (
    <div ref={containerRef} style={{ position: "absolute", bottom: 24, right: 12, zIndex: 1000 }}>
      <button
        onClick={handleLocate}
        title="Zlokalizuj mnie"
        style={{
          width: 40, height: 40,
          background: "white",
          border: "2px solid rgba(0,0,0,0.2)",
          borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 1px 5px rgba(0,0,0,0.25)",
          color: denied ? "#ef4444" : locating ? "#2563eb" : "#333",
          transition: "color 0.2s",
        }}
      >
        {locating ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="8" />
          </svg>
        )}
      </button>
      {denied && (
        <div style={{ position: "absolute", right: 44, bottom: 0, background: "white", border: "1px solid #fca5a5", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#ef4444", whiteSpace: "nowrap", boxShadow: "0 1px 5px rgba(0,0,0,0.15)" }}>
          Brak dostępu do lokalizacji
        </div>
      )}
    </div>
  );
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

function MapClickHandler({ onMapClick, suppressRef }: { onMapClick?: (lat: number, lng: number) => void; suppressRef: React.MutableRefObject<boolean> }) {
  useMapEvents({
    click(e) {
      if (suppressRef.current) { suppressRef.current = false; return; }
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
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
  onMapClick?: (lat: number, lng: number) => void;
}

export default function MapView({ onStanowiskoClick, onLowiskoClick, onMapClick }: Props) {
  const suppressMapClickRef = useRef(false);
  const [stanowiska, setStanowiska] = useState<Stanowisko[]>([]);
  const [lowiska, setLowiska] = useState<Lowisko[]>([]);
  const [warstwy, setWarstwy] = useState<WarstwaGeo[]>([]);
  const [postyZPinami, setPostyZPinami] = useState<Post[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    window.history.pushState({ lightbox: true }, "");
    function handlePop() { setLightbox(null); }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [lightbox]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState<[number, number] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<{ label: string; sublabel?: string; lat: number; lng: number; isLowisko?: boolean }[]>([]);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const [searchHistory, setSearchHistory] = useState<{ label: string; lat: number; lng: number }[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("fishnet_search_history") ?? "[]"); }
    catch { return []; }
  });
  const { t } = useLanguage();

  function saveToHistory(label: string, lat: number, lng: number) {
    const item = { label, lat, lng };
    const updated = [item, ...searchHistory.filter((h) => h.label.toLowerCase() !== label.toLowerCase())].slice(0, 3);
    setSearchHistory(updated);
    localStorage.setItem("fishnet_search_history", JSON.stringify(updated));
  }

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) { setSuggestions([]); return; }
    const ql = q.toLowerCase();

    // ── Natychmiastowe (0ms): łowiska + duże miasta ──────────────────────────
    const lowiskaMatches = lowiska
      .filter((l) => l.nazwa.toLowerCase().includes(ql) && l.lokalizacja)
      .slice(0, 2)
      .map((l) => ({ label: l.nazwa, sublabel: "łowisko", isLowisko: true, lat: l.lokalizacja!.latitude, lng: l.lokalizacja!.longitude, p: 200 }));

    const miastaMatches = POLSKIE_MIASTA
      .filter((m) => m.n.toLowerCase().includes(ql))
      .sort((a, b) => {
        const aPrefix = a.n.toLowerCase().startsWith(ql) ? 1 : 0;
        const bPrefix = b.n.toLowerCase().startsWith(ql) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;
        return b.p - a.p;
      })
      .slice(0, 3)
      .map((m) => ({ label: m.n, sublabel: undefined as string | undefined, lat: m.lat, lng: m.lng, p: m.p }));

    const instant = [...lowiskaMatches, ...miastaMatches].slice(0, 5);
    setSuggestions(instant);

    // ── Photon (200ms): uzupełnienie mniejszych miejscowości ─────────────────
    suggestAbortRef.current?.abort();
    const controller = new AbortController();
    suggestAbortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        type PhotonFeature = {
          geometry: { coordinates: [number, number] };
          properties: { name?: string; state?: string; county?: string; country?: string; type?: string; osm_id?: number };
        };
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7&lat=50.5&lon=19.0`,
          { signal: controller.signal }
        );
        const data = await res.json();
        const ALLOWED_COUNTRIES = ["polska", "ukraina", "białoruś", "poland", "ukraine", "belarus"];
        const ALLOWED_TYPES = ["city", "town", "village", "hamlet", "locality", "municipality", "county", "state"];
        const existingLabels = new Set(instant.map((s) => s.label.toLowerCase()));
        const seen = new Set<number>();
        const photonResults = (data.features as PhotonFeature[])
          .filter((f) => {
            const country = (f.properties.country ?? "").toLowerCase();
            const type = (f.properties.type ?? "").toLowerCase();
            const id = f.properties.osm_id ?? 0;
            const name = (f.properties.name ?? "").toLowerCase();
            return ALLOWED_COUNTRIES.some((c) => country.includes(c))
              && ALLOWED_TYPES.includes(type)
              && !existingLabels.has(name)
              && !seen.has(id) && seen.add(id);
          })
          .slice(0, 3)
          .map((f) => ({
            label: f.properties.name ?? "",
            sublabel: f.properties.state ?? f.properties.county ?? undefined,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
          }))
          .filter((r) => r.label);

        setSuggestions([...instant, ...photonResults].slice(0, 5));
      } catch { /* abort lub błąd sieciowy */ }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, lowiska]);

  function pickSuggestion(item: { label: string; lat: number; lng: number }) {
    setSearchQuery(item.label);
    setSearchTarget([item.lat, item.lng]);
    setSuggestions([]);
    setSearchFocused(false);
    saveToHistory(item.label, item.lat, item.lng);
  }

  async function handleMapSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchNotFound(false);
    setSearchFocused(false);
    setSuggestions([]);
    try {
      // Najpierw szukaj po nazwie łowiska
      const trafione = lowiska.find((l) => l.nazwa.toLowerCase().includes(q.toLowerCase()));
      if (trafione?.lokalizacja) {
        const lat = trafione.lokalizacja.latitude;
        const lng = trafione.lokalizacja.longitude;
        setSearchTarget([lat, lng]);
        saveToHistory(trafione.nazwa, lat, lng);
        return;
      }
      // Fallback: Nominatim — szukaj w Polsce, Ukrainie i Białorusi
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=pl,ua,by`,
        { headers: { "Accept-Language": "pl,uk,be,ru,en" } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setSearchTarget([lat, lng]);
        saveToHistory(q, lat, lng);
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
          <div className="flex-1 flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchNotFound(false); }}
              onKeyDown={(e) => e.key === "Enter" && handleMapSearch()}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 300)}
              placeholder="Szukaj łowiska lub miejscowości..."
              className="flex-1 px-3 py-1.5 text-sm text-gray-900 bg-transparent placeholder:text-gray-400 outline-none"
            />
            {searchQuery && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setSearchQuery(""); setSearchNotFound(false); }}
                className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={handleMapSearch}
            disabled={searching}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-xl transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {searching ? "..." : "Szukaj"}
          </button>
        </div>

        {/* Podpowiedzi podczas wpisywania */}
        {searchFocused && searchQuery.trim().length >= 2 && suggestions.length > 0 && (
          <div className="mt-1 bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {suggestions.map((item, i) => (
              <button
                key={i}
                onMouseDown={(e) => { e.preventDefault(); pickSuggestion(item); }}
                onTouchEnd={(e) => { e.preventDefault(); pickSuggestion(item); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer text-left"
              >
                {item.isLowisko ? (
                  <span className="text-base flex-shrink-0">🎣</span>
                ) : (
                  <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{item.label}</p>
                  {item.sublabel && <p className="text-xs text-gray-400 truncate">{item.sublabel}</p>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Historia wyszukiwań — gdy pole puste */}
        {searchFocused && !searchQuery.trim() && searchHistory.length > 0 && (
          <div className="mt-1 bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {searchHistory.map((item, i) => (
              <button
                key={i}
                onMouseDown={(e) => { e.preventDefault(); setSearchQuery(item.label); setSearchTarget([item.lat, item.lng]); setSearchFocused(false); }}
                onTouchEnd={(e) => { e.preventDefault(); setSearchQuery(item.label); setSearchTarget([item.lat, item.lng]); setSearchFocused(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer text-left"
              >
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {searchNotFound && (
          <p className="text-xs text-red-500 bg-white rounded-xl px-3 py-1.5 mt-1 shadow text-center">
            Nie znaleziono łowiska ani miejscowości
          </p>
        )}
      </div>

    <MapContainer
      center={[49.8877, 18.9510]}
      zoom={15}
      zoomControl={false}
      className="w-full h-full"
      style={{ minHeight: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="bottomleft" />
      <GeolocateOnMount />
      <MapController />
      <SearchFlyTo target={searchTarget} />
      <MapClickHandler onMapClick={onMapClick} suppressRef={suppressMapClickRef} />
      <LocateButton />

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
                suppressMapClickRef.current = true;
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
      <MarkerClusterGroup chunkedLoading showCoverageOnHover={false} maxClusterRadius={40}>
        {stanowiska.map((s) => {
          const lowisko = lowiska.find((l) => l.id === s.lowisko_id);
          return (
            <Marker key={s.id} position={[s.wspolrzedne.latitude, s.wspolrzedne.longitude]}
              eventHandlers={{ click: () => { suppressMapClickRef.current = true; } }}>
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
        maxClusterRadius={40}
        iconCreateFunction={(cluster: { getChildCount: () => number }) => L.divIcon({
          html: `<div style="background:#2563eb;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${cluster.getChildCount()}</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })}
      >
      {postyZPinami.map((post) => (
          <Marker key={post.id} position={[post.lat!, post.lng!]} icon={ikonaPosta}
            eventHandlers={{ click: () => { suppressMapClickRef.current = true; } }}>
            <Popup>
              <div style={{ fontSize: 12, width: 170 }}>
                {post.zdjecia?.[0] && (
                  <img
                    src={post.zdjecia[0]}
                    alt="połów"
                    onClick={() => setLightbox(post.zdjecia[0])}
                    style={{ width: "100%", maxHeight: 140, objectFit: "contain", borderRadius: 5, marginBottom: 6, cursor: "zoom-in", display: "block" }}
                  />
                )}
                <p style={{ fontWeight: 700, margin: "0 0 3px", fontSize: 12 }}>
                  {post.typ_ryby}{post.nazwa_ryby ? ` — ${post.nazwa_ryby}` : ""}
                </p>
                {(post.waga_kg || post.dlugosc_cm) && (
                  <p style={{ color: "#6b7280", margin: "2px 0", fontSize: 11 }}>
                    {post.waga_kg ? `⚖️ ${post.waga_kg} kg` : ""}{post.waga_kg && post.dlugosc_cm ? "  " : ""}{post.dlugosc_cm ? `📏 ${post.dlugosc_cm} cm` : ""}
                  </p>
                )}
                <a
                  href={`/feed?post=${post.id}`}
                  style={{ display: "block", marginTop: 6, background: "#2563eb", color: "#fff", textAlign: "center", padding: "4px 6px", borderRadius: 5, textDecoration: "none", fontSize: 11, fontWeight: 600 }}
                >
                  {t.map.seePost}
                </a>
                <button
                  onClick={() => onLowiskoClick?.({ nazwa: post.lokalizacja_nazwa || t.map.fishingSpot, lowisko_id: post.lowisko_id, lat: post.lat!, lng: post.lng! })}
                  style={{ display: "block", width: "100%", marginTop: 4, background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac", textAlign: "center", padding: "4px 6px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
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
