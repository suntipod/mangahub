"use client";

import React, { useState, useEffect } from "react";
import { Manga } from "@/types/manga";
import { ExternalLink, Plus, Globe, Check, Flame, Zap, EyeOff, BookOpen } from "lucide-react";

interface MangaCardProps {
  manga: Manga;
  onSelect: (manga: Manga) => void;
  onIncrement: (id: string) => void;
  onIncrementAndOpenNext?: (manga: Manga) => void;
  onSyncToLatest?: (id: string, latestChapter: number) => void;
  onOpenReader?: (manga: Manga) => void;
  onTagClick?: (tag: string) => void;
  isRecentlyRead?: boolean;
  viewMode?: "poster" | "compact";
  isDiscreetMode?: boolean;
}

export const MangaCard: React.FC<MangaCardProps> = ({
  manga,
  onSelect,
  onIncrement,
  onIncrementAndOpenNext,
  onSyncToLatest,
  onOpenReader,
  onTagClick,
  isRecentlyRead = false,
  viewMode = "poster",
  isDiscreetMode = false,
}) => {

  const [justIncremented, setJustIncremented] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [currentCover, setCurrentCover] = useState(manga.cover_url || "");
  const [triedProxy, setTriedProxy] = useState(false);

  useEffect(() => {
    setCurrentCover(manga.cover_url || "");
    setImgError(false);
    setTriedProxy(false);
  }, [manga.cover_url]);

  const handleImageError = () => {
    if (
      !triedProxy &&
      manga.cover_url &&
      !manga.cover_url.startsWith("/api/image-proxy") &&
      !manga.cover_url.startsWith("data:")
    ) {
      setTriedProxy(true);
      setCurrentCover(`/api/image-proxy?url=${encodeURIComponent(manga.cover_url)}`);
    } else {
      setImgError(true);
    }
  };

  const is18Plus = Boolean(
    manga.category &&
      (manga.category.toLowerCase().includes("dojin") ||
        manga.category.toLowerCase().includes("โดจิน") ||
        manga.category.toLowerCase().includes("ntr"))
  );
  const shouldBlur = Boolean(isDiscreetMode && is18Plus);

  const primarySource =
    manga.sources.find((s) => s.is_primary) || manga.sources[0];
  const otherSourcesCount = Math.max(0, manga.sources.length - 1);
  const unreadCount = Math.max(
    0,
    (manga.latest_available_chapter || manga.current_chapter) - manga.current_chapter
  );
  const hasNewChapter = unreadCount > 0;

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    onIncrement(manga.id);
    setJustIncremented(true);
    setTimeout(() => setJustIncremented(false), 800);
  };

  const handleOpenReader = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenReader) {
      onOpenReader(manga);
      return;
    }
    if (primarySource?.current_chapter_url) {
      window.open(primarySource.current_chapter_url, "_blank", "noopener,noreferrer");
    } else if (primarySource?.base_url) {
      window.open(primarySource.base_url, "_blank", "noopener,noreferrer");
    } else {
      onSelect(manga);
    }
  };

  const handleOpenNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onIncrementAndOpenNext) {
      onIncrementAndOpenNext(manga);
    } else {
      handleIncrement(e);
      handleOpenReader(e);
    }
  };

  // ==========================================
  // 1. POSTER VIEW (ตรงตามรูปภาพตัวอย่างเป๊ะๆ)
  // ==========================================
  if (viewMode === "poster") {
    return (
      <div
        onClick={() => onSelect(manga)}
        className={`group relative aspect-[2/3] w-full bg-[#111827] border rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1.5 select-none flex flex-col justify-end ${
          isRecentlyRead
            ? "border-violet-500 ring-2 ring-violet-500/80 shadow-2xl shadow-violet-900/50"
            : "border-[#1F2E45]/80 hover:border-violet-500/80 hover:shadow-2xl hover:shadow-violet-950/40"
        }`}
      >
        {/* Full-Bleed Cover Image */}
        {currentCover && !imgError ? (
          <img
            src={currentCover}
            alt={manga.title}
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className={`absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-all duration-500 ${
              shouldBlur
                ? "filter blur-xl brightness-50 contrast-125 scale-110 group-hover:blur-none group-hover:brightness-100 group-hover:scale-105"
                : ""
            }`}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-[#141E33] to-[#0A0E17]">
            <Globe className="w-10 h-10 mb-2 opacity-30 text-violet-400" />
            <span className="text-xs line-clamp-3 font-semibold text-gray-400">
              {manga.title}
            </span>
          </div>
        )}

        {/* Discreet Blur Overlay Badge */}
        {shouldBlur && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-3 text-center bg-black/40 backdrop-blur-sm pointer-events-none group-hover:opacity-0 transition-opacity duration-300">
            <div className="w-9 h-9 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 mb-1">
              <EyeOff className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-rose-300 drop-shadow">
              🔞 ซ่อนปก 18+
            </span>
            <span className="text-[9px] text-gray-300 opacity-80">
              (ชี้/แตะเพื่อดู)
            </span>
          </div>
        )}

        {/* Top Badges (Chapter in top-left like Tachiyomi screenshot) */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-1.5 pointer-events-none z-10">
          {/* Chapter badge: Displays BOTH current chapter read AND latest chapter available */}
          <div className="flex flex-col gap-0.5 items-start shrink-0">
            {hasNewChapter ? (
              <div className="flex flex-col gap-0.5 items-start">
                <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow-lg shadow-orange-500/40 flex items-center gap-1 animate-pulse border border-orange-300/30">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  <span>+{unreadCount} ตอนใหม่</span>
                </span>
                <span className="bg-black/80 backdrop-blur-md text-gray-200 text-[9px] font-bold px-1.5 py-0.5 rounded shadow border border-white/10">
                  ช.{manga.current_chapter} / {manga.latest_available_chapter}
                </span>
              </div>
            ) : (
              <span className="bg-indigo-600/90 backdrop-blur-md text-white text-xs font-black px-2 py-0.5 rounded-lg shadow-md border border-indigo-400/30 flex items-center gap-1">
                <span>ช.{manga.current_chapter}</span>
                {manga.latest_available_chapter ? (
                  <span className="text-[10px] text-indigo-200 opacity-90">/ {manga.latest_available_chapter}</span>
                ) : null}
              </span>
            )}
          </div>

          {/* Right badges: Recently Read, Category & Tier */}
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {isRecentlyRead && (
              <span className="bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-md shadow-violet-600/40 flex items-center gap-0.5 animate-pulse">
                <BookOpen className="w-2.5 h-2.5" />
                <span>อ่านล่าสุด</span>
              </span>
            )}
            {manga.category && (
              <span
                className={`backdrop-blur-md text-[10px] font-extrabold px-1.5 py-0.5 rounded-md shadow ${
                  manga.category.toLowerCase().includes("dojin")
                    ? "bg-rose-600/90 text-white"
                    : manga.category.toLowerCase().includes("ntr")
                    ? "bg-purple-600/90 text-white"
                    : "bg-black/60 text-gray-200 border border-white/10"
                }`}
              >
                {manga.category.toLowerCase().includes("dojin")
                  ? "🔞"
                  : manga.category.toLowerCase().includes("ntr")
                  ? "💔"
                  : "📚"}
              </span>
            )}
            {manga.tier && manga.tier !== "none" && (
              <span
                className={`backdrop-blur-md text-[10px] font-black px-1.5 py-0.5 rounded-md shadow ${
                  manga.tier === "S"
                    ? "bg-amber-400 text-black shadow-amber-400/30"
                    : manga.tier === "A"
                    ? "bg-orange-500 text-white shadow-orange-500/30"
                    : manga.tier === "B"
                    ? "bg-sky-500 text-white shadow-sky-500/30"
                    : manga.tier === "C"
                    ? "bg-emerald-600 text-white shadow-emerald-600/30"
                    : "bg-amber-500/90 text-black"
                }`}
              >
                {manga.tier === "S"
                  ? "👑 S"
                  : manga.tier === "A"
                  ? "🔥 A"
                  : manga.tier === "B"
                  ? "✨ B"
                  : manga.tier === "C"
                  ? "👍 C"
                  : manga.tier}
              </span>
            )}

            {/* Reading Status Badge if not reading */}
            {manga.status && manga.status !== "reading" && (
              <span
                className={`backdrop-blur-md text-[9px] font-black px-1.5 py-0.5 rounded-md shadow ${
                  manga.status === "completed"
                    ? "bg-blue-600 text-white shadow-blue-600/30"
                    : manga.status === "on_hold"
                    ? "bg-amber-600 text-white shadow-amber-600/30"
                    : manga.status === "dropped"
                    ? "bg-rose-700 text-white shadow-rose-700/30"
                    : "bg-gray-700 text-gray-200"
                }`}
              >
                {manga.status === "completed"
                  ? "✅ จบ"
                  : manga.status === "on_hold"
                  ? "⏳ ดอง"
                  : manga.status === "dropped"
                  ? "🛑 เท"
                  : "📌 รอ"}
              </span>
            )}
          </div>
        </div>


        {/* Bottom Dark Gradient & Title (ตรงกับรูปตัวอย่าง) */}
        <div className="relative z-10 pt-16 pb-3 px-3 bg-gradient-to-t from-black via-black/85 to-transparent flex flex-col justify-end">
          {/* Source & Backup indicator */}
          {primarySource && (
            <div className="flex items-center gap-1 mb-1 pointer-events-none">
              <span className="bg-black/70 backdrop-blur-md text-gray-300 text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                {primarySource.site_name}
              </span>
              {otherSourcesCount > 0 && (
                <span className="bg-violet-950/80 border border-violet-500/30 text-violet-300 text-[9px] font-bold px-1.5 py-0.5 rounded">
                  +{otherSourcesCount} เว็บสำรอง
                </span>
              )}
            </div>
          )}

          <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-tight drop-shadow-md group-hover:text-violet-200 transition-colors">
            {manga.title}
          </h3>
          {manga.alt_title && (
            <p className="text-[10px] text-gray-300 line-clamp-1 mt-0.5 opacity-90 drop-shadow">
              {manga.alt_title}
            </p>
          )}

          {/* Tags */}
          {manga.tags && manga.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5 pointer-events-auto">
              {manga.tags.slice(0, 3).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick?.(tag);
                  }}
                  className="text-[9px] font-medium bg-black/60 hover:bg-violet-600/80 text-violet-300 hover:text-white px-1.5 py-0.5 rounded border border-violet-500/20 transition-colors"
                >
                  #{tag}
                </button>
              ))}
              {manga.tags.length > 3 && (
                <span className="text-[9px] text-gray-400 self-center">
                  +{manga.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Quick Action Overlay (อ่านตอนปัจจุบัน, +1 & เปิดตอนถัดไป, +1 เท่านั้น) */}
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1">
            {/* Open Current Chapter */}
            <button
              onClick={handleOpenReader}
              className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-bold bg-[#141E33]/90 hover:bg-violet-600 text-gray-200 hover:text-white border border-white/10 backdrop-blur-sm transition active:scale-95 shadow truncate"
              title={`เปิดอ่านตอนปัจจุบัน (ตอนที่ ${manga.current_chapter})`}
            >
              <BookOpen className="w-3 h-3 shrink-0" />
              <span className="truncate">ช.{manga.current_chapter}</span>
            </button>

            {/* Smart +1 & Open Next Chapter */}
            <button
              onClick={handleOpenNext}
              className={`flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-xl text-[11px] font-black transition active:scale-95 shadow shrink-0 ${
                hasNewChapter
                  ? "bg-gradient-to-r from-orange-500 via-rose-500 to-pink-600 hover:from-orange-600 text-white shadow-orange-500/40 animate-pulse border border-orange-300/30"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
              }`}
              title={`เปิดอ่านตอนถัดไป (+1 เป็นตอนที่ ${manga.current_chapter + 1} และเปิดหน้าเว็บทันที)`}
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              <span>ช.{manga.current_chapter + 1}</span>
            </button>

            {/* Quick Sync to Latest Chapter Button */}
            {hasNewChapter && onSyncToLatest && unreadCount > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSyncToLatest(manga.id, manga.latest_available_chapter!);
                }}
                className="flex items-center justify-center gap-0.5 py-1.5 px-1.5 rounded-xl text-[10px] font-black bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 text-white shadow shadow-orange-500/30 transition active:scale-90 shrink-0"
                title={`อ่านถึงตอนล่าสุดแล้ว: ข้ามไปตอนที่ ${manga.latest_available_chapter} ทันที`}
              >
                <Zap className="w-3 h-3 fill-current text-yellow-200" />
                <span>ช.{manga.latest_available_chapter}</span>
              </button>
            )}

            {/* +1 Only Button */}
            <button
              onClick={handleIncrement}
              className={`flex items-center justify-center p-1.5 rounded-xl text-xs font-bold transition active:scale-90 shrink-0 ${
                justIncremented
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-white/10 hover:bg-violet-600 text-white border border-white/20 backdrop-blur-sm"
              }`}
              title="อ่านจบตอนนี้แล้ว กดบวก 1 ตอน (ไม่ออกไปหน้าเว็บ)"
            >
              {justIncremented ? (
                <Check className="w-3.5 h-3.5 animate-bounce" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. COMPACT VIEW (โหมดการ์ดแบบแยกกล่อง)
  // ==========================================
  return (
    <div
      onClick={() => onSelect(manga)}
      className={`group relative bg-[#131B2E] hover:bg-[#162032] border rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 flex flex-col ${
        isRecentlyRead
          ? "border-violet-500 ring-2 ring-violet-500/80 shadow-xl shadow-violet-900/40"
          : "border-[#1F2E45] hover:border-violet-500/50 hover:shadow-xl hover:shadow-violet-900/10"
      }`}
    >
      {/* Cover Image Container */}
      <div className="relative aspect-[3/4] w-full bg-[#0E1524] overflow-hidden">
        {currentCover && !imgError ? (
          <img
            src={currentCover}
            alt={manga.title}
            referrerPolicy="no-referrer"
            onError={handleImageError}
            className={`w-full h-full object-cover object-center group-hover:scale-105 transition-all duration-300 ${
              shouldBlur
                ? "filter blur-xl brightness-50 contrast-125 scale-110 group-hover:blur-none group-hover:brightness-100 group-hover:scale-105"
                : ""
            }`}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-gray-500 bg-gradient-to-br from-[#131B2E] to-[#0A0E17]">
            <Globe className="w-10 h-10 mb-2 opacity-40 text-violet-400" />
            <span className="text-xs line-clamp-3 font-medium text-gray-400">
              {manga.title}
            </span>
          </div>
        )}

        {/* Discreet Blur Overlay Badge */}
        {shouldBlur && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-2 text-center bg-black/40 backdrop-blur-sm pointer-events-none group-hover:opacity-0 transition-opacity duration-300">
            <div className="w-8 h-8 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 mb-1">
              <EyeOff className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-rose-300 drop-shadow">
              🔞 ซ่อนปก 18+
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-1.5 pointer-events-none">
          <div className="flex flex-col gap-1 items-start shrink-0">
            {hasNewChapter ? (
              <div className="flex flex-col gap-0.5 items-start">
                <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-lg shadow-lg shadow-orange-500/40 flex items-center gap-1 animate-pulse border border-orange-300/30">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  <span>+{unreadCount} ตอนใหม่</span>
                </span>
                <span className="bg-black/80 backdrop-blur-md text-gray-200 text-[10px] font-bold px-1.5 py-0.5 rounded shadow border border-white/10">
                  ช.{manga.current_chapter} / {manga.latest_available_chapter}
                </span>
              </div>
            ) : (
              <span className="bg-violet-600/90 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md shrink-0 flex items-center gap-1">
                <span>ตอนที่ {manga.current_chapter}</span>
                {manga.latest_available_chapter ? (
                  <span className="text-[10px] text-violet-200 opacity-90">/ {manga.latest_available_chapter}</span>
                ) : null}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {isRecentlyRead && (
              <span className="bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-md shadow-violet-600/40 flex items-center gap-0.5 animate-pulse">
                <BookOpen className="w-2.5 h-2.5" />
                <span>อ่านล่าสุด</span>
              </span>
            )}
            {manga.category && (
              <span
                className={`backdrop-blur-md text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow ${
                  manga.category.toLowerCase().includes("dojin")
                    ? "bg-rose-600/90 text-white"
                    : manga.category.toLowerCase().includes("ntr")
                    ? "bg-purple-600/90 text-white"
                    : "bg-slate-800/90 text-gray-200 border border-slate-700/50"
                }`}
              >
                {manga.category.toLowerCase().includes("dojin")
                  ? "🔞 Dojin"
                  : manga.category.toLowerCase().includes("ntr")
                  ? "💔 NTR"
                  : manga.category}
              </span>
            )}
            {manga.tier && manga.tier !== "none" && (
              <span
                className={`backdrop-blur-md text-[10px] font-black px-2 py-0.5 rounded-md shadow ${
                  manga.tier === "S"
                    ? "bg-amber-400 text-black shadow-amber-400/30"
                    : manga.tier === "A"
                    ? "bg-orange-500 text-white shadow-orange-500/30"
                    : manga.tier === "B"
                    ? "bg-sky-500 text-white shadow-sky-500/30"
                    : manga.tier === "C"
                    ? "bg-emerald-600 text-white shadow-emerald-600/30"
                    : "bg-amber-500/90 text-black"
                }`}
              >
                {manga.tier === "S"
                  ? "👑 S"
                  : manga.tier === "A"
                  ? "🔥 A"
                  : manga.tier === "B"
                  ? "✨ B"
                  : manga.tier === "C"
                  ? "👍 C"
                  : manga.tier}
              </span>
            )}
          </div>
        </div>

        {/* Multi-source indicator pill */}
        {primarySource && (
          <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center gap-1.5 pointer-events-none">
            <span className="bg-black/75 backdrop-blur-md text-gray-300 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              {primarySource.site_name}
            </span>
            {otherSourcesCount > 0 && (
              <span className="bg-black/75 backdrop-blur-md text-violet-300 text-[10px] px-1.5 py-0.5 rounded-md">
                +{otherSourcesCount} เว็บสำรอง
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-3.5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-1.5">
            <h3 className="text-sm font-semibold text-gray-100 line-clamp-2 leading-snug group-hover:text-violet-300 transition-colors">
              {manga.title}
            </h3>
            {manga.status && manga.status !== "reading" && (
              <span
                className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md shadow ${
                  manga.status === "completed"
                    ? "bg-blue-600 text-white"
                    : manga.status === "on_hold"
                    ? "bg-amber-600 text-white"
                    : manga.status === "dropped"
                    ? "bg-rose-700 text-white"
                    : "bg-gray-700 text-gray-200"
                }`}
              >
                {manga.status === "completed"
                  ? "✅ จบ"
                  : manga.status === "on_hold"
                  ? "⏳ ดอง"
                  : manga.status === "dropped"
                  ? "🛑 เท"
                  : "📌 รอ"}
              </span>
            )}
          </div>
          {manga.alt_title && (
            <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">
              {manga.alt_title}
            </p>
          )}

          {/* Tags */}
          {manga.tags && manga.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {manga.tags.slice(0, 3).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick?.(tag);
                  }}
                  className="text-[9px] font-medium bg-[#1F2E45]/80 hover:bg-violet-600/80 text-violet-300 hover:text-white px-1.5 py-0.5 rounded border border-violet-500/20 transition-colors"
                >
                  #{tag}
                </button>
              ))}
              {manga.tags.length > 3 && (
                <span className="text-[9px] text-gray-400 self-center">
                  +{manga.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-3 pt-2.5 border-t border-[#1F2E45]/60 flex items-center gap-2">
          {/* Read Current Chapter */}
          <button
            onClick={handleOpenReader}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-xs font-semibold bg-[#1C2638] hover:bg-violet-600/80 text-gray-200 hover:text-white border border-[#1F2E45] transition active:scale-95"
            title={`เปิดอ่านตอนปัจจุบัน (ตอนที่ ${manga.current_chapter})`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>ตอนที่ {manga.current_chapter}</span>
          </button>

          {/* Smart +1 & Open Next Chapter */}
          <button
            onClick={handleOpenNext}
            className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black transition active:scale-95 shadow shrink-0 ${
              hasNewChapter
                ? "bg-gradient-to-r from-orange-500 via-rose-500 to-pink-600 hover:from-orange-600 hover:to-rose-600 text-white shadow-orange-500/30 animate-pulse border border-orange-300/30"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
            }`}
            title={`เปิดอ่านตอนถัดไป (+1 เป็นตอนที่ ${manga.current_chapter + 1} และเปิดหน้าเว็บทันที)`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>เปิด ช.{manga.current_chapter + 1}</span>
          </button>

          {/* Quick Sync to Latest Chapter Button */}
          {hasNewChapter && onSyncToLatest && unreadCount > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSyncToLatest(manga.id, manga.latest_available_chapter!);
              }}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 text-white shadow shadow-orange-500/30 transition active:scale-90 shrink-0"
              title={`อ่านถึงตอนล่าสุดแล้ว: ข้ามไปตอนที่ ${manga.latest_available_chapter} ทันที`}
            >
              <Zap className="w-3.5 h-3.5 fill-current text-yellow-200" />
              <span>ช.{manga.latest_available_chapter}</span>
            </button>
          )}

          {/* +1 Only Button */}
          <button
            onClick={handleIncrement}
            className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-90 ${
              justIncremented
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/30"
                : "bg-[#1E2B45] hover:bg-violet-600 text-gray-200 hover:text-white"
            }`}
            title="อ่านจบตอนนี้แล้ว กดบวก 1 ตอน (ไม่ออกไปหน้าเว็บ)"
          >
            {justIncremented ? (
              <Check className="w-3.5 h-3.5 animate-bounce" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>+1</span>
          </button>
        </div>
      </div>
    </div>
  );
};
