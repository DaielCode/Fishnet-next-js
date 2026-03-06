"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Lowisko, Stanowisko } from "@/types";

// Fix domyślnych ikon Leaflet w Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface Props {
  onStanowiskoClick?: (stanowisko: Stanowisko, lowisko: Lowisko) => void;
}

export default function MapView({ onStanowiskoClick }: Props) {
  const [lowiska, setLowiska] = useState<Lowisko[]>([]);
  const [stanowiska, setStanowiska] = useState<Stanowisko[]>([]);
  const [geojsonData, setGeojsonData] = useState<Record<string, GeoJSON.FeatureCollection>>({});

  useEffect(() => {
    async function fetchData() {
      // Pobierz łowiska
      const lowiskaSnap = await getDocs(collection(db, "lowiska"));
      const lowiskaData = lowiskaSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Lowisko));
      setLowiska(lowiskaData);

      // Pobierz stanowiska z każdego łowiska
      const allStanowiska: Stanowisko[] = [];
      for (const lowisko of lowiskaData) {
        const stanSnap = await getDocs(collection(db, "lowiska", lowisko.id, "stanowiska"));
        stanSnap.docs.forEach((d) => {
          allStanowiska.push({ id: d.id, lowisko_id: lowisko.id, ...d.data() } as Stanowisko);
        });

        // Załaduj GeoJSON z Firebase Storage jeśli jest URL
        if (lowisko.geojson_url) {
          const response = await fetch(lowisko.geojson_url);
          const geoData = await response.json();
          setGeojsonData((prev) => ({ ...prev, [lowisko.id]: geoData }));
        }
      }
      setStanowiska(allStanowiska);
    }

    fetchData();
  }, []);

  return (
    <MapContainer
      center={[50.27, 19.02]}
      zoom={12}
      className="w-full h-full"
      style={{ minHeight: "500px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Poligony łowisk z GeoJSON */}
      {Object.entries(geojsonData).map(([lowiskoId, data]) => (
        <GeoJSON
          key={lowiskoId}
          data={data}
          style={{
            color: "#2563eb",
            weight: 2,
            fillColor: "#3b82f6",
            fillOpacity: 0.2,
          }}
        />
      ))}

      {/* Markery stanowisk */}
      {stanowiska.map((s) => {
        const lowisko = lowiska.find((l) => l.id === s.lowisko_id);
        return (
          <Marker
            key={s.id}
            position={[s.wspolrzedne.latitude, s.wspolrzedne.longitude]}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold">Stanowisko {s.numer}</p>
                <p className="text-gray-600">{lowisko?.nazwa}</p>
                <p className="mt-1">{s.opis}</p>
                {onStanowiskoClick && (
                  <button
                    onClick={() => lowisko && onStanowiskoClick(s, lowisko)}
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
    </MapContainer>
  );
}
