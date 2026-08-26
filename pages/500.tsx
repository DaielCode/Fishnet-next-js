/**
 * Ten plik dodałem z tego samego powodu co pages/404.tsx — pełne wyjaśnienie
 * problemu (błąd wewnątrz Next.js przy generowaniu stron Pages Router
 * podczas statycznego eksportu) opisałem tam, żeby nie powtarzać się dwa
 * razy. Strona 500 padała na dokładnie ten sam błąd co 404, więc rozwiązanie
 * musiało być identyczne — własna, prosta strona zamiast domyślnej.
 */
export default function Custom500() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>500</h1>
      <p style={{ color: "#6b7280" }}>Coś poszło nie tak.</p>
    </div>
  );
}
