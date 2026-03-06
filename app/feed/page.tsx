"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import PostCard from "@/components/feed/PostCard";
import type { Post, User } from "@/types";

export default function FeedPage() {
  const [posty, setPosty] = useState<Post[]>([]);
  const [autorzy, setAutorzy] = useState<Record<string, User>>({});

  useEffect(() => {
    const q = query(collection(db, "posty"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
      setPosty(data);

      // Pobierz profile autorów których jeszcze nie mamy
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

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Feed</h1>
      {posty.length === 0 && (
        <p className="text-center text-gray-400 py-16">Brak postów. Bądź pierwszy!</p>
      )}
      <div className="space-y-4">
        {posty.map((post) => {
          const autor = autorzy[post.user_id];
          return (
            <PostCard
              key={post.id}
              post={post}
              authorNick={autor?.nick ?? "Wędkarz"}
              authorAvatar={autor?.avatar ?? ""}
            />
          );
        })}
      </div>
    </div>
  );
}
