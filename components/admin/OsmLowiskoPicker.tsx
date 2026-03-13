"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { POLSKIE_MIASTA } from "@/lib/miejscowosci";
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface OsmZbiornik {
  osmId: number;
  osmType: "way" | "relation";
  name?: string;
  centroid: [number, number]; // [lat, lng]
  geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

interface Props {
  onConfirm: (zbiornik: OsmZbiornik, autoName: string) => void;
  onCancel: () => void;
}

// ─── Parsowanie odpowiedzi Overpass → GeoJSON ─────────────────────────────────

function parseOverpassElement(el: Record<string, unknown>): OsmZbiornik | null {
  try {
    const tags = (el.tags ?? {}) as Record<string, string>;

    if (el.type === "way") {
      const geometry = el.geometry as Array<{ lat: number; lon: number }> | undefined;
      if (!geometry || geometry.length < 2) return null;
      const coords = geometry.map((p) => [p.lon, p.lat] as [number, number]);
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push(coords[0]);
      }
      const centroidLat = geometry.reduce((s, p) => s + p.lat, 0) / geometry.length;
      const centroidLng = geometry.reduce((s, p) => s + p.lon, 0) / geometry.length;
      return {
        osmId: el.id as number,
        osmType: "way",
        name: tags.name,
        centroid: [centroidLat, centroidLng],
        geojson: {
          type: "Feature",
          properties: { ...tags },
          geometry: { type: "Polygon", coordinates: [coords] },
        },
      };
    }

    if (el.type === "relation") {
      const members = (el.members ?? []) as Array<{
        role: string;
        geometry: Array<{ lat: number; lon: number }>;
      }>;
      const outers: [number, number][][] = [];
      const inners: [number, number][][] = [];
      for (const m of members) {
        if (!m.geometry?.length) continue;
        const ring = m.geometry.map((p) => [p.lon, p.lat] as [number, number]);
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
          ring.push(ring[0]);
        }
        if (m.role === "outer") outers.push(ring);
        else if (m.role === "inner") inners.push(ring);
      }
      if (outers.length === 0) return null;

      const geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon =
        outers.length === 1
          ? { type: "Polygon", coordinates: [outers[0], ...inners] }
          : { type: "MultiPolygon", coordinates: outers.map((o) => [o, ...inners]) };

      const first = outers[0];
      const centroidLng = first.reduce((s, p) => s + p[0], 0) / first.length;
      const centroidLat = first.reduce((s, p) => s + p[1], 0) / first.length;

      return {
        osmId: el.id as number,
        osmType: "relation",
        name: tags.name,
        centroid: [centroidLat, centroidLng],
        geojson: {
          type: "Feature",
          properties: { ...tags },
          geometry,
        },
      };
    }
  } catch { /* pomiń uszkodzone */ }
  return null;
}

// ─── Scalanie wielu zbiorników w jeden MultiPolygon ───────────────────────────

function mergeZbiorniki(list: OsmZbiornik[]): OsmZbiornik {
  if (list.length === 1) return list[0];

  const coords: GeoJSON.Position[][][] = [];
  for (const z of list) {
    const g = z.geojson.geometry;
    if (g.type === "Polygon") {
      coords.push(g.coordinates);
    } else {
      coords.push(...g.coordinates);
    }
  }

  const centroidLat = list.reduce((s, z) => s + z.centroid[0], 0) / list.length;
  const centroidLng = list.reduce((s, z) => s + z.centroid[1], 0) / list.length;

  return {
    osmId: list[0].osmId,
    osmType: list[0].osmType,
    name: list.find((z) => z.name)?.name,
    centroid: [centroidLat, centroidLng],
    geojson: {
      type: "Feature",
      properties: list[0].geojson.properties,
      geometry: { type: "MultiPolygon", coordinates: coords },
    },
  };
}

// ─── Reverse geocoding → automatyczna nazwa ───────────────────────────────────

async function fetchAutoName(zbiornik: OsmZbiornik): Promise<string> {
  if (zbiornik.name) return zbiornik.name;
  try {
    const [lat, lng] = zbiornik.centroid;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "pl" } }
    );
    const data = await res.json();
    const addr = (data.address ?? {}) as Record<string, string>;
    const place =
      addr.village ?? addr.town ?? addr.city ?? addr.municipality ?? addr.county ?? "Nieznane";
    return `${place}-Lake`;
  } catch {
    return "Nowe łowisko";
  }
}

