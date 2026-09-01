"use client";

/**
 * OsmLowiskoPicker — picker zbiornika wodnego z OpenStreetMap.
 *
 * Używany w dwóch miejscach:
 * 1. `AdminPanel` — admin dodaje nowe łowisko do bazy
 * 2. `ZaproponujLowiskoModal` — użytkownik proponuje łowisko
 *
 * Przepływ działania:
 * 1. Wyszukaj miejscowość (autocomplete z POLSKIE_MIASTA + Photon API)
 * 2. Mapa Leaflet pokazuje zbiorniki pobrane z Overpass API
 * 3. Kliknij zbiornik aby go wybrać (Shift+klik = wybierz kilka)
 * 4. Wiele zbiorników zostaje scalone w jeden MultiPolygon
 * 5. Overpass API: próba 3 mirrorów z timeoutem 8s każdy
 *
 * Źródła zewnętrzne (bez autoryzacji):
 * - Overpass API — geometria zbiorników z OSM
 * - Photon (Komoot) — autocomplete nazw miejsc
 * - Nominatim (OSM) — reverse geocoding (automatyczna nazwa łowiska)
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { POLSKIE_MIASTA } from "@/lib/miejscowosci";
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Reprezentacja zbiornika wodnego z OpenStreetMap.
 * `osmType: "way"` = prosty polygon, `"relation"` = multipolygon (zbiornik z wyspami).
 */
export interface OsmZbiornik {
  osmId: number;
  osmType: "way" | "relation";
  name?: string;
  centroid: [number, number]; // [lat, lng] — centrum zbiornika (średnia współrzędnych)
  geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

interface Props {
  /** Callback gdy użytkownik kliknie "Dalej" z wybranym zbiornikiem */
  onConfirm: (zbiornik: OsmZbiornik, autoName: string) => void;
  onCancel: () => void;
}

// ─── Parsowanie odpowiedzi Overpass → GeoJSON ─────────────────────────────────

/**
 * Konwertuje jeden element z odpowiedzi Overpass API na OsmZbiornik.
 *
 * Overpass zwraca dwa typy elementów:
 * - `way`      — prosty polygon (zbiornik bez wysp) z tablicą punktów geometry
 * - `relation` — multipolygon (zbiornik z wyspami) z members[].role = "outer"/"inner"
 *
 * UWAGA: Overpass zwraca współrzędne jako {lat, lon} ale GeoJSON wymaga [lon, lat].
 * Ta funkcja wykonuje konwersję przy budowaniu tablicy coords.
 *
 * GeoJSON wymaga zamkniętych pierścieni: ostatni punkt === pierwszy punkt.
 * Overpass nie zawsze zamyka pierścień — sprawdzamy i dodajemy punkt jeśli brak.
 *
 * @returns OsmZbiornik lub null jeśli element jest nieprawidłowy (za mało punktów)
 */
function parseOverpassElement(el: Record<string, unknown>): OsmZbiornik | null {
  try {
    const tags = (el.tags ?? {}) as Record<string, string>;

    if (el.type === "way") {
      const geometry = el.geometry as Array<{ lat: number; lon: number }> | undefined;
      if (!geometry || geometry.length < 2) return null;

      // Overpass: {lat, lon} → GeoJSON wymaga [lon, lat] (odwrócona kolejność!)
      const coords = geometry.map((p) => [p.lon, p.lat] as [number, number]);

      // GeoJSON polygon musi być zamkniętym pierścieniem (pierwszy = ostatni punkt)
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push(coords[0]);
      }

      // Centroid = średnia arytmetyczna wszystkich punktów geometrii
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
          geometry: { type: "Polygon", coordinates: [coords] }, // coords w tablicy = outer ring
        },
      };
    }

    if (el.type === "relation") {
      // Relation = zbiór members z rolami "outer" (brzeg) i "inner" (wyspa/dziura)
      const members = (el.members ?? []) as Array<{
        role: string;
        geometry: Array<{ lat: number; lon: number }>;
      }>;
      const outers: [number, number][][] = []; // zewnętrzne pierścienie (granica zbiornika)
      const inners: [number, number][][] = []; // wewnętrzne pierścienie (wyspy)

      for (const m of members) {
        if (!m.geometry?.length) continue;
        const ring = m.geometry.map((p) => [p.lon, p.lat] as [number, number]);
        // Zamknij pierścień jeśli Overpass go nie zamknął
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
          ring.push(ring[0]);
        }
        if (m.role === "outer") outers.push(ring);
        else if (m.role === "inner") inners.push(ring);
      }

      if (outers.length === 0) return null; // zbiornik bez granicy zewnętrznej = invalid

      // Jeśli jeden outer → Polygon, wiele outerów → MultiPolygon
      // inners są dodawane do każdego outera (uproszczenie — zwykle wyspa należy do jednego)
      const geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon =
        outers.length === 1
          ? { type: "Polygon", coordinates: [outers[0], ...inners] }
          : { type: "MultiPolygon", coordinates: outers.map((o) => [o, ...inners]) };

      // Centroid wyliczany z pierwszego outer ringa (zwykle największy)
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
  } catch { /* pomiń uszkodzone elementy (np. brak geometry) */ }
  return null;
}

