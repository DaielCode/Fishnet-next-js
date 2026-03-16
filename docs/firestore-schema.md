# Firestore Schema — Fishnet

Aplikacja nie ma własnego REST API — całą komunikację z danymi realizuje
Firebase SDK po stronie klienta. Ten dokument pełni rolę **Swaggera dla Firestore**.

---

## Kolekcje (przegląd)

| Kolekcja | Opis | Odczyt | Zapis |
|---|---|---|---|
| `users` | Profile użytkowników | wszyscy | właściciel / admin |
| `lowiska` | Łowiska wędkarskie | wszyscy | admin |
| `lowiska/{id}/stanowiska` | Stanowiska na łowisku | wszyscy | admin |
| `posty` | Posty z połowami | wszyscy | zalogowany (create) |
| `lowiska_propozycje` | Propozycje nowych łowisk | admin | zalogowany (create) |
| `followers` | Relacje obserwowania | wszyscy | zalogowany |

---

## `users/{uid}`

Tworzony automatycznie przy pierwszym logowaniu Google przez `useAuth.ts → saveUserIfNew()`.

```typescript
{
  nick: string,             // Wyświetlana nazwa (z Google displayName lub "Wędkarz")
  avatar: string,           // URL zdjęcia profilowego (z Google lub Storage)
  bio: string,              // Krótki opis profilu (domyślnie "")
  followers_count: number,  // Liczba obserwujących (inkrementowana ręcznie)
  following_count: number,  // Liczba obserwowanych (inkrementowana ręcznie)
  isAdmin?: boolean         // TYLKO admin może ustawić — ręcznie przez Firebase Console
}
```

**Uprawnienia (Firestore Rules):**
- Odczyt: wszyscy
- Zapis: zalogowany właściciel (`request.auth.uid === userId`) lub admin

**Operacje w kodzie:**
| Operacja | Plik | Kod |
|---|---|---|
| Tworzenie (nowy user) | `hooks/useAuth.ts` | `setDoc(doc(db, "users", uid), {...})` |
| Odczyt profilu | `app/profil/page.tsx` | `getDoc(doc(db, "users", uid))` |
| Aktualizacja bio/nick | `app/profil/page.tsx` | `updateDoc(doc(db, "users", uid), {...})` |
| Sprawdzanie isAdmin | `hooks/useAuth.ts` | `getDoc(...).data()?.isAdmin === true` |

---

## `lowiska/{id}`

Łowisko wędkarskie. Dane GeoJSON granicy łowiska są w plikach statycznych
`/public/geojson/*.geojson` lub opcjonalnie w polu `geojson_data`.

```typescript
{
  nazwa: string,           // Wyświetlana nazwa łowiska
  lokalizacja: GeoPoint,   // Centrum łowiska (GPS)
  opis: string,            // Opis łowiska
  kolor?: string,          // Kolor obrysu na mapie (hex, np. "#1d4ed8")
  geojson_url?: string,    // URL pliku GeoJSON na Storage (publiczny)
  geojson_data?: string    // GeoJSON jako JSON.stringify(FeatureCollection)
                           // UWAGA: Firestore nie obsługuje zagnieżdżonych tablic,
                           // dlatego GeoJSON jest serializowany do stringa
}
```

**Uprawnienia:**
- Odczyt: wszyscy
- Zapis: tylko admin

**Operacje w kodzie:**
| Operacja | Plik | Kod |
|---|---|---|
| Pobieranie wszystkich łowisk | `components/map/MapView.tsx` | `getDocs(collection(db, "lowiska"))` |
| Dodawanie łowiska | `components/admin/AdminPanel.tsx` | `addDoc(collection(db, "lowiska"), {...})` |
| Aktualizacja | `components/admin/AdminPanel.tsx` | `updateDoc(doc(db, "lowiska", id), {...})` |
| Usuwanie | `components/admin/AdminPanel.tsx` | `deleteDoc(doc(db, "lowiska", id))` |

---

## `lowiska/{id}/stanowiska/{stanowiskoId}`

Subkolekcja stanowisk dla danego łowiska.

```typescript
{
  numer: number,           // Numer stanowiska (wyświetlany na markerze)
  wspolrzedne: GeoPoint,   // Dokładna lokalizacja GPS stanowiska
  opis: string             // Opis stanowiska (opcjonalny)
}
```

**Uprawnienia:**
- Odczyt: wszyscy
- Zapis: tylko admin

**Operacje w kodzie:**
| Operacja | Plik | Kod |
|---|---|---|
| Pobieranie stanowisk (realtime) | `components/map/MapView.tsx` | `onSnapshot(collection(db, "lowiska", id, "stanowiska"))` |
| Dodawanie stanowiska | `components/admin/AdminPanel.tsx` | `addDoc(collection(db, "lowiska", id, "stanowiska"), {...})` |

---

## `posty/{postId}`

Post z połowem — główna kolekcja treści użytkowników.

```typescript
{
  user_id: string,            // UID autora (z Firebase Auth)
  lowisko_id: string,         // ID łowiska (może być "" dla postów z mapy)
  stanowisko_id: string,      // ID stanowiska (może być "" dla postów bez stanowiska)
  lokalizacja_nazwa?: string, // Wyświetlana nazwa miejsca
  lat?: number,               // Szerokość geograficzna
  lng?: number,               // Długość geograficzna
  typ_ryby: string,           // Klucz słownika ryb z translations.ts
  nazwa_ryby: string,         // Niestandardowa nazwa ryby
  zdjecia: string[],          // Tablica URL-i z Firebase Storage
                              // Ścieżka: posty/{uid}/{timestamp}_{filename}
  opis: string,               // Treść posta
  waga_kg?: number,           // Waga ryby w kg
  dlugosc_cm?: number,        // Długość ryby w cm
  timestamp: Timestamp,       // Data i czas połowu (serverTimestamp())
  likes: number,              // Liczba polubień
  likedBy?: string[]          // UID-y użytkowników którzy polubili
}
```