// ─── Ładowanie zbiorników z Overpass ─────────────────────────────────────────

const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

async function loadZbiornikiFromBbox(map: L.Map): Promise<OsmZbiornik[]> {
  const bounds = map.getBounds();
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const overpassQuery = `[out:json][timeout:30];(way["natural"="water"](${bbox});relation["natural"="water"](${bbox}););out geom;`;

  let lastError: unknown;
  for (const mirror of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(mirror, { method: "POST", body: overpassQuery, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const parsed = (data.elements as unknown[])
        .map((el) => parseOverpassElement(el as Record<string, unknown>))
        .filter(Boolean) as OsmZbiornik[];
      return Array.from(new Map(parsed.map((z) => [z.osmId, z])).values());
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

// ─── Wewnętrzny komponent mapy ────────────────────────────────────────────────

function MapContent({
  zbiorniki,
  selectedIds,
  panTarget,
  onFeatureClick,
  onMapReady,
  onMoveEnd,
}: {
  zbiorniki: OsmZbiornik[];
  selectedIds: Set<number>;
  panTarget: [number, number] | null;
  onFeatureClick: (z: OsmZbiornik, shift: boolean) => void;
  onMapReady: (map: L.Map) => void;
  onMoveEnd: () => void;
}) {
  const map = useMap();
  const prevPanRef = useRef("");
  const onMoveEndRef = useRef(onMoveEnd);
  onMoveEndRef.current = onMoveEnd;

  useEffect(() => { onMapReady(map); }, [map, onMapReady]);

  useEffect(() => {
    const handler = () => onMoveEndRef.current();
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); };
  }, [map]);

  useEffect(() => {
    if (!panTarget) return;
    const key = `${panTarget[0]},${panTarget[1]}`;
    if (prevPanRef.current === key) return;
    prevPanRef.current = key;
    map.flyTo(panTarget, 13, { duration: 1.2 });
  }, [panTarget, map]);

  return (
    <>
      {zbiorniki.map((z) => {
        const isSelected = selectedIds.has(z.osmId);
        const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [z.geojson] };
        return (
          <GeoJSONLayer
            key={`${z.osmId}_${isSelected}`}
            data={fc}
            style={{
              color: isSelected ? "#f59e0b" : "#3b82f6",
              weight: isSelected ? 3 : 2,
              fillColor: isSelected ? "#f59e0b" : "#3b82f6",
              fillOpacity: isSelected ? 0.5 : 0.18,
            }}
            onEachFeature={(_, layer) => {
              layer.on({
                click: (e) => {
                  const shift = (e as L.LeafletMouseEvent).originalEvent?.shiftKey ?? false;
                  onFeatureClick(z, shift);
                  (e as L.LeafletMouseEvent).originalEvent?.stopPropagation();
                },
                mouseover: (e) => {
                  if (!isSelected)
                    (e.target as L.Path).setStyle({ weight: 3, fillOpacity: 0.35 });
                  (e.target as unknown as { _map?: L.Map })._map
                    ?.getContainer().style.setProperty("cursor", "pointer");
                },
                mouseout: (e) => {
                  if (!isSelected)
                    (e.target as L.Path).setStyle({ weight: 2, fillOpacity: 0.18 });
                  (e.target as unknown as { _map?: L.Map })._map
                    ?.getContainer().style.setProperty("cursor", "");
                },
              });
            }}
          />
        );
      })}
    </>
  );
}

// ─── Główny komponent ─────────────────────────────────────────────────────────

export default function OsmLowiskoPicker({ onConfirm, onCancel }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<{ label: string; sublabel?: string; lat: number; lng: number }[]>([]);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const [panTarget, setPanTarget] = useState<[number, number] | null>(null);
  const [zbiorniki, setZbiorniki] = useState<OsmZbiornik[]>([]);
  const [loadingZbiorniki, setLoadingZbiorniki] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [gettingName, setGettingName] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "info" | "success"; text: string } | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const MIN_ZOOM = 12;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
    // Załaduj zbiorniki od razu po załadowaniu mapy
    if (map.getZoom() >= MIN_ZOOM) {
      setTimeout(() => triggerLoadZbiorniki(), 500);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMoveEnd = useCallback(() => {
    if (!mapRef.current) return;
    if (mapRef.current.getZoom() < MIN_ZOOM) {
      setMessage({ type: "info", text: `Przybliż mapę (zoom ≥ ${MIN_ZOOM}), żeby automatycznie załadować zbiorniki.` });
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      triggerLoadZbiorniki();
    }, 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function triggerLoadZbiorniki() {
    if (!mapRef.current) return;
    setMessage(null);
    setLoadingZbiorniki(true);
    setSelectedIds(new Set());
    try {
      const unique = await loadZbiornikiFromBbox(mapRef.current);
      setZbiorniki(unique);
      if (unique.length === 0) {
        setMessage({ type: "info", text: "Brak zbiorników w tym obszarze. Przybliż mapę lub zmień lokalizację." });
      } else {
        setMessage({ type: "success", text: `Znaleziono ${unique.length} zbiorników — kliknij, aby wybrać. Shift+klik = wybierz kilka.` });
      }
    } catch {
      setMessage({ type: "error", text: "Błąd pobierania danych z Overpass API. Spróbuj ponownie." });
    } finally {
      setLoadingZbiorniki(false);
    }
  }

  function handleFeatureClick(z: OsmZbiornik, shift: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shift) {
        // Shift: toggle — dodaj lub usuń z zaznaczenia
        if (next.has(z.osmId)) next.delete(z.osmId);
        else next.add(z.osmId);
      } else {
        // Zwykłe kliknięcie: zastąp zaznaczenie
        next.clear();
        next.add(z.osmId);
      }
      return next;
    });
  }

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSuggestions([]); return; }

    const ql = q.toLowerCase();

    // Natychmiastowe: duże miasta
    const miastaMatches = POLSKIE_MIASTA
      .filter((m) => m.n.toLowerCase().includes(ql))
      .sort((a, b) => {
        const aPrefix = a.n.toLowerCase().startsWith(ql) ? 1 : 0;
        const bPrefix = b.n.toLowerCase().startsWith(ql) ? 1 : 0;
        if (aPrefix !== bPrefix) return bPrefix - aPrefix;
        return b.p - a.p;
      })
      .slice(0, 4)
      .map((m) => ({ label: m.n, sublabel: undefined as string | undefined, lat: m.lat, lng: m.lng }));
    setSuggestions(miastaMatches);

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
        const ALLOWED_TYPES = ["city", "town", "village", "hamlet", "locality", "municipality", "county", "state"];
        const existingLabels = new Set(miastaMatches.map((m) => m.label.toLowerCase()));
        const seen = new Set<number>();
        const photonResults = (data.features as PhotonFeature[])
          .filter((f) => {
            const type = (f.properties.type ?? "").toLowerCase();
            const id = f.properties.osm_id ?? 0;
            const name = (f.properties.name ?? "").toLowerCase();
            return ALLOWED_TYPES.includes(type) && !existingLabels.has(name) && !seen.has(id) && seen.add(id);
          })
          .slice(0, 3)
          .map((f) => ({
            label: f.properties.name ?? "",
            sublabel: f.properties.state ?? f.properties.county ?? undefined,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
          }))
          .filter((r) => r.label);
        setSuggestions([...miastaMatches, ...photonResults].slice(0, 5));
      } catch { /* abort lub błąd sieciowy */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function pickSuggestion(item: { label: string; lat: number; lng: number }) {
    setSearchQuery(item.label);
    setPanTarget([item.lat, item.lng]);
    setSuggestions([]);
    setSearchFocused(false);
    setZbiorniki([]);
    setSelectedIds(new Set());
    const shortName = item.label;
    setMessage({ type: "info", text: `Przechodzę do: ${shortName}` });
  }

  async function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setMessage(null);
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { "Accept-Language": "pl" } }
      );
      const data = await res.json();
      if (!data.length) {
        setMessage({ type: "error", text: "Nie znaleziono lokalizacji. Spróbuj pełnej nazwy." });
        return;
      }
      setZbiorniki([]);
      setSelectedIds(new Set());
      setPanTarget([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      const shortName = (data[0].display_name as string).split(",").slice(0, 2).join(",");
      setMessage({ type: "info", text: `Przechodzę do: ${shortName}` });
    } catch {
      setMessage({ type: "error", text: "Błąd połączenia z Nominatim." });
    } finally {
      setSearching(false);
    }
  }

  async function handleConfirm() {
    if (selectedIds.size === 0) return;
    const selected = zbiorniki.filter((z) => selectedIds.has(z.osmId));
    const merged = mergeZbiorniki(selected);
    setGettingName(true);
    const autoName = await fetchAutoName(merged);
    setGettingName(false);
    onConfirm(merged, autoName);
  }

  const selectedList = zbiorniki.filter((z) => selectedIds.has(z.osmId));

  const msgColor =
    message?.type === "error" ? "text-red-600 bg-red-50 border-red-200" :
    message?.type === "success" ? "text-green-700 bg-green-50 border-green-200" :
    "text-blue-700 bg-blue-50 border-blue-200";

  return (
    <div className="space-y-3">

      {/* ── Wyszukiwarka miejscowości ── */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center border border-gray-200 rounded-xl bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <input
              type="text"
              placeholder="Wpisz nazwę wsi, gminy lub miasta..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setMessage(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 300)}
              className="flex-1 px-3 py-2.5 text-sm text-gray-900 bg-transparent placeholder:text-gray-400 outline-none"
            />
            {searchQuery && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setSearchQuery(""); setSuggestions([]); }}
                className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 cursor-pointer font-medium transition-colors whitespace-nowrap"
          >
            {searching ? "..." : "Szukaj"}
          </button>
        </div>

        {/* Podpowiedzi */}
        {searchFocused && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-[9999]">
            {suggestions.map((item, i) => (
              <button
                key={i}
                onMouseDown={(e) => { e.preventDefault(); pickSuggestion(item); }}
                onTouchEnd={(e) => { e.preventDefault(); pickSuggestion(item); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer text-left"
              >
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{item.label}</p>
                  {item.sublabel && <p className="text-xs text-gray-400 truncate">{item.sublabel}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Komunikat ── */}
      {message && (
        <p className={`text-xs px-3 py-2 rounded-lg border ${msgColor}`}>
          {message.text}
        </p>
      )}

      {/* ── Mapa ── */}
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: "clamp(240px, 45vh, 380px)" }}>
        <MapContainer
          center={[50.0, 19.0]}
          zoom={13}
          style={{ width: "100%", height: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapContent
            zbiorniki={zbiorniki}
            selectedIds={selectedIds}
            panTarget={panTarget}
            onFeatureClick={handleFeatureClick}
            onMapReady={handleMapReady}
            onMoveEnd={handleMoveEnd}
          />
        </MapContainer>
      </div>

      {/* ── Przycisk ręcznego ładowania ── */}
      <button
        onClick={triggerLoadZbiorniki}
        disabled={loadingZbiorniki}
        className="w-full border border-blue-200 text-blue-700 bg-blue-50 text-sm px-4 py-2.5 rounded-xl hover:bg-blue-100 disabled:opacity-50 cursor-pointer font-medium transition-colors flex items-center justify-center gap-2"
      >
        {loadingZbiorniki ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Pobieranie zbiorników...
          </>
        ) : (
          "↓ Załaduj zbiorniki w widocznym obszarze"
        )}
      </button>

      {/* ── Podgląd wybranych zbiorników ── */}
      {selectedList.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5">
          <p className="font-semibold text-amber-900 text-sm">
            ✓ Wybrano {selectedList.length} {selectedList.length === 1 ? "zbiornik" : selectedList.length < 5 ? "zbiorniki" : "zbiorników"}
            {selectedList.length > 1 && " — zostaną scalone w jeden obszar"}
          </p>
          <div className="space-y-0.5">
            {selectedList.map((z) => (
              <div key={z.osmId} className="flex items-center justify-between gap-2">
                <p className="text-xs text-amber-800 truncate">
                  {z.name || `Zbiornik bez nazwy (OSM #${z.osmId})`}
                </p>
                <button
                  onClick={() => setSelectedIds((prev) => { const n = new Set(prev); n.delete(z.osmId); return n; })}
                  className="text-amber-600 hover:text-red-600 text-xs flex-shrink-0 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {selectedList.length > 1 && (
            <p className="text-xs text-amber-600">💡 Shift+klik na zbiornik aby dodać/usunąć z zaznaczenia</p>
          )}
        </div>
      )}

      {/* ── Akcje ── */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 border border-gray-200 text-gray-700 text-sm px-4 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer font-medium transition-colors"
        >
          Anuluj
        </button>
        <button
          onClick={handleConfirm}
          disabled={selectedIds.size === 0 || gettingName}
          className="flex-1 bg-purple-600 text-white text-sm px-4 py-2.5 rounded-xl hover:bg-purple-700 disabled:opacity-50 cursor-pointer font-medium transition-colors"
        >
          {gettingName ? "Pobieranie nazwy..." : `Dalej →${selectedIds.size > 1 ? ` (${selectedIds.size})` : ""}`}
        </button>
      </div>
    </div>
  );
}
