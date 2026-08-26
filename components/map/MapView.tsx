"use client";

/**
 * MapView — interaktywna mapa łowisk oparta na Leaflet.
 *
 * Funkcje:
 * - Renderuje warstwy GeoJSON z `/public/geojson/` (kontury łowisk)
 * - Wyświetla markery stanowisk pogrupowane w klastry (MarkerClusterGroup)
 * - Wyświetla piny postów z Firestore (realtime przez onSnapshot)
 * - Centruje mapę na lokalizacji użytkownika przy starcie
 * - Obsługuje wyszukiwanie miast (autocomplete z listy polskich miejscowości)
 * - Klik na stanowisko/łowisko/mapę przekazuje lokalizację do nadrzędnego komponentu
 *
 * Uwaga: komponent jest ładowany tylko client-side (`dynamic(..., { ssr: false })`),
 * bo Leaflet wymaga `window` — nie działa w SSR Next.js.
 *
 * @param onStanowiskoClick - wywoływane po kliknięciu markera stanowiska
 * @param onLowiskoClick    - wywoływane po kliknięciu poligonu łowiska
 * @param onMapClick        - wywoływane po kliknięciu w dowolne miejsce mapy
 * @param zaproponujVisible - czy pokazać przycisk "Zaproponuj łowisko"
 * @param onZaproponuj      - callback otwierający modal propozycji łowiska
 */
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

/**
 * Leaflet wczytuje ikony przez webpack — bundler nie może znaleźć _getIconUrl
 * w domyślnych markerach i ikon nie ma. Standardowy fix: usuń metodę i ręcznie
 * podaj URL-e do ikon z unpkg CDN (alternatywnie: skopiuj do /public/).
 */
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/**
 * Ikona dla pinów postów — niebieskie kółko z emoji wędki.
 * `divIcon` zamiast domyślnego markera bo chcemy własny HTML/CSS.
 * `className: ""` — usuwa domyślną białą ramkę Leaflet wokół div-a.
 * `iconAnchor: [16, 32]` — piksel [16,32] ikony "dotyka" współrzędnej (środek-dół).
 */
const ikonaPosta = L.divIcon({
  html: `<div style="
    background:#2563eb;color:white;border-radius:50%;width:32px;height:32px;
    display:flex;align-items:center;justify-content:center;font-size:16px;
    border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);
  ">🎣</div>`,
  className: "",        // brak domyślnej białej ramki wokół ikony
  iconSize: [32, 32],   // rozmiar klikalnego obszaru = rozmiar div-a
  iconAnchor: [16, 32], // środek-dół ikony = punkt kotwicy na mapie
});

/**
 * Statyczne warstwy GeoJSON wyeksportowane z QGIS, przechowywane w /public/geojson/.
 * Każda warstwa ma unikalny `id` (klucz React), ścieżkę do pliku i kolor konturu.
 * Warstwy są ładowane równolegle przez Promise.all w fetchAll().
 * Oprócz tych statycznych, GeoJSON-y z Firestore są dodawane dynamicznie (prefiks "fs_").
 */
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

/**
 * GeolocateOnMount — jednorazowo centruje mapę na pozycji GPS użytkownika.
 *
 * Renderuje `null` — komponent istnieje tylko dla efektu ubocznego.
 * `useMap()` — hook react-leaflet dający dostęp do instancji mapy Leaflet.
 * Musi być renderowany WEWNĄTRZ `<MapContainer>`, bo useMap() korzysta z kontekstu.
 *
 * Filtr `accuracy > 5000` — odrzucamy lokalizację opartą o IP/sieć komórkową
 * (dokładność ~5-20km). Chcemy tylko dane GPS (<100m). Bez tego użytkownik
 * na Starlinku / WiFi może być "przeniesiony" na środek kraju.
 */
function GeolocateOnMount() {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return; // Stare przeglądarki lub HTTP (bez HTTPS GPS nie działa)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Ignoruj wynik jeśli dokładność gorsza niż 5km (IP-based, np. Starlink)
        if (pos.coords.accuracy > 5000) return;
        map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      },
      () => {}, // Użytkownik odmówił lub GPS niedostępny — cicho pomiń, domyślny center z MapContainer
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 } // maximumAge:0 = zawsze świeże dane GPS
    );
  }, [map]);
  return null;
}

// ─── Przyciski dolne: "Zaproponuj łowisko" + "Zlokalizuj mnie" ───────────────

