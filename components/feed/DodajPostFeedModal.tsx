"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "@/lib/firebase";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/hooks/useAuth";

const LocationPreview = dynamic(() => import("./LocationPreview"), { ssr: false, loading: () => (
  <div className="w-full rounded-xl bg-gray-100 animate-pulse" style={{ height: 140 }} />
) });

async function uploadToStorage(plik: File, uid: string): Promise<string> {
  const sciezka = `posty/${uid}/${Date.now()}_${plik.name}`;
  const storageRef = ref(storage, sciezka);
  await uploadBytes(storageRef, plik);
  return getDownloadURL(storageRef);
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
        className="w-11 py-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors select-none text-xl leading-none cursor-pointer flex-shrink-0 flex items-center justify-center"
      >−</button>
      <div className="flex-1 flex items-center justify-center gap-1 min-w-0">
        <input
          ref={inputRef}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          step={step}
          min={min}
          className="w-12 text-center text-sm text-gray-900 bg-transparent focus:outline-none py-3 min-w-0"
        />
        <span className="text-xs text-gray-400 flex-shrink-0">{unit}</span>
      </div>
      <button
        type="button"
        onClick={() => change(step)}
        className="w-11 py-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors select-none text-xl leading-none cursor-pointer flex-shrink-0 flex items-center justify-center"
      >+</button>
    </div>
  );
}