**Uprawnienia:**
- Odczyt: wszyscy
- Create: zalogowany użytkownik
- Update: autor (własny post) lub dowolny użytkownik (tylko pola `likes` i `likedBy`)
- Delete: autor lub admin

**Operacje w kodzie:**
| Operacja | Plik | Kod |
|---|---|---|
| Dodawanie posta | `components/feed/DodajPostFeedModal.tsx` | `addDoc(collection(db, "posty"), {..., timestamp: serverTimestamp()})` |
| Pobieranie feedu (paginacja) | `app/feed/page.tsx` | `query(..., orderBy("timestamp","desc"), limit(12), startAfter(lastDoc))` |
| Like (optimistic update) | `components/feed/PostCard.tsx` | `updateDoc(doc(db,"posty",id), {likes: increment(1), likedBy: arrayUnion(uid)})` |
| Unlike | `components/feed/PostCard.tsx` | `updateDoc(..., {likes: increment(-1), likedBy: arrayRemove(uid)})` |
| Usuwanie posta | `components/feed/PostCard.tsx` | `deleteDoc(doc(db, "posty", id))` |
| Posty na mapie (realtime) | `components/map/MapView.tsx` | `onSnapshot(query(collection(db,"posty"), orderBy("timestamp","desc")))` |

**Upload zdjęć do Storage:**
```
Ścieżka: posty/{uid}/{Date.now()}_{filename}
Uprawnienia Storage: zalogowany użytkownik może pisać pod ścieżką posty/{uid}/
Limit: do 5 zdjęć na post
```

---

## `lowiska_propozycje/{id}`

Propozycje nowych łowisk od użytkowników czekające na akceptację admina.

```typescript
{
  user_id: string,           // UID użytkownika który zgłosił propozycję
  nazwa: string,
  opis: string,
  lokalizacja: GeoPoint,     // Wskazany przez użytkownika punkt na mapie
  kolor: string,             // Wybrany kolor łowiska
  geojson_data?: string,     // Opcjonalny GeoJSON granicy (jeśli podano)
  status: "oczekuje"         // Stan po utworzeniu
         | "zaakceptowane"   // Admin zaakceptował → przeniesiono do `lowiska`
         | "odrzucone",      // Admin odrzucił
  timestamp: Timestamp
}
```

**Uprawnienia:**
- Create: zalogowany użytkownik
- Read/Update/Delete: tylko admin

**Workflow:**
```
Użytkownik → ZaproponujLowiskoModal → addDoc(status:"oczekuje")
                                         ↓
Admin widzi w AdminPanel (badge z liczbą oczekujących przez onSnapshot)
                                         ↓
Akceptacja → addDoc do "lowiska" + updateDoc(status:"zaakceptowane")
Odrzucenie → updateDoc(status:"odrzucone")
```

**Operacje w kodzie:**
| Operacja | Plik | Kod |
|---|---|---|
| Zgłoszenie propozycji | `components/map/ZaproponujLowiskoModal.tsx` | `addDoc(collection(db,"lowiska_propozycje"), {...})` |
| Liczba oczekujących (realtime) | `components/admin/AdminPanel.tsx` | `onSnapshot(collection(db,"lowiska_propozycje"), snap => ...)` |
| Akceptacja/odrzucenie | `components/admin/AdminPanel.tsx` | `updateDoc(doc(db,"lowiska_propozycje",id), {status:"zaakceptowane"})` |

---

## `followers/{followerId}_{followingId}`

Relacja obserwowania między dwoma użytkownikami.

```typescript
{
  follower_id: string,   // UID obserwującego
  following_id: string,  // UID obserwowanego
  timestamp: Timestamp
}
```

Dokument ID jest złożony: `{follower_uid}_{following_uid}` — umożliwia
szybkie sprawdzenie czy relacja istnieje przez `getDoc`.

---

## Firebase Storage — ścieżki plików

| Ścieżka | Zawartość | Kto może pisać |
|---|---|---|
| `posty/{uid}/{timestamp}_{filename}` | Zdjęcia połowów | Zalogowany (właściciel UID) |
| `avatars/{uid}` | Zdjęcia profilowe | Właściciel konta |

**Reguły Storage (`storage.rules`):**
- Odczyt: publiczny (wszyscy mogą oglądać zdjęcia)
- Zapis: zalogowany użytkownik pod swoim UID

---

## Indeksy Firestore (`firestore.indexes.json`)

Wymagane dla złożonych zapytań:
- `posty` — indeks na `(timestamp DESC)` — dla feedu z sortowaniem
- Dodaj indeksy jeśli Firebase Console zgłosi błąd "requires an index"

---

## Kluczowe różnice vs REST API

| REST API | Firebase Firestore |
|---|---|
| `GET /api/posts?page=2` | `query(collection,"posty", orderBy, limit, startAfter(lastDoc))` |
| `POST /api/posts` | `addDoc(collection(db,"posty"), data)` |
| `DELETE /api/posts/:id` | `deleteDoc(doc(db,"posty",id))` |
| Middleware autoryzacji | Firestore Rules (deklaratywne, po stronie Firebase) |
| WebSocket / SSE | `onSnapshot(query, callback)` — wbudowany realtime |
| Paginacja offset | Cursor-based (tylko `startAfter`) — Firestore nie ma OFFSET |
