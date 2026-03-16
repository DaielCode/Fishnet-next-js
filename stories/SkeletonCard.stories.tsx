import type { Meta, StoryObj } from '@storybook/nextjs-vite';

/**
 * SkeletonCard — placeholder ładowania w feedzie.
 *
 * Wyświetlany podczas pobierania postów z Firestore.
 * Używa animacji `animate-pulse` z Tailwind CSS.
 */

const SkeletonCard = () => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse w-full max-w-md">
    <div className="flex items-center gap-3 px-4 pt-3 pb-2">
      <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="h-3 w-28 bg-gray-200 rounded" />
    </div>
    <div className="h-52 bg-gray-100" />
    <div className="p-4 space-y-2">
      <div className="h-3 w-3/4 bg-gray-200 rounded" />
      <div className="h-3 w-1/2 bg-gray-100 rounded" />
    </div>
  </div>
);

const meta: Meta<typeof SkeletonCard> = {
  title: 'Feed/SkeletonCard',
  component: SkeletonCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Placeholder ładowania postów. Wyświetlany gdy Feed pobiera dane z Firestore.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Pojedynczy: Story = {
  name: 'Jeden skeleton',
};

export const Lista: Story = {
  name: 'Lista 3 skeletonów (stan ładowania feedu)',
  render: () => (
    <div className="space-y-4 w-full max-w-md">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  ),
};
