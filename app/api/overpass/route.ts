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

export async function POST(req: NextRequest) {
  const query = await req.text();
  if (!query) {
    return NextResponse.json({ error: "Brak zapytania." }, { status: 400 });
  }

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
          // Przekazujemy odpowiedź bez zmian — parsowanie zostaje po stronie klienta
          return new NextResponse(await res.text(), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        lastStatus = res.status;
        // 429 = wyczerpany limit zapytań — ponawianie nic nie da, przerywamy od razu
        if (res.status === 429) {
          return NextResponse.json({ error: "rate_limit" }, { status: 429 });
        }
      } catch {
        // timeout albo błąd sieci — próbujemy dalej
      }
    }
  }

  return NextResponse.json(
    { error: "overpass_unavailable", upstreamStatus: lastStatus },
    { status: 502 }
  );
}
