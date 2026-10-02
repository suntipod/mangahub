"use client";

import React, { useState, useEffect } from "react";
import { Manga, MangaSource, ReadingStatus, TierRating } from "@/types/manga";
import {
  X,
  ExternalLink,
  Plus,
  Minus,
  Star,
  Trash2,
  Globe,
  Link as LinkIcon,
  Check,
  AlertCircle,
  Flame,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
  Search,
  ClipboardPaste,
  Zap,
  Tag,
  Sparkles,
} from "lucide-react";
import { computeNextChapterUrl, checkMangaOnlineUpdate } from "@/lib/storage";
import { getStoredCategories } from "@/lib/categories";

interface MangaDetailModalProps {
  manga: Manga | null;
  onClose: () => void;
  onUpdate: (updated: Manga) => void;
  onDelete: (id: string) => void;
}

export const MangaDetailModal: React.FC<MangaDetailModalProps> = ({
  manga,
  onClose,
  onUpdate,
  onDelete,
}) => {
  if (!manga) return null;

  const [currentChapter, setCurrentChapter] = useState(manga.current_chapter);
  const [status, setStatus] = useState<ReadingStatus>(manga.status);
  const [tier, setTier] = useState<TierRating>(manga.tier);
  const [category, setCategory] = useState<string>(manga.category || "การ์ตูนทั่วไป");
  const [tags, setTags] = useState<string[]>(manga.tags || []);
  const [newTagInput, setNewTagInput] = useState("");
  const [availableCategories] = useState<string[]>(getStoredCategories());
  const [notes, setNotes] = useState(manga.notes || "");
  const [sources, setSources] = useState<MangaSource[]>(manga.sources);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [showAddSource, setShowAddSource] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);


  // Cover image states
  const [coverUrl, setCoverUrl] = useState(manga.cover_url || "");
  const [displayCover, setDisplayCover] = useState(manga.cover_url || "");
  const [triedDetailProxy, setTriedDetailProxy] = useState(false);
  const [coverImgError, setCoverImgError] = useState(false);

  useEffect(() => {
    setDisplayCover(coverUrl);
    setTriedDetailProxy(false);
    setCoverImgError(false);
  }, [coverUrl]);

