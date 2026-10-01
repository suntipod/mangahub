"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Manga, ReadingStatus, SupabaseConfig } from "@/types/manga";
import {
  getLocalMangas,
  saveLocalMangas,
  upsertManga,
  upsertMangas,
  incrementChapter,
  removeManga,
  syncWithSupabase,
  syncWithServer,
} from "@/lib/storage";
import {
  loadSupabaseConfig,
  saveSupabaseConfig,
  getSupabaseClient,
  fetchRemoteMangas,
} from "@/lib/supabase";
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
  Compass,
  BookmarkCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";

export default function Home() {
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>({
    url: "",
    anonKey: "",
    enabled: false,
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Filters & Search
  const [currentTab, setCurrentTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "title" | "chapter">("recent");

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
        // Tab filter
        if (currentTab !== "all" && m.status !== currentTab) {
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
  }, [mangas, currentTab, searchQuery, sortBy]);

  // Counts for tabs
  const readingCount = mangas.filter((m) => m.status === "reading").length;
  const onHoldCount = mangas.filter((m) => m.status === "on_hold").length;
  const completedCount = mangas.filter((m) => m.status === "completed").length;

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
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 space-y-4">
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

          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-violet-600/30 transition active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>กู้ชีพแท็บ Safari ทันที</span>
          </button>
        </div>

        {/* Filter Tabs & Sorting Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setCurrentTab("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                currentTab === "all"
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "bg-[#131B2E] text-gray-400 hover:text-gray-200 border border-[#1F2E45]"
              }`}
            >
              ทั้งหมด ({mangas.length})
            </button>

            <button
              onClick={() => setCurrentTab("reading")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                currentTab === "reading"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "bg-[#131B2E] text-gray-400 hover:text-gray-200 border border-[#1F2E45]"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>กำลังอ่าน ({readingCount})</span>
            </button>

            <button
              onClick={() => setCurrentTab("on_hold")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                currentTab === "on_hold"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                  : "bg-[#131B2E] text-gray-400 hover:text-gray-200 border border-[#1F2E45]"
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>ดองไว้ ({onHoldCount})</span>
            </button>

            <button
              onClick={() => setCurrentTab("completed")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                currentTab === "completed"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "bg-[#131B2E] text-gray-400 hover:text-gray-200 border border-[#1F2E45]"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>อ่านจบ ({completedCount})</span>
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" /> เรียงตาม:
            </span>
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

        {/* Manga Bookshelf Grid */}
        {filteredMangas.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 pt-1">
            {filteredMangas.map((manga) => (
              <MangaCard
                key={manga.id}
                manga={manga}
                onSelect={(m) => setSelectedManga(m)}
                onIncrement={handleIncrementChapter}
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
                {searchQuery ? "ไม่พบการ์ตูนที่ค้นหา" : "ยังไม่มีการ์ตูนในหมวดนี้"}
              </h3>
              <p className="text-xs text-gray-400 max-w-sm mt-1">
                {searchQuery
                  ? `ไม่พบเรื่องที่ตรงกับ "${searchQuery}" ลองค้นหาด้วยคำอื่น หรือกดเพิ่มเรื่องใหม่`
                  : "เริ่มต้นโดยการกดปุ่ม 'กู้ชีพแท็บ' เพื่อวางลิงก์จากแท็บการ์ตูนที่คุณกำลังอ่านอยู่ได้เลย"}
              </p>
            </div>
            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-violet-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              <span>เพิ่มการ์ตูนเรื่องแรก</span>
            </button>
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
      />
    </div>
  );
}
