"use client";

import React, { useMemo } from "react";
import { Manga } from "@/types/manga";
import { getReadLogs } from "@/lib/storage";
import {
  X,
  TrendingUp,
  BookOpen,
  Award,
  Flame,
  Calendar,
  Sparkles,
  ExternalLink,
  Tag,
  BarChart3,
  Clock,
  CheckCircle2,
  BookmarkCheck,
  Ban,
} from "lucide-react";

interface ReadingStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mangas: Manga[];
  onOpenReader?: (manga: Manga) => void;
  isDiscreetMode?: boolean;
}

export const ReadingStatsModal: React.FC<ReadingStatsModalProps> = ({
  isOpen,
  onClose,
  mangas,
  onOpenReader,
  isDiscreetMode = false,
}) => {
  const stats = useMemo(() => {
    if (!isOpen || mangas.length === 0) {
      return null;
    }

    const logs = getReadLogs();
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Chapters read this week & today from activity logs
    let weekChaptersFromLogs = 0;
    let todayChaptersFromLogs = 0;
    const openCountMap = new Map<string, number>();

    for (const log of logs) {
      const logDate = new Date(log.timestamp);
      if (logDate >= oneWeekAgo) {
        weekChaptersFromLogs += log.delta || 0;
      }
      if (logDate >= startOfToday) {
        todayChaptersFromLogs += log.delta || 0;
      }
      if (log.type === "open" || log.type === "increment") {
        openCountMap.set(log.manga_id, (openCountMap.get(log.manga_id) || 0) + 1);
      }
    }

    // Fallback/supplement if logs were just started: check mangas read within last 7 days
    const activeMangasThisWeek = mangas.filter((m) => {
      if (!m.last_read_at) return false;
      return new Date(m.last_read_at) >= oneWeekAgo;
    });

    const totalChaptersRead = mangas.reduce((acc, m) => acc + (m.current_chapter || 0), 0);

    // If logs have 0 but user has active mangas this week, estimate minimum active chapters
    const chaptersThisWeek = Math.max(weekChaptersFromLogs, activeMangasThisWeek.length);
    const chaptersToday = todayChaptersFromLogs;

    // 2. Top Category by chapters read
    const categoryStats = new Map<string, { count: number; chapters: number }>();
    for (const m of mangas) {
      const cat = m.category || "การ์ตูนทั่วไป";
      const cur = categoryStats.get(cat) || { count: 0, chapters: 0 };
      categoryStats.set(cat, {
        count: cur.count + 1,
        chapters: cur.chapters + (m.current_chapter || 0),
      });
    }

    const sortedCategories = Array.from(categoryStats.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.chapters - a.chapters);

    const topCategory = sortedCategories[0] || { name: "การ์ตูนทั่วไป", chapters: 0, count: 0 };

    // 3. Top Tags by popularity & chapters
    const tagStats = new Map<string, { count: number; chapters: number }>();
    for (const m of mangas) {
      if (m.tags && Array.isArray(m.tags)) {
        for (const tag of m.tags) {
          const t = tag.trim();
          if (!t) continue;
          const cur = tagStats.get(t) || { count: 0, chapters: 0 };
          tagStats.set(t, {
            count: cur.count + 1,
            chapters: cur.chapters + (m.current_chapter || 0),
          });
        }
      }
    }

    const sortedTags = Array.from(tagStats.entries())
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.count - a.count || b.chapters - a.chapters)
      .slice(0, 6);

    // 4. Most opened manga & Top 5 most read mangas (by chapters)
    let mostOpenedManga: Manga | null = null;
    let maxOpens = 0;
    for (const [id, count] of openCountMap.entries()) {
      if (count > maxOpens) {
        const found = mangas.find((m) => m.id === id);
        if (found) {
          mostOpenedManga = found;
          maxOpens = count;
        }
      }
    }

    const topByChapters = [...mangas]
      .sort((a, b) => (b.current_chapter || 0) - (a.current_chapter || 0))
      .slice(0, 5);

    // If no open log yet, default most opened to highest chapter manga
    if (!mostOpenedManga && topByChapters.length > 0) {
      mostOpenedManga = topByChapters[0];
    }

    // 5. Tier Breakdown
    const tierCounts = { S: 0, A: 0, B: 0, C: 0, none: 0 };
    for (const m of mangas) {
      const t = m.tier || "none";
      if (t === "S") tierCounts.S++;
      else if (t === "A") tierCounts.A++;
      else if (t === "B") tierCounts.B++;
      else if (t === "C") tierCounts.C++;
      else tierCounts.none++;
    }

    // 6. Status Breakdown
    const statusCounts = {
      reading: mangas.filter((m) => m.status === "reading").length,
      on_hold: mangas.filter((m) => m.status === "on_hold").length,
      completed: mangas.filter((m) => m.status === "completed").length,
      dropped: mangas.filter((m) => m.status === "dropped").length,
      plan_to_read: mangas.filter((m) => m.status === "plan_to_read").length,
    };

    return {
      totalMangas: mangas.length,
      totalChaptersRead,
      chaptersThisWeek,
      chaptersToday,
      activeMangasThisWeek: activeMangasThisWeek.length,
      topCategory,
      sortedCategories,
      sortedTags,
      mostOpenedManga,
      maxOpens,
      topByChapters,
      tierCounts,
      statusCounts,
    };
  }, [isOpen, mangas]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0D1322] border border-violet-500/30 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="relative px-5 py-4 border-b border-[#1F2E45] bg-gradient-to-r from-violet-950/40 via-[#101726] to-[#0D1322] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-violet-600/30">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>สถิติการอ่านส่วนตัว</span>
                <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full font-semibold">
                  Reading Stats
                </span>
              </h2>
              <p className="text-xs text-gray-400">สรุปพฤติกรรมและความคืบหน้าการอ่านการ์ตูนของคุณ</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin">
          {!stats ? (
            <div className="py-12 text-center text-gray-400">ยังไม่มีข้อมูลการ์ตูนในระบบ</div>
          ) : (
            <>
              {/* Highlight Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. สัปดาห์นี้อ่านไปทั้งหมด */}
                <div className="bg-gradient-to-br from-orange-950/30 to-[#141C30] border border-orange-500/30 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between text-orange-400 mb-1">
                    <span className="text-[11px] font-bold">สัปดาห์นี้</span>
                    <Flame className="w-4 h-4 fill-current text-orange-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white">
                      {stats.chaptersThisWeek}{" "}
                      <span className="text-xs font-normal text-orange-300">ตอน</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {stats.activeMangasThisWeek > 0
                        ? `เปิดอ่านไป ${stats.activeMangasThisWeek} เรื่อง`
                        : "เริ่มอ่านเรื่องแรกสัปดาห์นี้เลย!"}
                    </p>
                  </div>
                </div>

                {/* 2. อ่านไปทั้งหมด */}
                <div className="bg-gradient-to-br from-violet-950/30 to-[#141C30] border border-violet-500/30 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between text-violet-400 mb-1">
                    <span className="text-[11px] font-bold">อ่านแล้วทั้งหมด</span>
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white">
                      {stats.totalChaptersRead.toLocaleString()}{" "}
                      <span className="text-xs font-normal text-violet-300">ตอน</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      จาก {stats.totalMangas} เรื่องในคลัง
                    </p>
                  </div>
                </div>

                {/* 3. แนวที่อ่านเยอะสุด */}
                <div className="bg-gradient-to-br from-emerald-950/30 to-[#141C30] border border-emerald-500/30 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-400 mb-1">
                    <span className="text-[11px] font-bold">หมวดโปรดอันดับ 1</span>
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white truncate" title={stats.topCategory.name}>
                      {stats.topCategory.name}
                    </div>
                    <p className="text-[10px] text-emerald-300 mt-0.5 font-semibold">
                      {stats.topCategory.chapters.toLocaleString()} ตอน ({stats.topCategory.count} เรื่อง)
                    </p>
                  </div>
                </div>

                {/* 4. เรื่องที่ติดตามอยู่ */}
                <div className="bg-gradient-to-br from-sky-950/30 to-[#141C30] border border-sky-500/30 p-3.5 rounded-2xl flex flex-col justify-between">
                  <div className="flex items-center justify-between text-sky-400 mb-1">
                    <span className="text-[11px] font-bold">กำลังตามอ่าน</span>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white">
                      {stats.statusCounts.reading}{" "}
                      <span className="text-xs font-normal text-sky-300">เรื่อง</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      ดองไว้ {stats.statusCounts.on_hold} • จบ {stats.statusCounts.completed}
                    </p>
                  </div>
                </div>
              </div>

              {/* Most Read Manga Feature Hero */}
              {stats.mostOpenedManga && (
                <div className="bg-gradient-to-r from-violet-950/50 via-indigo-950/30 to-[#141C30] border border-violet-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3.5 w-full sm:w-auto">
                    <div className="relative w-14 aspect-[2/3] rounded-xl overflow-hidden bg-black/60 border border-violet-500/40 shrink-0 shadow-md">
                      {stats.mostOpenedManga.cover_url ? (
                        <img
                          src={stats.mostOpenedManga.cover_url}
                          alt={stats.mostOpenedManga.title}
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-cover ${
                            isDiscreetMode &&
                            (stats.mostOpenedManga.category?.toLowerCase().includes("dojin") ||
                              stats.mostOpenedManga.category?.toLowerCase().includes("ntr"))
                              ? "blur-md"
                              : ""
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-violet-400">
                          <BookOpen className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="bg-amber-400 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                          👑 เรื่องที่อ่านไปมากที่สุด
                        </span>
                        {stats.mostOpenedManga.tier && stats.mostOpenedManga.tier !== "none" && (
                          <span className="text-[9px] font-bold text-amber-300 bg-amber-950/50 px-1 rounded border border-amber-600/30">
                            Tier {stats.mostOpenedManga.tier}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-white truncate" title={stats.mostOpenedManga.title}>
                        {stats.mostOpenedManga.title}
                      </h4>
                      <p className="text-xs text-violet-300 font-semibold mt-0.5">
                        อ่านถึงตอนที่ {stats.mostOpenedManga.current_chapter}{" "}
                        {stats.mostOpenedManga.latest_available_chapter
                          ? `(ล่าสุดในเว็บ ช.${stats.mostOpenedManga.latest_available_chapter})`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {onOpenReader && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenReader(stats.mostOpenedManga!);
                      }}
                      className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-violet-600/30 flex items-center justify-center gap-1.5 active:scale-95 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>อ่านต่อเรื่องนี้</span>
                    </button>
                  )}
                </div>
              )}

              {/* Two Column Grid: Top Genres & Top Tags */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Top Categories */}
                <div className="bg-[#101726] border border-[#1F2E45] rounded-2xl p-4">
                  <h3 className="text-xs font-bold text-gray-300 mb-3 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                    <span>สัดส่วนหมวดหมู่ที่อ่าน (Top Categories)</span>
                  </h3>
                  <div className="space-y-2.5">
                    {stats.sortedCategories.slice(0, 4).map((cat) => {
                      const pct = Math.round(
                        (cat.chapters / Math.max(1, stats.totalChaptersRead)) * 100
                      );
                      return (
                        <div key={cat.name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-200">{cat.name}</span>
                            <span className="text-[11px] text-gray-400">
                              {cat.chapters.toLocaleString()} ตอน ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-2 bg-[#1A253D] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full"
                              style={{ width: `${Math.max(4, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top Tags */}
                <div className="bg-[#101726] border border-[#1F2E45] rounded-2xl p-4">
                  <h3 className="text-xs font-bold text-gray-300 mb-3 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-violet-400" />
                    <span>แนว / แท็กที่คุณชอบอ่านที่สุด</span>
                  </h3>
                  {stats.sortedTags.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {stats.sortedTags.map((item, idx) => (
                        <div
                          key={item.tag}
                          className="bg-[#151F33] border border-[#23334E] rounded-xl p-2.5 flex items-center justify-between"
                        >
                          <div className="min-w-0">
                            <span className="text-[10px] text-violet-400 font-bold block">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-semibold text-gray-200 truncate block">
                              #{item.tag}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-gray-400 bg-black/40 px-1.5 py-0.5 rounded">
                            {item.count} เรื่อง
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 py-4 text-center">
                      ยังไม่มีการใส่แท็กในการ์ตูน ลองเพิ่มแท็กเช่น #พระเอกเทพ, #เกิดใหม่ ในรายละเอียดเรื่อง!
                    </p>
                  )}
                </div>
              </div>

              {/* Tier & Status Distribution */}
              <div className="bg-[#101726] border border-[#1F2E45] rounded-2xl p-4">
                <h3 className="text-xs font-bold text-gray-300 mb-3 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span>สัดส่วน Tier & สถานะการอ่าน</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-amber-950/20 border border-amber-600/30 rounded-xl p-2.5 text-center">
                    <span className="text-xs font-bold text-amber-300">👑 Tier S</span>
                    <div className="text-lg font-black text-white mt-0.5">{stats.tierCounts.S} เรื่อง</div>
                  </div>
                  <div className="bg-orange-950/20 border border-orange-600/30 rounded-xl p-2.5 text-center">
                    <span className="text-xs font-bold text-orange-300">🔥 Tier A</span>
                    <div className="text-lg font-black text-white mt-0.5">{stats.tierCounts.A} เรื่อง</div>
                  </div>
                  <div className="bg-sky-950/20 border border-sky-600/30 rounded-xl p-2.5 text-center">
                    <span className="text-xs font-bold text-sky-300">✨ Tier B</span>
                    <div className="text-lg font-black text-white mt-0.5">{stats.tierCounts.B} เรื่อง</div>
                  </div>
                  <div className="bg-emerald-950/20 border border-emerald-600/30 rounded-xl p-2.5 text-center">
                    <span className="text-xs font-bold text-emerald-300">👍 Tier C</span>
                    <div className="text-lg font-black text-white mt-0.5">{stats.tierCounts.C} เรื่อง</div>
                  </div>
                </div>
              </div>

              {/* Top 5 Most Chapters List */}
              <div className="bg-[#101726] border border-[#1F2E45] rounded-2xl p-4">
                <h3 className="text-xs font-bold text-gray-300 mb-3 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span>5 อันดับเรื่องที่อ่านไปมากตอนที่สุด (Top 5 Series)</span>
                </h3>
                <div className="divide-y divide-[#1F2E45]/60">
                  {stats.topByChapters.map((m, index) => (
                    <div
                      key={m.id}
                      className="py-2.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            index === 0
                              ? "bg-amber-400 text-black shadow"
                              : index === 1
                              ? "bg-gray-300 text-black shadow"
                              : index === 2
                              ? "bg-amber-700 text-white"
                              : "bg-[#1E2B45] text-gray-300"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-200 truncate">{m.title}</p>
                          <p className="text-[10px] text-gray-400">
                            {m.category || "การ์ตูนทั่วไป"} • Tier {m.tier || "none"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-black text-violet-300">
                          ช.{m.current_chapter}
                        </span>
                        {onOpenReader && (
                          <button
                            onClick={() => {
                              onClose();
                              onOpenReader(m);
                            }}
                            className="p-1 rounded-lg bg-[#1F2E45] hover:bg-violet-600 text-gray-300 hover:text-white transition"
                            title="เปิดอ่านเรื่องนี้"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1F2E45] bg-[#0A0F1A] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#1C2940] hover:bg-[#253654] text-white text-xs font-bold transition"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
