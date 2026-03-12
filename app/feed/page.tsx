"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { collection, onSnapshot, orderBy, query, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import PostCard from "@/components/feed/PostCard";
import DodajPostFeedModal from "@/components/feed/DodajPostFeedModal";
import { useAuth } from "@/hooks/useAuth";
import type { Post, User } from "@/types";

function FeedContent() {
  const [posty, setPosty] = useState<Post[]>([]);
  const [autorzy, setAutorzy] = useState<Record<string, User>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useLanguage();
  const params = useSearchParams();
  const focusId = params.get("post");
  const postRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrolled = useRef(false);

  useEffect(() => {
    const q = query(collection(db, "posty"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
      setPosty(data);
      setLoading(false);

      const noweUid = [...new Set(data.map((p) => p.user_id))].filter(
        (uid) => !autorzy[uid]
      );
      for (const uid of noweUid) {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (userSnap.exists()) {
          setAutorzy((prev) => ({ ...prev, [uid]: { uid, ...userSnap.data() } as User }));
        }
      }
    });
    return unsub;
  }, []);

  // Przewiń do posta po załadowaniu
  useEffect(() => {
    if (!focusId || scrolled.current) return;
    const el = postRefs.current.get(focusId);
    if (!el) return;
    scrolled.current = true;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [posty, focusId]);

  return (
    <div className="max-w-lg mx-auto px-4 pt-3 pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t.feed.title}</h1>
        {user && (
          <button
            onClick={() => setModalOpen(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {t.feed.addPost}
          </button>
        )}
      </div>
      {modalOpen && <DodajPostFeedModal onClose={() => setModalOpen(false)} />}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-200" />
                <div className="space-y-1.5">
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                  <div className="h-2.5 w-16 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="h-44 bg-gray-100 rounded-xl mb-3" />
              <div className="space-y-2">
                <div className="h-3 w-3/4 bg-gray-200 rounded" />
                <div className="h-3 w-1/2 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : posty.length === 0 ? (
        <p className="text-center text-gray-400 py-16">{t.feed.empty}</p>
      ) : null}
      <div className="space-y-4">
        {posty.map((post) => {
          const autor = autorzy[post.user_id];
          const isFocus = post.id === focusId;
          return (
            <div
              key={post.id}
              ref={(el) => { if (el) postRefs.current.set(post.id, el); }}
              className={isFocus ? "ring-2 ring-blue-500 ring-offset-2 rounded-2xl transition-all" : ""}
            >
              <PostCard
                post={post}
                authorNick={autor?.nick ?? t.feed.angler}
                authorAvatar={autor?.avatar ?? ""}
              />
            </div>
          );
        })}
      </div>
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
