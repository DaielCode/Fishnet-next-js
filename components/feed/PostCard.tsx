"use client";

import Image from "next/image";
import { useState } from "react";
import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Post } from "@/types";

interface Props {
  post: Post;
  authorNick: string;
  authorAvatar: string;
}

export default function PostCard({ post, authorNick, authorAvatar }: Props) {
  const [likes, setLikes] = useState(post.likes);
  const [liked, setLiked] = useState(false);

  async function handleLike() {
    if (liked) return;
    setLiked(true);
    setLikes((prev) => prev + 1);
    await updateDoc(doc(db, "posty", post.id), { likes: increment(1) });
  }

  const date = post.timestamp?.toDate?.()?.toLocaleDateString("pl-PL") ?? "";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {post.zdjecia[0] && (
        <div className="relative aspect-square">
          <Image src={post.zdjecia[0]} alt={post.nazwa_ryby} fill className="object-cover" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          {authorAvatar ? (
            <Image src={authorAvatar} alt={authorNick} width={32} height={32} className="rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm">
              {authorNick[0]}
            </div>
          )}
          <div>
            <p className="text-sm font-medium">{authorNick}</p>
            <p className="text-xs text-gray-400">{date}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
            {post.typ_ryby}
          </span>
          {post.waga_kg && (
            <span className="text-xs text-gray-500">{post.waga_kg} kg</span>
          )}
          {post.dlugosc_cm && (
            <span className="text-xs text-gray-500">{post.dlugosc_cm} cm</span>
          )}
        </div>

        {post.nazwa_ryby && (
          <p className="font-semibold text-sm">{post.nazwa_ryby}</p>
        )}
        {post.opis && (
          <p className="text-sm text-gray-600 mt-1">{post.opis}</p>
        )}

        <button
          onClick={handleLike}
          className={`mt-3 flex items-center gap-1 text-sm ${liked ? "text-red-500" : "text-gray-400 hover:text-red-400"}`}
        >
          ❤️ {likes}
        </button>
      </div>
    </div>
  );
}
