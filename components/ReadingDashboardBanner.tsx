"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Manga } from "@/types/manga";
import { getReadLogs } from "@/lib/storage";
import {
  Flame,
  Sparkles,
  TrendingUp,
  BarChart3,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Zap,
  ExternalLink,
  Award,
} from "lucide-react";

interface ReadingDashboardBannerProps {
  mangas: Manga[];
  onOpenStats: () => void;
  onOpenReader?: (manga: Manga) => void;
  onTagClick?: (tag: string) => void;
  onCategoryClick?: (category: string) => void;
}

export const ReadingDashboardBanner: React.FC<ReadingDashboardBannerProps> = ({
  mangas,
  onOpenStats,
  onOpenReader,
  onTagClick,
  onCategoryClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Load user preference for banner expansion from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("mangahub_dashboard_expanded");
    if (saved !== null) {
      setIsExpanded(saved === "true");
    }
  }, []);

  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("mangahub_dashboard_expanded", String(next));
    }
  };

  // Calculate Reading Stats & Insights
  const summary = useMemo(() => {
    if (!mangas || mangas.length === 0) return null;

    const logs = getReadLogs();
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Chapters read this week & today
    let weekChaptersFromLogs = 0;
    let todayChaptersFromLogs = 0;
    for (const log of logs) {
      const logDate = new Date(log.timestamp);
      if (logDate >= oneWeekAgo) {
        weekChaptersFromLogs += log.delta || 0;
      }
      if (logDate >= startOfToday) {
        todayChaptersFromLogs += log.delta || 0;
      }
    }

    const activeMangasThisWeek = mangas.filter((m) => {
      if (!m.last_read_at) return false;
      return new Date(m.last_read_at) >= oneWeekAgo;
    });

    const chaptersThisWeek = Math.max(weekChaptersFromLogs, activeMangasThisWeek.length);
    const chaptersToday = todayChaptersFromLogs;
    const totalChaptersRead = mangas.reduce((acc, m) => acc + (m.current_chapter || 0), 0);

    // 2. Manga with most updates / unread backlog
    const mangasWithBacklog = mangas
      .filter((m) => m.latest_available_chapter && m.latest_available_chapter > m.current_chapter)
      .map((m) => ({
        manga: m,
        backlog: (m.latest_available_chapter || m.current_chapter) - m.current_chapter,
      }))
      .sort((a, b) => b.backlog - a.backlog);

    const mostUpdatedManga = mangasWithBacklog[0]?.manga || null;
    const mostUpdatedBacklog = mangasWithBacklog[0]?.backlog || 0;

    // Highest chapter manga in case no backlog
    const topReadManga = [...mangas].sort((a, b) => (b.current_chapter || 0) - (a.current_chapter || 0))[0];

    // 3. Top Theme / Genre Analysis (Checking Tags, Title Keywords & Category)
    const THEME_KEYWORDS: Record<string, { label: string; icon: string; regex: RegExp }> = {
      murim: { label: "มูริม / กำลังภายใน", icon: "⚔️", regex: /มูริม|กำลังภายใน|ยุทธภพ|ดาบ|กระบี่|จอมยุทธ์|murim|martial/i },
      fantasy: { label: "แฟนตาซี", icon: "✨", regex: /แฟนตาซี|เวท|เวทมนตร์|จอมเวท|fantasy|magic|mage/i },
      regressor: { label: "ย้อนเวลา / เกิดใหม่", icon: "⏳", regex: /ย้อนเวลา|เกิดใหม่|กลับชาติ|หวนคืน|regress|reincarnat|return/i },
      dungeon: { label: "ลงดันเจี้ยน / ระบบ", icon: "🏰", regex: /ดันเจี้ยน|หอคอย|ระบบ|ฮันเตอร์|dungeon|tower|hunter|system|level/i },
      op: { label: "พระเอกเทพ", icon: "👑", regex: /พระเอกเทพ|เทพ|ไร้เทียมทาน|overpower|strongest/i },
      romance: { label: "โรแมนติก / ดราม่า", icon: "💖", regex: /โรแมนติก|ดราม่า|ความรัก|romance|drama|love/i },
      farming: { label: "ทำฟาร์ม / สโลว์ไลฟ์", icon: "🌾", regex: /ทำฟาร์ม|สโลว์ไลฟ์|เกษตร|farm|slow life/i },
      dojin: { label: "โดจิน / 18+", icon: "🔞", regex: /dojin|โดจิน|ntr|18\+/i },
    };

    const themeScores: Record<string, { key: string; label: string; icon: string; chapters: number; count: number }> = {};
    for (const [key, meta] of Object.entries(THEME_KEYWORDS)) {
      themeScores[key] = { key, label: meta.label, icon: meta.icon, chapters: 0, count: 0 };
    }

    for (const m of mangas) {
      const allText = `${m.title} ${m.alt_title || ""} ${(m.tags || []).join(" ")} ${m.category || ""}`.toLowerCase();
      let matchedAny = false;

      for (const [key, meta] of Object.entries(THEME_KEYWORDS)) {
        if (meta.regex.test(allText)) {
          themeScores[key].chapters += m.current_chapter || 1;
          themeScores[key].count += 1;
          matchedAny = true;
        }
      }

      // If no keyword match, count into general category
      if (!matchedAny && m.category) {
        if (!themeScores[m.category]) {
          themeScores[m.category] = {
            key: m.category,
            label: m.category,
            icon: "📚",
            chapters: 0,
            count: 0,
          };
        }
        themeScores[m.category].chapters += m.current_chapter || 1;
        themeScores[m.category].count += 1;
      }
    }

    const sortedThemes = Object.values(themeScores)
      .filter((t) => t.count > 0)
      .sort((a, b) => b.chapters - a.chapters);

    const topTheme = sortedThemes[0] || { label: "แฟนตาซี", icon: "✨", chapters: 0, count: 0 };
    const secondaryThemes = sortedThemes.slice(1, 3);

    return {
      chaptersThisWeek,
      chaptersToday,
      activeMangasThisWeek: activeMangasThisWeek.length,
      totalChaptersRead,
      mostUpdatedManga,
      mostUpdatedBacklog,
      topReadManga,
      topTheme,
      secondaryThemes,
      totalMangas: mangas.length,
    };
  }, [mangas]);

  if (!summary) return null;

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-[#111A2E]/90 via-[#0F1626]/90 to-[#121B2B]/90 border border-violet-500/30 rounded-2xl sm:rounded-3xl shadow-xl transition-all duration-300 animate-fade-in mb-3">
      {/* Top Banner Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0A0F1D]/70 border-b border-[#1E293B]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-sm">
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <span>สรุปสถิติ & ประวัติการอ่าน (Reading Tracker)</span>
          </span>
          <span className="text-[10px] font-semibold bg-violet-950/60 text-violet-300 border border-violet-800/40 px-2 py-0.5 rounded-full hidden sm:inline">
            Realtime
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenStats}
            className="flex items-center gap-1 text-[11px] font-bold text-violet-300 hover:text-white bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 px-2.5 py-1 rounded-lg transition active:scale-95 shadow-sm"
          >
            <span>ดูสถิติฉบับเต็ม 📊</span>
          </button>
          <button
            onClick={toggleExpanded}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-[#1E293B] transition"
            title={isExpanded ? "ย่อแถบสถิติ" : "ขยายแถบสถิติ"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Dashboard Content */}
      {isExpanded ? (
        <div className="p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: สัปดาห์นี้อ่านไปแล้วกี่ตอน */}
          <div className="bg-[#0B1120] border border-[#1E293B] hover:border-orange-500/40 rounded-2xl p-3.5 flex flex-col justify-between transition group shadow-sm">
            <div className="flex items-center justify-between text-orange-400">
              <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
                <span>สัปดาห์นี้อ่านไปแล้ว</span>
              </span>
              <span className="text-[10px] font-bold bg-orange-950/60 text-orange-300 border border-orange-800/40 px-2 py-0.5 rounded-md">
                7 วันล่าสุด
              </span>
            </div>

            <div className="my-2">
              <div className="text-2xl sm:text-3xl font-black text-white flex items-baseline gap-1.5">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">
                  {summary.chaptersThisWeek}
                </span>
                <span className="text-xs font-bold text-gray-400">ตอน</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {summary.activeMangasThisWeek > 0
                  ? `เปิดอ่านไป ${summary.activeMangasThisWeek} เรื่อง • วันนี้ +${summary.chaptersToday} ตอน`
                  : `อ่านรวมทั้งหมด ${summary.totalChaptersRead.toLocaleString()} ตอน`}
              </p>
            </div>

            <div className="w-full bg-[#162035] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(10, summary.chaptersThisWeek * 4))}%` }}
              />
            </div>
          </div>

          {/* Card 2: เรื่องที่อัปเดตถี่ / มีตอนค้างมากสุด */}
          <div className="bg-[#0B1120] border border-[#1E293B] hover:border-cyan-500/40 rounded-2xl p-3.5 flex flex-col justify-between transition group shadow-sm">
            <div className="flex items-center justify-between text-cyan-400">
              <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400 fill-cyan-400" />
                <span>
                  {summary.mostUpdatedManga ? "อัปเดตมีตอนใหม่ค้างอยู่" : "เรื่องที่อ่านมากที่สุด"}
                </span>
              </span>
              {summary.mostUpdatedBacklog > 0 && (
                <span className="text-[10px] font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 px-2 py-0.5 rounded-md animate-pulse">
                  +{summary.mostUpdatedBacklog} ตอน
                </span>
              )}
            </div>

            {summary.mostUpdatedManga ? (
              <div className="my-2">
                <h4
                  className="text-sm font-bold text-white truncate group-hover:text-cyan-300 transition-colors"
                  title={summary.mostUpdatedManga.title}
                >
                  {summary.mostUpdatedManga.title}
                </h4>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-0.5">
                  <span className="text-cyan-300 font-semibold">
                    อ่านถึง ช.{summary.mostUpdatedManga.current_chapter}
                  </span>
                  <span>/</span>
                  <span className="text-orange-400 font-bold">
                    ในเว็บ ช.{summary.mostUpdatedManga.latest_available_chapter}
                  </span>
                </div>
              </div>
            ) : summary.topReadManga ? (
              <div className="my-2">
                <h4 className="text-sm font-bold text-white truncate" title={summary.topReadManga.title}>
                  {summary.topReadManga.title}
                </h4>
                <p className="text-[11px] text-violet-300 font-semibold mt-0.5">
                  อ่านไปแล้วถึงตอนที่ {summary.topReadManga.current_chapter}
                </p>
              </div>
            ) : (
              <div className="my-2 text-xs text-gray-500">ไม่มีข้อมูลการอัปเดต</div>
            )}

            {summary.mostUpdatedManga && onOpenReader && (
              <button
                onClick={() => onOpenReader(summary.mostUpdatedManga!)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-700/40 text-cyan-300 rounded-xl text-xs font-bold transition active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>เปิดอ่านตอนค้างทันที</span>
              </button>
            )}
          </div>

          {/* Card 3: หมวดหมู่ / แนวการ์ตูนที่อ่านเยอะที่สุด */}
          <div className="bg-[#0B1120] border border-[#1E293B] hover:border-violet-500/40 rounded-2xl p-3.5 flex flex-col justify-between transition group shadow-sm">
            <div className="flex items-center justify-between text-violet-400">
              <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-violet-400" />
                <span>แนวโปรดที่อ่านเยอะที่สุด</span>
              </span>
              <span className="text-[10px] font-bold bg-violet-950/60 text-violet-300 border border-violet-800/40 px-2 py-0.5 rounded-md">
                Top Genre
              </span>
            </div>

            <div className="my-2">
              <div className="flex items-center gap-1.5">
                <span className="text-lg">{summary.topTheme.icon}</span>
                <span className="text-sm sm:text-base font-extrabold text-white truncate">
                  {summary.topTheme.label}
                </span>
              </div>
              <p className="text-[11px] text-violet-300 mt-0.5 font-medium">
                อ่านไปแล้ว {summary.topTheme.chapters.toLocaleString()} ตอน ({summary.topTheme.count} เรื่อง)
              </p>
            </div>

            {/* Quick Filter Clickable Theme Badges */}
            <div className="flex flex-wrap gap-1 pt-1">
              <span className="text-[10px] text-gray-500 self-center">แนวฮิต:</span>
              {[summary.topTheme, ...summary.secondaryThemes].slice(0, 3).map((th) => (
                <button
                  key={th.label}
                  type="button"
                  onClick={() => {
                    if (onTagClick) {
                      // Extract clean tag text
                      const clean = th.label.split("/")[0].trim();
                      onTagClick(clean);
                    }
                  }}
                  className="text-[10px] font-semibold bg-[#151F33] hover:bg-violet-600/80 text-violet-300 hover:text-white px-2 py-0.5 rounded-lg border border-violet-500/20 transition active:scale-95"
                  title={`คลิกเพื่อกรองการ์ตูนแนว ${th.label}`}
                >
                  {th.icon} {th.label.split("/")[0].trim()}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed Compact Strip */
        <div className="px-4 py-2 flex items-center justify-between text-xs text-gray-300 gap-3 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
              <span>สัปดาห์นี้: </span>
              <strong className="text-white">{summary.chaptersThisWeek} ตอน</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span>{summary.topTheme.icon}</span>
              <span>แนวโปรด: </span>
              <strong className="text-violet-300">{summary.topTheme.label}</strong>
            </span>
            {summary.mostUpdatedBacklog > 0 && (
              <span className="flex items-center gap-1.5 text-cyan-300 font-bold animate-pulse">
                <Zap className="w-3.5 h-3.5 fill-cyan-400 text-cyan-400" />
                <span>มีตอนใหม่อ่านค้างอยู่ +{summary.mostUpdatedBacklog} ตอน</span>
              </span>
            )}
          </div>

          <button
            onClick={toggleExpanded}
            className="text-[11px] text-violet-400 hover:text-violet-300 underline underline-offset-2 flex items-center gap-1"
          >
            <span>ขยายดูสรุป</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
