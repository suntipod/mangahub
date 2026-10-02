"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Manga } from "@/types/manga";
import {
  X,
  Dices,
  Sparkles,
  Zap,
  BookOpen,
  RefreshCw,
  Flame,
  ExternalLink,
  Info,
} from "lucide-react";

interface RandomPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mangas: Manga[];
  onOpenReader: (manga: Manga) => void;
  onSelectManga?: (manga: Manga) => void;
  isDiscreetMode?: boolean;
}

type PoolFilter = "tier_sa_onhold" | "has_update" | "all_onhold" | "all";

export const RandomPickerModal: React.FC<RandomPickerModalProps> = ({
  isOpen,
  onClose,
  mangas,
  onOpenReader,
  onSelectManga,
  isDiscreetMode = false,
}) => {
  const [filterMode, setFilterMode] = useState<PoolFilter>("tier_sa_onhold");
  const [isRolling, setIsRolling] = useState(false);
  const [pickedManga, setPickedManga] = useState<Manga | null>(null);
  const [shuffleTitle, setShuffleTitle] = useState("");
  const [shuffleCover, setShuffleCover] = useState("");

  const rollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Filter pool candidates based on chosen filter
  const candidatePool = useMemo(() => {
    if (mangas.length === 0) return [];

    if (filterMode === "tier_sa_onhold") {
      // 1st priority: Tier S or A that are on_hold
      const onHoldTierSA = mangas.filter(
        (m) => (m.tier === "S" || m.tier === "A") && m.status === "on_hold"
      );
      if (onHoldTierSA.length > 0) return onHoldTierSA;

      // 2nd priority: Tier S or A that are reading or plan_to_read
      const anyTierSA = mangas.filter(
        (m) => (m.tier === "S" || m.tier === "A") && m.status !== "dropped"
      );
      if (anyTierSA.length > 0) return anyTierSA;

      // Fallback: any on_hold
      const anyOnHold = mangas.filter((m) => m.status === "on_hold");
      if (anyOnHold.length > 0) return anyOnHold;

      return mangas;
    }

    if (filterMode === "has_update") {
      const withUpdate = mangas.filter(
        (m) => m.latest_available_chapter && m.latest_available_chapter > m.current_chapter
      );
      return withUpdate.length > 0 ? withUpdate : mangas;
    }

    if (filterMode === "all_onhold") {
      const onHold = mangas.filter((m) => m.status === "on_hold");
      return onHold.length > 0 ? onHold : mangas;
    }

    return mangas;
  }, [mangas, filterMode]);

  // Execute roll logic
  const handleRoll = () => {
    if (candidatePool.length === 0) return;
    if (isRolling) return;

    setIsRolling(true);

    let counter = 0;
    const maxSteps = 16;
    const intervalTime = 70;

    if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);

    rollIntervalRef.current = setInterval(() => {
      counter++;
      const randomIndex = Math.floor(Math.random() * candidatePool.length);
      const randomItem = candidatePool[randomIndex];
      setShuffleTitle(randomItem.title);
      setShuffleCover(randomItem.cover_url || "");

      if (counter >= maxSteps) {
        if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
        // Final pick: avoid picking the exact same one if pool has > 1
        let finalIndex = Math.floor(Math.random() * candidatePool.length);
        if (candidatePool.length > 1 && pickedManga && candidatePool[finalIndex].id === pickedManga.id) {
          finalIndex = (finalIndex + 1) % candidatePool.length;
        }
        const winner = candidatePool[finalIndex];
        setPickedManga(winner);
        setShuffleTitle(winner.title);
        setShuffleCover(winner.cover_url || "");
        setIsRolling(false);
      }
    }, intervalTime);
  };

  // Trigger initial roll when modal opens
  useEffect(() => {
    if (isOpen && mangas.length > 0) {
      handleRoll();
    } else {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      setIsRolling(false);
    }
    return () => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
    };
  }, [isOpen, filterMode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#0D1322] border border-violet-500/30 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1F2E45] bg-gradient-to-r from-violet-950/40 via-[#101726] to-[#0D1322] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
              <Dices className={`w-5 h-5 ${isRolling ? "animate-spin" : ""}`} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>วันนี้อ่านเรื่องอะไรดี?</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                  Random Picker
                </span>
              </h2>
              <p className="text-xs text-gray-400">สุ่มการ์ตูนเด็ดมาให้อ่าน ไม่ต้องเสียเวลาเลือก!</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Pills Toolbar */}
        <div className="px-5 pt-3.5 pb-2 bg-[#090E1A] border-b border-[#1F2E45]/60 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
          <span className="text-[11px] font-bold text-gray-400 shrink-0 mr-1">สุ่มจาก:</span>
          <button
            onClick={() => setFilterMode("tier_sa_onhold")}
            className={`px-3 py-1 rounded-xl font-bold transition shrink-0 ${
              filterMode === "tier_sa_onhold"
                ? "bg-amber-500 text-black shadow-md shadow-amber-500/30"
                : "bg-[#141C30] text-gray-300 hover:text-white border border-[#1F2E45]"
            }`}
          >
            ⭐ Tier S/A ที่ดองไว้
          </button>
          <button
            onClick={() => setFilterMode("has_update")}
            className={`px-3 py-1 rounded-xl font-bold transition shrink-0 flex items-center gap-1 ${
              filterMode === "has_update"
                ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                : "bg-[#141C30] text-gray-300 hover:text-white border border-[#1F2E45]"
            }`}
          >
            <Flame className="w-3 h-3 text-orange-400" />
            <span>มีตอนใหม่</span>
          </button>
          <button
            onClick={() => setFilterMode("all_onhold")}
            className={`px-3 py-1 rounded-xl font-bold transition shrink-0 ${
              filterMode === "all_onhold"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "bg-[#141C30] text-gray-300 hover:text-white border border-[#1F2E45]"
            }`}
          >
            ⏳ การ์ตูนดองทั้งหมด
          </button>
          <button
            onClick={() => setFilterMode("all")}
            className={`px-3 py-1 rounded-xl font-bold transition shrink-0 ${
              filterMode === "all"
                ? "bg-gray-200 text-gray-900 shadow-md font-black"
                : "bg-[#141C30] text-gray-300 hover:text-white border border-[#1F2E45]"
            }`}
          >
            📚 ทั้งหมดในคลัง ({mangas.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 flex flex-col items-center justify-center text-center">
          {candidatePool.length === 0 ? (
            <div className="py-12 space-y-2">
              <p className="text-gray-400 text-sm">ไม่พบการ์ตูนในเงื่อนไขนี้</p>
              <button
                onClick={() => setFilterMode("all")}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition"
              >
                สลับไปสุ่มจากการ์ตูนทั้งหมด
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center">
              {/* Cover Card with Glow Animation */}
              <div
                className={`relative w-40 sm:w-48 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 ${
                  isRolling
                    ? "scale-95 blur-[1px] rotate-1 ring-4 ring-amber-500/50 animate-pulse"
                    : "scale-100 ring-4 ring-violet-500/50 shadow-violet-500/20"
                }`}
              >
                {shuffleCover || pickedManga?.cover_url ? (
                  <img
                    src={shuffleCover || pickedManga?.cover_url}
                    alt={shuffleTitle || pickedManga?.title || "Manga"}
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-cover ${
                      isDiscreetMode &&
                      (pickedManga?.category?.toLowerCase().includes("dojin") ||
                        pickedManga?.category?.toLowerCase().includes("ntr"))
                        ? "blur-md"
                        : ""
                    }`}
                  />
                ) : (
                  <div className="w-full h-full bg-[#151F33] flex items-center justify-center text-violet-400">
                    <BookOpen className="w-12 h-12" />
                  </div>
                )}

                {/* Status Badges Overlay */}
                {!isRolling && pickedManga && (
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 pointer-events-none">
                    {pickedManga.tier && pickedManga.tier !== "none" && (
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md shadow-md backdrop-blur-md ${
                          pickedManga.tier === "S"
                            ? "bg-amber-400 text-black shadow-amber-400/30"
                            : pickedManga.tier === "A"
                            ? "bg-orange-500 text-white shadow-orange-500/30"
                            : "bg-violet-600 text-white"
                        }`}
                      >
                        {pickedManga.tier === "S" ? "👑 Tier S" : `🔥 Tier ${pickedManga.tier}`}
                      </span>
                    )}

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md shadow backdrop-blur-md bg-black/75 text-gray-200">
                      {pickedManga.status === "on_hold"
                        ? "⏳ ดองไว้"
                        : pickedManga.status === "reading"
                        ? "📖 กำลังอ่าน"
                        : pickedManga.status === "completed"
                        ? "✅ อ่านจบ"
                        : "📌 อยากอ่าน"}
                    </span>
                  </div>
                )}
              </div>

              {/* Title & Info */}
              <div className="mt-4 w-full max-w-md">
                <h3
                  className={`text-base sm:text-lg font-bold text-white transition-opacity ${
                    isRolling ? "opacity-60 truncate" : "opacity-100 line-clamp-2"
                  }`}
                >
                  {shuffleTitle || pickedManga?.title || "กำลังสุ่ม..."}
                </h3>

                {!isRolling && pickedManga && (
                  <>
                    {pickedManga.alt_title && (
                      <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                        {pickedManga.alt_title}
                      </p>
                    )}

                    {/* Tags */}
                    {pickedManga.tags && pickedManga.tags.length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-1 mt-2">
                        {pickedManga.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-violet-950/60 border border-violet-500/30 text-violet-300 px-2 py-0.5 rounded-md"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Chapter Progress Info */}
                    <div className="mt-3 inline-flex items-center gap-2 bg-[#141C30] border border-[#1F2E45] px-3 py-1.5 rounded-xl text-xs">
                      <span className="text-violet-300 font-bold">
                        อ่านถึงตอนที่ {pickedManga.current_chapter}
                      </span>
                      {pickedManga.latest_available_chapter ? (
                        <>
                          <span className="text-gray-500">•</span>
                          <span className="text-gray-300 font-semibold">
                            ล่าสุดในเว็บ ช.{pickedManga.latest_available_chapter}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 w-full max-w-sm space-y-2">
                <button
                  disabled={isRolling || !pickedManga}
                  onClick={() => {
                    if (pickedManga) {
                      onClose();
                      onOpenReader(pickedManga);
                    }
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-extrabold text-sm shadow-xl shadow-violet-600/30 flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Zap className="w-4 h-4 fill-current text-amber-300" />
                  <span>
                    เปิดอ่านเรื่องนี้ทันที (ช.
                    {pickedManga
                      ? pickedManga.latest_available_chapter &&
                        pickedManga.latest_available_chapter > pickedManga.current_chapter
                        ? pickedManga.current_chapter + 1
                        : pickedManga.current_chapter
                      : 1}
                    )
                  </span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    disabled={isRolling}
                    onClick={handleRoll}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#141C30] hover:bg-[#1E2B45] text-amber-300 hover:text-amber-200 border border-amber-500/30 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
                  >
                    <Dices className={`w-4 h-4 ${isRolling ? "animate-spin" : ""}`} />
                    <span>สุ่มใหม่อีกรอบ 🎲</span>
                  </button>

                  {onSelectManga && pickedManga && (
                    <button
                      disabled={isRolling}
                      onClick={() => {
                        onClose();
                        onSelectManga(pickedManga);
                      }}
                      className="py-2.5 px-3.5 rounded-xl bg-[#141C30] hover:bg-[#1E2B45] text-gray-300 hover:text-white border border-[#1F2E45] font-semibold text-xs transition"
                      title="ดูรายละเอียดการ์ตูนเรื่องนี้"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
