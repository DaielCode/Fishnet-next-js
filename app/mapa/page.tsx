"use client";

/**
 * MapaPage — strona mapy łowisk (/mapa).
 *
 * Koordynuje trzy komponenty lazy-loaded (ssr: false — wszystkie używają Leaflet):
 * - `MapView`               — interaktywna mapa z łowiskami i stanowiskami
 * - `DodajPostFeedModal`    — modal posta, otwierany po kliknięciu na mapie
 * - `ZaproponujLowiskoModal`— modal propozycji łowiska (tylko dla zalogowanych)
 *
 * Stan `lokalizacja` przenosi dane klikniętego miejsca do modalu posta.
 * Mapa zajmuje całą wysokość viewportu minus Navbar (top-[57px]) i
 * minus dolną nawigację mobile (`--map-bottom-offset` z globals.css).
 */
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
  const { user, loading, isAdmin } = useAuth();

  /**
   * Klik na marker stanowiska — otwiera modal posta z danymi stanowiska.
   * Niezalogowani użytkownicy są ignorowani (brak akcji).
   */
  function handleStanowiskoClick(stanowisko: Stanowisko, lowisko: Lowisko) {
    if (!user) return;
    setLokalizacja({
      nazwa: lowisko.nazwa,
      lowisko_id: lowisko.id,
      stanowisko_id: stanowisko.id,
      lat: stanowisko.wspolrzedne.latitude,
      lng: stanowisko.wspolrzedne.longitude,
      numer: stanowisko.numer,
    });
  }

  /**
   * Klik na poligon łowiska (bez wyboru konkretnego stanowiska).
   * stanowisko_id będzie pustym stringiem w poście.
   */
  function handleLowiskoClick(info: { nazwa: string; lowisko_id: string; lat: number; lng: number }) {
    if (!user) return;
    setLokalizacja({
      nazwa: info.nazwa,
      lowisko_id: info.lowisko_id,
      stanowisko_id: "",
      lat: info.lat,
      lng: info.lng,
    });
  }

  /**
   * Klik w dowolne miejsce na mapie (poza stanowiskiem/łowiskiem).
   * Post będzie miał puste lowisko_id i stanowisko_id, tylko współrzędne.
   */
  function handleMapClick(lat: number, lng: number) {
    if (!user) return;
    setLokalizacja({
      nazwa: "Mapa",
      lowisko_id: "",
      stanowisko_id: "",
      lat,
      lng,
    });
  }

  return (
    <>
      {/*
       * Mapa zajmuje cały viewport pomiędzy Navbar (top-[57px]) a dolną nawigacją.
       * `--map-bottom-offset` to CSS custom property ustawiane w globals.css:
       * - Mobile: wartość = wysokość dolnego paska nawigacji (np. 64px)
       * - Desktop: 0px (brak dolnego paska)
       * `overflow: hidden` — zapobiega scroll na mapie (mapa ma własny scroll).
       *
       * `zaproponujVisible={!loading && !!user && !isAdmin}` — przycisk widoczny gdy:
       * zalogowany + NIE admin (admin ma swój własny panel do dodawania łowisk).
       *
       * `<Suspense fallback={null}>` — wymagane przez Next.js gdy wewnątrz jest useSearchParams()
       * (MapController w MapView używa useSearchParams).
       */}
      <div className="fixed inset-x-0 top-[57px] overflow-hidden" style={{ bottom: 'var(--map-bottom-offset)' }}>
        <Suspense fallback={null}>
          <MapView
            onStanowiskoClick={handleStanowiskoClick}
            onLowiskoClick={handleLowiskoClick}
            onMapClick={handleMapClick}
            zaproponujVisible={!loading && !!user && !isAdmin} // tylko zalogowani non-admini
            onZaproponuj={() => setPropozycjaOpen(true)}
          />
        </Suspense>
      </div>
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
