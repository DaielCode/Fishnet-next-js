"use client";

/**
 * Kontekst i18n — zarządza aktywnym językiem aplikacji.
 *
 * Obsługiwane języki: `"pl"` (Polski), `"en"` (English), `"uk"` (Українська).
 * Wybrany język jest zapisywany w localStorage pod kluczem `fishnet_lang`.
 *
 * Użycie:
 * ```tsx
 * // Dostęp do tłumaczeń w dowolnym komponencie:
 * const { t, lang, setLang } = useLanguage();
 * return <h1>{t.feed.title}</h1>;
 * ```
 */
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { translations, type Lang, type Translations } from "@/lib/i18n/translations";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
}

const LanguageContext = createContext<LangCtx>({
  lang: "pl",
  setLang: () => {},
  t: translations.pl,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pl");

  useEffect(() => {
    const saved = localStorage.getItem("fishnet_lang") as Lang | null;
    if (saved && saved in translations) setLangState(saved);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("fishnet_lang", l);
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
