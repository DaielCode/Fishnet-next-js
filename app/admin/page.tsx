"use client";

/**
 * Strona panelu administracyjnego — /admin
 *
 * Dostęp tylko dla adminów — weryfikacja odbywa się wewnątrz AdminPanel
 * przez `useAuth().isAdmin`. Niezalogowani i nieadmini widzą komunikat błędu.
 *
 * AdminPanel jest lazy-loaded z `ssr: false` ponieważ używa Leaflet
 * (OsmLowiskoPicker), który wymaga obiektu `window` i nie działa w SSR.
 */
import dynamic from "next/dynamic";

// Leaflet wymaga środowiska przeglądarki — wyłączamy SSR
const AdminPanel = dynamic(() => import("@/components/admin/AdminPanel"), { ssr: false });

export default function AdminPage() {
  return <AdminPanel />;
}
