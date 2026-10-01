"use client";

import React, { useState } from "react";
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
  const [availableCategories] = useState<string[]>(getStoredCategories());
  const [notes, setNotes] = useState(manga.notes || "");
  const [sources, setSources] = useState<MangaSource[]>(manga.sources);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [showAddSource, setShowAddSource] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Cover image states
  const [coverUrl, setCoverUrl] = useState(manga.cover_url || "");
  const [searchCoverQuery, setSearchCoverQuery] = useState(manga.title);
  const [isSearchingCover, setIsSearchingCover] = useState(false);
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

  // Search official covers from AniList & MangaDex
  const handleSearchCovers = async () => {
    const q = searchCoverQuery.trim() || manga.title;
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
  const handleSave = () => {
    const updated: Manga = {
      ...manga,
      cover_url: coverUrl.trim(),
      current_chapter: currentChapter,
      latest_available_chapter: latestChapter,
      status,
      tier,
      category,
      notes,
      sources,
      last_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onUpdate(updated);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 400);
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
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={manga.title}
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

              {/* Status, Tier & Category Selectors */}
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ReadingStatus)}
                  className="bg-[#182338] border border-[#233554] text-xs font-semibold rounded-xl px-2.5 py-1.5 text-gray-200 outline-none"
                >
                  <option value="reading">🟢 กำลังอ่าน</option>
                  <option value="on_hold">🟡 ดองไว้ก่อน</option>
                  <option value="completed">🔵 อ่านจบแล้ว</option>
                  <option value="plan_to_read">⚪ มีแผนจะอ่าน</option>
                </select>

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

              {/* Toggle Cover Search Button */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !showCoverSearch;
                  setShowCoverSearch(nextState);
                  if (nextState && coverResults.length === 0) {
                    handleSearchCovers();
                  }
                }}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-white bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 px-3 py-1.5 rounded-xl transition"
              >
                <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                <span>{showCoverSearch ? "ซ่อนเมนูค้นหาปก" : "🖼️ ค้นหารูปปกสวยๆ HD"}</span>
              </button>
            </div>
          </div>

          {/* Cover Search Box (AniList + MangaDex) */}
          {showCoverSearch && (
            <div className="bg-[#141E33] border border-violet-500/40 rounded-2xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-violet-400" />
                    <span>ค้นหารูปปกสวยๆ จาก AniList & MangaDex</span>
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    แตะที่รูปเพื่อเปลี่ยนรูปปกของการ์ตูนเรื่องนี้ทันที
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchCoverQuery}
                  onChange={(e) => setSearchCoverQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchCovers()}
                  placeholder="พิมพ์ชื่อเรื่องภาษาอังกฤษหรือเกาหลี..."
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
                      <span className="absolute bottom-1 left-1 right-1 text-[9px] bg-black/85 text-gray-200 px-1 py-0.5 rounded text-center truncate">
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

            {/* Quick Button to Jump to Latest Available Chapter */}
            {latestChapter !== undefined && latestChapter > currentChapter && (
              <button
                type="button"
                onClick={() => handleChapterChange(latestChapter)}
                className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 hover:from-amber-500/30 border border-orange-500/40 rounded-xl text-xs font-bold text-orange-300 hover:text-white transition active:scale-98 shadow-sm"
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

          {/* Notes Section */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              บันทึกช่วยจำ (Notes)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="บันทึกช่วยจำ เช่น สนุกมาก, พระเอกเทพ, รอดองให้จบซีซั่น..."
              rows={2}
              className="w-full bg-[#141E33] border border-[#1F2E45] rounded-xl p-3 text-xs text-gray-200 outline-none focus:border-violet-500 resize-none"
            />
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
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-600/30 transition active:scale-95"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>บันทึกแล้ว!</span>
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
