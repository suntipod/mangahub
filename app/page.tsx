"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Manga, ReadingStatus, SupabaseConfig, DEFAULT_CATEGORIES } from "@/types/manga";
import {
  getLocalMangas,
  saveLocalMangas,
  upsertManga,
  upsertMangas,
  incrementChapter,
  setChapter,
  removeManga,
  syncWithSupabase,
  syncWithServer,
  checkMangaOnlineUpdate,
} from "@/lib/storage";
import {
  loadSupabaseConfig,
  saveSupabaseConfig,
  getSupabaseClient,
  fetchRemoteMangas,
} from "@/lib/supabase";
import { getStoredCategories } from "@/lib/categories";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { MangaCard } from "@/components/MangaCard";
import { MangaDetailModal } from "@/components/MangaDetailModal";
import { AddMangaModal } from "@/components/AddMangaModal";
import { SettingsModal } from "@/components/SettingsModal";
import {
  BookOpen,
  Plus,
  Sparkles,
  ArrowUpDown,
  BookmarkCheck,
  Clock,
  CheckCircle2,
  Flame,
  Check,
  LayoutGrid,
  StretchHorizontal,
} from "lucide-react";

export default function Home() {
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>({
    url: "",
    anonKey: "",
    enabled: false,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Online Chapter Updates State
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{ current: number; total: number } | null>(null);
  const [updateNotification, setUpdateNotification] = useState<string | null>(null);

  // Filters & Search
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [availableCategories, setAvailableCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [currentTab, setCurrentTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "title" | "chapter">("recent");
  const [viewMode, setViewMode] = useState<"poster" | "compact">("poster");
  const [isDiscreetMode, setIsDiscreetMode] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem("mangahub_view_mode") as "poster" | "compact";
      if (savedMode) setViewMode(savedMode);

      const savedDiscreet = localStorage.getItem("mangahub_discreet_mode");
      if (savedDiscreet === "true") setIsDiscreetMode(true);
    }
  }, []);

  const handleToggleViewMode = (mode: "poster" | "compact") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("mangahub_view_mode", mode);
    }
  };

  const handleToggleDiscreet = () => {
    setIsDiscreetMode((prev) => {
      const nextVal = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("mangahub_discreet_mode", String(nextVal));
      }
      return nextVal;
    });
  };

  // Modals state
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Load initial data (Local cache + Server Sync)
  useEffect(() => {
    // 1. Render local cache immediately
    const loadedMangas = getLocalMangas();
    if (loadedMangas.length > 0) {
      setMangas(loadedMangas);
    }

    // 2. Fetch and sync with Server database (also uploads any new manga from iPhone's cache!)
    syncWithServer().then((serverData) => {
      if (serverData && serverData.length > 0) {
        setMangas(serverData);
      }
    });

    const loadedConfig = loadSupabaseConfig();
    setSupabaseConfig(loadedConfig);

    // Initial background Supabase sync if enabled
    if (loadedConfig.enabled) {
      handleSync();
    }

    // Load custom categories
    setAvailableCategories(getStoredCategories());
  }, []);

  // Supabase Realtime Subscription setup
  useEffect(() => {
    const client = getSupabaseClient(supabaseConfig);
    if (!client || !supabaseConfig.enabled) return;

    // Listen to changes on mangas table
    const channel = client
      .channel("mangas-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mangas" },
        async () => {
          try {
            const remote = await fetchRemoteMangas(client);
            if (remote && remote.length > 0) {
              setMangas(remote);
              saveLocalMangas(remote);
            }
          } catch (e) {
            console.error("Realtime fetch error:", e);
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [supabaseConfig]);

  // Handle Sync (syncs with both server and Supabase)
  const handleSync = async () => {
    setIsSyncing(true);
    // 1. Sync with local server
    const serverData = await syncWithServer();
    if (serverData && serverData.length > 0) {
      setMangas(serverData);
    }
    // 2. Sync with Supabase if configured
    if (supabaseConfig.enabled) {
      const res = await syncWithSupabase();
      if (res.synced > 0) {
        setMangas(getLocalMangas());
      }
    }
    setIsSyncing(false);
  };

  // Check online updates for all mangas with linked sources
  const handleCheckAllUpdates = async () => {
    if (isCheckingUpdates || mangas.length === 0) return;
    setIsCheckingUpdates(true);
    setUpdateNotification(null);

    const candidates = mangas.filter((m) => m.sources && m.sources.length > 0);
    let newUpdatesFound = 0;
    let currentList = [...mangas];

    for (let i = 0; i < candidates.length; i++) {
      setCheckProgress({ current: i + 1, total: candidates.length });
      const manga = candidates[i];
      try {
        const res = await checkMangaOnlineUpdate(manga);
        if (res.hasUpdate && res.latestChapter > manga.current_chapter) {
          newUpdatesFound++;
          const updated: Manga = {
            ...manga,
            latest_available_chapter: res.latestChapter,
            updated_at: new Date().toISOString(),
          };
          currentList = await upsertManga(updated);
          setMangas(currentList);
        }
      } catch (err) {
        console.error("Error checking update for:", manga.title, err);
      }
      // Small pause between web requests
      await new Promise((r) => setTimeout(r, 200));
    }

    setIsCheckingUpdates(false);
    setCheckProgress(null);

    if (newUpdatesFound > 0) {
      setUpdateNotification(`🎉 ตรวจสอบเรียบร้อย! พบเรื่องที่มีตอนใหม่อัปเดต ${newUpdatesFound} เรื่อง`);
    } else {
      setUpdateNotification(`✅ ทุกเรื่องที่คุณติดตามเป็นตอนล่าสุดแล้ว ไม่มีตอนค้างอ่าน`);
    }

    setTimeout(() => {
      setUpdateNotification(null);
    }, 6000);
  };

  // Add new manga
  const handleAddManga = async (newManga: Manga) => {
    const updated = await upsertManga(newManga);
    setMangas(updated);
  };

  // Batch add multiple new mangas
  const handleAddMangas = async (newMangas: Manga[]) => {
    const updated = await upsertMangas(newMangas);
    setMangas(updated);
  };

  // Update existing manga
  const handleUpdateManga = async (updatedManga: Manga) => {
    const updated = await upsertManga(updatedManga);
    setMangas(updated);
  };

  // Quick increment chapter (+1)
  const handleIncrementChapter = async (id: string) => {
    const updated = await incrementChapter(id);
    setMangas(updated);
  };

  // Quick Sync to latest available chapter
  const handleSyncToLatest = async (id: string, latestChapter: number) => {
    const updated = await setChapter(id, latestChapter);
    setMangas(updated);
  };

  // Delete manga
  const handleDeleteManga = async (id: string) => {
    const updated = await removeManga(id);
    setMangas(updated);
  };

  // Save Supabase Config
  const handleSaveConfig = (newConfig: SupabaseConfig) => {
    setSupabaseConfig(newConfig);
    saveSupabaseConfig(newConfig);
    if (newConfig.enabled) {
      setTimeout(() => handleSync(), 100);
    }
  };

  // Filtered & Sorted Mangas
  const filteredMangas = useMemo(() => {
    return mangas
      .filter((m) => {
        // Category filter
        if (selectedCategory !== "all") {
          const mangaCategory = m.category || "การ์ตูนทั่วไป";
          if (mangaCategory !== selectedCategory) {
            return false;
          }
        }
        // Status / Update Tab filter
        if (currentTab === "has_update") {
          const hasUpdate = Boolean(
            m.latest_available_chapter && m.latest_available_chapter > m.current_chapter
          );
          if (!hasUpdate) return false;
        } else if (currentTab !== "all" && m.status !== currentTab) {
          return false;
        }
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = m.title.toLowerCase().includes(q);
          const matchAlt = m.alt_title?.toLowerCase().includes(q);
          const matchSources = m.sources.some(
            (s) =>
              s.site_name.toLowerCase().includes(q) ||
              s.base_url.toLowerCase().includes(q)
          );
          if (!matchTitle && !matchAlt && !matchSources) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "recent") {
          return new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime();
        }
        if (sortBy === "title") {
          return a.title.localeCompare(b.title, "th");
        }
        if (sortBy === "chapter") {
          return b.current_chapter - a.current_chapter;
        }
        return 0;
      });
  }, [mangas, selectedCategory, currentTab, searchQuery, sortBy]);

  // Counts for status tabs (respecting selectedCategory)
  const categoryScopedMangas = useMemo(() => {
    if (selectedCategory === "all") return mangas;
    return mangas.filter((m) => (m.category || "การ์ตูนทั่วไป") === selectedCategory);
  }, [mangas, selectedCategory]);

  const updatesCount = categoryScopedMangas.filter(
    (m) => m.latest_available_chapter && m.latest_available_chapter > m.current_chapter
  ).length;

  const readingCount = categoryScopedMangas.filter((m) => m.status === "reading").length;
  const onHoldCount = categoryScopedMangas.filter((m) => m.status === "on_hold").length;
  const completedCount = categoryScopedMangas.filter((m) => m.status === "completed").length;

  return (
    <div className="min-h-screen flex flex-col bg-[#090D16] text-gray-100 pb-24 sm:pb-12">
      {/* Header */}
      <Header
        supabaseConfig={supabaseConfig}
        isSyncing={isSyncing}
        onSync={handleSync}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAdd={() => setIsAddOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCheckUpdates={handleCheckAllUpdates}
        isCheckingUpdates={isCheckingUpdates}
        checkProgress={checkProgress}
        isDiscreetMode={isDiscreetMode}
        onToggleDiscreet={handleToggleDiscreet}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 space-y-4">
        {/* Update Notification Alert Banner */}
        {updateNotification && (
          <div className="bg-gradient-to-r from-orange-950/60 to-rose-950/60 border border-orange-500/40 text-orange-200 text-xs px-4 py-3 rounded-2xl flex items-center justify-between shadow-lg animate-fade-in">
            <span className="font-semibold">{updateNotification}</span>
            {updatesCount > 0 && currentTab !== "has_update" && (
              <button
                onClick={() => setCurrentTab("has_update")}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-[11px] px-3 py-1 rounded-xl transition shadow"
              >
                ดูเรื่องที่มีตอนใหม่ ({updatesCount})
              </button>
            )}
          </div>
        )}

        {/* Safari Tab Rescue Quick Banner */}
        <div className="relative overflow-hidden bg-gradient-to-r from-violet-950/40 via-indigo-950/30 to-[#131B2E] border border-violet-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/40 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>มีแท็บเปิดค้างใน iPhone เยอะใช่ไหม?</span>
                <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-semibold border border-violet-500/30">
                  แก้ปัญหาแท็บหาย
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                ก๊อปปี้ลิงก์หน้าเว็บที่เปิดค้างไว้มาแปะ ระบบจะดึงรูปปกและชื่อเรื่องให้ทันที จากนั้นปิดแท็บใน Safari ทิ้งได้เลย!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCheckAllUpdates}
              disabled={isCheckingUpdates}
              className="flex items-center justify-center gap-1.5 bg-[#182338] hover:bg-[#20304c] text-orange-300 border border-orange-500/30 text-xs font-bold px-3.5 py-2.5 rounded-xl shadow transition active:scale-95 shrink-0"
              title="ตรวจสอบตอนใหม่ล่าสุดจากเว็บทั้งหมด"
            >
              <Flame className={`w-4 h-4 ${isCheckingUpdates ? "animate-pulse text-orange-400" : ""}`} />
              <span>
                {isCheckingUpdates && checkProgress
                  ? `ตรวจ ${checkProgress.current}/${checkProgress.total}...`
                  : "ตรวจหาตอนใหม่"}
              </span>
            </button>

            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-violet-600/30 transition active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>กู้ชีพแท็บ Safari</span>
            </button>
          </div>
        </div>

        {/* Category Filter Toolbar */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                selectedCategory === "all"
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "bg-[#131B2E] text-gray-400 hover:text-gray-200 border border-[#1F2E45]"
              }`}
            >
              <span>🗂️ ทุกหมวดหมู่</span>
              <span className="text-[10px] opacity-75">({mangas.length})</span>
            </button>

            {availableCategories.map((cat) => {
              const isSelected = selectedCategory === cat;
              const count = mangas.filter((m) => (m.category || "การ์ตูนทั่วไป") === cat).length;
              const isDojin = cat.toLowerCase().includes("dojin") || cat.includes("โดจิน");
              const isNTR = cat.toUpperCase().includes("NTR");

              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? isDojin
                        ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                        : isNTR
                        ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                        : "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : isDojin
                      ? "bg-rose-950/30 text-rose-300 hover:bg-rose-950/50 border border-rose-800/40"
                      : isNTR
                      ? "bg-purple-950/30 text-purple-300 hover:bg-purple-950/50 border border-purple-800/40"
                      : "bg-[#131B2E] text-gray-300 hover:text-white border border-[#1F2E45]"
                  }`}
                >
                  <span>
                    {isDojin ? "🔞 " : isNTR ? "💔 " : "📚 "}
                    {cat}
                  </span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Status Tabs & Sorting Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Status Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setCurrentTab("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
                  currentTab === "all"
                    ? "bg-gray-700/80 text-white"
                    : "bg-[#101726] text-gray-400 hover:text-gray-200 border border-[#1F2E45]/80"
                }`}
              >
                สถานะทั้งหมด ({categoryScopedMangas.length})
              </button>

              {/* Has Updates Tab */}
              <button
                onClick={() => setCurrentTab("has_update")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "has_update"
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white font-bold shadow-md shadow-orange-500/30"
                    : updatesCount > 0
                    ? "bg-orange-950/40 text-orange-300 hover:bg-orange-900/50 border border-orange-700/50 animate-pulse font-bold"
                    : "bg-[#101726] text-gray-400 hover:text-gray-200 border border-[#1F2E45]/80"
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>มีตอนใหม่ ({updatesCount})</span>
              </button>

              <button
                onClick={() => setCurrentTab("reading")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "reading"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "bg-[#101726] text-gray-400 hover:text-gray-200 border border-[#1F2E45]/80"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>กำลังอ่าน ({readingCount})</span>
              </button>

              <button
                onClick={() => setCurrentTab("on_hold")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "on_hold"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                    : "bg-[#101726] text-gray-400 hover:text-gray-200 border border-[#1F2E45]/80"
                }`}
              >
                <BookmarkCheck className="w-3.5 h-3.5" />
                <span>ดองไว้ ({onHoldCount})</span>
              </button>

              <button
                onClick={() => setCurrentTab("completed")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "completed"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "bg-[#101726] text-gray-400 hover:text-gray-200 border border-[#1F2E45]/80"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>อ่านจบ ({completedCount})</span>
              </button>
            </div>

            {/* View Mode & Sort Selector Toolbar */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {/* View Mode Toggle Buttons */}
              <div className="flex items-center bg-[#131B2E] border border-[#1F2E45] rounded-xl p-0.5">
                <button
                  onClick={() => handleToggleViewMode("poster")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    viewMode === "poster"
                      ? "bg-violet-600 text-white shadow-sm font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                  title="โหมดโปสเตอร์เน้นรูปปกสวยงาม (แบบในตัวอย่าง)"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">โปสเตอร์</span>
                </button>
                <button
                  onClick={() => handleToggleViewMode("compact")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    viewMode === "compact"
                      ? "bg-violet-600 text-white shadow-sm font-bold"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                  title="โหมดการ์ดมาตรฐาน"
                >
                  <StretchHorizontal className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">การ์ด</span>
                </button>
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-[#131B2E] border border-[#1F2E45] rounded-xl px-2.5 py-1.5 text-xs text-gray-200 outline-none"
                >
                  <option value="recent">อ่านล่าสุด</option>
                  <option value="title">ชื่อเรื่อง (ก-ฮ / A-Z)</option>
                  <option value="chapter">เลขตอนมากสุด</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Manga Bookshelf Grid */}
        {filteredMangas.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 pt-1">
            {filteredMangas.map((manga) => (
              <MangaCard
                key={manga.id}
                manga={manga}
                viewMode={viewMode}
                isDiscreetMode={isDiscreetMode}
                onSelect={(m) => setSelectedManga(m)}
                onIncrement={handleIncrementChapter}
                onSyncToLatest={handleSyncToLatest}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center p-12 text-center bg-[#111827]/40 border border-[#1F2E45] rounded-3xl space-y-4 my-8">
            <div className="w-16 h-16 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-violet-400 flex items-center justify-center">
              <BookOpen className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {currentTab === "has_update"
                  ? "ยังไม่มีตอนใหม่ที่รออ่านในขณะนี้"
                  : searchQuery
                  ? "ไม่พบการ์ตูนที่ค้นหา"
                  : "ยังไม่มีการ์ตูนในหมวดนี้"}
              </h3>
              <p className="text-xs text-gray-400 max-w-sm mt-1">
                {currentTab === "has_update"
                  ? "คุณอ่านทันทุกตอนแล้ว! กดปุ่ม 'ตรวจหาตอนใหม่' เพื่อสแกนเว็บต้นทางอีกครั้งได้ทุกเมื่อ"
                  : searchQuery
                  ? `ไม่พบเรื่องที่ตรงกับ "${searchQuery}" ลองค้นหาด้วยคำอื่น หรือกดเพิ่มเรื่องใหม่`
                  : "เริ่มต้นโดยการกดปุ่ม 'กู้ชีพแท็บ' เพื่อวางลิงก์จากแท็บการ์ตูนที่คุณกำลังอ่านอยู่ได้เลย"}
              </p>
            </div>
            {currentTab === "has_update" ? (
              <button
                onClick={handleCheckAllUpdates}
                disabled={isCheckingUpdates}
                className="flex items-center gap-1.5 bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/30 transition"
              >
                <Flame className="w-4 h-4" />
                <span>ตรวจหาตอนใหม่อีกครั้ง</span>
              </button>
            ) : (
              <button
                onClick={() => setIsAddOpen(true)}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-violet-600/30 transition"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มการ์ตูนเรื่องแรก</span>
              </button>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation for Mobile Touch */}
      <BottomNav
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        onOpenAdd={() => setIsAddOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Modals */}
      <MangaDetailModal
        manga={selectedManga}
        onClose={() => setSelectedManga(null)}
        onUpdate={handleUpdateManga}
        onDelete={handleDeleteManga}
      />

      <AddMangaModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAddManga={handleAddManga}
        onAddMangas={handleAddMangas}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={supabaseConfig}
        onSaveConfig={handleSaveConfig}
        onDataImported={() => setMangas(getLocalMangas())}
        onCategoriesChanged={() => setAvailableCategories(getStoredCategories())}
      />
    </div>
  );
}
