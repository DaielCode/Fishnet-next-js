# Fishnet — Aplikacja Wędkarska

Mapa łowisk z GeoJSON, stanowiska, feed połowów, logowanie Google.

## Tech Stack

- **Next.js 15** (App Router, TypeScript)
- **TailwindCSS**
- **Firebase** — Auth (Google OAuth), Firestore, Storage
- **Leaflet + react-leaflet** — mapa z poligonami GeoJSON

## Pierwsze uruchomienie

1. Utwórz projekt w [Firebase Console](https://console.firebase.google.com)
2. Włącz: **Authentication** (dostawca Google), **Firestore**, **Storage**
3. Uzupełnij `.env.local` danymi z Firebase Console → Project Settings → Your apps
4. Wgraj plik GeoJSON do Firebase Storage pod ścieżką `geojson/ligota.geojson`
5. W Firestore dodaj dokument łowiska z polem `geojson_url` (publiczny URL ze Storage)

```bash
npm run dev
```

Aplikacja działa na http://localhost:3000

## Struktura Firestore

```
lowiska/{id}          — nazwa, lokalizacja (GeoPoint), opis, geojson_url
  stanowiska/{id}     — numer, wspolrzedne (GeoPoint), opis

posty/{id}            — user_id, stanowisko_id, typ_ryby, zdjecia[], waga_kg, dlugosc_cm, ...
users/{uid}           — nick, avatar (Storage URL), bio, followers_count, following_count
followers/{id}        — follower_id, following_id, timestamp
```

## GeoJSON Ligoty

Masz już plik `Ligota_43518.geojson` w C:/Users/Daniel/.
Wgraj go do Firebase Storage: `geojson/ligota.geojson`, skopiuj URL i dodaj do dokumentu łowiska w Firestore.

## Wdrożenie

Firebase Hosting (bezpłatnie do 10 GB/mies):
```bash
npm run build
npx firebase deploy
```
