"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Stanowisko, Lowisko } from "@/types";

// Leaflet nie działa SSR — ładujemy tylko po stronie klienta
const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const DodajPostModal = dynamic(() => import("@/components/map/DodajPostModal"), { ssr: false });

export default function MapaPage() {
  const [selected, setSelected] = useState<{ stanowisko: Stanowisko; lowisko: Lowisko } | null>(null);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 57px)" }}>
      <MapView
        onStanowiskoClick={(stanowisko, lowisko) => setSelected({ stanowisko, lowisko })}
      />
      {selected && (
        <DodajPostModal
          stanowisko={selected.stanowisko}
          lowisko={selected.lowisko}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
