"use client";

import React, { useState } from "react";
import { Manga } from "@/types/manga";
import { ExternalLink, Plus, Globe, Check, Flame, Zap, EyeOff } from "lucide-react";

interface MangaCardProps {
  manga: Manga;
  onSelect: (manga: Manga) => void;
  onIncrement: (id: string) => void;
  onSyncToLatest?: (id: string, latestChapter: number) => void;
  viewMode?: "poster" | "compact";
  isDiscreetMode?: boolean;
}

export const MangaCard: React.FC<MangaCardProps> = ({
  manga,
  onSelect,
  onIncrement,
  onSyncToLatest,
  viewMode = "poster",
  isDiscreetMode = false,
}) => {
  const [justIncremented, setJustIncremented] = useState(false);
  const [imgError, setImgError] = useState(false);

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
  const hasNewChapter = Boolean(
    manga.latest_available_chapter &&
      manga.latest_available_chapter > manga.current_chapter
  );

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    onIncrement(manga.id);
    setJustIncremented(true);
    setTimeout(() => setJustIncremented(false), 800);
  };

  const handleOpenReader = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (primarySource?.current_chapter_url) {
      window.open(primarySource.current_chapter_url, "_blank", "noopener,noreferrer");
    } else if (primarySource?.base_url) {
      window.open(primarySource.base_url, "_blank", "noopener,noreferrer");
    } else {
      onSelect(manga);
    }
  };

  // ==========================================
  // 1. POSTER VIEW (ตรงตามรูปภาพตัวอย่างเป๊ะๆ)
  // ==========================================
  if (viewMode === "poster") {
    return (
      <div
        onClick={() => onSelect(manga)}
        className="group relative aspect-[2/3] w-full bg-[#111827] border border-[#1F2E45]/80 hover:border-violet-500/80 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-violet-950/40 select-none flex flex-col justify-end"
      >
        {/* Full-Bleed Cover Image */}
        {manga.cover_url && !imgError ? (
          <img
            src={manga.cover_url}
            alt={manga.title}
            onError={() => setImgError(true)}
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
              <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow-lg shadow-orange-500/40 flex items-center gap-1 animate-pulse">
                <Flame className="w-3.5 h-3.5 fill-current" />
                <span>ช.{manga.current_chapter} / {manga.latest_available_chapter}</span>
              </span>
            ) : (
              <span className="bg-indigo-600/90 backdrop-blur-md text-white text-xs font-black px-2 py-0.5 rounded-lg shadow-md border border-indigo-400/30 flex items-center gap-1">
                <span>ช.{manga.current_chapter}</span>
                {manga.latest_available_chapter ? (
                  <span className="text-[10px] text-indigo-200 opacity-90">/ {manga.latest_available_chapter}</span>
                ) : null}
              </span>
            )}
          </div>

          {/* Right badges: Category & Tier */}
          <div className="flex items-center gap-1">
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
              <span className="bg-amber-500/90 backdrop-blur-md text-black font-extrabold text-[10px] px-1.5 py-0.5 rounded-md shadow">
                {manga.tier}
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

          {/* Quick Action Overlay (อ่านต่อ & +1) */}
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5">
            <button
              onClick={handleOpenReader}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition active:scale-95 shadow ${
                hasNewChapter
                  ? "bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 text-white shadow-orange-500/30"
                  : "bg-violet-600/80 hover:bg-violet-600 text-white backdrop-blur-sm"
              }`}
              title="เปิดอ่านทันที"
            >
              <ExternalLink className="w-3 h-3" />
              <span>
                {hasNewChapter
                  ? `อ่าน ช.${manga.current_chapter + 1}`
                  : "อ่านต่อ"}
              </span>
            </button>

            {/* Quick Sync to Latest Chapter Button */}
            {hasNewChapter && onSyncToLatest && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSyncToLatest(manga.id, manga.latest_available_chapter!);
                }}
                className="flex items-center justify-center gap-0.5 py-1.5 px-2 rounded-xl text-[10px] font-black bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 text-white shadow shadow-orange-500/30 transition active:scale-90 shrink-0"
                title={`อ่านถึงตอนล่าสุดแล้ว: ข้ามไปตอนที่ ${manga.latest_available_chapter} ทันที`}
              >
                <Zap className="w-3 h-3 fill-current text-yellow-200" />
                <span>ช.{manga.latest_available_chapter}</span>
              </button>
            )}

            <button
              onClick={handleIncrement}
              className={`flex items-center justify-center p-1.5 rounded-xl text-xs font-bold transition active:scale-90 ${
                justIncremented
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-white/10 hover:bg-violet-600 text-white border border-white/20 backdrop-blur-sm"
              }`}
              title="อ่านจบตอนนี้แล้ว กดบวก 1 ตอน"
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
      className="group relative bg-[#131B2E] hover:bg-[#162032] border border-[#1F2E45] hover:border-violet-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-violet-900/10 flex flex-col"
    >
      {/* Cover Image Container */}
      <div className="relative aspect-[3/4] w-full bg-[#0E1524] overflow-hidden">
        {manga.cover_url && !imgError ? (
          <img
            src={manga.cover_url}
            alt={manga.title}
            onError={() => setImgError(true)}
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
              <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow-lg shadow-orange-500/40 flex items-center gap-1 animate-pulse">
                <Flame className="w-3.5 h-3.5 fill-current" />
                <span>ช.{manga.current_chapter} / {manga.latest_available_chapter}</span>
              </span>
            ) : (
              <span className="bg-violet-600/90 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md shrink-0 flex items-center gap-1">
                <span>ตอนที่ {manga.current_chapter}</span>
                {manga.latest_available_chapter ? (
                  <span className="text-[10px] text-violet-200 opacity-90">/ {manga.latest_available_chapter}</span>
                ) : null}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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
              <span className="bg-amber-500/90 backdrop-blur-md text-black font-extrabold text-[11px] px-2 py-0.5 rounded-md shadow">
                Tier {manga.tier}
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
          <h3 className="text-sm font-semibold text-gray-100 line-clamp-2 leading-snug group-hover:text-violet-300 transition-colors">
            {manga.title}
          </h3>
          {manga.alt_title && (
            <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">
              {manga.alt_title}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-3 pt-2.5 border-t border-[#1F2E45]/60 flex items-center gap-2">
          <button
            onClick={handleOpenReader}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
              hasNewChapter
                ? "bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 text-white font-bold shadow-md shadow-orange-500/30"
                : "bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/30 hover:border-violet-500"
            }`}
            title="เปิดอ่านตอนปัจจุบันทันที"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>
              {hasNewChapter
                ? `อ่านต่อ (ช.${manga.current_chapter + 1})`
                : "อ่านต่อ"}
            </span>
          </button>

          {/* Quick Sync to Latest Chapter Button */}
          {hasNewChapter && onSyncToLatest && (
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

          <button
            onClick={handleIncrement}
            className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-90 ${
              justIncremented
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/30"
                : "bg-[#1E2B45] hover:bg-violet-600 text-gray-200 hover:text-white"
            }`}
            title="อ่านจบตอนนี้แล้ว กดบวก 1 ตอน"
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
