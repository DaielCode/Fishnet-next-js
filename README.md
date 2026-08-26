# 🎣 Fishnet — Aplikacja Wędkarska

Społecznościowa aplikacja PWA dla wędkarzy. Mapa łowisk z poligonami GeoJSON, stanowiska połowów, feed zdjęć ryb, logowanie przez Google, panel admina.

## Spis treści

- [Tech Stack](#tech-stack)
- [Architektura](#architektura)
- [Struktura projektu](#struktura-projektu)
- [Jak uruchomić lokalnie](#jak-uruchomić-lokalnie)
- [Zmienne środowiskowe](#zmienne-środowiskowe)
- [Struktura Firestore](#struktura-firestore)
- [Przepływy danych (Flows)](#przepływy-danych)
- [GeoJSON łowisk](#geojson-łowisk)
- [i18n — wielojęzyczność](#i18n--wielojęzyczność)
- [PWA](#pwa)
- [Wdrożenie](#wdrożenie)

---

## Tech Stack

| Warstwa | Technologia |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Stylowanie | Tailwind CSS v4 |
| Mapa | Leaflet + react-leaflet + react-leaflet-cluster |
| Baza danych | Firebase Firestore |
| Auth | Firebase Auth (Google OAuth) |
| Pliki | Firebase Storage |
| Monitoring | Sentry |
| PWA | next-pwa (manifest.json, service worker) |

Nie ma własnego backendu — wszystko przez Firebase SDK po stronie klienta.

---

## Architektura

```
Przeglądarka (React / Next.js)
        │
        ├── Firebase Auth      ← logowanie Google
        ├── Firebase Firestore ← dane (łowiska, posty, użytkownicy)
        └── Firebase Storage   ← zdjęcia ryb, avatary użytkowników
```

Dane GeoJSON łowisk są przechowywane jako pliki statyczne w `/public/geojson/` i ładowane przez Leaflet po stronie klienta.

---

## Struktura projektu

```
fishnet-app/
├── app/                        # Next.js App Router — strony
│   ├── (auth)/page.tsx         # Strona logowania
│   ├── mapa/page.tsx           # Strona z mapą łowisk
│   ├── feed/page.tsx           # Feed połowów (infinite scroll)
│   ├── profil/page.tsx         # Profil użytkownika
│   ├── admin/page.tsx          # Panel administracyjny
│   ├── layout.tsx              # Root layout (Navbar, LanguageProvider, PWA)
│   └── page.tsx                # Strona główna (landing)
│
├── components/
│   ├── ui/
│   │   ├── Navbar.tsx          # Nawigacja top + bottom (mobile)
│   │   └── PWARegister.tsx     # Rejestracja service workera
│   ├── map/
│   │   ├── MapView.tsx         # Mapa Leaflet z łowiskami i stanowiskami
│   │   └── ZaproponujLowiskoModal.tsx  # Modal propozycji nowego łowiska
│   ├── feed/
│   │   ├── PostCard.tsx        # Karta pojedynczego połowu
│   │   ├── DodajPostFeedModal.tsx      # Modal dodawania posta (z mapy lub feedu)
│   │   └── LocationPreview.tsx # Miniaturka mapy w modalu posta
│   └── admin/
│       ├── AdminPanel.tsx      # Panel: użytkownicy, łowiska, posty, propozycje
│       └── OsmLowiskoPicker.tsx # Picker zbiornika z OSM do panelu admina
│
├── hooks/
│   └── useAuth.ts              # Firebase Auth hook (login, logout, isAdmin)
│
├── context/
│   └── LanguageContext.tsx     # i18n — zmiana języka (PL/EN/UA)
│
├── lib/
│   ├── firebase.ts             # Inicjalizacja Firebase (auth, db, storage)
│   ├── miejscowosci.ts         # Lista polskich miast (autocomplete na mapie)
│   └── i18n/
│       └── translations.ts     # Słowniki tłumaczeń (PL, EN, UA)
│
├── types/
│   └── index.ts                # Typy TypeScript (User, Lowisko, Post, ...)
│
├── public/
│   ├── geojson/                # Pliki GeoJSON łowisk (uroczysko, ligota, ...)
│   └── manifest.json           # PWA manifest
│
├── firestore.rules             # Reguły bezpieczeństwa Firestore
├── storage.rules               # Reguły bezpieczeństwa Storage
└── firebase.json               # Konfiguracja Firebase Hosting
```

---

## Jak uruchomić lokalnie

### Wymagania
- Node.js 18+
- Projekt w Firebase Console z włączonymi: Auth (Google), Firestore, Storage

### Kroki

```bash
# 1. Sklonuj i zainstaluj
cd fishnet-app
npm install

# 2. Utwórz plik ze zmiennymi środowiskowymi
cp .env.local.example .env.local
# Uzupełnij wartości z Firebase Console → Project Settings → Your apps

# 3. Uruchom serwer deweloperski (port 4001)
npm run dev
```

Aplikacja działa na **http://localhost:4001**

---

## Zmienne środowiskowe

Utwórz plik `.env.local` w katalogu głównym:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Wszystkie wartości znajdziesz w Firebase Console → ⚙️ Project Settings → Your apps → SDK snippet (Config).

---

## Struktura Firestore

Szczegółowa dokumentacja: [`docs/firestore-schema.md`](./docs/firestore-schema.md)

### Skrócony przegląd

```
users/{uid}
  nick, avatar, bio, followers_count, following_count, isAdmin?

lowiska/{id}
  nazwa, lokalizacja (GeoPoint), opis, kolor, geojson_url?, geojson_data?
  └── stanowiska/{id}              ← subkolekcja
        numer, wspolrzedne (GeoPoint), opis

posty/{id}
  user_id, lowisko_id, stanowisko_id, typ_ryby, nazwa_ryby
  zdjecia[], opis, waga_kg?, dlugosc_cm?, lat?, lng?
  timestamp, likes, likedBy[]

lowiska_propozycje/{id}
  user_id, nazwa, opis, lokalizacja (GeoPoint), kolor
  status: "oczekuje" | "zaakceptowane" | "odrzucone"
  geojson_data?, timestamp

followers/{followerId}_{followingId}
  follower_id, following_id, timestamp
```

---

## Przepływy danych

### Logowanie
```
Klik "Zaloguj przez Google"
  → Firebase Auth (signInWithPopup)
    → jeśli nowy użytkownik → setDoc w users/{uid}
      → useAuth zwraca { user, isAdmin, loading }
```

### Dodawanie posta
```
Wypełnienie formularza w DodajPostFeedModal
  → upload zdjęć do Firebase Storage (posty/{uid}/{timestamp}_{filename})
    → getDownloadURL → URLs zdjęć
      → addDoc do kolekcji "posty" z timestamp, lokalizacją, danymi ryby
```

### Mapa łowisk
```
MapView mount
  → getDocs("lowiska") — pobiera wszystkie łowiska
    → onSnapshot("stanowiska") — realtime subkolekcja stanowisk
      → GeoJSON z /public/geojson/*.geojson — kontury łowisk
        → Leaflet renderuje warstwy + markery stanowisk
```

### Feed (infinite scroll)
```
FeedPage mount
  → query("posty", orderBy timestamp, limit 12)
    → IntersectionObserver na sentinel element
      → przy scroll: kolejny query z startAfter(lastDoc)
        → fetchAuthors — getDoc("users/{uid}") dla nowych autorów
```

### Propozycja łowiska
```
Użytkownik klika "Zaproponuj łowisko"
  → ZaproponujLowiskoModal — wybiera punkt na mapie
    → addDoc do "lowiska_propozycje" ze status "oczekuje"
      → Admin widzi oczekujące propozycje w panelu
        → akceptacja → addDoc do "lowiska"
```

---

## GeoJSON łowisk

Pliki GeoJSON znajdują się w `/public/geojson/` i są ładowane statycznie:

| Plik | Opis |
|---|---|
| `uroczysko_karpiowe.geojson` | Główne łowisko karpiowe |
| `karpiowe_rezerwacje.geojson` | Łowisko z systemem rezerwacji |
| `obok_uroczyska.geojson` | 50 zbiorników wokół Uroczyska |
| `zbiorniki_ligota.geojson` | Zbiorniki regionu Ligoty (w tym Goczałkowice) |

Aby dodać nowe łowisko GeoJSON:
1. Wgraj plik `.geojson` do `/public/geojson/`
2. Dodaj wpis do tablicy `WARSTWY` w `components/map/MapView.tsx`
3. Opcjonalnie: dodaj dokument do kolekcji `lowiska` w Firestore z polem `geojson_url`

Instrukcja wydobywania zbiorników z OSM przez QGIS: `docs/qgis-geojson.md`

---

## i18n — wielojęzyczność

Aplikacja obsługuje 3 języki: **Polski (pl)**, **English (en)**, **Українська (uk)**.

Tłumaczenia są w `lib/i18n/translations.ts`. Aktywny język jest zapisywany w `localStorage` pod kluczem `fishnet_lang`.

Użycie w komponencie:
```tsx
import { useLanguage } from "@/context/LanguageContext";

function MyComponent() {
  const { t } = useLanguage();
  return <p>{t.feed.title}</p>;
}
```

---

## PWA

Fishnet jest Progressive Web App — można zainstalować na telefonie jak natywną aplikację.

- Manifest: `/public/manifest.json`
- Service Worker: rejestrowany przez `components/ui/PWARegister.tsx`
- Ikony: `/public/icons/`
- Theme color: `#2563eb` (niebieski)

---

## Wdrożenie

### Firebase Hosting (zalecane, bezpłatnie do 10 GB/mies)

```bash
npm run build
npx firebase deploy
```

### Tylko hosting (bez Firestore/Storage)

```bash
npx firebase deploy --only hosting
```

### Sentry (monitoring błędów)

Konfiguracja w `sentry.client.config.ts`. Wymaga zmiennej `SENTRY_DSN` w `.env.local`.
