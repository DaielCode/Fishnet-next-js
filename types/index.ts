import { GeoPoint, Timestamp } from "firebase/firestore";

/**
 * Profil użytkownika — kolekcja Firestore: `users/{uid}`
 *
 * Dokument jest tworzony automatycznie przy pierwszym logowaniu przez Google.
 * `uid` odpowiada `User.uid` z Firebase Auth.
 */
export interface User {
  uid: string;
  nick: string;
  /** URL avatara — zdjęcie profilowe z Google lub Storage */
  avatar: string;
  bio: string;
  followers_count: number;
  following_count: number;
  /** Tylko admin może to pole ustawić — ręcznie przez Firebase Console */
  isAdmin?: boolean;
}

/**
 * Łowisko wędkarskie — kolekcja Firestore: `lowiska/{id}`
 *
 * Zawiera subkolekcję `stanowiska`. Granica łowiska pochodzi z GeoJSON —
 * albo z pliku statycznego (`/public/geojson/`), albo zapisanego w Firestore.
 */
export interface Lowisko {
  id: string;
  nazwa: string;
  /** Centrum łowiska jako współrzędne GPS */
  lokalizacja: GeoPoint;
  opis: string;
  /** URL do pliku GeoJSON na Firebase Storage (publiczny) */
  geojson_url?: string;
  /**
   * GeoJSON zapisany jako string — `JSON.stringify(FeatureCollection)`.
   * Używane zamiast geojson_url gdy dane są małe.
   * Powód: Firestore nie obsługuje zagnieżdżonych tablic (GeoJSON coordinates).
   */
  geojson_data?: string;
  /** Kolor obrysu łowiska na mapie (np. `"#1d4ed8"`) */
  kolor?: string;
}

/**
 * Stanowisko na łowisku — subkolekcja Firestore: `lowiska/{id}/stanowiska/{id}`
 *
 * Każde łowisko może mieć wiele stanowisk. Stanowisko to konkretny punkt
 * na brzegu (np. „stanowisko nr 3"), z którego wędkuje jeden wędkarz.
 */
export interface Stanowisko {
  id: string;
  lowisko_id: string;
  /** Numer stanowiska (kolejność na mapie) */
  numer: number;
  wspolrzedne: GeoPoint;
  opis: string;
}

/**
 * Propozycja nowego łowiska zgłoszona przez użytkownika.
 * Kolekcja Firestore: `lowiska_propozycje/{id}`
 *
 * Po zaakceptowaniu przez admina propozycja jest przenoszona do kolekcji `lowiska`.
 */
export interface LowiskoPropozycja {
  id: string;
  user_id: string;
  nazwa: string;
  opis: string;
  lokalizacja: GeoPoint;
  kolor: string;
  geojson_data?: string;
  /** Workflow: oczekuje → zaakceptowane lub odrzucone */
  status: "oczekuje" | "zaakceptowane" | "odrzucone";
  timestamp: Timestamp;
}

/**
 * Post z połowem — kolekcja Firestore: `posty/{id}`
 *
 * Tworzony przez zalogowanego użytkownika z mapy lub z feedu.
 * Zdjęcia są przechowywane w Firebase Storage, `zdjecia[]` zawiera ich URL-e.
 */
export interface Post {
  id: string;
  user_id: string;
  /** ID stanowiska (może być puste jeśli post z ogólnej lokalizacji mapy) */
  stanowisko_id: string;
  /** ID łowiska (może być puste jeśli post z dowolnego punktu mapy) */
  lowisko_id: string;
  /** Wyświetlana nazwa lokalizacji */
  lokalizacja_nazwa?: string;
  lat?: number;
  lng?: number;
  /** Klucz słownika ryb z `translations.ts` (np. `"Karp"`, `"Szczupak"`) */
  typ_ryby: string;
  /** Wyświetlana nazwa ryby */
  nazwa_ryby: string;
  /** Tablica URL-i zdjęć z Firebase Storage (`posty/{uid}/{timestamp}_{filename}`) */
  zdjecia: string[];
  opis: string;
  waga_kg?: number;
  dlugosc_cm?: number;
  timestamp: Timestamp;
  likes: number;
  /** UID-y użytkowników którzy polubili post — używane do optymistic update */
  likedBy?: string[];
}
