import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Timestamp } from 'firebase/firestore';
import PostCard from '../components/feed/PostCard';

/**
 * PostCard — karta połowu w feedzie.
 *
 * Pokazuje zdjęcia, gatunek ryby, wagę, długość, opis i lokalizację.
 * Obsługuje polubienia (optimistic update) i usuwanie przez autora.
 *
 * **Uwaga:** W Storybook akcje Firestore są wyłączone — like/delete
 * nie zapisuje się do bazy, ale wizualnie działa poprawnie.
 */
const meta: Meta<typeof PostCard> = {
  title: 'Feed/PostCard',
  component: PostCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Karta pojedynczego połowu w feedzie. Pobiera dane z props (post, authorNick, authorAvatar).',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    post: { description: 'Obiekt Post z Firestore' },
    authorNick: { description: 'Nick autora posta' },
    authorAvatar: { description: 'URL avatara autora (puste = inicjał)' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Przykładowe timestamp — Storybook nie ma Firestore, symulujemy */
const mockTimestamp = {
  toDate: () => new Date('2025-06-15T10:30:00'),
  seconds: 1750000000,
  nanoseconds: 0,
} as unknown as Timestamp;

/** Post z pełnymi danymi — zdjęcie, waga, długość, lokalizacja */
export const PelnyPost: Story = {
  name: 'Pełny post (karp z wagą i zdjęciem)',
  args: {
    post: {
      id: 'abc123',
      user_id: 'user_1',
      stanowisko_id: 'stanowisko_3',
      lowisko_id: 'uroczysko',
      lokalizacja_nazwa: 'Uroczysko Karpiowe — Stanowisko 3',
      lat: 49.9,
      lng: 19.1,
      typ_ryby: 'Karp',
      nazwa_ryby: 'Złoty Karp',
      zdjecia: ['https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/24701-nature-natural-beauty.jpg/1280px-24701-nature-natural-beauty.jpg'],
      opis: 'Złapałem na kukurydzę. Walka trwała 20 minut, niesamowite przeżycie!',
      waga_kg: 8.5,
      dlugosc_cm: 72,
      timestamp: mockTimestamp,
      likes: 14,
      likedBy: [],
    },
    authorNick: 'WędkarzJan',
    authorAvatar: 'https://i.pravatar.cc/150?img=3',
  },
};

/** Post bez zdjęcia — tylko tekst i dane ryby */
export const BezZdjecia: Story = {
  name: 'Post bez zdjęcia',
  args: {
    post: {
      id: 'def456',
      user_id: 'user_2',
      stanowisko_id: '',
      lowisko_id: '',
      lokalizacja_nazwa: 'Jezioro Goczałkowickie',
      typ_ryby: 'Szczupak',
      nazwa_ryby: 'Szczupak',
      zdjecia: [],
      opis: 'Złapany z łódki, wypuszczony po zdjęciu.',
      waga_kg: 3.2,
      dlugosc_cm: 65,
      timestamp: mockTimestamp,
      likes: 3,
      likedBy: [],
    },
    authorNick: 'Marek_Wedkarz',
    authorAvatar: '',
  },
};

/** Post z minimalną ilością danych — tylko gatunek i zdjęcie */
export const MinimalnyPost: Story = {
  name: 'Minimalny post (tylko gatunek)',
  args: {
    post: {
      id: 'ghi789',
      user_id: 'user_3',
      stanowisko_id: '',
      lowisko_id: '',
      typ_ryby: 'Inne',
      nazwa_ryby: '',
      zdjecia: [],
      opis: '',
      timestamp: mockTimestamp,
      likes: 0,
      likedBy: [],
    },
    authorNick: 'NowicjuszW',
    authorAvatar: '',
  },
};

/** Post z wieloma polubieniami */
export const PopularnyPost: Story = {
  name: 'Popularny post (dużo polubień)',
  args: {
    ...PelnyPost.args,
    post: {
      ...PelnyPost.args!.post!,
      id: 'xyz999',
      likes: 127,
      opis: 'Rekordowy karp sezonu! 12.4kg na metodzie karpiowej.',
      waga_kg: 12.4,
    },
  },
};