export default function DodajPostFeedModal({ onClose, lokalizacja }: Props) {
  const { user, loginWithGoogle } = useAuth();
  const [typRyby, setTypRyby] = useState("");
  const [nazwaRyby, setNazwaRyby] = useState("");
  const [opis, setOpis] = useState("");
  const [wagaKg, setWagaKg] = useState("");
  const [dlugoscCm, setDlugoscCm] = useState("");
  const [zdjecia, setZdjecia] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const swipeHandleRef = useRef<HTMLDivElement>(null);
  const swipeStartY = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const { t } = useLanguage();

  useEffect(() => {
    const el = swipeHandleRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      swipeStartY.current = e.touches[0].clientY;
    }
    function onTouchMove(e: TouchEvent) {
      if (swipeStartY.current === null) return;
      const delta = e.touches[0].clientY - swipeStartY.current;
      if (delta > 0) {
        e.preventDefault();
        dragYRef.current = delta;
        setDragY(delta);
      }
    }
    function onTouchEnd() {
      if (dragYRef.current > 80) { onClose(); }
      dragYRef.current = 0;
      setDragY(0);
      swipeStartY.current = null;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onClose]);
  const fishDict = t.fish as Record<string, string>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.currentUser) { setBlad(t.post.errorNotLoggedIn); return; }
    setLoading(true);
    setBlad(null);
    try {
      const uid = auth.currentUser.uid;
      const zdjeciaUrls: string[] = [];
      for (const plik of zdjecia) {
        zdjeciaUrls.push(await uploadToStorage(plik, uid));
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
      setBlad(t.post.errorGeneral);
    } finally {
      setLoading(false);
    }
  }

  function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length > 0) setZdjecia((prev) => [...prev, ...images]);
  }

  return (
    /* Mobile: bottom sheet od dołu. Desktop: wyśrodkowany modal */
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[1002] sm:p-4"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[93dvh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `translateY(${dragY}px)`, transition: dragY === 0 ? "transform 0.3s ease" : "none" }}
      >
        {/* Uchwyt + Header — obszar przeciągania (tylko mobile) */}
        <div ref={swipeHandleRef} className="sm:cursor-default cursor-grab active:cursor-grabbing flex-shrink-0">
          <div className="sm:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

        {/* Header — sticky, zawsze widoczny */}
        <div className="flex items-center justify-between px-5 pt-3 sm:pt-5 pb-4 border-b border-gray-100">
          <div className="min-w-0 pr-3">
            <h2 className="text-xl font-bold text-gray-900">{t.post.addTitle}</h2>
            <p className="text-sm text-gray-400 mt-0.5 truncate">
              {lokalizacja
                ? lokalizacja.numer
                  ? `${t.post.station} ${lokalizacja.numer} · ${lokalizacja.nazwa}`
                  : lokalizacja.nazwa
                : t.post.shareDefault}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors text-xl cursor-pointer"
          >×</button>
        </div>
        </div>{/* koniec swipeHandleRef */}

        {/* Scrollowalna zawartość */}
        <div className="overflow-y-auto flex-1">

        {/* Niezalogowany */}
        {!user && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
            <div className="text-5xl">🔒</div>
            <p className="font-semibold text-gray-900">Musisz być zalogowany</p>
            <p className="text-sm text-gray-400">Zaloguj się, aby dodać swój połów.</p>
            <button
              onClick={loginWithGoogle}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Zaloguj się przez Google
            </button>
          </div>
        )}

        {/* Podgląd pinu na mapie */}
        {user && lokalizacja?.lat != null && lokalizacja?.lng != null && (
          <LocationPreview lat={lokalizacja.lat} lng={lokalizacja.lng} nazwa={lokalizacja.nazwa} />
        )}

        {user && <form id="dodaj-post-form" onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

          {/* Gatunek */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">{t.post.species} <span className="text-blue-500">*</span></label>
            <select value={typRyby} onChange={(e) => setTypRyby(e.target.value)} required className={INPUT}>
              <option value="">{t.post.speciesPlaceholder}</option>
              {TYPY_RYB.map((plKey) => (
                <option key={plKey} value={plKey}>{fishDict[plKey] ?? plKey}</option>
              ))}
            </select>
          </div>

          {/* Nazwa */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">
              {t.post.fishName} <span className="text-gray-400 font-normal">{t.post.optional}</span>
            </label>
            <input type="text" value={nazwaRyby} onChange={(e) => setNazwaRyby(e.target.value)}
              placeholder={t.post.fishNamePlaceholder} className={INPUT} />
          </div>

          {/* Waga + Długość */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">{t.post.weight}</label>
              <StepperInput value={wagaKg} onChange={setWagaKg} step={0.1} min={0} placeholder="0.0" unit="kg" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">{t.post.length}</label>
              <StepperInput value={dlugoscCm} onChange={setDlugoscCm} step={1} min={0} placeholder="0" unit="cm" />
            </div>
          </div>

          {/* Opis */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">{t.post.description}</label>
            <textarea value={opis} onChange={(e) => setOpis(e.target.value)} rows={3}
              placeholder={t.post.descriptionPlaceholder} className={INPUT + " resize-none"} />
          </div>

          {/* Zdjęcia */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-gray-700">{t.post.photos}</label>
            <input ref={fileRef} type="file" accept="image/*" multiple
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))} className="hidden" />
            <div
              onClick={() => fileRef.current?.click()}
              onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setDragActive(false); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); dragCounter.current = 0; setDragActive(false); addFiles(Array.from(e.dataTransfer.files)); }}
              className={`w-full border-2 border-dashed rounded-xl py-5 flex flex-col items-center gap-1.5 cursor-pointer transition-all select-none ${
                dragActive ? "border-blue-500 bg-blue-50 text-blue-600"
                : zdjecia.length > 0 ? "border-green-400 bg-green-50 text-green-600"
                : "border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50"
              }`}
            >
              <span className="text-2xl">{dragActive ? "📂" : zdjecia.length > 0 ? "📷" : "📁"}</span>
              <span className="text-sm font-medium text-center px-2">
                {zdjecia.length > 0 ? t.post.photosSelected(zdjecia.length) : t.post.photosClick}
              </span>
              {zdjecia.length === 0 && !dragActive && (
                <span className="text-xs text-center px-4">{t.post.photosHint}</span>
              )}
            </div>
            {zdjecia.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-1">
                {zdjecia.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} alt={f.name}
                      className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    <button type="button"
                      onClick={() => setZdjecia((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center cursor-pointer"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {blad && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{blad}</div>
          )}

        </form>}
        </div>

        {/* Przycisk submit — sticky na dole, tylko dla zalogowanych */}
        {user && (
          <div
            className="px-5 pt-4 pb-6 sm:pb-4 border-t border-gray-100 bg-white flex-shrink-0"
          >
            <button
              type="submit"
              form="dodaj-post-form"
              disabled={loading || !typRyby}
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all shadow-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  {t.post.saving}
                </span>
              ) : t.post.publish}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
