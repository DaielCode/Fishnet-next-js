"use client";

/**
 * DodajPostModal — uproszczony modal dodawania posta, używany na stronie /mapa.
 *
 * UWAGA: To jest STARSZA wersja modala. Główny modal to `DodajPostFeedModal`.
 * Różnice:
 * - Brak swipe-to-close, brak LocationPreview, brak drag-and-drop
 * - Upload do Cloudinary zamiast Firebase Storage (legacy)
 * - Brak obsługi lat/lng (nie zapisuje pinów na mapie)
 * - Skrócona lista gatunków ryb (10 vs 35 w DodajPostFeedModal)
 * - Brak i18n (hardcoded po polsku)
 *
 * Komponent może być zastąpiony przez DodajPostFeedModal w przyszłości.
 */
import { useState, useRef } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

/** Skrócona lista gatunków — starsza wersja bez pełnej listy z translations.ts */
const TYPY_RYB = ["Karp", "Szczupak", "Okoń", "Lin", "Amur", "Sum", "Płoć", "Leszcz", "Sandacz", "Inne"];

/**
 * Uploaduje plik do Cloudinary przez REST API.
 *
 * LEGACY: Nowy kod używa Firebase Storage (uploadToStorage w DodajPostFeedModal).
 * Cloudinary wymaga konfiguracji:
 * - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` — nazwa konta Cloudinary
 * - `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` — unsigned upload preset (bez podpisu)
 *
 * `upload_preset` pozwala na upload bez sygnatury (mniej bezpieczne, ale prostsze dla MVP).
 * `secure_url` — zawsze HTTPS, niezależnie od konfiguracji Cloudinary.
 */
async function uploadToCloudinary(plik: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", plik);
  formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Błąd uploadu zdjęcia");
  const data = await res.json();
  return data.secure_url as string; // publiczny HTTPS URL do zdjęcia
}

interface Props {
  lokalizacja: {
    nazwa: string;
    lowisko_id: string;
    stanowisko_id: string;
    numer?: number;
  };
  onClose: () => void;
}

export default function DodajPostModal({ lokalizacja, onClose }: Props) {
  const [typRyby, setTypRyby] = useState("");
  const [nazwaRyby, setNazwaRyby] = useState("");
  const [opis, setOpisState] = useState("");
  const [wagaKg, setWagaKg] = useState("");
  const [dlugoscCm, setDlugoscCm] = useState("");
  const [zdjecia, setZdjecia] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null); // ukryty <input type="file">

  /**
   * Submit: upload zdjęć do Cloudinary (sekwencyjnie) → addDoc do Firestore.
   * Guard `if (!auth.currentUser) return` — Firestore i tak odrzuci (reguły bezpieczeństwa),
   * ale early return zapobiega błędom TypeScript przy dostępie do .uid.
   * `serverTimestamp()` — timestamp po stronie serwera (niezależny od zegara klienta).
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.currentUser) return; // teoretycznie niemożliwe — modal nie pokazuje się dla niezalogowanych
    setLoading(true);

    try {
      const zdjeciaUrls: string[] = [];
      for (const plik of zdjecia) {
        const url = await uploadToCloudinary(plik); // upload sekwencyjnie (nie Promise.all)
        zdjeciaUrls.push(url);
      }

      await addDoc(collection(db, "posty"), {
        user_id: auth.currentUser.uid,
        stanowisko_id: lokalizacja.stanowisko_id,
        lowisko_id: lokalizacja.lowisko_id,
        lokalizacja_nazwa: lokalizacja.nazwa,
        typ_ryby: typRyby,
        nazwa_ryby: nazwaRyby,
        zdjecia: zdjeciaUrls,
        opis,
        waga_kg: wagaKg ? parseFloat(wagaKg) : null,    // null = nie podano
        dlugosc_cm: dlugoscCm ? parseFloat(dlugoscCm) : null,
        timestamp: serverTimestamp(),
        likes: 0,
      });

      onClose(); // zamknij modal po sukcesie
    } finally {
      setLoading(false); // zawsze odblokuj przycisk (nawet przy błędzie)
    }
  }

  // Nagłówek: "Stanowisko 3 · Uroczysko Karpiowe" lub tylko "Uroczysko Karpiowe"
  const naglowekLokalizacji = lokalizacja.numer
    ? `Stanowisko ${lokalizacja.numer} · ${lokalizacja.nazwa}`
    : lokalizacja.nazwa;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1002] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold">Dodaj połów</h2>
              <p className="text-sm text-gray-500">{naglowekLokalizacji}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Typ ryby</label>
              <select
                value={typRyby}
                onChange={(e) => setTypRyby(e.target.value)}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Wybierz...</option>
                {TYPY_RYB.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Nazwa ryby</label>
              <input
                type="text"
                value={nazwaRyby}
                onChange={(e) => setNazwaRyby(e.target.value)}
                placeholder="np. Złoty Karp"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Waga (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={wagaKg}
                  onChange={(e) => setWagaKg(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Długość (cm)</label>
                <input
                  type="number"
                  value={dlugoscCm}
                  onChange={(e) => setDlugoscCm(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Opis</label>
              <textarea
                value={opis}
                onChange={(e) => setOpisState(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Zdjęcia</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setZdjecia(Array.from(e.target.files ?? []))}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-blue-400"
              >
                {zdjecia.length > 0 ? `${zdjecia.length} zdjęcie(a) wybrane` : "Kliknij aby dodać zdjęcia"}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !typRyby}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Zapisywanie..." : "Opublikuj połów"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