/**
 * BottomRightControls — overlay z przyciskami w prawym dolnym rogu mapy.
 *
 * Dwa przyciski:
 * 1. "Zaproponuj łowisko" — widoczny tylko gdy `zaproponujVisible=true` (strona /mapa)
 * 2. "Zlokalizuj mnie" — GPS/flyTo z animacją. Pokazuje spinner podczas geolokalizacji
 *    i czerwony tooltip przez 3s gdy brak dostępu.
 *
 * `L.DomEvent.disableClickPropagation(container)` — krytyczne!
 * Bez tego klik w button propaguje przez overlay do mapy → `MapClickHandler`
 * wywołałby onMapClick() i otworzył "Dodaj post" przy każdym kliknięciu przycisku.
 */
function BottomRightControls({ zaproponujVisible, onZaproponuj }: { zaproponujVisible?: boolean; onZaproponuj?: () => void }) {
  const map = useMap();
  const [locating, setLocating] = useState(false);  // true podczas oczekiwania na GPS
  const [denied, setDenied] = useState(false);       // true gdy użytkownik odrzucił uprawnienia
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Zatrzymaj propagację kliku do mapy — bez tego każdy klik w overlay otwierałby modal posta
      L.DomEvent.disableClickPropagation(containerRef.current);
    }
  }, []);

  function handleLocate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    setDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // flyTo zamiast setView — płynna animacja lotu do pozycji użytkownika
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 1.2 });
        setLocating(false);
      },
      () => {
        // Odmowa uprawnień lub timeout — pokaż tooltip przez 3s i ukryj
        setLocating(false);
        setDenied(true);
        setTimeout(() => setDenied(false), 3000);
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
    );
  }

  return (
    <div ref={containerRef} style={{ position: "absolute", bottom: 8, right: 12, zIndex: 1000, display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
      {zaproponujVisible && (
        <button
          onClick={onZaproponuj}
          style={{
            background: "#2563eb", color: "white", border: "none",
            borderRadius: 14, padding: "9px 14px",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 1px 5px rgba(0,0,0,0.25)", whiteSpace: "nowrap",
          }}
        >
          <span>📍</span> Zaproponuj łowisko
        </button>
      )}
      <div style={{ position: "relative" }}>
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
          <div style={{ position: "absolute", right: 48, bottom: 0, background: "white", border: "1px solid #fca5a5", borderRadius: 6, padding: "4px 8px", fontSize: 11, color: "#ef4444", whiteSpace: "nowrap", boxShadow: "0 1px 5px rgba(0,0,0,0.15)" }}>
            Brak dostępu do lokalizacji
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kontroler wyszukiwania lokalizacji ──────────────────────────────────────

/**
 * SearchFlyTo — obserwuje prop `target` i animuje mapę do nowej lokalizacji.
 *
 * Problem: React re-renderuje się przy każdej zmianie stanu — jeśli `target`
 * to ta sama wartość, ale nowy obiekt tablicowy (`[lat, lng]`), useEffect
 * odpali się ponownie. `prev` ref zapamiętuje ostatni klucz "lat,lng" —
 * flyTo wywoła się tylko gdy współrzędne faktycznie się zmieniły.
 *
 * Musi być wewnątrz `<MapContainer>` bo używa `useMap()`.
 */
function SearchFlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const prev = useRef<string>("");  // ostatni klucz "lat,lng" — zapobiega podwójnemu flyTo
  useEffect(() => {
    if (!target) return;
    const key = `${target[0]},${target[1]}`;
    if (prev.current === key) return; // ta sama lokalizacja — nie animuj ponownie
    prev.current = key;
    map.flyTo(target, 13, { duration: 1.2 }); // zoom 13 = widok miasta/dzielnicy
  }, [target, map]);
  return null;
}

/**
 * MapClickHandler — nasłuchuje kliknięć w mapę i wywołuje `onMapClick(lat, lng)`.
 *
 * `suppressRef` — mechanizm blokady: gdy użytkownik klika marker lub poligon,
 * handler markera/poligonu ustawia `suppressRef.current = true` PRZED propagacją
 * do mapy. Ten handler sprawdza flagę i jeśli jest true — pomija klik (i resetuje flagę).
 *
 * Dlaczego ref a nie state? Ustawienie stanu jest asynchroniczne — do czasu
 * kolejnego rendera klik mapy już by się wykonał. Ref jest synchroniczny.
 */
function MapClickHandler({ onMapClick, suppressRef }: { onMapClick?: (lat: number, lng: number) => void; suppressRef: React.MutableRefObject<boolean> }) {
  useMapEvents({
    click(e) {
      if (suppressRef.current) { suppressRef.current = false; return; } // klik był na marker/poligon — ignoruj
      onMapClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * MapController — obsługuje deep link ?lat=X&lng=Y z URL.
 *
 * Gdy użytkownik trafia na /mapa?lat=50.07&lng=19.95 (np. z powiadomienia),
 * mapa animuje się do podanych współrzędnych na zoom 17 (widok ulicy).
 * `useSearchParams()` wymaga że mapa/page.tsx jest opakowana w `<Suspense>`.
 */
function MapController() {
  const map = useMap();
  const params = useSearchParams();
  // parseFloat("") === NaN — isNaN() chroni przed przypadkowym setView gdy brak params
  const lat = parseFloat(params?.get("lat") ?? "");
  const lng = parseFloat(params?.get("lng") ?? "");

  useEffect(() => {
    if (isNaN(lat) || isNaN(lng)) return; // brak lub niepoprawny parametr — nic nie rób
    map.flyTo([lat, lng], 17, { duration: 1.2 }); // zoom 17 = widok ulicy
  }, [lat, lng, map]);

  return null;
}

interface Props {
  onStanowiskoClick?: (stanowisko: Stanowisko, lowisko: Lowisko) => void;
  onLowiskoClick?: (info: LowiskoKlik) => void;
  onMapClick?: (lat: number, lng: number) => void;
  zaproponujVisible?: boolean;
  onZaproponuj?: () => void;
}

export default function MapView({ onStanowiskoClick, onLowiskoClick, onMapClick, zaproponujVisible, onZaproponuj }: Props) {
  /**
   * suppressMapClickRef — flaga blokująca `onMapClick` po kliknięciu markera/poligonu.
   * Problem: klik na marker Leaflet propaguje do mapy i wywołałby również `onMapClick`.
   * Rozwiązanie: handler markera ustawia flagę PRZED zdarzeniem click na mapie;
   * MapClickHandler sprawdza flagę i ignoruje klik jeśli jest ustawiona.
   * Ref zamiast state — synchroniczność jest kluczowa (state aktualizuje się async).
   */
  const suppressMapClickRef = useRef(false);

  // Dane z Firestore — ładowane raz po mount w fetchAll()
  const [stanowiska, setStanowiska] = useState<Stanowisko[]>([]);
  const [lowiska, setLowiska] = useState<Lowisko[]>([]);

  // Warstwy GeoJSON: statyczne z /public/ + dynamiczne z Firestore (prefiks "fs_")
  const [warstwy, setWarstwy] = useState<WarstwaGeo[]>([]);

  // Posty z koordynatami GPS — subskrypcja realtime (onSnapshot)
  const [postyZPinami, setPostyZPinami] = useState<Post[]>([]);

  // Lightbox do powiększania zdjęć z popupów postów
  const [lightbox, setLightbox] = useState<string | null>(null);

  /**
   * Obsługa przycisku "wstecz" w przeglądarce gdy lightbox jest otwarty.
   * pushState() dodaje sztuczny wpis do historii → użytkownik wciska "wstecz"
   * → popstate → zamykamy lightbox zamiast wychodzić ze strony.
   * Cleanup: usuń listener gdy lightbox się zamknie lub komponent odmontuje.
   */
  useEffect(() => {
    if (!lightbox) return;
    window.history.pushState({ lightbox: true }, "");
    function handlePop() { setLightbox(null); }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [lightbox]);

  // Stan wyszukiwarki lokalizacji
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTarget, setSearchTarget] = useState<[number, number] | null>(null); // przekazywany do SearchFlyTo
  const [searching, setSearching] = useState(false);       // spinner w przycisku "Szukaj"
  const [searchNotFound, setSearchNotFound] = useState(false); // komunikat błędu
  const [searchFocused, setSearchFocused] = useState(false);   // czy input ma focus → pokaż dropdown
  const [suggestions, setSuggestions] = useState<{ label: string; sublabel?: string; lat: number; lng: number; isLowisko?: boolean }[]>([]);

  // AbortController dla zapytań Photon — anuluje poprzednie zapytanie gdy user dalej pisze
  const suggestAbortRef = useRef<AbortController | null>(null);

  /**
   * Historia wyszukiwań — max 3 ostatnie, persystowane w localStorage.
   * Inicjalizator funkcyjny useState — JSON.parse wykonuje się tylko raz (nie przy każdym render).
   * `typeof window === "undefined"` — guard dla SSR (choć MapView jest ssr:false, TypeScript nie wie).
   */
  const [searchHistory, setSearchHistory] = useState<{ label: string; lat: number; lng: number }[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("fishnet_search_history") ?? "[]"); }
    catch { return []; } // uszkodzony JSON w localStorage — zacznij od pustej historii
  });
  const { t } = useLanguage();

  /**
   * Dodaje lokalizację do historii wyszukiwań w localStorage.
   * Dedup — nie duplikuje tej samej nazwy (case-insensitive).
   * slice(0, 3) — max 3 elementy w historii.
   */
  function saveToHistory(label: string, lat: number, lng: number) {
    const item = { label, lat, lng };
    const updated = [item, ...searchHistory.filter((h) => h.label.toLowerCase() !== label.toLowerCase())].slice(0, 3);
    setSearchHistory(updated);
    localStorage.setItem("fishnet_search_history", JSON.stringify(updated));
  }

  /**
   * Autocomplete — dwustopniowe podpowiedzi wyszukiwarki.
   *
   * Krok 1 — Natychmiastowe (0ms): lokalne źródła bez opóźnienia sieciowego
   *   - Łowiska z Firestore (już załadowane w state) — priorytet wyświetlania
   *   - Duże polskie miasta z POLSKIE_MIASTA — statyczna lista, zawsze dostępna offline
   *   - Sortowanie miast: prefix match (wyżej) → priorytet populacyjny (`p`)
   *
   * Krok 2 — Photon API (po 200ms debounce): mniejsze miejscowości i wsie
   *   - `suggestAbortRef.current?.abort()` — anuluje poprzednie zapytanie gdy user pisze
   *   - `clearTimeout(timer)` w cleanup — anuluje timeout gdy query się zmieni
   *   - `ALLOWED_COUNTRIES` — ograniczamy do PL/UA/BY (Photon szuka globalnie)
   *   - `ALLOWED_TYPES` — tylko miejscowości (bez ulic, POI, budynków)
   *   - `existingLabels` Set — nie duplikuj wyników które już są z kroku 1
   *   - `seen` Set po osm_id — deduplikacja duplikatów w Photon (np. miasto + gmina)
   *   - Photon zwraca [lon, lat] — zamieniamy na [lat, lng] dla Leaflet
   *   - `lat=50.5&lon=19.0` — bias geograficzny: wyniki bliżej Polski wyżej
   */
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
        // Prefix match wygrywa z contains match (np. "War" → Warszawa przed Przemyśl)
        const aPrefix = a.n.toLowerCase().startsWith(ql) ? 1 : 0;
        const bPrefix = b.n.toLowerCase().startsWith(ql) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;
        return b.p - a.p; // przy równym prefixie → sortuj po priorytecie (populacja)
      })
      .slice(0, 3)
      .map((m) => ({ label: m.n, sublabel: undefined as string | undefined, lat: m.lat, lng: m.lng, p: m.p }));

    const instant = [...lowiskaMatches, ...miastaMatches].slice(0, 5);
    setSuggestions(instant); // pokaż natychmiast bez czekania na Photon

    // ── Photon (200ms): uzupełnienie mniejszych miejscowości ─────────────────
    suggestAbortRef.current?.abort(); // anuluj poprzednie zapytanie — user pisze nowy znak
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
          { signal: controller.signal } // abort gdy user pisze lub komponent odmontuje
        );
        const data = await res.json();
        // Ograniczamy do Polski, Ukrainy i Białorusi — Photon szuka globalnie
        const ALLOWED_COUNTRIES = ["polska", "ukraina", "białoruś", "poland", "ukraine", "belarus"];
        // Tylko typy administracyjne — pomijamy ulice, POI, budynki
        const ALLOWED_TYPES = ["city", "town", "village", "hamlet", "locality", "municipality", "county", "state"];
        const existingLabels = new Set(instant.map((s) => s.label.toLowerCase())); // nie duplikuj
        const seen = new Set<number>(); // dedup po osm_id — Photon może zwrócić to samo miejsce kilka razy
        const photonResults = (data.features as PhotonFeature[])
          .filter((f) => {
            const country = (f.properties.country ?? "").toLowerCase();
            const type = (f.properties.type ?? "").toLowerCase();
            const id = f.properties.osm_id ?? 0;
            const name = (f.properties.name ?? "").toLowerCase();
            return ALLOWED_COUNTRIES.some((c) => country.includes(c))
              && ALLOWED_TYPES.includes(type)
              && !existingLabels.has(name)      // nie duplikuj wyników z kroku 1
              && !seen.has(id) && seen.add(id); // dedup duplikatów Photon
          })
          .slice(0, 3)
          .map((f) => ({
            label: f.properties.name ?? "",
            sublabel: f.properties.state ?? f.properties.county ?? undefined, // województwo/powiat
            lat: f.geometry.coordinates[1],  // Photon: [lon, lat] → zamieniamy na lat
            lng: f.geometry.coordinates[0],  // Photon: [lon, lat] → zamieniamy na lng
          }))
          .filter((r) => r.label); // odfiltruj bez nazwy

        setSuggestions([...instant, ...photonResults].slice(0, 5));
      } catch { /* abort (AbortError) lub błąd sieciowy — cicho pomiń */ }
    }, 200); // debounce — czekaj 200ms po ostatnim znaku zanim zapytasz Photon

    return () => clearTimeout(timer); // cleanup: anuluj timer gdy query się zmieni
  }, [searchQuery, lowiska]);

  /**
   * Obsługuje kliknięcie na podpowiedź z dropdown.
   * `onMouseDown` + `e.preventDefault()` — zapobiega `onBlur` na inpucie (blur zamknąłby dropdown
   * PRZED obsłużeniem kliknięcia, bo blur odpala się przed mousedown).
   * `onTouchEnd` — obsługa urządzeń mobilnych (brak mousedown na touch).
   */
  function pickSuggestion(item: { label: string; lat: number; lng: number }) {
    setSearchQuery(item.label);
    setSearchTarget([item.lat, item.lng]); // SearchFlyTo wykryje zmianę i animuje mapę
    setSuggestions([]);
    setSearchFocused(false);
    saveToHistory(item.label, item.lat, item.lng);
  }

  /**
   * Obsługuje wciśnięcie przycisku "Szukaj" lub Enter w polu.
   *
   * Priorytet wyszukiwania:
   * 1. Łowiska z Firestore (lokalne, bez zapytania sieciowego)
   * 2. Nominatim API (OpenStreetMap geocoder) — szuka w PL/UA/BY
   *    `countrycodes=pl,ua,by` — nie znajdzie np. "Berlin" (zamierzone)
   *    `Accept-Language: pl,uk,be,ru,en` — nazwy w języku polskim/ukraińskim
   *
   * Różnica od autocomplete: handleMapSearch używa Nominatim (pełna baza OSM),
   * autocomplete używa Photon (szybszy, ale mniej dokładny).
   */
  async function handleMapSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchNotFound(false);
    setSearchFocused(false);
    setSuggestions([]);
    try {
      // Najpierw szukaj po nazwie łowiska w lokalnym stanie (bez network call)
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
        { headers: { "Accept-Language": "pl,uk,be,ru,en" } } // nazwy po polsku/ukraińsku
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon); // Nominatim: pole `lon` (nie `lng`)
        setSearchTarget([lat, lng]);
        saveToHistory(q, lat, lng);
      } else {
        setSearchNotFound(true); // pokaż "Nie znaleziono" przez 3s
      }
    } catch { /* błąd sieciowy — cicho pomiń, searching=false w finally */ }
    finally { setSearching(false); }
  }

  /**
   * Efekt inicjalizacyjny — ładuje wszystkie dane przy montowaniu komponentu.
   *
   * Dwa równoległe strumienie danych:
   * 1. `fetchAll()` — jednorazowe załadowanie GeoJSON + Firestore (async)
   * 2. `onSnapshot()` — stała subskrypcja realtime na posty (pushe z serwera)
   *
   * `onSnapshot` zwraca funkcję `unsub` (cleanup) — jest zwracana z useEffect
   * jako cleanup function, więc Firestore odsubskrybuje po odmontowaniu komponentu.
   * Bez cleanup → wyciek pamięci + próba setState na odmontowanym komponencie.
   *
   * Dlaczego `fetchAll` jest wewnętrzną funkcją async zamiast zewnętrznej?
   * useEffect nie może być async (musi zwrócić funkcję lub undefined, nie Promise).
   */
  useEffect(() => {
    async function fetchAll() {
      /**
       * GeoJSON warstwy statyczne z /public/geojson/ — ładowane równolegle.
       * Promise.all — wszystkie fetche startują jednocześnie (nie sekwencyjnie).
       * `if (!res.ok) return null` — warstwa może nie istnieć (np. plik usunięty) — graceful degradation.
       * filter(Boolean) na końcu odrzuca null-e (nieudane fetche).
       */
      const staticWarstwy = await Promise.all(
        WARSTWY.map(async ({ id, plik, kolor }) => {
          try {
            const res = await fetch(plik);
            if (!res.ok) return null; // 404 → brak pliku → pomiń warstwę
            return { id, kolor, data: await res.json() } as WarstwaGeo;
          } catch {
            return null; // błąd sieciowy → pomiń warstwę
          }
        })
      );

      /**
       * Łowiska z Firestore — jednorazowy getDocs (nie realtime).
       * Łowiska zmieniają się rzadko, nie potrzebujemy onSnapshot.
       */
      const snap = await getDocs(collection(db, "lowiska"));
      const lowiskaData = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lowisko));
      setLowiska(lowiskaData);

      /**
       * Stanowiska — subkolekcja każdego łowiska: `lowiska/{id}/stanowiska`.
       * Firestore nie ma JOIN — musimy pobrać każdą subkolekcję osobno.
       * Pętla for...of zamiast Promise.all — unikamy rate limitingu przy wielu łowiskach.
       * `lowisko_id: l.id` — dodajemy ręcznie bo nie ma go w dokumencie (jest w ścieżce).
       */
      const all: Stanowisko[] = [];
      for (const l of lowiskaData) {
        const s = await getDocs(collection(db, "lowiska", l.id, "stanowiska"));
        s.docs.forEach((d) => all.push({ id: d.id, lowisko_id: l.id, ...d.data() } as Stanowisko));
      }
      setStanowiska(all);

      /**
       * GeoJSON z Firestore — łowiska dodane przez admina mają pole `geojson_data`.
       * Jest przechowywane jako JSON string (Firestore nie obsługuje zagnieżdżonych tablic).
       * Prefiks "fs_" w id odróżnia warstwy Firestore od statycznych.
       * `typeof === "string" ? JSON.parse : as FeatureCollection` — defensywna obsługa
       * gdyby ktoś zapisał obiekt zamiast stringa (legacy data).
       */
      const firestoreWarstwy = lowiskaData
        .filter((l) => l.geojson_data) // tylko łowiska z GeoJSON
        .map((l) => {
          let data: GeoJSON.FeatureCollection;
          try {
            data = typeof l.geojson_data === "string"
              ? JSON.parse(l.geojson_data)      // normalny przypadek — string → obiekt
              : (l.geojson_data as unknown as GeoJSON.FeatureCollection); // legacy — już obiekt
          } catch {
            return null; // uszkodzony JSON — pomiń warstwę
          }
          return { id: `fs_${l.id}`, kolor: l.kolor ?? "#1d4ed8", data };
        })
        .filter(Boolean) as WarstwaGeo[];

      // Połącz statyczne i dynamiczne warstwy w jedną tablicę
      setWarstwy([...(staticWarstwy.filter(Boolean) as WarstwaGeo[]), ...firestoreWarstwy]);
    }

    /**
     * onSnapshot — subskrypcja realtime na posty z lokalizacją.
     * Nowy post pojawia się na mapie natychmiast bez odświeżania strony.
     * `.filter((p) => p.lat != null && p.lng != null)` — tylko posty z GPS.
     * Posty bez lokalizacji (dodane bez kliknięcia mapy) nie mają pinów.
     */
    const q = query(collection(db, "posty"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const posty = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Post))
        .filter((p) => p.lat != null && p.lng != null); // pomiń posty bez lokalizacji
      setPostyZPinami(posty);
    });

    fetchAll();
    return unsub; // cleanup: odsubskrybuj Firestore gdy komponent odmontuje
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

        {/* Dropdown podpowiedzi — widoczny gdy: pole ma focus + query >= 2 znaki + są wyniki */}
        {searchFocused && searchQuery.trim().length >= 2 && suggestions.length > 0 && (
          <div className="mt-1 bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
            {suggestions.map((item, i) => (
              <button
                key={i}
                // onMouseDown + preventDefault: zapobiega utracie focusu przez input przed kliknięciem
                onMouseDown={(e) => { e.preventDefault(); pickSuggestion(item); }}
                onTouchEnd={(e) => { e.preventDefault(); pickSuggestion(item); }} // mobile touch
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

    {/*
     * MapContainer — główny kontener Leaflet.
     * `center` — domyślny środek: okolice Ligoty/Bielska-Białej (cel: Uroczysko Karpiowe).
     * GeolocateOnMount może nadpisać center po uzyskaniu GPS.
     * MapController nadpisze center jeśli URL ma ?lat=&lng=.
     * `zoomControl={false}` — wyłączamy domyślny +/- (góra-lewo), używamy własnego (dół-lewo).
     * `minHeight: 0` — wymagane gdy rodzic jest flex/grid z `flex-1`: bez tego div nie kurczy się.
     */}
    <MapContainer
      center={[49.8877, 18.9510]}
      zoom={15}
      zoomControl={false}   // własny ZoomControl poniżej z position="bottomleft"
      className="w-full h-full"
      style={{ minHeight: 0 }} // fix dla flex children
    >
      {/* OpenStreetMap tile layer — darmowe kafelki, wymaga atrybucji w UI */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="bottomleft" /> {/* +/- przyciski w lewym dolnym rogu */}
      <GeolocateOnMount />   {/* jednorazowe centrowanie na GPS przy mount */}
      <MapController />      {/* obsługa URL params ?lat=&lng= */}
      <SearchFlyTo target={searchTarget} />  {/* animacja do wyniku wyszukiwania */}
      <MapClickHandler onMapClick={onMapClick} suppressRef={suppressMapClickRef} />
      <BottomRightControls zaproponujVisible={zaproponujVisible} onZaproponuj={onZaproponuj} />

      {/* Warstwy GeoJSON — kontury łowisk (statyczne z /public/ + dynamiczne z Firestore) */}
      {warstwy.map((w) => (
        <GeoJSON
          key={w.id}
          data={w.data}
          style={{
            color: w.kolor,        // kolor konturu poligonu
            weight: 2,             // grubość konturu w pikselach
            fillColor: w.kolor,    // kolor wypełnienia = ten sam co kontur
            fillOpacity: 0.2,      // półprzezroczyste wypełnienie — mapa widoczna pod spodem
          }}
          onEachFeature={(feature, layer) => {
            /**
             * Nazwa warstwy — priorytet:
             * 1. Warstwy Firestore (prefiks "fs_") → nazwa łowiska z Firestore
             * 2. Warstwy statyczne z GeoJSON → tag `name` z właściwości feature (z OSM)
             * 3. Fallback → t.map.fishingSpot ("Łowisko" / "Fishing spot" itp.)
             *
             * `w.id.slice(3)` — usuwa prefiks "fs_" i zwraca Firestore document ID.
             */
            const firestoreNazwa = w.id.startsWith("fs_")
              ? lowiska.find((l) => l.id === w.id.slice(3))?.nazwa
              : undefined;
            const nazwa = firestoreNazwa ?? feature.properties?.name ?? t.map.fishingSpot;
            layer.on({
              click: (e) => {
                suppressMapClickRef.current = true; // blokuj MapClickHandler — klik był w poligon
                onLowiskoClick?.({
                  nazwa,
                  lowisko_id: w.id,
                  lat: e.latlng.lat,
                  lng: e.latlng.lng,
                });
                L.DomEvent.stopPropagation(e); // dodatkowe zabezpieczenie — zatrzymaj propagację
              },
              // Hover: zwiększ grubość konturu i kursor pointer — feedback wizualny
              mouseover: (e) => {
                e.target.setStyle({ weight: 3, fillOpacity: 0.45 });
                e.target._map?.getContainer().style.setProperty("cursor", "pointer");
              },
              // MouseOut: przywróć domyślny styl po opuszczeniu poligonu
              mouseout: (e) => {
                e.target.setStyle({ weight: 2, fillOpacity: 0.2 });
                e.target._map?.getContainer().style.setProperty("cursor", "");
              },
            });
          }}
        />
      ))}

      {/*
       * Markery stanowisk pogrupowane w klastry.
       * `chunkedLoading` — Leaflet renderuje markery partiami (nie blokuje wątku UI przy wielu markerach).
       * `showCoverageOnHover={false}` — nie rysuj wielokąta zasięgu klastra po najechaniu.
       * `maxClusterRadius={40}` — markery bliżej niż 40px (w pikselach) łączą się w klaster.
       *
       * Popup stanowiska zawiera:
       * - Numer stanowiska i nazwę łowiska (lookup po lowisko_id)
       * - Opcjonalny opis
       * - Przycisk "Dodaj połów" — widoczny tylko gdy przekazano `onStanowiskoClick` (strona /mapa)
       */}
      <MarkerClusterGroup chunkedLoading showCoverageOnHover={false} maxClusterRadius={40}>
        {stanowiska.map((s) => {
          const lowisko = lowiska.find((l) => l.id === s.lowisko_id); // lookup powiązanego łowiska
          return (
            <Marker key={s.id} position={[s.wspolrzedne.latitude, s.wspolrzedne.longitude]}
              eventHandlers={{ click: () => { suppressMapClickRef.current = true; } /* blokuj MapClickHandler */ }}>
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">{t.map.station} {s.numer}</p>
                  <p className="text-gray-600">{lowisko?.nazwa}</p>
                  {s.opis && <p className="mt-1">{s.opis}</p>}
                  {/* Przycisk widoczny tylko na stronie /mapa (prop onStanowiskoClick) */}
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

      {/*
       * Piny postów — osobna MarkerClusterGroup z własną ikoną klastra.
       * `iconCreateFunction` — customowy wygląd klastra (niebieskie kółko z liczbą).
       * Osobna grupa od stanowisk — inny wygląd klastra, inne zachowanie.
       *
       * Popup posta zawiera:
       * - Miniaturę zdjęcia (klikalna → lightbox)
       * - Gatunek + nazwa własna ryby
       * - Wagę i długość (jeśli podane)
       * - Link "Zobacz post →" — deep link /feed?post=ID
       * - Przycisk "Dodaj połów" — przekazuje lokalizację posta jako punkt dodawania
       *
       * `post.lat!` — non-null assertion: wiemy że lat != null bo filtrowaliśmy w onSnapshot
       */}
      <MarkerClusterGroup
        chunkedLoading
        showCoverageOnHover={false}
        maxClusterRadius={40}
        iconCreateFunction={(cluster: { getChildCount: () => number }) => L.divIcon({
          // Klaster postów: niebieskie kółko z liczbą postów w środku
          html: `<div style="background:#2563eb;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${cluster.getChildCount()}</div>`,
          className: "",      // brak domyślnej białej ramki
          iconSize: [36, 36],
          iconAnchor: [18, 18], // środek kółka = punkt kotwicy (nie dół jak przy pinach)
        })}
      >
      {postyZPinami.map((post) => (
          <Marker key={post.id} position={[post.lat!, post.lng!]} icon={ikonaPosta}
            eventHandlers={{ click: () => { suppressMapClickRef.current = true; } /* blokuj MapClickHandler */ }}>
            <Popup>
              <div style={{ fontSize: 12, width: 170 }}>
                {/* Miniatura zdjęcia — klikalna, otwiera lightbox */}
                {post.zdjecia?.[0] && (
                  <img
                    src={post.zdjecia[0]}
                    alt="połów"
                    onClick={() => setLightbox(post.zdjecia[0])}
                    style={{ width: "100%", maxHeight: 140, objectFit: "contain", borderRadius: 5, marginBottom: 6, cursor: "zoom-in", display: "block" }}
                  />
                )}
                {/* Gatunek + opcjonalna nazwa własna ryby */}
                <p style={{ fontWeight: 700, margin: "0 0 3px", fontSize: 12 }}>
                  {post.typ_ryby}{post.nazwa_ryby ? ` — ${post.nazwa_ryby}` : ""}
                </p>
                {/* Waga i długość — widoczne tylko gdy co najmniej jedno podane */}
                {(post.waga_kg || post.dlugosc_cm) && (
                  <p style={{ color: "#6b7280", margin: "2px 0", fontSize: 11 }}>
                    {post.waga_kg ? `⚖️ ${post.waga_kg} kg` : ""}{post.waga_kg && post.dlugosc_cm ? "  " : ""}{post.dlugosc_cm ? `📏 ${post.dlugosc_cm} cm` : ""}
                  </p>
                )}
                {/* Deep link do posta w feedzie — ?post=ID scrolluje do posta */}
                <a
                  href={`/feed?post=${post.id}`}
                  style={{ display: "block", marginTop: 6, background: "#2563eb", color: "#fff", textAlign: "center", padding: "4px 6px", borderRadius: 5, textDecoration: "none", fontSize: 11, fontWeight: 600 }}
                >
                  {t.map.seePost}
                </a>
                {/* Dodaj połów w tym miejscu — pre-fill lokalizacja z danych posta */}
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

      {/*
       * Lightbox — powiększony widok zdjęcia na pełnym ekranie.
       * Renderowany poza MapContainer (poza </div> mapy) żeby pokrył całą stronę.
       * `zIndex: 9999` — powyżej mapy (z-index Leaflet popupów ≈ 700) i overlay (2000).
       * `position: fixed; inset: 0` — przykrywa cały viewport.
       * Klik gdziekolwiek zamyka lightbox.
       * Przycisk "wstecz" też zamyka (obsługiwane w useEffect powyżej przez pushState).
       */}
      {lightbox && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}
          onClick={() => setLightbox(null)} // klik w tło zamyka lightbox
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
