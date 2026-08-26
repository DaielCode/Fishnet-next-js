import * as Sentry from "@sentry/nextjs";

/**
 * Zdecydowałem się podpiąć Sentry, bo lokalnie widzę wszystkie błędy
 * od razu w konsoli, ale u prawdziwych użytkowników — nie. Bez takiego
 * narzędzia dowiedziałbym się o awarii dopiero wtedy, gdy ktoś mi ją zgłosi
 * (albo wcale). Ta konfiguracja odpala się tylko po stronie przeglądarki.
 *
 * Wartości parametrów ustawiłem świadomie pod projekt na etapie testów:
 * `tracesSampleRate: 1.0` — monitoruję 100% ruchu pod kątem wydajności;
 * przy realnym, większym ruchu obniżyłbym to, żeby nie przekroczyć
 * darmowego limitu zapytań w Sentry.
 * `replaysOnErrorSampleRate: 1.0` — jeśli wystąpi błąd, chcę mieć zawsze
 * nagranie tego, co użytkownik robił na stronie tuż przed nim — to
 * zdecydowanie ułatwia znalezienie przyczyny, niż sama treść błędu.
 * `replaysSessionSampleRate: 0.1` — sesje bez błędów nagrywam tylko
 * w 10% przypadków, żeby nie zbierać zbyt dużo niepotrzebnych danych.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [Sentry.replayIntegration()],
});
