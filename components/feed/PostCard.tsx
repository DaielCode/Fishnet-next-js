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
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikes((prev) => prev + (nowLiked ? 1 : -1));
    await updateDoc(doc(db, "posty", post.id), { likes: increment(nowLiked ? 1 : -1) });
  }

  const date = post.timestamp?.toDate?.()?.toLocaleDateString("pl-PL", {
    day: "numeric", month: "short", year: "numeric",
  }) ?? "";

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow">

      {/* Zdjęcie */}
      {post.zdjecia[0] && (
        <div className="relative aspect-square bg-gray-100">
          <Image src={post.zdjecia[0]} alt={post.nazwa_ryby || post.typ_ryby} fill className="object-cover" />
        </div>
      )}

      <div className="p-4 space-y-3">

        {/* Autor */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {authorAvatar ? (
              <Image
                src={authorAvatar}
                alt={authorNick}
                width={38}
                height={38}
                className="rounded-full ring-2 ring-gray-100"
              />
            ) : (
              <div className="w-[38px] h-[38px] rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold ring-2 ring-gray-100">
                {authorNick[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">{authorNick}</p>
              <p className="text-xs text-gray-400">{date}</p>
            </div>
          </div>

          {/* Badge gatunek */}
          <span className="bg-blue-50 text-blue-600 text-xs font-semibold px-3 py-1 rounded-full border border-blue-100">
            {post.typ_ryby}
          </span>
        </div>

        {/* Nazwa ryby */}
        {post.nazwa_ryby && (
          <p className="font-bold text-gray-900 text-base">{post.nazwa_ryby}</p>
        )}

        {/* Statystyki waga/długość */}
        {(post.waga_kg || post.dlugosc_cm) && (
          <div className="flex gap-3">
            {post.waga_kg && (
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5">
                <span className="text-base">⚖️</span>
                <span className="text-sm font-semibold text-gray-800">{post.waga_kg} kg</span>
              </div>
            )}
            {post.dlugosc_cm && (
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5">
                <span className="text-base">📏</span>
                <span className="text-sm font-semibold text-gray-800">{post.dlugosc_cm} cm</span>
              </div>
            )}
          </div>
        )}

        {/* Opis */}
        {post.opis && (
          <p className="text-sm text-gray-600 leading-relaxed">{post.opis}</p>
        )}

        {/* Lajk */}
        <div className="pt-1 border-t border-gray-50 flex items-center">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              liked
                ? "text-red-500 bg-red-50"
                : "text-gray-500 hover:text-red-400 hover:bg-red-50"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-5 h-5 transition-all"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {likes}
          </button>
        </div>

      </div>
    </div>
  );
}
