import type { Meta, StoryObj } from '@storybook/nextjs-vite';

/**
 * Strona główna (landing page) — punkt wejścia do aplikacji.
 *
 * Wyświetla logo, tagline i dwa CTA: "Otwórz Mapę" i "Zobacz Feed".
 * Tekst pochodzi z `LanguageContext` (i18n).
 */

// Storybook nie obsługuje kontekstów Next.js bezpośrednio,
// więc dokumentujemy stronę jako statyczny HTML — do wizualnego przeglądu.

const LandingPreview = () => (
  <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4 bg-gray-50">
    <h1 className="text-5xl font-bold text-blue-600 mb-4">🎣 Fishnet</h1>
    <p className="text-xl text-gray-600 mb-8 max-w-md">
      Społeczność wędkarzy. Odkryj łowiska, dodaj swój połów i śledź innych wędkarzy.
    </p>
    <div className="flex gap-4">
      <a href="/mapa" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition">
        Otwórz Mapę
      </a>
      <a href="/feed" className="border border-blue-600 text-blue-600 px-6 py-3 rounded-xl font-medium hover:bg-blue-50 transition">
        Zobacz Feed
      </a>
    </div>
  </div>
);

const meta: Meta<typeof LandingPreview> = {
  title: 'Strony/LandingPage',
  component: LandingPreview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Strona główna — landing page aplikacji Fishnet. Dwa przyciski CTA: do mapy i do feedu.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: 'Strona główna',
};
