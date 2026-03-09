"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { collection, getDocs, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
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

// Piksele odpowiadające 200m przy danym zoomie (szerokość geogr. ~50°)
function pixele200m(zoom: number): number {
  const metersPerPixel = (2 * Math.PI * 6378137 * Math.cos(50 * Math.PI / 180)) / (256 * Math.pow(2, zoom));
  return Math.round(200 / metersPerPixel);
}

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

interface Props {
  onStanowiskoClick?: (stanowisko: Stanowisko, lowisko: Lowisko) => void;
  onLowiskoClick?: (info: LowiskoKlik) => void;
}

export default function MapView({ onStanowiskoClick, onLowiskoClick }: Props) {
  const [stanowiska, setStanowiska] = useState<Stanowisko[]>([]);
  const [lowiska, setLowiska] = useState<Lowisko[]>([]);
  const [warstwy, setWarstwy] = useState<WarstwaGeo[]>([]);
  const [postyZPinami, setPostyZPinami] = useState<Post[]>([]);

  useEffect(() => {
    // Stanowiska z Firestore
    async function fetchStanowiska() {
      const snap = await getDocs(collection(db, "lowiska"));
      const lowiskaData = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lowisko));
      setLowiska(lowiskaData);
      const all: Stanowisko[] = [];
      for (const l of lowiskaData) {
        const s = await getDocs(collection(db, "lowiska", l.id, "stanowiska"));
        s.docs.forEach((d) => all.push({ id: d.id, lowisko_id: l.id, ...d.data() } as Stanowisko));
      }
      setStanowiska(all);
    }

    // GeoJSON warstwy statyczne
    async function fetchWarstwy() {
      const loaded = await Promise.all(
        WARSTWY.map(async ({ id, plik, kolor }) => {
          try {
            const res = await fetch(plik);
            if (!res.ok) return null;
            const data = await res.json();
            return { id, kolor, data } as WarstwaGeo;
          } catch {
            return null;
          }
        })
      );
      setWarstwy(loaded.filter(Boolean) as WarstwaGeo[]);
    }

    // Posty z pinami (mają lat/lng)
    const q = query(collection(db, "posty"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const posty = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Post))
        .filter((p) => p.lat != null && p.lng != null);
      setPostyZPinami(posty);
    });

    fetchStanowiska();
    fetchWarstwy();
    return unsub;
  }, []);

  return (
    <MapContainer
      center={[49.8877, 18.9510]}
      zoom={15}
      className="w-full h-full"
      style={{ minHeight: "500px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

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
            const nazwa = feature.properties?.name ?? "Łowisko";
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
      {stanowiska.map((s) => {
        const lowisko = lowiska.find((l) => l.id === s.lowisko_id);
        return (
          <Marker key={s.id} position={[s.wspolrzedne.latitude, s.wspolrzedne.longitude]}>
            <Popup>
              <div className="text-sm">
                <p className="font-bold">Stanowisko {s.numer}</p>
                <p className="text-gray-600">{lowisko?.nazwa}</p>
                {s.opis && <p className="mt-1">{s.opis}</p>}
                {onStanowiskoClick && lowisko && (
                  <button
                    onClick={() => onStanowiskoClick(s, lowisko)}
                    className="mt-2 w-full bg-blue-600 text-white text-xs py-1 px-2 rounded hover:bg-blue-700"
                  >
                    Dodaj połów
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Piny postów z grupowaniem */}
      <MarkerClusterGroup
        chunkedLoading
        iconCreateFunction={(cluster: { getChildCount: () => number }) => L.divIcon({
          html: `<div style="background:#2563eb;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${cluster.getChildCount()}</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })}
        maxClusterRadius={(zoom: number) => pixele200m(zoom)}
        showCoverageOnHover={false}
      >
        {postyZPinami.map((post) => (
          <Marker key={post.id} position={[post.lat!, post.lng!]} icon={ikonaPosta}>
            <Popup>
              <div style={{ fontSize: 13, minWidth: 180 }}>
                {post.zdjecia?.[0] && (
                  <img
                    src={post.zdjecia[0]}
                    alt="połów"
                    style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 6, marginBottom: 8 }}
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
                  Zobacz post →
                </a>
                <button
                  onClick={() => onLowiskoClick?.({ nazwa: post.lokalizacja_nazwa || "Łowisko", lowisko_id: post.lowisko_id, lat: post.lat!, lng: post.lng! })}
                  style={{ display: "block", width: "100%", marginTop: 6, background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac", textAlign: "center", padding: "6px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  + Dodaj post w tym miejscu
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
