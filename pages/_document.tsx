import { Html, Head, Main, NextScript } from "next/document";

/**
 * Ten plik jest częścią tego samego obejścia, co pages/404.tsx i pages/500.tsx
 * — dokładny opis problemu, który mnie do tego zmusił, zostawiłem w pages/404.tsx.
 *
 * Sam plik nie zawiera żadnej mojej logiki — to standardowy szkielet HTML
 * zalecany w oficjalnej dokumentacji Next.js dla Pages Routera (komponenty
 * Html, Head, Main, NextScript). Musiał tu być, bo strony /404 i /500
 * w Pages Routerze potrzebują takiego "dokumentu" do wyrenderowania —
 * bez niego build i tak by się nie udał.
 */
export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
