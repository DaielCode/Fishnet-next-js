"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { doc, updateDoc, increment, deleteDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, auth, storage } from "@/lib/firebase";
import { useLanguage } from "@/context/LanguageContext";
import type { Post } from "@/types";

const LS_KEY = "fishnet_liked";

function getLikedSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? "[]")); }
  catch { return new Set(); }
}
function saveLikedSet(set: Set<string>) {
  localStorage.setItem(LS_KEY, JSON.stringify([...set]));
}

interface Props {
  post: Post;
  authorNick: string;
  authorAvatar: string;
}

export default function PostCard({ post, authorNick, authorAvatar }: Props) {
  const [likes, setLikes] = useState(post.likes);
  const [liked, setLiked] = useState(() => getLikedSet().has(post.id));
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const { t } = useLanguage();

  const fishDict = t.fish as Record<string, string>;
  const fishLabel = fishDict[post.typ_ryby] ?? post.typ_ryby;
  const isOwner = auth.currentUser?.uid === post.user_id;

  async function handleLike() {
    const nowLiked = !liked;
    setLiked(nowLiked);
    setLikes((prev) => prev + (nowLiked ? 1 : -1));
    const set = getLikedSet();
    nowLiked ? set.add(post.id) : set.delete(post.id);
    saveLikedSet(set);
    await updateDoc(doc(db, "posty", post.id), { likes: increment(nowLiked ? 1 : -1) });
  }

  async function handleDelete() {
    if (!window.confirm(t.post.confirmDelete)) return;
    setDeleted(true);
    try {
      for (const url of post.zdjecia ?? []) {
        try {
          const storageRef = ref(storage, url);
          await deleteObject(storageRef);
        } catch { /* pomiń */ }
      }
      await deleteDoc(doc(db, "posty", post.id));
    } catch (err) {
      console.error("Błąd usuwania posta:", err);
      setDeleted(false);
    }
  }

  const date = post.timestamp?.toDate?.()?.toLocaleDateString("pl-PL", {
    day: "numeric", month: "short", year: "numeric",
  }) ?? "";

  if (deleted) return null;

  return (
    <>
      {/* ── Karta posta ── */}
      <article
        className="bg-white rounded-2xl overflow-hidden transition-shadow duration-200 hover:shadow-lg"
        style={{ boxShadow: "0 2px 8px -2px rgb(0 0 0 / 0.10), 0 1px 3px -1px rgb(0 0 0 / 0.06)" }}
      >

        {/* ── Autor nad zdjęciem ── */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          {authorAvatar ? (
            <Image src={authorAvatar} alt={authorNick} width={36} height={36}
              className="rounded-full ring-2 ring-white shadow-sm flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center text-white text-sm font-bold ring-2 ring-white shadow-sm flex-shrink-0">
              {authorNick[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{authorNick}</p>
        </div>

        {/* Zdjęcie */}
        {post.zdjecia[0] && (
          <div
            className="relative cursor-zoom-in bg-gray-100"
            onClick={() => setLightbox(post.zdjecia[0])}
          >
            <Image
              src={post.zdjecia[0]}
              alt={post.nazwa_ryby || post.typ_ryby}
              width={0}
              height={0}
              sizes="(max-width: 768px) 100vw, 600px"
              loading="eager"
              style={{ width: "100%", height: "auto", display: "block" }}
              className=""
            />
          </div>
        )}

        {/* ── Akcje pod zdjęciem ── */}
        <div className="px-4 pt-3 flex items-center justify-between border-b border-gray-100 pb-3">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer select-none ${
              liked
                ? "text-red-500 bg-red-50"
                : "text-gray-500 hover:text-red-400 hover:bg-red-50"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-5 h-5 transition-transform duration-150 hover:scale-110"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="text-gray-700">{likes}</span>
          </button>

          {post.lat != null && post.lng != null && (
            <Link
              href={`/mapa?lat=${post.lat}&lng=${post.lng}`}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span className="text-gray-600">{t.feed.seeOnMap}</span>
            </Link>
          )}
        </div>

        <div className="p-4 space-y-3">

          {/* ── Nagłówek: data + badge + usuń ── */}
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-500 leading-tight flex-1">{date}</p>
            <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full border border-blue-100 flex-shrink-0 max-w-[120px] truncate">
              {fishLabel}
            </span>
            {isOwner && (
              <button onClick={handleDelete} title={t.post.deletePost}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          {/* ── Nazwa ryby ── */}
          {post.nazwa_ryby && (
            <p className="font-bold text-gray-900 text-base leading-snug">{post.nazwa_ryby}</p>
          )}

          {/* ── Waga / Długość ── */}
          {(post.waga_kg || post.dlugosc_cm) && (
            <div className="flex flex-wrap gap-2">
              {post.waga_kg && (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
                  <span className="text-sm">⚖️</span>
                  <span className="text-sm font-semibold text-slate-700">{post.waga_kg} kg</span>
                </div>
              )}
              {post.dlugosc_cm && (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
                  <span className="text-sm">📏</span>
                  <span className="text-sm font-semibold text-slate-700">{post.dlugosc_cm} cm</span>
                </div>
              )}
            </div>
          )}

          {/* ── Opis ── */}
          {post.opis && (
            <p className="text-sm text-gray-700 leading-relaxed">{post.opis}</p>
          )}

        </div>
      </article>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-[2000] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <Image
            src={lightbox}
            alt="Zdjęcie połowu"
            width={0}
            height={0}
            sizes="100vw"
            className="max-w-full max-h-[90vh] w-auto h-auto rounded-xl shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
