"use client";

import React, { useState } from "react";
import { Manga } from "@/types/manga";
import { ExternalLink, Plus, Globe, Check } from "lucide-react";

interface MangaCardProps {
  manga: Manga;
  onSelect: (manga: Manga) => void;
  onIncrement: (id: string) => void;
}

export const MangaCard: React.FC<MangaCardProps> = ({
  manga,
  onSelect,
  onIncrement,
}) => {
  const [justIncremented, setJustIncremented] = useState(false);
  const [imgError, setImgError] = useState(false);

  const primarySource =
    manga.sources.find((s) => s.is_primary) || manga.sources[0];
  const otherSourcesCount = Math.max(0, manga.sources.length - 1);

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
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
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

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-1.5 pointer-events-none">
          {/* Chapter & Update Badges */}
          <div className="flex flex-col gap-1 items-start shrink-0">
            {manga.latest_available_chapter && manga.latest_available_chapter > manga.current_chapter ? (
              <>
                <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-lg shadow-orange-500/40 flex items-center gap-1 animate-pulse">
                  🔥 ตอนใหม่! ช.{manga.latest_available_chapter}
                </span>
                <span className="bg-black/80 backdrop-blur-md text-gray-300 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                  อ่านถึง ช.{manga.current_chapter}
                </span>
              </>
            ) : (
              <span className="bg-violet-600/90 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md shrink-0">
                ตอนที่ {manga.current_chapter}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Category Badge */}
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

            {/* Tier or Status */}
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

        {/* Action Buttons: 1-Tap Read & +1 Chapter */}
        <div className="mt-3 pt-2.5 border-t border-[#1F2E45]/60 flex items-center gap-2">
          {/* 1-Tap Read Button */}
          <button
            onClick={handleOpenReader}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
              manga.latest_available_chapter && manga.latest_available_chapter > manga.current_chapter
                ? "bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white font-bold shadow-md shadow-orange-500/30"
                : "bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/30 hover:border-violet-500"
            }`}
            title="เปิดอ่านตอนปัจจุบันทันที"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>
              {manga.latest_available_chapter && manga.latest_available_chapter > manga.current_chapter
                ? `อ่านต่อ (ช.${manga.current_chapter + 1})`
                : "อ่านต่อ"}
            </span>
          </button>

          {/* +1 Quick Increment Button */}
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
