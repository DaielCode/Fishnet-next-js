/**
 * Ten plik istnieje z konkretnego, dość nietypowego powodu, więc go opiszę.
 *
 * Cała aplikacja jest napisana w App Routerze (folder `app/`) — to nowszy
 * sposób organizacji stron w Next.js. Pages Router (folder `pages/`, w którym
 * jest ten plik) to starszy mechanizm, którego świadomie nigdzie indziej
 * nie używam. Musiałem jednak po niego sięgnąć, bo napotkałem błąd, który
 * uniemożliwiał mi zbudowanie aplikacji do wdrożenia.
 *
 * Przy statycznym eksporcie (`output: "export"` w next.config.ts) Next.js
 * generuje strony /404 i /500 właśnie przez ten starszy mechanizm Pages
 * Router — nawet jeśli reszta projektu go nie używa. Na moim środowisku
 * (Windows) domyślna, wbudowana strona /404 powodowała, że cały build
 * kończył się błędem wewnątrz samego Next.js (`useContext` wywoływane na
 * pustej wartości w komponencie `<Html>`) — czyli błędem w bibliotece,
 * nie w moim kodzie. Po sporym czasie debugowania i sprawdzeniu, że problem
 * występuje niezależnie od wersji Next.js czy Reacta, znalazłem obejście:
 * podanie własnej, bardzo prostej strony 404 w tym miejscu sprawia, że
 * Next.js nie próbuje już generować tej zepsutej, domyślnej wersji.
 */
export default function Custom404() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>404</h1>
      <p style={{ color: "#6b7280" }}>Strona nie znaleziona.</p>
    </div>
  );
}
