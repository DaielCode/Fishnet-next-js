"use client";

import { useState, useRef, useEffect } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

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
  return data.secure_url as string;
}

const TYPY_RYB = [
  "Karp", "Szczupak", "Okoń", "Lin", "Amur", "Sum", "Płoć", "Leszcz", "Sandacz",
  "Tołpyga", "Karaś", "Karaś srebrzysty", "Boleń", "Brzana", "Certa", "Jaź",
  "Jelec", "Kleń", "Krąp", "Miętus", "Pstrąg potokowy", "Pstrąg tęczowy",
  "Pstrąg źródlany", "Sieja", "Sielawa", "Troć wędrowna", "Łosoś", "Węgorz",
  "Wzdręga", "Ukleja", "Różanka", "Świnka", "Ciernik", "Stynka", "Inne",
];

const INPUT = "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all";

interface Lokalizacja {
  nazwa: string;
  lowisko_id: string;
  stanowisko_id: string;
  lat?: number;
  lng?: number;
  numer?: number;
}

interface Props {
  onClose: () => void;
  lokalizacja?: Lokalizacja;
}

function StepperInput({
  value, onChange, step, min, placeholder, unit,
}: {
  value: string;
  onChange: (v: string) => void;
  step: number;
  min: number;
  placeholder: string;
  unit: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  function change(delta: number) {
    const current = parseFloat(valueRef.current) || 0;
    const next = Math.max(min, parseFloat((current + delta).toFixed(10)));
    onChangeRef.current(String(next));
  }

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      change(e.deltaY < 0 ? step : -step);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [step, min]);

  return (
    <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 overflow-hidden focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
      <button
        type="button"
        onClick={() => change(-step)}
        className="px-4 py-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors select-none text-lg leading-none cursor-pointer"
      >−</button>
      <div className="flex-1 flex items-center justify-center gap-1">
        <input
          ref={inputRef}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          step={step}
          min={min}
          className="w-16 text-center text-sm text-gray-900 bg-transparent focus:outline-none py-3"
        />
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
      <button
        type="button"
        onClick={() => change(step)}
        className="px-4 py-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors select-none text-lg leading-none cursor-pointer"
      >+</button>
    </div>
  );
}

export default function DodajPostFeedModal({ onClose, lokalizacja }: Props) {
  const [typRyby, setTypRyby] = useState("");
  const [nazwaRyby, setNazwaRyby] = useState("");
  const [opis, setOpis] = useState("");
  const [wagaKg, setWagaKg] = useState("");
  const [dlugoscCm, setDlugoscCm] = useState("");
  const [zdjecia, setZdjecia] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.currentUser) {
      setBlad("Musisz być zalogowany, aby dodać post.");
      return;
    }
    setLoading(true);
    setBlad(null);

    try {
      const uid = auth.currentUser.uid;

      const zdjeciaUrls: string[] = [];
      for (const plik of zdjecia) {
        const url = await uploadToCloudinary(plik);
        zdjeciaUrls.push(url);
      }

      await addDoc(collection(db, "posty"), {
        user_id: uid,
        stanowisko_id: lokalizacja?.stanowisko_id ?? "",
        lowisko_id: lokalizacja?.lowisko_id ?? "",
        lokalizacja_nazwa: lokalizacja?.nazwa ?? "",
        ...(lokalizacja?.lat != null && { lat: lokalizacja.lat, lng: lokalizacja.lng }),
        typ_ryby: typRyby,
        nazwa_ryby: nazwaRyby,
        zdjecia: zdjeciaUrls,
        opis,
        waga_kg: wagaKg ? parseFloat(wagaKg) : null,
        dlugosc_cm: dlugoscCm ? parseFloat(dlugoscCm) : null,
        timestamp: serverTimestamp(),
        likes: 0,
      });

      onClose();
    } catch (err) {
      console.error("Błąd zapisu posta:", err);
      setBlad("Wystąpił błąd. Sprawdź konsolę lub spróbuj bez zdjęć.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Dodaj połów 🎣</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {lokalizacja
                ? lokalizacja.numer
                  ? `Stanowisko ${lokalizacja.numer} · ${lokalizacja.nazwa}`
                  : lokalizacja.nazwa
                : "Podziel się swoim połowem"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors text-lg font-medium cursor-pointer"
          >×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Gatunek */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Gatunek ryby <span className="text-blue-500">*</span></label>
            <select
              value={typRyby}
              onChange={(e) => setTypRyby(e.target.value)}
              required
              className={INPUT}
            >
              <option value="">Wybierz gatunek...</option>
              {TYPY_RYB.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Nazwa */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Nazwa ryby <span className="text-gray-400 font-normal">(opcjonalnie)</span></label>
            <input
              type="text"
              value={nazwaRyby}
              onChange={(e) => setNazwaRyby(e.target.value)}
              placeholder="np. Złoty Karp, Wielki Szczupak..."
              className={INPUT}
            />
          </div>

          {/* Waga + Długość */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Waga</label>
              <StepperInput value={wagaKg} onChange={setWagaKg} step={0.1} min={0} placeholder="0.0" unit="kg" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Długość</label>
              <StepperInput value={dlugoscCm} onChange={setDlugoscCm} step={1} min={0} placeholder="0" unit="cm" />
            </div>
          </div>

          {/* Opis */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Opis</label>
            <textarea
              value={opis}
              onChange={(e) => setOpis(e.target.value)}
              rows={3}
              placeholder="Opisz swój połów — miejsce, przynęta, warunki pogodowe..."
              className={INPUT + " resize-none"}
            />
          </div>

          {/* Zdjęcia */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">Zdjęcia</label>
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
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-5 flex flex-col items-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
            >
              <span className="text-2xl">{zdjecia.length > 0 ? "📷" : "📁"}</span>
              <span className="text-sm font-medium">
                {zdjecia.length > 0 ? `${zdjecia.length} zdjęcie(a) wybrane` : "Kliknij, aby dodać zdjęcia"}
              </span>
              {zdjecia.length === 0 && <span className="text-xs">JPG, PNG, HEIC</span>}
            </button>
          </div>

          {/* Błąd */}
          {blad && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {blad}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !typRyby}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shadow-sm hover:shadow-md"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Zapisywanie...
              </span>
            ) : "Opublikuj połów"}
          </button>

        </form>
      </div>
    </div>
  );
}
