"use client";

import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

// Fix ikon Leaflet
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const pinIcon = L.divIcon({
  html: `<div style="
    background:#2563eb;color:white;border-radius:50%;width:36px;height:36px;
    display:flex;align-items:center;justify-content:center;font-size:18px;
    border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);
  ">🎣</div>`,
  className: "",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 15, { animate: false });
  }, [lat, lng, map]);
  return null;
}

interface Props {
  lat: number;
  lng: number;
  nazwa?: string;
}

export default function LocationPreview({ lat, lng, nazwa }: Props) {
  return (
    <div className="relative">
      <div className="rounded-none overflow-hidden" style={{ height: 150 }}>
        <MapContainer
          center={[lat, lng]}
          zoom={15}
          style={{ width: "100%", height: "100%" }}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          keyboard={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Recenter lat={lat} lng={lng} />
          <Marker position={[lat, lng]} icon={pinIcon} />
        </MapContainer>
      </div>
      {nazwa && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 pointer-events-none">
          <p className="text-white text-xs font-semibold truncate">📍 {nazwa}</p>
        </div>
      )}
    </div>
  );
}