// ─── Scalanie wielu zbiorników w jeden MultiPolygon ───────────────────────────

/**
 * Scala tablicę wybranych zbiorników w jeden OsmZbiornik z geometrią MultiPolygon.
 *
 * Używane gdy użytkownik zaznaczył kilka zbiorników przez Shift+klik.
 * Scenariusz: łowisko składające się z kilku połączonych stawów w OSM.
 *
 * - Polygon → bierzemy bezpośrednio jego coordinates (tablica pierścieni)
 * - MultiPolygon → rozwijamy (spread) jego coordinates (tablica tablic pierścieni)
 * - Centroid = uśredniony centroid wszystkich zaznaczonych zbiorników
 * - Nazwa = pierwsza znaleziona nazwa wśród zbiorników (lub undefined)
 * - osmId/osmType/properties = z pierwszego zbiornika na liście
 */
function mergeZbiorniki(list: OsmZbiornik[]): OsmZbiornik {
  if (list.length === 1) return list[0]; // optymalizacja — nic do scalania

  const coords: GeoJSON.Position[][][] = [];
  for (const z of list) {
    const g = z.geojson.geometry;
    if (g.type === "Polygon") {
      coords.push(g.coordinates); // Polygon.coordinates = Position[][] → opakowujemy w tablicę
    } else {
      coords.push(...g.coordinates); // MultiPolygon.coordinates = Position[][][] → rozwijamy
    }
  }

  const centroidLat = list.reduce((s, z) => s + z.centroid[0], 0) / list.length;
  const centroidLng = list.reduce((s, z) => s + z.centroid[1], 0) / list.length;

  return {
    osmId: list[0].osmId,
    osmType: list[0].osmType,
    name: list.find((z) => z.name)?.name, // pierwsza niepusta nazwa
    centroid: [centroidLat, centroidLng],
    geojson: {
      type: "Feature",
      properties: list[0].geojson.properties,
      geometry: { type: "MultiPolygon", coordinates: coords },
    },
  };
}

// ─── Reverse geocoding → automatyczna nazwa ───────────────────────────────────

/**
 * Generuje automatyczną nazwę dla zbiornika na podstawie jego lokalizacji.
 *
 * Priorytet:
 * 1. Tag `name` z OSM (np. "Jezioro Goczałkowickie") — używamy bez API
 * 2. Nominatim reverse geocoding — szuka nazwy miejscowości przy centroidzie
 *    Format: "{wieś/miasto}-Lake" (np. "Ligota-Lake")
 * 3. Fallback: "Nowe łowisko" gdy API jest niedostępne
 *
 * Nominatim zwraca obiekt `address` z hierarchią administracyjną:
 * village > town > city > municipality > county
 */
async function fetchAutoName(zbiornik: OsmZbiornik): Promise<string> {
  if (zbiornik.name) return zbiornik.name; // tag name z OSM — nie potrzebujemy API
  try {
    const [lat, lng] = zbiornik.centroid;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "pl" } } // odpowiedź po polsku
    );
    const data = await res.json();
    const addr = (data.address ?? {}) as Record<string, string>;
    // Bierzemy najbardziej szczegółowy dostępny poziom administracyjny
    const place =
      addr.village ?? addr.town ?? addr.city ?? addr.municipality ?? addr.county ?? "Nieznane";
    return `${place}-Lake`;
  } catch {
    return "Nowe łowisko"; // sieć niedostępna lub API zwróciło błąd
  }
}

