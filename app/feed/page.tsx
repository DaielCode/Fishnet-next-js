"use client";

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
  const [autorzy, setAutorzy] = useState<Record<string, User>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  const loadingMoreRef = useRef(false);
  const fetchedUids = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrolled = useRef(false);

  const { t } = useLanguage();
  const params = useSearchParams();
  const focusId = params.get("post");

  async function fetchAuthors(posts: Post[]) {
    const newUids = [...new Set(posts.map((p) => p.user_id))].filter(
      (uid) => !fetchedUids.current.has(uid)
    );
    if (!newUids.length) return;
    newUids.forEach((uid) => fetchedUids.current.add(uid));
    const results = await Promise.all(
      newUids.map(async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        return snap.exists() ? ({ uid, ...snap.data() } as User) : null;
      })
    );
    const fetched: Record<string, User> = {};
    results.forEach((u) => { if (u) fetched[u.uid] = u; });
    if (Object.keys(fetched).length) {
      setAutorzy((prev) => ({ ...prev, ...fetched }));
    }
  }

  async function fetchPage(after?: DocumentSnapshot) {
    const q = after
      ? query(collection(db, "posty"), orderBy("timestamp", "desc"), limit(PAGE_SIZE), startAfter(after))
      : query(collection(db, "posty"), orderBy("timestamp", "desc"), limit(PAGE_SIZE));
    const snap = await getDocs(q);
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
    lastDocRef.current = snap.docs.at(-1) ?? null;
    return { data, done: snap.docs.length < PAGE_SIZE };
  }

  // Pierwsze załadowanie
  useEffect(() => {
    fetchPage().then(({ data, done }) => {
      setPosty(data);
      setHasMore(!done);
      setLoading(false);
      fetchAuthors(data);
    });
  }, []);

  // Infinite scroll
  async function loadMore() {
    if (loadingMoreRef.current || !hasMore || !lastDocRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const { data, done } = await fetchPage(lastDocRef.current);
    setPosty((prev) => [...prev, ...data]);
    setHasMore(!done);
    fetchAuthors(data);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }

  // IntersectionObserver na sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore]);

  // Scroll do konkretnego posta
  useEffect(() => {
    if (!focusId || scrolled.current) return;
    const el = postRefs.current.get(focusId);
    if (!el) return;
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
            const autor = autorzy[post.user_id];
            const isFocus = post.id === focusId;
            return (
              <div
                key={post.id}
                ref={(el) => { if (el) postRefs.current.set(post.id, el); }}
                className={isFocus ? "ring-2 ring-blue-500 ring-offset-2 rounded-2xl" : ""}
              >
                <PostCard
                  post={post}
                  authorNick={autor?.nick ?? t.feed.angler}
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

export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedContent />
    </Suspense>
  );
}
