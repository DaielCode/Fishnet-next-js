"use client";

import dynamic from "next/dynamic";
import { useState, Suspense } from "react";
import type { Stanowisko, Lowisko } from "@/types";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const DodajPostFeedModal = dynamic(() => import("@/components/feed/DodajPostFeedModal"), { ssr: false });

interface Lokalizacja {
  nazwa: string;
  lowisko_id: string;
  stanowisko_id: string;
  lat?: number;
  lng?: number;
  numer?: number;
}

export default function MapaPage() {
  const [lokalizacja, setLokalizacja] = useState<Lokalizacja | null>(null);

  function handleStanowiskoClick(stanowisko: Stanowisko, lowisko: Lowisko) {
    setLokalizacja({
      nazwa: lowisko.nazwa,
      lowisko_id: lowisko.id,
      stanowisko_id: stanowisko.id,
      lat: stanowisko.wspolrzedne.latitude,
      lng: stanowisko.wspolrzedne.longitude,
      numer: stanowisko.numer,
    });
  }

  function handleLowiskoClick(info: { nazwa: string; lowisko_id: string; lat: number; lng: number }) {
    setLokalizacja({
      nazwa: info.nazwa,
      lowisko_id: info.lowisko_id,
      stanowisko_id: "",
      lat: info.lat,
      lng: info.lng,
    });
  }

  return (
    <div className="relative w-full h-[calc(100vh-121px)] sm:h-[calc(100vh-57px)]">
      <Suspense fallback={null}>
      <MapView
        onStanowiskoClick={handleStanowiskoClick}
        onLowiskoClick={handleLowiskoClick}
      />
      </Suspense>
      {lokalizacja && (
        <DodajPostFeedModal
          lokalizacja={lokalizacja}
          onClose={() => setLokalizacja(null)}
        />
      )}
    </div>
  );
}