// ─── Ładowanie zbiorników z Overpass ─────────────────────────────────────────

/**
 * Lista mirrorów Overpass API — próbowane po kolei aż jeden odpowie.
 * Overpass-api.de bywa przeciążony, dlatego najpierw próbujemy szybsze mirrory.
 */
const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

/**
 * Pobiera zbiorniki wodne z Overpass API dla aktualnego widoku mapy (bbox).
 *
 * Zapytanie Overpass szuka elementów z tagiem `natural=water`:
 * - `way` = zwykły zbiornik (polygon)
 * - `relation` = zbiornik z wyspami (multipolygon)
 * `out geom` — Overpass zwraca pełną geometrię (nie tylko ID)
 *
 * Mechanizm retry z timeout:
 * - Każdy mirror ma 8 sekund na odpowiedź (AbortController)
 * - Jeśli mirror nie odpowie → próbujemy następny
 * - Jeśli wszystkie zawiodą → rzucamy ostatni błąd
 *
 * Deduplikacja: Map(osmId → zbiornik) usuwa duplikaty gdy te same zbiorniki
 * pojawią się w kilku mirrorach (teoretycznie niemożliwe, ale dla pewności).
 */
async function loadZbiornikiFromBbox(map: L.Map): Promise<OsmZbiornik[]> {
  const bounds = map.getBounds();
  // Overpass bbox format: south,west,north,east (odwrotnie niż GeoJSON [w,s,e,n]!)
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const overpassQuery = `[out:json][timeout:30];(way["natural"="water"](${bbox});relation["natural"="water"](${bbox}););out geom;`;

  let lastError: unknown;
  for (const mirror of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // 8s timeout na mirror
    try {
      const res = await fetch(mirror, { method: "POST", body: overpassQuery, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const parsed = (data.elements as unknown[])
        .map((el) => parseOverpassElement(el as Record<string, unknown>))
        .filter(Boolean) as OsmZbiornik[]; // filter(Boolean) usuwa null (nievalid elementy)
      // Deduplikacja po osmId na wypadek duplikatów w danych
      return Array.from(new Map(parsed.map((z) => [z.osmId, z])).values());
    } catch (err) {
      lastError = err; // zapisz błąd i spróbuj następny mirror
    } finally {
      clearTimeout(timer); // zawsze czyść timer niezależnie od wyniku
    }
  }
  throw lastError; // wszystkie mirrory zawiodły
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

  // Stabilizujemy FeatureCollection per zbiornik — bez tego nowy obiekt {type:"FeatureCollection",...}
  // powstawałby przy KAŻDYM renderze (np. przy toggle selectedIds), co zmuszało GeoJSON
  // z react-leaflet do przebudowy warstwy nawet gdy dane faktycznie się nie zmieniły.
  const featureCollections = useMemo(
    () => zbiorniki.map((z): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [z.geojson] })),
    [zbiorniki]
  );

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
      {zbiorniki.map((z, i) => {
        const isSelected = selectedIds.has(z.osmId);
        const fc = featureCollections[i];
        return (
          <GeoJSONLayer
            key={z.osmId}
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
  // requestIdRef — chroni przed race condition: handleMapReady i handleMoveEnd
  // mogą wywołać triggerLoadZbiorniki() niemal jednocześnie (np. zaraz po starcie
  // mapy), a wolniejszy request (retry po mirrorach, do 24s) mógłby nadpisać
  // wynik szybszego, który już się poprawnie załadował. Stosujemy tylko wynik
  // najnowszego wywołania.
  const requestIdRef = useRef(0);

  /**
   * Callback gdy Leaflet zakończy inicjalizację mapy.
   * Zapisujemy referencję do instancji L.Map i ładujemy zbiorniki jeśli zoom jest OK.
   */
  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
    // Krótkie opóźnienie żeby tiles zdążyły się załadować przed pierwszym fetch
    if (map.getZoom() >= MIN_ZOOM) {
      setTimeout(() => triggerLoadZbiorniki(), 500);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Callback po każdym ruchu mapy (pan/zoom). Debounced 2s — nie chcemy
   * wysyłać zapytania do Overpass po każdym pikselu przesunięcia mapy.
   * Poniżej MIN_ZOOM pokazujemy informację zamiast ładować (za dużo danych).
   */
  const handleMoveEnd = useCallback(() => {
    if (!mapRef.current) return;
    if (mapRef.current.getZoom() < MIN_ZOOM) {
      setMessage({ type: "info", text: `Przybliż mapę (zoom ≥ ${MIN_ZOOM}), żeby automatycznie załadować zbiorniki.` });
      return;
    }
    // Debounce: anuluj poprzedni timer i ustaw nowy 2s
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      triggerLoadZbiorniki();
    }, 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function triggerLoadZbiorniki() {
    if (!mapRef.current) return;
    const myRequestId = ++requestIdRef.current; // ten fetch jest teraz "najnowszy"
    setMessage(null);
    setLoadingZbiorniki(true);
    setSelectedIds(new Set());
    try {
      const unique = await loadZbiornikiFromBbox(mapRef.current);
      if (myRequestId !== requestIdRef.current) return; // w międzyczasie wystartował nowszy fetch — ignorujemy ten wynik
      setZbiorniki(unique);
      if (unique.length === 0) {
        setMessage({ type: "info", text: "Brak zbiorników w tym obszarze. Przybliż mapę lub zmień lokalizację." });
      } else {
        setMessage({ type: "success", text: `Znaleziono ${unique.length} zbiorników — kliknij, aby wybrać. Shift+klik = wybierz kilka.` });
      }
    } catch {
      if (myRequestId !== requestIdRef.current) return;
      setMessage({ type: "error", text: "Błąd pobierania danych z Overpass API. Spróbuj ponownie." });
    } finally {
      if (myRequestId === requestIdRef.current) setLoadingZbiorniki(false);
    }
  }

  /**
   * Obsługuje kliknięcie na polygon zbiornika.
   * Shift+klik = multiselect (toggle), zwykły klik = zastępuje zaznaczenie.
   * Używamy funkcji updater setState żeby uniknąć stale closure na selectedIds.
   */
  function handleFeatureClick(z: OsmZbiornik, shift: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev); // kopia — nie mutujemy stanu bezpośrednio
      if (shift) {
        // Shift+klik: toggle — jeśli był zaznaczony to odznacz, i odwrotnie
        if (next.has(z.osmId)) next.delete(z.osmId);
        else next.add(z.osmId);
      } else {
        // Zwykły klik: zastąp całe zaznaczenie tylko tym zbiornikiem
        next.clear();
        next.add(z.osmId);
      }
      return next;
    });
  }

  /**
   * Efekt autocomplete — uruchamia się przy każdej zmianie searchQuery.
   *
   * Dwa źródła podpowiedzi działające równolegle:
   * 1. POLSKIE_MIASTA — natychmiastowe (synchroniczne), sortowane według priorytetu
   * 2. Photon API (komoot.io) — asynchroniczne, debounced 200ms
   *    Filtrujemy tylko miejscowości (city/town/village/hamlet...), pomijamy ulice i POI.
   *    Deduplikacja: pomijamy miejscowości które już są w wynikach z POLSKIE_MIASTA.
   *
   * AbortController anuluje poprzednie zapytanie Photon gdy user dalej pisze.
   */
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSuggestions([]); return; } // za krótkie zapytanie

    const ql = q.toLowerCase();

    // Natychmiastowe wyniki z lokalnej listy (bez API, zero latency)
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

  /**
   * Potwierdza wybór zbiorników i przekazuje dane do rodzica przez onConfirm.
   * Jeśli wybrano wiele zbiorników — scala je w jeden MultiPolygon przed przekazaniem.
   * Pobiera automatyczną nazwę z Nominatim (może chwilę zająć — stąd stan gettingName).
   */
  async function handleConfirm() {
    if (selectedIds.size === 0) return;
    const selected = zbiorniki.filter((z) => selectedIds.has(z.osmId));
    const merged = mergeZbiorniki(selected); // scala w MultiPolygon jeśli wiele wybranych
    setGettingName(true);
    const autoName = await fetchAutoName(merged); // reverse geocoding lub tag name z OSM
    setGettingName(false);
    onConfirm(merged, autoName); // przekaż do ZaproponujLowiskoModal lub AdminPanel
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
