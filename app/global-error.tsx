"use client";

/**
 * GlobalError — fallback UI dla krytycznych błędów całej aplikacji.
 *
 * Next.js renderuje ten komponent gdy wyjątek nie zostanie złapany przez
 * żaden Error Boundary niższego poziomu (np. błąd w samym layout.tsx).
 * Zastępuje cały HTML strony — dlatego musi zawierać własne <html> i <body>.
 *
 * Każdy błąd jest automatycznie raportowany do Sentry przez captureException.
 * Przycisk "Spróbuj ponownie" wywołuje `reset()` — remountuje drzewo React.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: 32, textAlign: "center" }}>
          <h2>Coś poszło nie tak</h2>
          <button onClick={reset}>Spróbuj ponownie</button>
        </div>
      </body>
    </html>
  );
}
