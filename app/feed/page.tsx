"use client";

/**
 * FeedPage — strona feedu połowów (/feed).
 *
 * Architektura:
 * - `FeedPage` opakowuje `FeedContent` w `<Suspense>` co jest wymagane
 *   przez Next.js gdy używamy `useSearchParams()` — hook ten powoduje
 *   że komponent staje się "dynamiczny" i musi być opakowany w Suspense.
 *
 * - `FeedContent` zawiera całą logikę feedu.
 *
 * Funkcje feedu:
 * 1. Infinite scroll przez IntersectionObserver na "sentinel" divie
 * 2. Cursor-based pagination Firestore (startAfter) — nie ma offset w Firestore
 * 3. Lazy loading autorów — pobieramy tylko tych których jeszcze nie mamy
 * 4. Deep linking — ?post=ID scrolluje do konkretnego posta (np. z mapy)
 * 5. Focus highlight — post z URL param ma niebieski ring
 */
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import {
  collection, getDocs, orderBy, query, limit, startAfter,
  doc, getDoc, type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import PostCard from "@/components/feed/PostCard";
import DodajPostFeedModal from "@/components/feed/DodajPostFeedModal";
import type { Post, User } from "@/types";

/** Liczba postów ładowanych na raz — wyżej = mniej zapytań, ale wolniejszy start */
const PAGE_SIZE = 12;

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
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
}

