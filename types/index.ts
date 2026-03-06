import { GeoPoint, Timestamp } from "firebase/firestore";

export interface User {
  uid: string;
  nick: string;
  avatar: string;
  bio: string;
  followers_count: number;
  following_count: number;
}

export interface Lowisko {
  id: string;
  nazwa: string;
  lokalizacja: GeoPoint;
  opis: string;
  geojson_url?: string; // URL do GeoJSON w Firebase Storage
}

export interface Stanowisko {
  id: string;
  lowisko_id: string;
  numer: number;
  wspolrzedne: GeoPoint;
  opis: string;
}

export interface Post {
  id: string;
  user_id: string;
  stanowisko_id: string;
  lowisko_id: string;
  typ_ryby: string;
  nazwa_ryby: string;
  zdjecia: string[];
  opis: string;
  waga_kg?: number;
  dlugosc_cm?: number;
  timestamp: Timestamp;
  likes: number;
}
