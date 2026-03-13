"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { db } from "@/lib/firebase";
import { collection, addDoc, GeoPoint, Timestamp } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import type { OsmZbiornik } from "@/components/admin/OsmLowiskoPicker";

const LoginPrompt = ({ onLogin }: { onLogin: () => void }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
    <div className="text-5xl">🔒</div>
    <p className="font-semibold text-gray-900">Musisz być zalogowany</p>
    <p className="text-sm text-gray-400">Zaloguj się, aby zaproponować łowisko.</p>
    <button
      onClick={onLogin}
      className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer"
    >
      Zaloguj się przez Google
    </button>
  </div>
);

const OsmLowiskoPickerDynamic = dynamic(() => import("@/components/admin/OsmLowiskoPicker"), {
  ssr: false,
  loading: () => <div className="text-center py-10 text-sm text-gray-400">Ładowanie mapy...</div>,
});

type Step = "idle" | "picking" | "form";

interface Props {
  onClose: () => void;
}

export default function ZaproponujLowiskoModal({ onClose }: Props) {
  const { user, loginWithGoogle } = useAuth();
  const [step, setStep] = useState<Step>("idle");
  const [nazwa, setNazwa] = useState("");
  const [opis, setOpis] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [kolor, setKolor] = useState("#1d4ed8");
  const [geojsonFile, setGeojsonFile] = useState<File | null>(null);
  const [osmGeojson, setOsmGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function handleOsmConfirm(zbiornik: OsmZbiornik, autoName: string) {
    setNazwa(autoName);
    setLat(String(zbiornik.centroid[0]));
    setLng(String(zbiornik.centroid[1]));
    setOsmGeojson({ type: "FeatureCollection", features: [zbiornik.geojson] });
    setStep("form");
  }

  function resetForm() {
    setNazwa("");
    setOpis("");
    setLat("");
    setLng("");
    setKolor("#1d4ed8");
    setGeojsonFile(null);
    setOsmGeojson(null);
    setStep("idle");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nazwa.trim()) return setError("Podaj nazwę łowiska.");
    if (!user) return setError("Musisz być zalogowany.");

    let geojson_data: GeoJSON.FeatureCollection | undefined;
    if (osmGeojson) {
      geojson_data = osmGeojson;
    } else if (geojsonFile) {
      try {
        const text = await geojsonFile.text();
        geojson_data = JSON.parse(text);
      } catch {
        return setError("Niepoprawny plik GeoJSON.");
      }
    }

    const latNum = parseFloat(lat.replace(",", "."));
    const lngNum = parseFloat(lng.replace(",", "."));
    if (isNaN(latNum) || isNaN(lngNum)) return setError("Podaj poprawne współrzędne.");

    setSaving(true);
    try {
      const docData: Record<string, unknown> = {
        user_id: user.uid,
        nazwa: nazwa.trim(),
        opis: opis.trim(),
        lokalizacja: new GeoPoint(latNum, lngNum),
        kolor,
        status: "oczekuje",
        timestamp: Timestamp.now(),
      };
      if (geojson_data) docData.geojson_data = JSON.stringify(geojson_data);
      await addDoc(collection(db, "lowiska_propozycje"), docData);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Błąd zapisu.");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-bold text-base text-gray-900">Zaproponuj łowisko</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg">✕</button>
        </div>

        <div className="p-5">
          {!user ? (
            <LoginPrompt onLogin={loginWithGoogle} />
          ) : done ? (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">✅</div>
              <p className="font-semibold text-gray-900">Propozycja wysłana!</p>
              <p className="text-sm text-gray-500">Administrator sprawdzi Twoje łowisko i zatwierdzi je wkrótce.</p>
              <button
                onClick={onClose}
                className="mt-2 bg-blue-600 text-white text-sm px-6 py-2.5 rounded-xl hover:bg-blue-700 cursor-pointer font-medium transition-colors"
              >
                Zamknij
              </button>
            </div>
          ) : (
            <>
              {/* Krok 1: wybór metody */}
              {step === "idle" && (
                <div className="space-y-3">
                  <button
                    onClick={() => setStep("picking")}
                    className="w-full bg-blue-600 text-white text-sm px-5 py-3 rounded-xl hover:bg-blue-700 cursor-pointer font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <span>🗺️</span>
                    <span>Wyszukaj zbiornik w OpenStreetMap</span>
                  </button>
                  <div className="relative flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400">lub</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <button
                    onClick={() => setStep("form")}
                    className="w-full border border-gray-200 text-gray-600 text-sm px-5 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer font-medium transition-colors"
                  >
                    Dodaj ręcznie (własne współrzędne / plik GeoJSON)
                  </button>
                </div>
              )}

              {/* Krok 2: picker OSM */}
              {step === "picking" && (
                <>
                  <p className="text-sm text-gray-500 mb-3">Wybierz zbiornik z OSM</p>
                  <OsmLowiskoPickerDynamic
                    onConfirm={handleOsmConfirm}
                    onCancel={() => setStep("idle")}
                  />
                </>
              )}

              {/* Krok 3: formularz */}
              {step === "form" && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-gray-700">
                      {osmGeojson ? "Zatwierdź łowisko" : "Dane łowiska"}
                    </p>
                    <button onClick={resetForm} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">
                      ← Wróć
                    </button>
                  </div>

                  {osmGeojson && (
                    <div className="flex items-center gap-2 mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>✓</span>
                      <span>Geometria pobrana z OpenStreetMap</span>
                      <button onClick={() => setStep("picking")} className="ml-auto text-blue-600 hover:underline cursor-pointer">
                        Zmień
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-3">
                    <input
                      type="text"
                      placeholder="Nazwa łowiska *"
                      value={nazwa}
                      onChange={(e) => setNazwa(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                    <textarea
                      placeholder="Opis (opcjonalnie)"
                      value={opis}
                      onChange={(e) => setOpis(e.target.value)}
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
                    />

                    {!osmGeojson && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Szerokość (lat) *"
                          value={lat}
                          onChange={(e) => setLat(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                        />
                        <input
                          type="text"
                          placeholder="Długość (lng) *"
                          value={lng}
                          onChange={(e) => setLng(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-500">Kolor na mapie:</label>
                      <input
                        type="color"
                        value={kolor}
                        onChange={(e) => setKolor(e.target.value)}
                        className="w-10 h-8 rounded-lg cursor-pointer border border-gray-200"
                      />
                      <span className="text-xs text-gray-400 font-mono">{kolor}</span>
                    </div>

                    {!osmGeojson && (
                      <div>
                        <label className="block text-sm text-gray-500 mb-1">
                          Plik GeoJSON <span className="text-gray-400">(opcjonalnie)</span>
                        </label>
                        <input
                          type="file"
                          accept=".geojson,.json"
                          onChange={(e) => setGeojsonFile(e.target.files?.[0] ?? null)}
                          className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer"
                        />
                        {geojsonFile && <p className="text-xs text-green-600 mt-1">Wybrano: {geojsonFile.name}</p>}
                      </div>
                    )}

                    {error && <p className="text-red-500 text-sm">{error}</p>}

                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full bg-blue-600 text-white text-sm px-5 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 cursor-pointer font-medium transition-colors"
                    >
                      {saving ? "Wysyłanie..." : "Wyślij propozycję"}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
