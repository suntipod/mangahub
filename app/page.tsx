"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Manga, ReadingStatus, SupabaseConfig, DEFAULT_CATEGORIES, CloudSyncStatus } from "@/types/manga";

import {
  getLocalMangas,
  saveLocalMangas,
  deduplicateMangas,
  upsertManga,
  upsertMangas,
  incrementChapter,
  incrementAndOpenNextChapter,
  setChapter,
  removeManga,
  syncWithSupabase,
  syncWithServer,
  checkMangaOnlineUpdate,
  touchMangaRead,
  autoFixMissingAndBadCovers,
  computeNextChapterUrl,
  getDeletedMangaIds,
  getLastSyncError,
  clearLastSyncError,
} from "@/lib/storage";
import {
  loadSupabaseConfig,
  saveSupabaseConfig,
  getSupabaseClient,
  fetchRemoteMangas,
} from "@/lib/supabase";
import { getStoredCategories, isAdultCategory } from "@/lib/categories";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { MangaCard } from "@/components/MangaCard";
import { MangaDetailModal } from "@/components/MangaDetailModal";
import { AddMangaModal } from "@/components/AddMangaModal";
import { SettingsModal } from "@/components/SettingsModal";
import { BackupModal } from "@/components/BackupModal";
import { ReadingStatsModal } from "@/components/ReadingStatsModal";
import { RandomPickerModal } from "@/components/RandomPickerModal";
import { ReadingDashboardBanner, doesMangaMatchTagOrTheme } from "@/components/ReadingDashboardBanner";
import {
  BookOpen,
  Plus,
  Sparkles,
  BookmarkCheck,
  Clock,
  CheckCircle2,
  Flame,
  LayoutGrid,
  StretchHorizontal,
  Zap,
  Tag,
  X,
  Dices,
  BarChart3,
  Loader2,
  Database,
  RotateCcw,
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

  // Auto-Fix All Covers State
  const [isFixingAllCovers, setIsFixingAllCovers] = useState(false);
  const [fixCoverProgress, setFixCoverProgress] = useState<{ current: number; total: number; title: string } | null>(null);

  // Filters & Search
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [lastReadMangaId, setLastReadMangaId] = useState<string | null>(null);
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

      const savedLastRead = localStorage.getItem("mangahub_last_read_manga_id");
      if (savedLastRead) setLastReadMangaId(savedLastRead);
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
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isRandomOpen, setIsRandomOpen] = useState(false);

  // Close active modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedManga) setSelectedManga(null);
        else if (isAddOpen) setIsAddOpen(false);
        else if (isSettingsOpen) setIsSettingsOpen(false);
        else if (isBackupOpen) setIsBackupOpen(false);
        else if (isStatsOpen) setIsStatsOpen(false);
        else if (isRandomOpen) setIsRandomOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedManga, isAddOpen, isSettingsOpen, isBackupOpen, isStatsOpen, isRandomOpen]);

  // Cloud Sync state
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>("syncing");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Helper to wrap mutations with sync status tracking
  const trackSyncMutation = async <T,>(action: () => Promise<T>): Promise<T> => {
    if (supabaseConfig.enabled) {
      setSyncStatus("syncing");
    }
    clearLastSyncError();
    try {
      const res = await action();
      if (supabaseConfig.enabled) {
        if (getLastSyncError()) {
          setSyncStatus("offline");
        } else {
          setSyncStatus("synced");
          setLastSyncedAt(new Date());
        }
      }
      return res;
    } catch (err) {
      if (supabaseConfig.enabled) {
        setSyncStatus("offline");
      }
      throw err;
    }
  };

  // Load initial data (Local cache + Cloud/Server Sync)
  useEffect(() => {
    // 1. Render local cache immediately
    const loadedMangas = getLocalMangas();
    if (loadedMangas.length > 0) {
      setMangas(loadedMangas);
    }

    const loadedConfig = loadSupabaseConfig();
    setSupabaseConfig(loadedConfig);

    // 2. Fetch from primary source (Supabase if enabled, otherwise local server fallback)
    if (loadedConfig.enabled) {
      setSyncStatus("syncing");
      syncWithSupabase()
        .then((res) => {
          if (res.error) {
            setSyncStatus("offline");
          } else {
            setSyncStatus("synced");
            setLastSyncedAt(new Date());
          }
          setMangas(getLocalMangas());
        })
        .catch(() => {
          setSyncStatus("offline");
          // Fallback to server sync if Supabase is unreachable/blocked
          syncWithServer().then((serverData) => {
            if (serverData && serverData.length > 0) {
              setMangas(serverData);
            }
          });
        });
    } else {
      setSyncStatus("disabled");
      syncWithServer().then((serverData) => {
        if (serverData && serverData.length > 0) {
          setMangas(serverData);
        }
      });
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
            setSyncStatus("syncing");
            const remote = await fetchRemoteMangas(client);
            if (remote && remote.length > 0) {
              const deletedIds = getDeletedMangaIds();
              const validRemote = remote.filter((m) => !deletedIds.has(m.id));
              const local = getLocalMangas();
              const merged = deduplicateMangas([...local, ...validRemote]);
              setMangas(merged);
              saveLocalMangas(merged);
            }
            setSyncStatus("synced");
            setLastSyncedAt(new Date());
          } catch (e) {
            console.error("Realtime fetch error:", e);
            setSyncStatus("offline");
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [supabaseConfig]);

  // Handle browser online/offline status
  useEffect(() => {
    const handleOnline = () => {
      if (supabaseConfig.enabled) {
        handleSync();
      }
    };
    const handleOffline = () => {
      if (supabaseConfig.enabled) {
        setSyncStatus("offline");
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [supabaseConfig.enabled]);

  // Warn user before leaving if currently syncing with cloud
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (syncStatus === "syncing") {
        e.preventDefault();
        e.returnValue = "ข้อมูลกำลังซิงค์ขึ้น Cloud คุณต้องการออกจากหน้านี้หรือไม่?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [syncStatus]);

  // Handle Sync (syncs with primary source: Supabase or local server)
  const handleSync = async () => {
    setIsSyncing(true);
    if (supabaseConfig.enabled) {
      setSyncStatus("syncing");
    }
    try {
      if (supabaseConfig.enabled) {
        const res = await syncWithSupabase();
        if (res.error) {
          setSyncStatus("offline");
        } else {
          setSyncStatus("synced");
          setLastSyncedAt(new Date());
        }
        setMangas(getLocalMangas());
      } else {
        const serverData = await syncWithServer();
        if (serverData && serverData.length > 0) {
          setMangas(serverData);
        }
        setSyncStatus("disabled");
      }
    } catch (e) {
      console.error("Sync error:", e);
      if (supabaseConfig.enabled) {
        setSyncStatus("offline");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Check online updates for all mangas with linked sources (parallelized in batches for 5x speed)
  const handleCheckAllUpdates = async () => {
    if (isCheckingUpdates || mangas.length === 0) return;
    setIsCheckingUpdates(true);
    setUpdateNotification(null);

    const candidates = mangas.filter((m) => m.sources && m.sources.length > 0);
    let newUpdatesFound = 0;
    let completedCount = 0;
    const BATCH_SIZE = 6;

    setCheckProgress({ current: 0, total: candidates.length });

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (candidate) => {
          try {
            const freshManga = getLocalMangas().find((m) => m.id === candidate.id) || candidate;
            const res = await checkMangaOnlineUpdate(freshManga);
            return { candidate, res };
          } catch (err) {
            console.error("Error checking update for:", candidate.title, err);
            return { candidate, res: null };
          } finally {
            completedCount++;
            setCheckProgress({ current: completedCount, total: candidates.length });
          }
        })
      );

      for (const { candidate, res } of batchResults) {
        if (!res || !res.foundFromWeb || !res.latestChapter) continue;
        const latestFresh = getLocalMangas().find((m) => m.id === candidate.id) || candidate;
        const chapterChanged = res.latestChapter !== latestFresh.latest_available_chapter;
        const sourcesChanged = Boolean(res.updatedSources);

        if (res.hasUpdate && res.latestChapter > latestFresh.current_chapter && chapterChanged) {
          newUpdatesFound++;
        }

        if (chapterChanged || sourcesChanged) {
          const updated: Manga = {
            ...latestFresh,
            latest_available_chapter: res.latestChapter,
            sources: res.updatedSources || latestFresh.sources,
            updated_at: new Date().toISOString(),
          };
          const currentList = await upsertManga(updated);
          setMangas(currentList);
          setSelectedManga((prev) => (prev && prev.id === updated.id ? updated : prev));
        }
      }
    }

    setIsCheckingUpdates(false);
    setCheckProgress(null);

    const totalWithUnread = getLocalMangas().filter(
      (m) => m.latest_available_chapter && m.latest_available_chapter > m.current_chapter
    ).length;

    if (newUpdatesFound > 0) {
      setUpdateNotification(
        `🎉 ตรวจสอบเรียบร้อย! พบตอนใหม่อัปเดตเพิ่ม ${newUpdatesFound} เรื่อง (รวมมีตอนค้างอ่าน ${totalWithUnread} เรื่อง)`
      );
    } else if (totalWithUnread > 0) {
      setUpdateNotification(
        `✅ ตรวจสอบครบทุกเรื่องแล้ว! มีเรื่องที่มีตอนใหม่รออ่านทั้งหมด ${totalWithUnread} เรื่อง`
      );
    } else {
      setUpdateNotification(`✅ ทุกเรื่องที่คุณติดตามเป็นตอนล่าสุดแล้ว ไม่มีตอนค้างอ่าน`);
    }

    setTimeout(() => {
      setUpdateNotification(null);
    }, 6000);
  };

  // Batch Auto-Fix All Covers in Library
  const handleAutoFixAllCovers = async () => {
    if (isFixingAllCovers || mangas.length === 0) return;
    setIsFixingAllCovers(true);
    setFixCoverProgress(null);
    setUpdateNotification("🔍 กำลังค้นหาและดึงรูปปก HD สำหรับเรื่องที่ยังไม่มีปก...");
    try {
      const res = await autoFixMissingAndBadCovers((current, total, title) => {
        setFixCoverProgress({ current, total, title });
      });
      const updatedList = getLocalMangas();
      setMangas(updatedList);
      if (res.updatedCount > 0) {
        setUpdateNotification(`🎉 ดึงรูปปก HD สำเร็จจำนวน ${res.updatedCount} เรื่อง!`);
      } else if (res.totalCandidates === 0) {
        setUpdateNotification(`✅ ทุกเรื่องในชั้นหนังสือของคุณมีรูปปก HD สวยงามครบถ้วนแล้ว`);
      } else {
        setUpdateNotification(`⚠️ ตรวจสอบเรียบร้อย ไม่พบรูปปกใหม่เพิ่มเติม`);
      }
    } catch (e: any) {
      setUpdateNotification(`❌ เกิดข้อผิดพลาดในการดึงรูปปก: ${e.message}`);
    } finally {
      setIsFixingAllCovers(false);
      setFixCoverProgress(null);
      setTimeout(() => setUpdateNotification(null), 6000);
    }
  };

  // Add new manga
  const handleAddManga = async (newManga: Manga) => {
    await trackSyncMutation(async () => {
      const updated = await upsertManga(newManga);
      setMangas(updated);
    });
  };

  // Batch add multiple new mangas
  const handleAddMangas = async (newMangas: Manga[]) => {
    await trackSyncMutation(async () => {
      const updated = await upsertMangas(newMangas);
      setMangas(updated);
    });
  };

  // Update existing manga
  const handleUpdateManga = async (updatedManga: Manga) => {
    setSelectedManga((prev) => (prev && prev.id === updatedManga.id ? updatedManga : prev));
    try {
      const savedLastId = localStorage.getItem("mangahub_last_read_manga_id");
      if (savedLastId) setLastReadMangaId(savedLastId);
    } catch {}
    await trackSyncMutation(async () => {
      const updated = await upsertManga(updatedManga);
      setMangas(updated);
    });
  };

  // Quick increment chapter (+1)
  const handleIncrementChapter = async (id: string) => {
    await trackSyncMutation(async () => {
      const updated = await incrementChapter(id);
      setMangas(updated);
    });
  };

  // Smart +1 & Open Next Chapter (opens tab synchronously before async await for iOS Safari)
  const handleIncrementAndOpenNext = async (manga: Manga) => {
    setLastReadMangaId(manga.id);
    const nextChapter = manga.current_chapter + 1;
    const primarySource = manga.sources?.find((s) => s.is_primary) || manga.sources?.[0];
    const nextUrl = primarySource
      ? computeNextChapterUrl(primarySource.current_chapter_url || primarySource.base_url, nextChapter)
      : null;

    if (nextUrl) {
      window.open(nextUrl, "_blank", "noopener,noreferrer");
    } else {
      setSelectedManga(manga);
    }

    await trackSyncMutation(async () => {
      const { updatedList } = await incrementAndOpenNextChapter(manga.id);
      setMangas(updatedList);
    });
  };

  // Quick Sync to latest available chapter
  const handleSyncToLatest = async (id: string, latestChapter: number) => {
    await trackSyncMutation(async () => {
      const updated = await setChapter(id, latestChapter);
      setMangas(updated);
    });
  };

  // Open reader and update recently read (opens tab synchronously before async await for iOS Safari)
  const handleOpenReader = async (manga: Manga) => {
    setLastReadMangaId(manga.id);
    const primarySource = manga.sources?.find((s) => s.is_primary) || manga.sources?.[0];
    const targetUrl = primarySource?.current_chapter_url || primarySource?.base_url;
    if (targetUrl) {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    } else {
      setSelectedManga(manga);
    }

    await trackSyncMutation(async () => {
      const updated = await touchMangaRead(manga.id);
      setMangas(updated);
    });
  };

  // Delete manga
  const handleDeleteManga = async (id: string) => {
    await trackSyncMutation(async () => {
      const updated = await removeManga(id);
      setMangas(updated);
    });
  };

  // Quick switch reading status
  const handleStatusChange = async (id: string, newStatus: ReadingStatus) => {
    await trackSyncMutation(async () => {
      const current = getLocalMangas();
      const target = current.find((m) => m.id === id);
      if (!target) return;
      const updatedManga: Manga = {
        ...target,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      const updated = await upsertManga(updatedManga);
      setMangas(updated);
    });
  };

  // Save Supabase Config
  const handleSaveConfig = (newConfig: SupabaseConfig) => {
    setSupabaseConfig(newConfig);
    saveSupabaseConfig(newConfig);
    if (newConfig.enabled) {
      setSyncStatus("syncing");
      setTimeout(() => handleSync(), 100);
    } else {
      setSyncStatus("disabled");
    }
  };

  // Find the most recently read manga
  const recentlyReadManga = useMemo(() => {
    if (mangas.length === 0) return null;
    if (lastReadMangaId) {
      const found = mangas.find((m) => m.id === lastReadMangaId);
      if (found) return found;
    }
    const withRead = mangas.filter((m) => m.last_read_at);
    if (withRead.length > 0) {
      return [...withRead].sort(
        (a, b) => new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime()
      )[0];
    }
    return null;
  }, [mangas, lastReadMangaId]);

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
        // Tier filter
        if (selectedTier !== "all") {
          const mangaTier = m.tier || "none";
          if (mangaTier !== selectedTier) {
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
        // Tag or Theme filter
        if (selectedTag) {
          if (!doesMangaMatchTagOrTheme(m, selectedTag)) {
            return false;
          }
        }
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = m.title.toLowerCase().includes(q);
          const matchAlt = m.alt_title?.toLowerCase().includes(q);
          const matchSources = (m.sources || []).some(
            (s) =>
              s.site_name.toLowerCase().includes(q) ||
              s.base_url.toLowerCase().includes(q)
          );
          const matchTags = m.tags?.some((t) => t.toLowerCase().includes(q));
          if (!matchTitle && !matchAlt && !matchSources && !matchTags) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // When in has_update tab, prioritize highest unread backlog chapters first
        if (currentTab === "has_update") {
          const backlogA = (a.latest_available_chapter || a.current_chapter) - a.current_chapter;
          const backlogB = (b.latest_available_chapter || b.current_chapter) - b.current_chapter;
          if (backlogB !== backlogA) {
            return backlogB - backlogA;
          }
        }
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
  }, [mangas, selectedCategory, selectedTier, selectedTag, currentTab, searchQuery, sortBy]);

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
  const droppedCount = categoryScopedMangas.filter((m) => m.status === "dropped").length;
  const planToReadCount = categoryScopedMangas.filter((m) => m.status === "plan_to_read").length;

  // All unique tags with counts in current category scope
  const allTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    for (const m of categoryScopedMangas) {
      if (m.tags && Array.isArray(m.tags)) {
        for (const t of m.tags) {
          const trimmed = t.trim();
          if (trimmed) {
            tagMap.set(trimmed, (tagMap.get(trimmed) || 0) + 1);
          }
        }
      }
    }
    return Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1]) // Most used first
      .map(([tag, count]) => ({ tag, count }));
  }, [categoryScopedMangas]);

  const tierCounts = useMemo(() => {
    const counts = { all: 0, S: 0, A: 0, B: 0, C: 0, none: 0 };
    for (const m of categoryScopedMangas) {
      counts.all++;
      const t = m.tier || "none";
      if (t === "S") counts.S++;
      else if (t === "A") counts.A++;
      else if (t === "B") counts.B++;
      else if (t === "C") counts.C++;
      else counts.none++;
    }
    return counts;
  }, [categoryScopedMangas]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    Boolean(selectedTag) ||
    selectedCategory !== "all" ||
    selectedTier !== "all" ||
    currentTab !== "all";

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedTag(null);
    setSelectedCategory("all");
    setSelectedTier("all");
    setCurrentTab("all");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090D16] text-gray-100 pb-24 sm:pb-12">
      {/* Header */}
      <Header
        supabaseConfig={supabaseConfig}
        syncStatus={syncStatus}
        mangasCount={mangas.length}
        lastSyncedAt={lastSyncedAt}
        isSyncing={isSyncing}
        onSync={handleSync}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenBackup={() => setIsBackupOpen(true)}
        onOpenInstallPwa={() => window.dispatchEvent(new CustomEvent("mangahub-open-install-pwa"))}
        onOpenStats={() => setIsStatsOpen(true)}
        onOpenRandom={() => setIsRandomOpen(true)}
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
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-[11px] px-3 py-1 rounded-xl transition shadow tabular-nums"
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
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5 flex-wrap">
                <span>มีแท็บเปิดค้างใน iPhone เยอะใช่ไหม?</span>
                <span className="text-[10px] bg-violet-500/20 text-violet-200 px-2 py-0.5 rounded-full font-semibold border border-violet-500/30">
                  แก้ปัญหาแท็บหาย
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                ก๊อปปี้ลิงก์หน้าเว็บที่เปิดค้างไว้มาแปะ ระบบจะดึงรูปปกและชื่อเรื่องให้ทันที จากนั้นปิดแท็บใน Safari ทิ้งได้เลย!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Random Picker Button */}
            <button
              onClick={() => setIsRandomOpen(true)}
              className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold px-3 py-2.5 rounded-xl shadow transition active:scale-95 shrink-0"
              title="สุ่มการ์ตูน Tier S/A ที่ดองไว้มาให้อ่าน"
            >
              <Dices className="w-4 h-4 text-amber-400" />
              <span>สุ่มอ่าน</span>
            </button>

            {/* Reading Stats Button */}
            <button
              onClick={() => setIsStatsOpen(true)}
              className="flex items-center justify-center gap-1.5 bg-[#182338] hover:bg-[#20304c] text-violet-300 border border-violet-500/30 text-xs font-bold px-3 py-2.5 rounded-xl shadow transition active:scale-95 shrink-0"
              title="ดูสถิติการอ่านส่วนตัวของคุณ"
            >
              <BarChart3 className="w-4 h-4 text-violet-400" />
              <span>สถิติ</span>
            </button>

            {/* Backup & Export / Import Button */}
            <button
              onClick={() => setIsBackupOpen(true)}
              className="flex items-center justify-center gap-1.5 bg-[#182338] hover:bg-[#20304c] text-emerald-300 border border-emerald-500/30 text-xs font-bold px-3 py-2.5 rounded-xl shadow transition active:scale-95 shrink-0"
              title="สำรองข้อมูล / กู้คืน / ดาวน์โหลด Excel CSV และ JSON"
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span>สำรองข้อมูล</span>
            </button>

            <button
              onClick={handleCheckAllUpdates}
              disabled={isCheckingUpdates}
              className="flex items-center justify-center gap-1.5 bg-[#182338] hover:bg-[#20304c] text-orange-300 border border-orange-500/30 text-xs font-bold px-3 py-2.5 rounded-xl shadow transition active:scale-95 shrink-0 tabular-nums"
              title="ตรวจสอบตอนใหม่ล่าสุดจากเว็บทั้งหมด"
            >
              <Flame className={`w-4 h-4 ${isCheckingUpdates ? "animate-pulse text-orange-400" : ""}`} />
              <span>
                {isCheckingUpdates && checkProgress
                  ? `ตรวจ ${checkProgress.current}/${checkProgress.total}...`
                  : "ตรวจหาตอนใหม่"}
              </span>
            </button>

            {/* Quick Unread Backlog Filter Button */}
            {updatesCount > 0 && (
              <button
                onClick={() => setCurrentTab(currentTab === "has_update" ? "all" : "has_update")}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition active:scale-95 shadow-lg shrink-0 tabular-nums ${
                  currentTab === "has_update"
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white ring-2 ring-orange-400 shadow-orange-500/40"
                    : "bg-orange-950/40 hover:bg-orange-900/50 text-orange-300 border border-orange-600/50 shadow-orange-950/30"
                }`}
                title="คลิกเพื่อกรองดูเฉพาะเรื่องที่มีตอนใหม่อ่านค้างอยู่ (เรียงตามตอนที่ดองไว้มากสุด)"
              >
                <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
                <span>
                  {currentTab === "has_update"
                    ? `กำลังดูตอนค้าง (${updatesCount})`
                    : `มีตอนใหม่ (${updatesCount})`}
                </span>
              </button>
            )}

            {/* Auto-Fix Covers Button */}
            <button
              onClick={handleAutoFixAllCovers}
              disabled={isFixingAllCovers}
              className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 hover:from-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold px-3 py-2.5 rounded-xl shadow transition active:scale-95 shrink-0 tabular-nums"
              title="ดึงรูปปก HD สวยๆ จากเน็ตมาใส่ให้ทุกเรื่องที่ไม่มีรูปปก หรือภาพปกไม่ชัด"
            >
              {isFixingAllCovers ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400/20" />
              )}
              <span>
                {isFixingAllCovers && fixCoverProgress
                  ? `ดึงปก ${fixCoverProgress.current}/${fixCoverProgress.total}...`
                  : "ดึงรูปปก HD"}
              </span>
            </button>

            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-lg shadow-violet-600/30 transition active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>กู้ชีพแท็บ Safari</span>
            </button>
          </div>
        </div>

        {/* Recently Read Manga (Continue Reading Quick Hero) */}
        {recentlyReadManga && (
          <div className="relative overflow-hidden bg-gradient-to-r from-violet-950/40 via-[#131B2E] to-[#101726] border border-violet-500/40 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3.5 animate-fade-in tabular-nums">
            {/* Left side: Cover & Manga Info */}
            <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
              <div
                onClick={() => setSelectedManga(recentlyReadManga)}
                className="relative w-14 sm:w-16 aspect-[2/3] rounded-xl overflow-hidden bg-[#0A0E17] border border-violet-500/50 hover:border-violet-400 shrink-0 cursor-pointer shadow-md transition"
                title="คลิกดูรายละเอียดเรื่อง"
              >
                {recentlyReadManga.cover_url ? (
                  <img
                    src={recentlyReadManga.cover_url}
                    alt={recentlyReadManga.title}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const rawUrl = recentlyReadManga.cover_url || "";
                      const img = e.currentTarget;
                      if (rawUrl && !img.src.includes("/api/image-proxy") && !rawUrl.startsWith("data:")) {
                        img.src = `/api/image-proxy?url=${encodeURIComponent(rawUrl)}`;
                      }
                    }}
                    className={`w-full h-full object-cover ${
                      isDiscreetMode && isAdultCategory(recentlyReadManga.category)
                        ? "blur-md"
                        : ""
                    }`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-violet-400">
                    <BookOpen className="w-6 h-6" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                    <BookOpen className="w-3 h-3" />
                    <span>กำลังอ่านอยู่ล่าสุด</span>
                  </span>
                  {recentlyReadManga.tier && recentlyReadManga.tier !== "none" && (
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-md shadow ${
                        recentlyReadManga.tier === "S"
                          ? "bg-amber-400 text-black shadow-amber-400/30"
                          : recentlyReadManga.tier === "A"
                          ? "bg-orange-500 text-white shadow-orange-500/30"
                          : recentlyReadManga.tier === "B"
                          ? "bg-sky-500 text-white shadow-sky-500/30"
                          : "bg-emerald-600 text-white shadow-emerald-600/30"
                      }`}
                    >
                      {recentlyReadManga.tier === "S"
                        ? "👑 Tier S"
                        : recentlyReadManga.tier === "A"
                        ? "🔥 Tier A"
                        : recentlyReadManga.tier === "B"
                        ? "✨ Tier B"
                        : "👍 Tier C"}
                    </span>
                  )}
                  {recentlyReadManga.category && (
                    <span className="text-[10px] bg-[#1a253d] border border-[#2d3e61] text-slate-200 px-1.5 py-0.5 rounded-md font-medium">
                      {recentlyReadManga.category}
                    </span>
                  )}
                </div>

                <h3
                  onClick={() => setSelectedManga(recentlyReadManga)}
                  className="text-sm sm:text-base font-bold text-white hover:text-violet-300 transition cursor-pointer truncate"
                  title={recentlyReadManga.title}
                >
                  {recentlyReadManga.title}
                </h3>

                <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5 flex-wrap">
                  <span className="text-violet-300 font-bold">
                    อ่านถึงตอนที่ {recentlyReadManga.current_chapter}
                  </span>
                  {recentlyReadManga.latest_available_chapter ? (
                    <span className="text-slate-300">
                      / ล่าสุดในเว็บ {recentlyReadManga.latest_available_chapter}
                    </span>
                  ) : null}
                  {recentlyReadManga.latest_available_chapter &&
                    recentlyReadManga.latest_available_chapter > recentlyReadManga.current_chapter && (
                      <span className="text-orange-400 font-extrabold flex items-center gap-0.5 text-[11px]">
                        <Flame className="w-3 h-3 fill-current" />
                        มีตอนใหม่!
                      </span>
                    )}
                  {recentlyReadManga.notes && recentlyReadManga.notes.trim() && (
                    <span
                      className="text-[11px] text-amber-300 font-medium bg-amber-950/40 border border-amber-600/30 px-2 py-0.5 rounded-lg flex items-center gap-1 max-w-[260px] truncate"
                      title={`บันทึกช่วยจำ: ${recentlyReadManga.notes}`}
                    >
                      <span>📝</span>
                      <span className="truncate">{recentlyReadManga.notes}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right side: Quick Action Buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end flex-wrap">
              <button
                onClick={() => handleIncrementChapter(recentlyReadManga.id)}
                className="min-h-[38px] px-3 py-2 bg-[#182338] hover:bg-[#223250] text-slate-100 border border-[#27385a] rounded-xl text-xs font-bold transition active:scale-95 flex items-center gap-1 shrink-0"
                title="เพิ่มเลขตอนที่อ่าน +1 ตอน (ไม่ออกไปหน้าเว็บ)"
              >
                <Plus className="w-3.5 h-3.5 text-violet-400" />
                <span>+1 ตอน</span>
              </button>

              <button
                onClick={() => handleOpenReader(recentlyReadManga)}
                className="min-h-[38px] px-3.5 py-2 bg-[#182338] hover:bg-[#223250] text-slate-100 border border-[#27385a] rounded-xl text-xs font-bold transition active:scale-95 flex items-center gap-1.5 shrink-0"
                title={`อ่านตอนปัจจุบัน (ตอนที่ ${recentlyReadManga.current_chapter})`}
              >
                <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                <span>ช.{recentlyReadManga.current_chapter}</span>
              </button>

              <button
                onClick={() => handleIncrementAndOpenNext(recentlyReadManga)}
                className="min-h-[38px] flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-emerald-600/30 transition active:scale-95"
                title={`อ่านตอนถัดไป: อัปเดตเป็นตอนที่ ${recentlyReadManga.current_chapter + 1} และเปิดหน้าเว็บทันที`}
              >
                <Zap className="w-4 h-4 fill-current text-amber-300" />
                <span>อ่านตอนที่ {recentlyReadManga.current_chapter + 1}</span>
              </button>
            </div>
          </div>
        )}

        {/* Reading Tracker Dashboard Banner */}
        <ReadingDashboardBanner
          mangas={mangas}
          onOpenStats={() => setIsStatsOpen(true)}
          onOpenReader={handleOpenReader}
          onTagClick={(tag) => setSelectedTag(selectedTag === tag ? null : tag)}
          onCategoryClick={(cat) => setSelectedCategory(cat)}
        />

        {/* Category & Tier Filter Toolbar */}
        <div className="space-y-2.5 pt-1 tabular-nums">
          {/* Category Filter Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`min-h-[34px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                selectedCategory === "all"
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                  : "bg-[#131B2E] text-slate-300 hover:text-white border border-[#1F2E45]"
              }`}
            >
              <span>🗂️ ทุกหมวดหมู่</span>
              <span className="text-[10px] opacity-80">({mangas.length})</span>
            </button>

            {availableCategories.map((cat) => {
              const isSelected = selectedCategory === cat;
              const count = mangas.filter((m) => (m.category || "การ์ตูนทั่วไป") === cat).length;
              const isNTR = cat.toUpperCase().includes("NTR");
              const isDojin = !isNTR && isAdultCategory(cat);

              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[34px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
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
                      : "bg-[#131B2E] text-slate-300 hover:text-white border border-[#1F2E45]"
                  }`}
                >
                  <span>
                    {isDojin ? "🔞 " : isNTR ? "💔 " : "📚 "}
                    {cat}
                  </span>
                  <span className="text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Tier Filter Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-300 shrink-0 mr-1 flex items-center gap-1">
              <span>🏆 Tier:</span>
            </span>

            <button
              onClick={() => setSelectedTier("all")}
              className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1 ${
                selectedTier === "all"
                  ? "bg-gray-200 text-gray-900 shadow-md font-extrabold"
                  : "bg-[#131B2E] text-slate-300 hover:text-white border border-[#1F2E45]"
              }`}
            >
              <span>⭐ ทั้งหมด</span>
              <span className="text-[10px] opacity-80">({tierCounts.all})</span>
            </button>

            <button
              onClick={() => setSelectedTier("S")}
              className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                selectedTier === "S"
                  ? "bg-amber-400 text-black shadow-md shadow-amber-400/30 font-black"
                  : "bg-amber-950/20 text-amber-300 hover:bg-amber-950/40 border border-amber-600/40"
              }`}
            >
              <span>👑 Tier S</span>
              <span className="text-[10px] opacity-85">({tierCounts.S})</span>
            </button>

            <button
              onClick={() => setSelectedTier("A")}
              className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                selectedTier === "A"
                  ? "bg-orange-500 text-white shadow-md shadow-orange-500/30 font-black"
                  : "bg-orange-950/20 text-orange-300 hover:bg-orange-950/40 border border-orange-600/40"
              }`}
            >
              <span>🔥 Tier A</span>
              <span className="text-[10px] opacity-85">({tierCounts.A})</span>
            </button>

            <button
              onClick={() => setSelectedTier("B")}
              className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                selectedTier === "B"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/30 font-black"
                  : "bg-sky-950/20 text-sky-300 hover:bg-sky-950/40 border border-sky-600/40"
              }`}
            >
              <span>✨ Tier B</span>
              <span className="text-[10px] opacity-85">({tierCounts.B})</span>
            </button>

            <button
              onClick={() => setSelectedTier("C")}
              className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                selectedTier === "C"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-black"
                  : "bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40 border border-emerald-600/40"
              }`}
            >
              <span>👍 Tier C</span>
              <span className="text-[10px] opacity-85">({tierCounts.C})</span>
            </button>

            <button
              onClick={() => setSelectedTier("none")}
              className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
                selectedTier === "none"
                  ? "bg-gray-600 text-white shadow-md font-bold"
                  : "bg-[#131B2E] text-slate-300 hover:text-white border border-[#1F2E45]"
              }`}
            >
              <span>⚪ ไม่ระบุ</span>
              <span className="text-[10px] opacity-80">({tierCounts.none})</span>
            </button>
          </div>

          {/* Tag Filter Bar */}
          {(allTags.length > 0 || selectedTag) && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-0.5">
              <span className="text-[11px] font-bold text-slate-300 shrink-0 mr-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-violet-400" />
                <span>แท็ก:</span>
              </span>

              {selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="bg-violet-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-md shadow-violet-600/30 shrink-0 animate-fade-in"
                  title="คลิกเพื่อล้างตัวกรองแท็ก"
                >
                  <span>#{selectedTag}</span>
                  <X className="w-3 h-3" />
                </button>
              )}

              {allTags.map(({ tag, count }) => {
                const isSelected = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(isSelected ? null : tag)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition shrink-0 flex items-center gap-1 ${
                      isSelected
                        ? "bg-violet-600 text-white font-bold shadow-md shadow-violet-600/30"
                        : "bg-[#131B2E] text-violet-200 hover:text-white hover:bg-violet-950/40 border border-violet-500/20"
                    }`}
                  >
                    <span>#{tag}</span>
                    <span className="text-[10px] opacity-80">({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Status Tabs & Sorting Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Status Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setCurrentTab("all")}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 ${
                  currentTab === "all"
                    ? "bg-slate-700 text-white"
                    : "bg-[#101726] text-slate-300 hover:text-white border border-[#1F2E45]/80"
                }`}
              >
                สถานะทั้งหมด ({categoryScopedMangas.length})
              </button>

              {/* Has Updates Tab */}
              <button
                onClick={() => setCurrentTab("has_update")}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "has_update"
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white font-bold shadow-md shadow-orange-500/30"
                    : updatesCount > 0
                    ? "bg-orange-950/40 text-orange-300 hover:bg-orange-900/50 border border-orange-700/50 font-bold"
                    : "bg-[#101726] text-slate-300 hover:text-white border border-[#1F2E45]/80"
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>มีตอนใหม่ ({updatesCount})</span>
              </button>

              <button
                onClick={() => setCurrentTab("reading")}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "reading"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "bg-[#101726] text-slate-300 hover:text-white border border-[#1F2E45]/80"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>กำลังอ่าน ({readingCount})</span>
              </button>

              <button
                onClick={() => setCurrentTab("on_hold")}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "on_hold"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                    : "bg-[#101726] text-slate-300 hover:text-white border border-[#1F2E45]/80"
                }`}
              >
                <BookmarkCheck className="w-3.5 h-3.5" />
                <span>ดองไว้ ({onHoldCount})</span>
              </button>

              <button
                onClick={() => setCurrentTab("completed")}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "completed"
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "bg-[#101726] text-slate-300 hover:text-white border border-[#1F2E45]/80"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>อ่านจบ ({completedCount})</span>
              </button>

              <button
                onClick={() => setCurrentTab("dropped")}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "dropped"
                    ? "bg-rose-700 text-white shadow-md shadow-rose-700/30 font-bold"
                    : "bg-[#101726] text-slate-300 hover:text-white border border-[#1F2E45]/80"
                }`}
              >
                <span>🛑 เทแล้ว ({droppedCount})</span>
              </button>

              <button
                onClick={() => setCurrentTab("plan_to_read")}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                  currentTab === "plan_to_read"
                    ? "bg-purple-700 text-white shadow-md shadow-purple-700/30 font-bold"
                    : "bg-[#101726] text-slate-300 hover:text-white border border-[#1F2E45]/80"
                }`}
              >
                <span>📌 อยากอ่าน ({planToReadCount})</span>
              </button>
            </div>

            {/* View Mode & Sort Selector Toolbar */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold bg-violet-950/60 hover:bg-violet-900/70 text-violet-200 border border-violet-600/40 flex items-center gap-1 transition active:scale-95"
                  title="ล้างตัวกรองทั้งหมด"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>ล้างตัวกรอง ({filteredMangas.length})</span>
                </button>
              )}

              {/* View Mode Toggle Buttons */}
              <div className="flex items-center bg-[#131B2E] border border-[#1F2E45] rounded-xl p-0.5">
                <button
                  onClick={() => handleToggleViewMode("poster")}
                  aria-label="มุมมองโปสเตอร์"
                  aria-pressed={viewMode === "poster"}
                  className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    viewMode === "poster"
                      ? "bg-violet-600 text-white shadow-sm font-bold"
                      : "text-slate-300 hover:text-white"
                  }`}
                  title="โหมดโปสเตอร์เน้นรูปปกสวยงาม"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">โปสเตอร์</span>
                </button>
                <button
                  onClick={() => handleToggleViewMode("compact")}
                  aria-label="มุมมองการ์ดมาตรฐาน"
                  aria-pressed={viewMode === "compact"}
                  className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    viewMode === "compact"
                      ? "bg-violet-600 text-white shadow-sm font-bold"
                      : "text-slate-300 hover:text-white"
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
                  aria-label="เรียงลำดับการ์ตูน"
                  className="min-h-[34px] bg-[#131B2E] border border-[#1F2E45] rounded-xl px-2.5 py-1.5 text-xs text-slate-100 outline-none"
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
                isRecentlyRead={manga.id === recentlyReadManga?.id}
                onSelect={(m) => setSelectedManga(m)}
                onIncrement={handleIncrementChapter}
                onIncrementAndOpenNext={handleIncrementAndOpenNext}
                onSyncToLatest={handleSyncToLatest}
                onOpenReader={handleOpenReader}
                onStatusChange={handleStatusChange}
                onTagClick={(tag) => setSelectedTag(selectedTag === tag ? null : tag)}
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
                  : selectedTag
                  ? `ไม่พบการ์ตูนที่มีแท็ก #${selectedTag}`
                  : searchQuery
                  ? "ไม่พบการ์ตูนที่ค้นหา"
                  : "ยังไม่มีการ์ตูนในหมวดนี้"}
              </h3>
              <p className="text-xs text-slate-300 max-w-sm mt-1">
                {currentTab === "has_update"
                  ? "คุณอ่านทันทุกตอนแล้ว! กดปุ่มด้านล่างเพื่อตรวจหาตอนใหม่ล่าสุดจากเว็บอ่านการ์ตูน"
                  : selectedTag
                  ? `ไม่มีเรื่องที่ติดแท็ก #${selectedTag} ลองคลิกแท็กอื่น หรือกดปุ่มด้านล่างเพื่อล้างแท็ก`
                  : searchQuery
                  ? `ไม่พบเรื่องที่ตรงกับ "${searchQuery}" ลองค้นหาด้วยคำอื่น หรือล้างคำค้นหา`
                  : "เริ่มต้นโดยการกดปุ่ม 'กู้ชีพแท็บ' เพื่อวางลิงก์จากแท็บการ์ตูนที่คุณกำลังอ่านอยู่ได้เลย"}
              </p>
              {currentTab === "has_update" && (
                <div className="pt-3">
                  <button
                    onClick={handleCheckAllUpdates}
                    disabled={isCheckingUpdates}
                    className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/30 transition active:scale-95"
                  >
                    <Flame className="w-4 h-4 fill-current" />
                    <span>
                      {isCheckingUpdates && checkProgress
                        ? `กำลังตรวจ ${checkProgress.current}/${checkProgress.total}...`
                        : "ตรวจหาตอนใหม่ออนไลน์ทันที"}
                    </span>
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="bg-[#182338] hover:bg-[#223250] text-violet-300 hover:text-white border border-violet-500/40 text-xs font-bold px-4 py-2.5 rounded-xl transition shadow"
                >
                  ล้างตัวกรอง / คำค้นหาทั้งหมด
                </button>
              )}
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
                  <span>{mangas.length > 0 ? "เพิ่มการ์ตูนเรื่องใหม่" : "เพิ่มการ์ตูนเรื่องแรก"}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation for Mobile Touch */}
      <BottomNav
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        onOpenAdd={() => setIsAddOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenRandom={() => setIsRandomOpen(true)}
        onOpenStats={() => setIsStatsOpen(true)}
        unreadCount={updatesCount}
      />

      {/* Modals */}
      <MangaDetailModal
        manga={selectedManga}
        onClose={() => setSelectedManga(null)}
        onUpdate={handleUpdateManga}
        onDelete={handleDeleteManga}
        isDiscreetMode={isDiscreetMode}
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
        onOpenBackup={() => setIsBackupOpen(true)}
        onOpenInstallPwa={() => {
          setIsSettingsOpen(false);
          window.dispatchEvent(new CustomEvent("mangahub-open-install-pwa"));
        }}
      />

      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        mangas={mangas}
        supabaseEnabled={supabaseConfig.enabled}
        onDataRestored={() => {
          setMangas(getLocalMangas());
          setAvailableCategories(getStoredCategories());
          if (supabaseConfig.enabled) {
            setSyncStatus("synced");
            setLastSyncedAt(new Date());
          }
        }}
      />

      {/* Reading Stats Modal */}
      <ReadingStatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        mangas={mangas}
        onOpenReader={handleOpenReader}
        isDiscreetMode={isDiscreetMode}
      />

      {/* Random Picker Modal */}
      <RandomPickerModal
        isOpen={isRandomOpen}
        onClose={() => setIsRandomOpen(false)}
        mangas={mangas}
        onOpenReader={handleOpenReader}
        onIncrementAndOpenNext={handleIncrementAndOpenNext}
        onSelectManga={(m) => setSelectedManga(m)}
        isDiscreetMode={isDiscreetMode}
      />
    </div>
  );
}
