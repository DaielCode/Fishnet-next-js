"use client";

/**
 * LocationPreview — statyczna miniatura mapy Leaflet w modalu posta.
 *
 * Pokazuje pin 🎣 na podanych współrzędnych z nakładką nazwy miejsca.
 * Wszystkie interakcje są wyłączone (dragging, scroll, zoom) — to tylko podgląd.
 *
 * Ładowany wyłącznie client-side (`dynamic(..., { ssr: false })`),
 * bo Leaflet wymaga `window` i nie działa w Node.js.
 */
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

// ── Fix ikon Leaflet ──────────────────────────────────────────────────────────
// Leaflet próbuje wykryć URL ikon przez webpack, co psuje się w bundlerach.
// Rozwiązanie: usuwamy metodę _getIconUrl i podajemy URL-e ikon ręcznie.
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Niestandardowy pin: niebieski okrąg z emoji wędki (zamiast domyślnej ikony Leaflet)
// divIcon pozwala użyć dowolnego HTML jako markera
const pinIcon = L.divIcon({
  html: `<div style="
    background:#2563eb;color:white;border-radius:50%;width:36px;height:36px;
    display:flex;align-items:center;justify-content:center;font-size:18px;
    border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);
  ">🎣</div>`,
  className: "",      // czyścimy domyślne klasy CSS Leaflet
  iconSize: [36, 36], // rozmiar div w pikselach
  iconAnchor: [18, 36], // punkt zaczepu: środek X, dół Y (tip strzałki)
});

/**
 * Recenter — wewnętrzny komponent wymuszający pozycję mapy.
 *
 * Leaflet nie aktualizuje widoku gdy zmienia się prop `center` MapContainer.
 * Ten komponent używa hooka `useMap()` aby bezpośrednio wywołać `setView`
 * gdy lat/lng się zmieni. Nie renderuje żadnego HTML (zwraca null).
 */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap(); // dostęp do instancji L.Map przez kontekst react-leaflet
  useEffect(() => {
    // animate: false — natychmiastowe ustawienie bez animacji (to podgląd, nie nawigacja)
    map.setView([lat, lng], 15, { animate: false });
  }, [lat, lng, map]);
  return null;
}

interface Props {
  lat: number;
  lng: number;
  /** Opcjonalna nazwa miejsca wyświetlana jako nakładka w dolnej części mapy */
  nazwa?: string;
}

/**
 * @param lat   - szerokość geograficzna (np. 49.9)
 * @param lng   - długość geograficzna (np. 19.1)
 * @param nazwa - wyświetlana nazwa lokalizacji (np. "Uroczysko Karpiowe")
 */
export default function LocationPreview({ lat, lng, nazwa }: Props) {
  return (
    <div className="relative">
      {/* Kontener mapy — fixed height, overflow hidden żeby nie wychodziła poza ramkę */}
      <div className="rounded-none overflow-hidden" style={{ height: 150 }}>
        <MapContainer
          center={[lat, lng]}
          zoom={15}
          style={{ width: "100%", height: "100%" }}
          // Wyłączamy wszystkie interakcje — to tylko podgląd, nie nawigacja
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          keyboard={false}
        >
          {/* Kafelki mapy z OpenStreetMap — {s} to subdomena (a/b/c) dla load balancingu */}
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {/* Recenter wymuszony bo MapContainer ignoruje zmiany center po montowaniu */}
          <Recenter lat={lat} lng={lng} />
          <Marker position={[lat, lng]} icon={pinIcon} />
        </MapContainer>
      </div>

      {/* Nakładka z nazwą — gradient od dołu zapewnia czytelność tekstu na mapie */}
      {nazwa && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 pointer-events-none">
          <p className="text-white text-xs font-semibold truncate">📍 {nazwa}</p>
        </div>
      )}
    </div>
  );
}
