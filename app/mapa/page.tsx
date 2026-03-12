"use client";

import dynamic from "next/dynamic";
import { useState, Suspense } from "react";
import type { Stanowisko, Lowisko } from "@/types";
import { useAuth } from "@/hooks/useAuth";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const DodajPostFeedModal = dynamic(() => import("@/components/feed/DodajPostFeedModal"), { ssr: false });
const ZaproponujLowiskoModal = dynamic(() => import("@/components/map/ZaproponujLowiskoModal"), { ssr: false });

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
  const [propozycjaOpen, setPropozycjaOpen] = useState(false);
  const { user, isAdmin } = useAuth();

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
    <>
      <div className="fixed inset-x-0 top-[57px] bottom-[64px] sm:bottom-0 overflow-hidden">
        <Suspense fallback={null}>
          <MapView
            onStanowiskoClick={handleStanowiskoClick}
            onLowiskoClick={handleLowiskoClick}
          />
        </Suspense>
      </div>
      {user && !isAdmin && (
        <button
          onClick={() => setPropozycjaOpen(true)}
          style={{ position: "fixed", bottom: 80, right: 16, zIndex: 1000 }}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-lg hover:bg-blue-700 transition-colors flex items-center gap-2 sm:bottom-6"
        >
          <span>📍</span> Zaproponuj łowisko
        </button>
      )}
      {lokalizacja && (
        <DodajPostFeedModal
          lokalizacja={lokalizacja}
          onClose={() => setLokalizacja(null)}
        />
      )}
      {propozycjaOpen && (
        <ZaproponujLowiskoModal onClose={() => setPropozycjaOpen(false)} />
      )}
    </>
  );
}