function FeedContent() {
  const [posty, setPosty] = useState<Post[]>([]);
  const [autorzy, setAutorzy] = useState<Record<string, User>>({}); // uid → profil użytkownika
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);       // true tylko przy pierwszym załadowaniu
  const [loadingMore, setLoadingMore] = useState(false); // true przy doczytywaniu kolejnych stron
  const [hasMore, setHasMore] = useState(true);        // false gdy Firestore zwróci < PAGE_SIZE

  // Kursor Firestore — ostatni dokument z poprzedniej strony, używany w startAfter()
  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  // Ref zamiast state — unikamy re-render + race condition przy szybkim scrollowaniu
  const loadingMoreRef = useRef(false);
  // Set UID-ów dla których już pobraliśmy profil — unikamy duplikowanych zapytań
  const fetchedUids = useRef<Set<string>>(new Set());
  // Element DOM obserwowany przez IntersectionObserver — gdy wejdzie w viewport → loadMore()
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Mapa postId → element DOM — do scroll do konkretnego posta z URL param
  const postRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Zapobiega wielokrotnemu scrollowaniu do tego samego posta
  const scrolled = useRef(false);

  const { t } = useLanguage();
  const params = useSearchParams();
  // Deep link: /feed?post=abc123 → scrolluje do tego posta po załadowaniu
  const focusId = params.get("post");

  /**
   * Pobiera profile autorów dla listy postów — tylko tych których jeszcze nie mamy.
   * Wszystkie getDoc() są wykonywane równolegle (Promise.all) dla wydajności.
   * fetchedUids zapobiega ponownemu pobieraniu tych samych profili przy kolejnych stronach.
   */
  async function fetchAuthors(posts: Post[]) {
    // Zbierz unikalne UID-y z nowej strony, odfiltruj już pobrane
    const newUids = [...new Set(posts.map((p) => p.user_id))].filter(
      (uid) => !fetchedUids.current.has(uid)
    );
    if (!newUids.length) return; // wszyscy autorzy już są w stanie
    newUids.forEach((uid) => fetchedUids.current.add(uid)); // oznacz jako "w trakcie/pobrane"
    const results = await Promise.all(
      newUids.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        // snap.exists() może być false jeśli konto zostało usunięte
        return snap.exists() ? ({ uid, ...snap.data() } as User) : null;
      })
    );
    const fetched: Record<string, User> = {};
    results.forEach((u) => { if (u) fetched[u.uid] = u; });
    if (Object.keys(fetched).length) {
      // Merge z istniejącymi autorami, nie zastępuj całego stanu
      setAutorzy((prev) => ({ ...prev, ...fetched }));
    }
  }

  /**
   * Pobiera jedną stronę postów z Firestore (cursor-based pagination).
   *
   * Firestore nie ma OFFSET — zamiast tego używamy startAfter(lastDoc).
   * `after` = DocumentSnapshot ostatniego posta z poprzedniej strony.
   * Bez `after` = pierwsza strona (od najnowszego posta).
   *
   * `done: true` gdy Firestore zwróciło mniej niż PAGE_SIZE — brak kolejnych stron.
   */
  async function fetchPage(after?: DocumentSnapshot) {
    const q = after
      ? query(collection(db, "posty"), orderBy("timestamp", "desc"), limit(PAGE_SIZE), startAfter(after))
      : query(collection(db, "posty"), orderBy("timestamp", "desc"), limit(PAGE_SIZE));
    const snap = await getDocs(q);
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
    lastDocRef.current = snap.docs.at(-1) ?? null; // zapamiętaj kursor dla następnej strony
    return { data, done: snap.docs.length < PAGE_SIZE }; // done gdy ostatnia strona
  }

  // Pierwsze załadowanie — uruchamia się raz po zamontowaniu komponentu
  useEffect(() => {
    fetchPage().then(({ data, done }) => {
      setPosty(data);
      setHasMore(!done);
      setLoading(false); // ukryj skeleton
      fetchAuthors(data); // załaduj profile autorów (równolegle po setPosty)
    });
  }, []);

  /**
   * Doczytuje następną stronę postów.
   * Guard: loadingMoreRef zapobiega równoległym wywołaniom (np. szybki scroll).
   * Używamy ref zamiast state żeby sprawdzenie było synchroniczne.
   */
  async function loadMore() {
    if (loadingMoreRef.current || !hasMore || !lastDocRef.current) return;
    loadingMoreRef.current = true; // synchroniczna blokada — state byłby za wolny
    setLoadingMore(true);
    const { data, done } = await fetchPage(lastDocRef.current);
    setPosty((prev) => [...prev, ...data]); // append — nie zastępuj
    setHasMore(!done);
    fetchAuthors(data);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }

  /**
   * IntersectionObserver obserwuje "sentinel" — niewidoczny div na końcu listy.
   * Gdy sentinel wejdzie w viewport (threshold: 10%) → wywołaj loadMore().
   * Cleanup (observer.disconnect) zapobiega memory leak po odmontowaniu.
   * Zależności [hasMore, loadingMore] przebudowują observer gdy stan się zmieni.
   */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 } // 10% elementu widoczne = trigger
    );
    observer.observe(sentinel);
    return () => observer.disconnect(); // cleanup przy odmontowaniu
  }, [hasMore, loadingMore]);

  /**
   * Scroll do konkretnego posta gdy URL ma param ?post=ID.
   * Uruchamia się po każdym załadowaniu postów (posty jako dependency).
   * scrolled.current = true po pierwszym scrollu — nie scrollujemy ponownie.
   * setTimeout(100ms) daje czas React na renderowanie przed scrollIntoView.
   */
  useEffect(() => {
    if (!focusId || scrolled.current) return;
    const el = postRefs.current.get(focusId);
    if (!el) return; // post jeszcze nie wyrenderowany — czekamy na następny render
    scrolled.current = true;
    setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }, [posty, focusId]);

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6">

      <h1 className="hidden sm:block text-2xl font-bold text-gray-900 mb-5">{t.feed.title}</h1>

      {modalOpen && <DodajPostFeedModal onClose={() => setModalOpen(false)} />}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : posty.length === 0 ? (
        <p className="text-center text-gray-400 py-16">{t.feed.empty}</p>
      ) : (
        <div className="space-y-4">
          {posty.map((post) => {
            const autor = autorzy[post.user_id]; // może być undefined gdy profil jeszcze się ładuje
            const isFocus = post.id === focusId; // czy ten post jest "fokusowany" z URL
            return (
              <div
                key={post.id}
                // Rejestruj ref w mapie — używany przez efekt scroll do focusId
                ref={(el) => { if (el) postRefs.current.set(post.id, el); }}
                // Niebieski ring dla posta z URL param — wizualne wyróżnienie
                className={isFocus ? "ring-2 ring-blue-500 ring-offset-2 rounded-2xl" : ""}
              >
                <PostCard
                  post={post}
                  authorNick={autor?.nick ?? t.feed.angler}  // fallback gdy profil jeszcze się ładuje
                  authorAvatar={autor?.avatar ?? ""}
                />
              </div>
            );
          })}

          {/* Sentinel — trigger infinite scroll */}
          <div ref={sentinelRef} className="h-4" />

          {loadingMore && (
            <div className="space-y-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {!hasMore && posty.length > 0 && (
            <p className="text-center text-xs text-gray-300 py-4">
              — wszystkie posty załadowane —
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * FeedPage — wrapper wymagany przez Next.js App Router.
 *
 * `useSearchParams()` w FeedContent powoduje że komponent jest "dynamiczny".
 * Next.js wymaga owinięcia takich komponentów w `<Suspense>` podczas SSR.
 * `fallback={null}` — brak placeholdera podczas hydratacji (FeedContent renderuje własne skeletony).
 */
export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedContent />
    </Suspense>
  );
}
