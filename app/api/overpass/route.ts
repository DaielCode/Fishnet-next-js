import { NextRequest, NextResponse } from "next/server";

/**
 * Serwerowe proxy do Overpass API.
 *
 * Dlaczego w ogóle jest potrzebne, skoro przeglądarka potrafi wysłać fetch sama?
 * Bo w praktyce nie potrafi tego zrobić niezawodnie. Publiczny Overpass przy
 * odpowiedziach o przeciążeniu lub przekroczeniu limitu nie dołącza nagłówków
 * CORS, więc przeglądarka blokuje odpowiedź i pokazuje wyłącznie ogólne
 * "Failed to fetch" — bez statusu HTTP i bez informacji, co się naprawdę stało.
 * Zmierzone realnie: dokładnie ten sam request z innej domeny przechodził
 * poprawnie, a z domeny aplikacji był blokowany przez CORS.
 *
 * Żądanie wysyłane z serwera nie podlega regułom CORS (to mechanizm wyłącznie
 * przeglądarkowy), więc tutaj problem znika całkowicie. Dodatkowo limit zapytań
 * Overpassa (2 równoległe na adres IP) dotyczy teraz serwera, a nie łącza
 * pojedynczego użytkownika.
 */

/** Oficjalna instancja Overpass. */
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
];

/**
 * Polityka korzystania z usług OpenStreetMap wymaga wysyłania własnego,
 * opisowego nagłówka User-Agent. Bez niego serwer odrzuca żądanie z kodem
 * HTTP 406 (Not Acceptable) — sprawdzone: identyczne zapytanie bez tego
 * nagłówka dostaje 406, a z nim wraca 200 z kompletem danych.
 */
// UWAGA: wyłącznie znaki ASCII — nagłówki HTTP nie dopuszczają polskich znaków
// diakrytycznych (fetch rzuca wtedy błąd konwersji na ByteString).
const USER_AGENT = "Fishnet/1.0 (fishing spots map app; bachelor thesis project)";

/**
 * Vercel domyślnie przerywa funkcję po 10s, a realne zapytania do Overpassa
 * dla zwykłego widoku mapy trwają 20-30s (zmierzone) — bez tego limit ucinałby
 * każde zapytanie zanim Overpass zdąży odpowiedzieć.
 */
export const maxDuration = 60;

/** Ile razy ponawiamy zapytanie gdy Overpass odpowie błędem przeciążenia (504/503). */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Cache odpowiedzi w pamięci procesu.
 *
 * Dwa powody, dla których jest tu ważny:
 * 1. Limit Overpassa (2 równoległe zapytania na IP) dotyczy teraz serwera, a więc
 *    jest WSPÓLNY dla wszystkich użytkowników aplikacji — bez cache kilka osób
 *    przeglądających mapę naraz wyczerpałoby go natychmiast.
 * 2. Overpass bywa chwilowo niedostępny (504). Wtedy zamiast pokazywać błąd
 *    oddajemy ostatnie znane dane dla tego obszaru (stale-if-error).
 *
 * To cache best-effort: instancje serwerless bywają wygaszane, więc czasem
 * będzie pusty. Klucz to treść zapytania — klient zaokrągla bbox do siatki,
 * dzięki czemu drobne przesunięcia mapy trafiają w ten sam wpis.
 */
const CACHE = new Map<string, { body: string; at: number }>();
const FRESH_MS = 10 * 60 * 1000;      // 10 min — w tym czasie oddajemy z cache bez pytania Overpassa
const STALE_MAX_MS = 24 * 60 * 60 * 1000; // 24 h — tak stare dane oddamy tylko awaryjnie, gdy Overpass nie działa
const CACHE_MAX_ENTRIES = 100;

function readCache(key: string, maxAge: number): string | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > maxAge) return null;
  return hit.body;
}

function writeCache(key: string, body: string) {
  // Prosty limit rozmiaru — usuwamy najstarszy wpis (Map zachowuje kolejność wstawiania)
  if (CACHE.size >= CACHE_MAX_ENTRIES) {
    const oldest = CACHE.keys().next().value;
    if (oldest) CACHE.delete(oldest);
  }
  CACHE.set(key, { body, at: Date.now() });
}

function jsonResponse(body: string, source: "live" | "cache" | "stale") {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/json", "X-Data-Source": source },
  });
}

export async function POST(req: NextRequest) {
  const query = await req.text();
  if (!query) {
    return NextResponse.json({ error: "Brak zapytania." }, { status: 400 });
  }

  // Świeży cache — oddajemy od razu, bez obciążania Overpassa
  const fresh = readCache(query, FRESH_MS);
  if (fresh) return jsonResponse(fresh, "cache");

  let lastStatus = 0;
  // Publiczny Overpass bywa chwilowo przeciążony i odpowiada wtedy 504/503.
  // Zmierzone: to samo zapytanie potrafi zwrócić 504, a chwilę później 200,
  // dlatego ponawiamy próbę kilka razy z krótką przerwą zamiast od razu
  // pokazywać użytkownikowi błąd.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));

    for (const mirror of OVERPASS_MIRRORS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 40000);
        const res = await fetch(mirror, {
          method: "POST",
          body: query,
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          const body = await res.text();
          writeCache(query, body);
          // Przekazujemy odpowiedź bez zmian — parsowanie zostaje po stronie klienta
          return jsonResponse(body, "live");
        }

        lastStatus = res.status;
        // 429 = wyczerpany limit zapytań — ponawianie nic nie da, przerywamy od razu
        if (res.status === 429) {
          // Zanim pokażemy błąd — spróbujmy oddać starsze dane dla tego obszaru
          const stale = readCache(query, STALE_MAX_MS);
          if (stale) return jsonResponse(stale, "stale");
          return NextResponse.json({ error: "rate_limit" }, { status: 429 });
        }
      } catch {
        // timeout albo błąd sieci — próbujemy dalej
      }
    }
  }

  // Overpass nie odpowiedział — ostatnia deska ratunku: starsze dane z cache.
  // Lepiej pokazać zbiorniki sprzed kilku godzin niż komunikat o błędzie:
  // granice jezior praktycznie się nie zmieniają, więc dane pozostają użyteczne.
  const stale = readCache(query, STALE_MAX_MS);
  if (stale) return jsonResponse(stale, "stale");

  return NextResponse.json(
    { error: "overpass_unavailable", upstreamStatus: lastStatus },
    { status: 502 }
  );
}