// Helper to clean raw title into clean English/Romaji or pure title for search
function getCleanCoverSearchTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  const enMatch = rawTitle.match(/[a-zA-Z0-9\s':,-]{3,}/g);
  if (enMatch && enMatch[0].trim().length >= 3) {
    return enMatch[0].replace(/[-_:]/g, " ").replace(/\s+/g, " ").trim();
  }
  return rawTitle
    .replace(/(?:ตอนที่|ch|chapter|ep|episode)\s*\d+(?:\.\d+)?/gi, "")
    .replace(/แปลไทย|จบแล้ว|จบss\d*|มังงะออนไลน์|อ่านออนไลน์|มังฮวา|มังงะ/gi, "")
    .replace(/\((?:Remake|นิยาย|ฉบับการ์ตูน|มังงะ)[^)]*\)/gi, "")
    .replace(/[-–|•]\s*[\w\s.-]+(?:com|net|org|xyz|to|in|co|app)\s*$/gi, "")
    .replace(/[-_:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

  // Synchronize state when manga prop changes
  useEffect(() => {
    if (manga) {
      setCurrentChapter(manga.current_chapter);
      setStatus(manga.status);
      setTier(manga.tier);
      setCategory(manga.category || "การ์ตูนทั่วไป");
      setTags(manga.tags || []);
      setNotes(manga.notes || "");
      setSources(manga.sources || []);
      setCoverUrl(manga.cover_url || "");
      setDisplayCover(manga.cover_url || "");
      setLatestChapter(manga.latest_available_chapter);
      setSearchCoverQuery(getCleanCoverSearchTitle(manga.title));
    }
  }, [manga]);

  const [searchCoverQuery, setSearchCoverQuery] = useState(
    manga ? getCleanCoverSearchTitle(manga.title) : ""
  );
  const [isSearchingCover, setIsSearchingCover] = useState(false);
  const [isAutoFetchingCover, setIsAutoFetchingCover] = useState(false);
  const [autoFetchMsg, setAutoFetchMsg] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const [coverResults, setCoverResults] = useState<
    Array<{ title: string; coverUrl: string; source: string }>
  >([]);
  const [showCoverSearch, setShowCoverSearch] = useState(false);

  // Chapter update states
  const [latestChapter, setLatestChapter] = useState<number | undefined>(
    manga.latest_available_chapter
  );
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateCheckMsg, setUpdateCheckMsg] = useState<{
    text: string;
    isNew: boolean;
    isError?: boolean;
  } | null>(null);

  // Search official covers from AniList, Kitsu, MangaDex & Web
  const handleSearchCovers = async () => {
    const q =
      searchCoverQuery.trim() ||
      getCleanCoverSearchTitle(manga.title) ||
      manga.title;
    if (!q) return;
    setIsSearchingCover(true);
    try {
      const res = await fetch(`/api/cover-search?title=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success && json.results) {
        setCoverResults(json.results);
      }
    } catch (err) {
      console.error("Cover search failed:", err);
    } finally {
      setIsSearchingCover(false);
    }
  };

  // 1-Click Auto Fetch Best Cover
  const handleAutoFetchCover = async () => {
    setIsAutoFetchingCover(true);
    setAutoFetchMsg(null);
    try {
      const q =
        searchCoverQuery.trim() ||
        getCleanCoverSearchTitle(manga.title) ||
        manga.title;
      const res = await fetch(`/api/cover-search?title=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success && json.bestCover) {
        setCoverUrl(json.bestCover);
        setDisplayCover(json.bestCover);
        if (json.results && json.results.length > 0) {
          setCoverResults(json.results);
        }
        setAutoFetchMsg({
          text: `✨ ดึงรูปปก HD สำเร็จแล้ว! (${json.results?.[0]?.source || "ระบบ"})`,
        });
      } else {
        setAutoFetchMsg({
          text: `⚠️ ไม่พบรูปปกที่ตรงกับชื่อเรื่องนี้ ลองพิมพ์ชื่อภาษาอังกฤษในช่องค้นหาดูครับ`,
          isError: true,
        });
      }
    } catch (err: any) {
      setAutoFetchMsg({
        text: `❌ เกิดข้อผิดพลาดในการดึงรูปปก: ${err.message}`,
        isError: true,
      });
    } finally {
      setIsAutoFetchingCover(false);
      setTimeout(() => setAutoFetchMsg(null), 4000);
    }
  };

  // Check online for newer chapters
  const handleCheckOnline = async () => {
    setCheckingUpdate(true);
    setUpdateCheckMsg(null);
    const result = await checkMangaOnlineUpdate({
      ...manga,
      current_chapter: currentChapter,
      sources,
    });
    setCheckingUpdate(false);
    if (result.foundFromWeb && result.latestChapter) {
      setLatestChapter(result.latestChapter);
      if (result.hasUpdate) {
        setUpdateCheckMsg({
          text: `พบตอนใหม่ในเว็บถึงตอนที่ ${result.latestChapter}! (คุณตามหลังอยู่ ${
            result.latestChapter - currentChapter
          } ตอน)`,
          isNew: true,
        });
      } else {
        setUpdateCheckMsg({
          text: `คุณอ่านทันตอนล่าสุดในเว็บแล้ว (ตอนที่ ${result.latestChapter})`,
          isNew: false,
        });
      }
    } else {
      setUpdateCheckMsg({
        text: `⚠️ ไม่สามารถดึงเลขตอนล่าสุดจากเว็บที่ผูกไว้ได้ในขณะนี้ (หน้าเว็บอาจมีการตั้งค่าป้องกัน หรือเปลี่ยนโครงสร้าง)`,
        isNew: false,
        isError: true,
      });
    }
  };

  // Update chapter number and recalculate source URLs
  const handleChapterChange = (newVal: number) => {
    if (newVal < 0) return;
    setCurrentChapter(newVal);
    const updatedSources = sources.map((s) => ({
      ...s,
      current_chapter_url: computeNextChapterUrl(s.current_chapter_url || s.base_url, newVal),
    }));
    setSources(updatedSources);
  };

  // Add backup source URL
  const handleAddSource = () => {
    if (!newSourceUrl.trim()) return;

    let derivedName = newSourceName.trim();
    if (!derivedName) {
      try {
        const u = new URL(newSourceUrl);
        derivedName = u.hostname.replace(/^www\./, "").split(".")[0];
        derivedName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);
      } catch {
        derivedName = "เว็บอ่านสำรอง";
      }
    }

    const newSource: MangaSource = {
      id: `src-${Date.now()}`,
      manga_id: manga.id,
      site_name: derivedName,
      base_url: newSourceUrl.trim(),
      current_chapter_url: computeNextChapterUrl(newSourceUrl.trim(), currentChapter),
      is_primary: sources.length === 0,
      is_active: true,
    };

    setSources([...sources, newSource]);
    setNewSourceUrl("");
    setNewSourceName("");
    setShowAddSource(false);
  };

  // Set primary source
  const handleSetPrimary = (sourceId: string) => {
    setSources(
      sources.map((s) => ({
        ...s,
        is_primary: s.id === sourceId,
      }))
    );
  };

  // Remove a source
  const handleRemoveSource = (sourceId: string) => {
    setSources(sources.filter((s) => s.id !== sourceId));
  };

  // Save changes
  const handleSave = async () => {
    setIsSaving(true);
    const updated: Manga = {
      ...manga,
      cover_url: coverUrl.trim(),
      current_chapter: currentChapter,
      latest_available_chapter: latestChapter,
      status,
      tier,
      category,
      tags,
      notes,
      sources,
      last_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      await onUpdate(updated);
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setIsSaving(false);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-[#111827] border border-[#1F2E45] rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2E45]/80 bg-[#0E1524]">
          <h2 className="text-base font-bold text-white line-clamp-1">
            รายละเอียดเรื่อง & จัดการเว็บอ่าน
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#1A263D] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Top Info Banner */}
          <div className="flex gap-4 items-start">
            <div className="w-24 sm:w-28 aspect-[3/4] rounded-2xl overflow-hidden bg-[#0A0E17] border border-[#1F2E45] shrink-0 shadow-lg relative group">
              {displayCover && !coverImgError ? (
                <img
                  src={displayCover}
                  alt={manga.title}
                  referrerPolicy="no-referrer"
                  onError={() => {
                    if (
                      !triedDetailProxy &&
                      displayCover &&
                      !displayCover.startsWith("/api/image-proxy") &&
                      !displayCover.startsWith("data:")
                    ) {
                      setTriedDetailProxy(true);
                      setDisplayCover(`/api/image-proxy?url=${encodeURIComponent(displayCover)}`);
                    } else {
                      setCoverImgError(true);
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-600">
                  <Globe className="w-8 h-8" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-white leading-snug">
                {manga.title}
              </h1>
              {manga.alt_title && (
                <p className="text-xs text-gray-400 mt-0.5">{manga.alt_title}</p>
              )}

              {/* Status Selector Buttons */}
              <div className="mt-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  สถานะการอ่าน:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "reading", label: "กำลังอ่าน", icon: "📖", activeClass: "bg-emerald-600 text-white shadow-emerald-600/40 border-emerald-400" },
                    { id: "on_hold", label: "ดองไว้ก่อน", icon: "⏳", activeClass: "bg-amber-600 text-white shadow-amber-600/40 border-amber-400" },
                    { id: "completed", label: "อ่านจบแล้ว", icon: "✅", activeClass: "bg-blue-600 text-white shadow-blue-600/40 border-blue-400" },
                    { id: "dropped", label: "ดรอป/เทแล้ว", icon: "🛑", activeClass: "bg-rose-700 text-white shadow-rose-700/40 border-rose-500" },
                    { id: "plan_to_read", label: "อยากอ่าน", icon: "📌", activeClass: "bg-purple-700 text-white shadow-purple-700/40 border-purple-500" },
                  ].map((st) => {
                    const isSelected = status === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setStatus(st.id as ReadingStatus)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 ${
                          isSelected
                            ? `${st.activeClass} shadow-md`
                            : "bg-[#141E33] border-[#1F2E45] text-gray-400 hover:text-gray-200 hover:border-gray-600"
                        }`}
                      >
                        <span>{st.icon}</span>
                        <span>{st.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tier & Category Selectors */}
              <div className="mt-2.5 flex flex-wrap gap-2 items-center">


                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value as TierRating)}
                  className="bg-[#182338] border border-[#233554] text-xs font-bold rounded-xl px-2.5 py-1.5 text-amber-300 outline-none"
                >
                  <option value="none">⭐ Tier (ไม่ระบุ)</option>
                  <option value="S">👑 Tier S (ดีเยี่ยม)</option>
                  <option value="A">🔥 Tier A (สนุกมาก)</option>
                  <option value="B">✨ Tier B (สนุกดี)</option>
                  <option value="C">👍 Tier C (พอใช้)</option>
                </select>

                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-[#182338] border border-[#233554] text-xs font-bold rounded-xl px-2.5 py-1.5 text-violet-300 outline-none"
                >
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.toLowerCase().includes("dojin")
                        ? "🔞 "
                        : cat.toLowerCase().includes("ntr")
                        ? "💔 "
                        : "📚 "}
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cover Action Buttons */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFetchCover}
                  disabled={isAutoFetchingCover}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-white bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 hover:from-amber-500/30 border border-amber-500/40 px-3 py-1.5 rounded-xl transition active:scale-95 shadow-sm disabled:opacity-50"
                  title="ดึงรูปปก HD ที่ดีที่สุดจากเน็ตมาใส่เรื่องนี้ทันทีโดยไม่ต้องค้นหาเอง"
                >
                  {isAutoFetchingCover ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                  )}
                  <span>
                    {isAutoFetchingCover ? "กำลังดึงรูปปก..." : "⚡ ดึงรูปปก HD อัตโนมัติ"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextState = !showCoverSearch;
                    setShowCoverSearch(nextState);
                    if (nextState && coverResults.length === 0) {
                      handleSearchCovers();
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-white bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 px-3 py-1.5 rounded-xl transition"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                  <span>{showCoverSearch ? "ซ่อนเมนูค้นหาปก" : "🖼️ เลือกรูปปกเอง"}</span>
                </button>
              </div>

              {/* Auto Fetch Feedback Message */}
              {autoFetchMsg && (
                <div
                  className={`mt-2 p-2 rounded-xl text-xs font-semibold animate-fade-in ${
                    autoFetchMsg.isError
                      ? "bg-rose-950/40 border border-rose-500/30 text-rose-300"
                      : "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                  }`}
                >
                  {autoFetchMsg.text}
                </div>
              )}
            </div>
          </div>

          {/* Cover Search Box (AniList + Kitsu + MangaDex + Web) */}
          {showCoverSearch && (
            <div className="bg-[#141E33] border border-violet-500/40 rounded-2xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-violet-400" />
                    <span>ค้นหารูปปกสวยๆ จาก AniList, Kitsu, MangaDex & Web HD</span>
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    แตะที่รูปเพื่อเลือกเป็นภาพปกของการ์ตูนเรื่องนี้ทันที
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchCoverQuery}
                  onChange={(e) => setSearchCoverQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchCovers()}
                  placeholder="พิมพ์ชื่อเรื่องภาษาอังกฤษหรือคำค้นหา..."
                  className="flex-1 bg-[#0B0F19] border border-[#1F2E45] rounded-xl px-3 py-2 text-xs text-gray-200 outline-none focus:border-violet-500 placeholder-gray-500"
                />
                <button
                  type="button"
                  onClick={handleSearchCovers}
                  disabled={isSearchingCover}
                  className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-violet-600/30 disabled:opacity-50"
                >
                  {isSearchingCover ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>ค้นหา</span>
                </button>
              </div>

              {/* Cover Candidates Grid */}
              {coverResults.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 pt-1">
                  {coverResults.map((r, idx) => (
                    <div
                      key={idx}
                      onClick={() => setCoverUrl(r.coverUrl)}
                      className={`group/cover relative aspect-[2/3] rounded-xl overflow-hidden border cursor-pointer transition active:scale-95 shadow ${
                        coverUrl === r.coverUrl
                          ? "border-emerald-500 ring-2 ring-emerald-500/60"
                          : "border-[#1F2E45] hover:border-violet-400"
                      }`}
                    >
                      <img
                        src={r.coverUrl}
                        alt={r.title}
                        className="w-full h-full object-cover group-hover/cover:scale-105 transition duration-300"
                      />
                      {coverUrl === r.coverUrl && (
                        <div className="absolute inset-0 bg-emerald-950/60 flex items-center justify-center">
                          <Check className="w-6 h-6 text-emerald-400 drop-shadow-md" />
                        </div>
                      )}
                      <span
                        className={`absolute bottom-1 left-1 right-1 text-[9px] px-1 py-0.5 rounded text-center truncate font-bold shadow ${
                          r.source.includes("AniList")
                            ? "bg-blue-950/90 text-blue-200 border border-blue-700/50"
                            : r.source.includes("Kitsu")
                            ? "bg-purple-950/90 text-purple-200 border border-purple-700/50"
                            : r.source.includes("MangaDex")
                            ? "bg-orange-950/90 text-orange-200 border border-orange-700/50"
                            : "bg-emerald-950/90 text-emerald-200 border border-emerald-700/50"
                        }`}
                      >
                        {r.source}
                      </span>
                    </div>
                  ))}
                </div>
              ) : isSearchingCover ? (
                <div className="py-6 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  <span>กำลังค้นหาภาพปกความละเอียดสูง...</span>
                </div>
              ) : null}

              {/* Custom Direct URL Input */}
              <div className="pt-1">
                <input
                  type="text"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="หรือวางลิงก์รูปภาพโดยตรง (https://...)"
                  className="w-full bg-[#0B0F19] border border-[#1F2E45] rounded-xl px-3 py-1.5 text-xs text-gray-300 outline-none font-mono placeholder-gray-600"
                />
              </div>
            </div>
          )}

          {/* Chapter Quick Counter */}
          <div className="bg-[#141E33] border border-[#1F2E45] rounded-2xl p-4">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              ตอนล่าสุดที่คุณอ่านถึง
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleChapterChange(currentChapter - 1)}
                className="w-10 h-10 rounded-xl bg-[#1C2940] hover:bg-[#253754] text-gray-200 flex items-center justify-center transition active:scale-95"
              >
                <Minus className="w-4 h-4" />
              </button>

              <div className="flex-1 flex items-center justify-center bg-[#0B0F19] border border-[#1F2E45] rounded-xl py-2 px-3">
                <span className="text-xs text-gray-400 mr-2">ตอนที่</span>
                <input
                  type="number"
                  value={currentChapter}
                  onChange={(e) => handleChapterChange(parseFloat(e.target.value) || 0)}
                  className="w-20 bg-transparent text-xl font-extrabold text-violet-400 text-center outline-none"
                />
              </div>

              <button
                onClick={() => handleChapterChange(currentChapter + 1)}
                className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg shadow-violet-600/30 transition active:scale-95"
              >
                <Plus className="w-5 h-5 font-bold" />
              </button>
            </div>

            {/* Quick Button to Open Next Chapter (+1 & Read) */}
            <button
              type="button"
              onClick={() => {
                const nextCh = currentChapter + 1;
                handleChapterChange(nextCh);
                const primary = sources.find((s) => s.is_primary) || sources[0];
                if (primary) {
                  const nextUrl = computeNextChapterUrl(primary.current_chapter_url || primary.base_url, nextCh);
                  window.open(nextUrl, "_blank", "noopener,noreferrer");
                }
              }}
              className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition active:scale-98"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>เปิดอ่านตอนถัดไป (ช.{currentChapter + 1}) ทันที 🚀</span>
            </button>

            {/* Quick Button to Jump to Latest Available Chapter */}
            {latestChapter !== undefined && latestChapter > currentChapter && (
              <button
                type="button"
                onClick={() => handleChapterChange(latestChapter)}
                className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 hover:from-amber-500/30 border border-orange-500/40 rounded-xl text-xs font-bold text-orange-300 hover:text-white transition active:scale-98 shadow-sm"
              >
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span>
                  อ่านทันตอนล่าสุดแล้ว: ข้ามไปตอนที่ {latestChapter} ทันที ({latestChapter - currentChapter} ตอน)
                </span>
              </button>
            )}
          </div>

          {/* Latest Available Chapter from Web & Online Checker */}
          <div className="bg-[#141E33] border border-[#1F2E45] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span>ตอนล่าสุดบนเว็บ (Update Status)</span>
                </label>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  ตรวจสอบว่าเว็บที่ผูกไว้ปล่อยตอนใหม่ออกมาหรือยัง
                </p>
              </div>

              <button
                type="button"
                onClick={handleCheckOnline}
                disabled={checkingUpdate}
                className="flex items-center gap-1.5 bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-md shadow-orange-500/20 transition active:scale-95 disabled:opacity-50"
              >
                {checkingUpdate ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>{checkingUpdate ? "กำลังตรวจ..." : "ตรวจหาตอนล่าสุด"}</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center justify-between bg-[#0B0F19] border border-[#1F2E45] rounded-xl py-2 px-3">
                <span className="text-xs text-gray-400">ตอนล่าสุดในเว็บ:</span>
                <input
                  type="number"
                  placeholder="ยังไม่ได้เช็ค"
                  value={latestChapter ?? ""}
                  onChange={(e) => setLatestChapter(parseFloat(e.target.value) || undefined)}
                  className="w-24 bg-transparent text-sm font-bold text-orange-400 text-right outline-none"
                />
              </div>

              {latestChapter && latestChapter > currentChapter && (
                <button
                  type="button"
                  onClick={() => handleChapterChange(latestChapter)}
                  className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold transition active:scale-95 shrink-0"
                  title="ปรับเลขตอนที่คุณอ่านให้ทันตอนล่าสุด"
                >
                  ⏩ ปรับเป็นตอนล่าสุด
                </button>
              )}
            </div>

            {updateCheckMsg && (
              <div
                className={`p-2.5 rounded-xl text-xs font-medium ${
                  updateCheckMsg.isError
                    ? "bg-rose-950/40 border border-rose-500/30 text-rose-300"
                    : updateCheckMsg.isNew
                    ? "bg-orange-950/40 border border-orange-500/30 text-orange-300"
                    : "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                }`}
              >
                {updateCheckMsg.text}
              </div>
            )}
          </div>

          {/* Multi-Source Hub (แก้ปัญหาเว็บปลิว) */}
          <div className="bg-[#141E33] border border-[#1F2E45] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-violet-400" />
                  <span>เว็บอ่านการ์ตูนที่ผูกไว้ (Multi-Sources)</span>
                </h3>
                <p className="text-[11px] text-gray-400">
                  ผูกไว้หลายเว็บ ถ้าเว็บไหนปลิวหรือล่ม สามารถกดอ่านเว็บสำรองได้ทันที
                </p>
              </div>
              <button
                onClick={() => setShowAddSource(!showAddSource)}
                className="text-xs font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มเว็บสำรอง</span>
              </button>
            </div>

            {/* Source List */}
            <div className="space-y-2">
              {sources.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition ${
                    s.is_primary
                      ? "bg-violet-950/20 border-violet-500/40"
                      : "bg-[#0F1626] border-[#1F2E45]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm font-semibold text-gray-200">
                      {s.site_name}
                    </span>
                    {s.is_primary ? (
                      <span className="text-[10px] bg-violet-600/30 text-violet-300 px-2 py-0.5 rounded-full font-bold border border-violet-500/40">
                        เว็บหลัก (1-Tap Read)
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSetPrimary(s.id)}
                        className="text-[10px] text-gray-400 hover:text-violet-300 underline"
                      >
                        ตั้งเป็นเว็บหลัก
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={s.current_chapter_url || s.base_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-[#182338] hover:bg-violet-600 text-gray-300 hover:text-white transition"
                      title="ทดสอบเปิดอ่านเว็บนี้"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {sources.length > 1 && (
                      <button
                        onClick={() => handleRemoveSource(s.id)}
                        className="p-1.5 rounded-lg hover:bg-red-950/40 text-gray-400 hover:text-red-400 transition"
                        title="ลบเว็บนี้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Source Form */}
            {showAddSource && (
              <div className="bg-[#0B0F19] border border-[#1F2E45] rounded-xl p-3 space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300">
                    เพิ่มลิงก์เว็บอ่านเรื่องนี้:
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          const match = text.match(/(https?:\/\/[^\s]+)/i);
                          setNewSourceUrl(match ? match[1] : text.trim());
                        }
                      } catch {}
                    }}
                    className="text-[11px] font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1 bg-violet-600/20 hover:bg-violet-600/30 px-2 py-0.5 rounded-lg border border-violet-500/30 transition active:scale-95"
                    title="วางลิงก์จากคลิปบอร์ดทันที"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>วางจากคลิปบอร์ด</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="URL เว็บอ่าน (เช่น https://...)"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    className="flex-1 bg-[#131B2E] border border-[#1F2E45] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-violet-500"
                  />
                  <input
                    type="text"
                    placeholder="ชื่อเว็บ (ไม่บังคับ)"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    className="w-28 bg-[#131B2E] border border-[#1F2E45] rounded-lg px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-violet-500"
                  />
                  <button
                    onClick={handleAddSource}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                  >
                    เพิ่ม
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Custom Tags Section */}
          <div className="bg-[#141E33] border border-[#1F2E45] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                <span>แท็กส่วนตัว (Custom Tags)</span>
              </label>
              <span className="text-[10px] text-gray-400">ใช้ค้นหาหรือกรองแนวเรื่อง</span>
            </div>

            {/* Existing Tags Chips */}
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {tags.length > 0 ? (
                tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 bg-cyan-950/50 border border-cyan-700/50 text-cyan-300 text-xs px-2.5 py-1 rounded-xl font-medium"
                  >
                    <span>#{t}</span>
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((item) => item !== t))}
                      className="hover:text-red-400 transition ml-0.5"
                      title="ลบแท็กนี้"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-500 italic">ยังไม่มีแท็ก (เลือกจากด้านล่างหรือพิมพ์เพิ่มได้เลย)</span>
              )}
            </div>

            {/* Add Tag Input */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const clean = newTagInput.trim().replace(/^#/, "");
                    if (clean && !tags.includes(clean)) {
                      setTags([...tags, clean]);
                      setNewTagInput("");
                    }
                  }
                }}
                placeholder="พิมพ์แท็กใหม่ เช่น พระเอกเทพ, ทำฟาร์ม..."
                className="flex-1 bg-[#0B0F19] border border-[#1F2E45] rounded-xl px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-cyan-500 placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => {
                  const clean = newTagInput.trim().replace(/^#/, "");
                  if (clean && !tags.includes(clean)) {
                    setTags([...tags, clean]);
                    setNewTagInput("");
                  }
                }}
                className="bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-300 font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1 active:scale-95 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่ม</span>
              </button>
            </div>

            {/* Quick Popular Tags */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[10px] text-gray-400 self-center mr-1">แท็กแนะนำ:</span>
              {["พระเอกเทพ", "เกิดใหม่", "ทำฟาร์ม", "ลงดันเจี้ยน", "คอมเมดี้", "ต่างโลก", "แก้แค้น", "โรแมนติก", "ดราม่า", "แฟนตาซี"].map(
                (quickTag) => (
                  <button
                    key={quickTag}
                    type="button"
                    onClick={() => {
                      if (!tags.includes(quickTag)) {
                        setTags([...tags, quickTag]);
                      }
                    }}
                    disabled={tags.includes(quickTag)}
                    className={`text-[10px] px-2 py-0.5 rounded-lg border transition ${
                      tags.includes(quickTag)
                        ? "bg-cyan-950/20 border-cyan-900/30 text-cyan-500/50 cursor-default"
                        : "bg-[#0E1524] border-[#1F2E45] text-gray-300 hover:text-cyan-300 hover:border-cyan-500/40 active:scale-95"
                    }`}
                  >
                    +{quickTag}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Notes Section (Private Notes / Memo) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>📝 บันทึกช่วยจำส่วนตัว (Private Memo)</span>
              </label>
              {notes && (
                <button
                  type="button"
                  onClick={() => setNotes("")}
                  className="text-[10px] text-gray-400 hover:text-red-400 transition"
                >
                  ล้างข้อความ
                </button>
              )}
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="บันทึกช่วยจำ เช่น พักไว้รอแปลจบภาค 1, พระเอกกำลังบุกดันเจี้ยนชั้น 50, หยุดรอตอนที่ 150..."
              rows={2}
              className="w-full bg-[#141E33] border border-[#1F2E45] rounded-xl p-3 text-xs text-gray-200 outline-none focus:border-violet-500 resize-none"
            />

            {/* Quick Memo Suggestion Chips */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="text-[10px] text-gray-400 self-center mr-1">ข้อความด่วน:</span>
              {[
                "⏳ พักไว้รอแปลจบภาค 1",
                "🛑 หยุดรอตอนที่ 150 ค่อยอ่านต่อ",
                "⚔️ พระเอกกำลังบุกดันเจี้ยน",
                "✨ เรื่องโปรด สนุกมาก ห้ามลืมอ่าน",
                "⚠️ เว็บแปลหยุดแปลชั่วคราว",
                "🔥 รอแปลอังกฤษ / รวมเล่ม",
              ].map((memo) => (
                <button
                  key={memo}
                  type="button"
                  onClick={() => {
                    if (!notes) {
                      setNotes(memo);
                    } else if (!notes.includes(memo)) {
                      setNotes(`${notes} • ${memo}`);
                    }
                  }}
                  className="text-[10px] px-2 py-0.5 rounded-lg border border-[#1F2E45] bg-[#0E1524] text-amber-200/90 hover:text-amber-200 hover:border-amber-500/40 hover:bg-amber-950/20 transition active:scale-95"
                >
                  +{memo}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#1F2E45] bg-[#0E1524]">
          <button
            onClick={() => {
              if (confirm(`คุณต้องการลบ "${manga.title}" ออกจากชั้นหนังสือใช่หรือไม่?`)) {
                onDelete(manga.id);
                onClose();
              }
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 py-1.5 px-2 rounded-lg transition hover:bg-red-950/30"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>ลบเรื่องนี้</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-60 shadow-md shadow-violet-600/30 transition active:scale-95"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>กำลังบันทึกลงฐานข้อมูล...</span>
                </>
              ) : savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>บันทึกสำเร็จเรียบร้อย!</span>
                </>
              ) : (
                <span>บันทึกการเปลี่ยนแปลง</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
