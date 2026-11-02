"use client";

import React from "react";
import {
  BookMarked,
  Cloud,
  RefreshCw,
  Settings,
  Plus,
  Flame,
  EyeOff,
  Eye,
  Database,
  CheckCircle2,
  WifiOff,
  BarChart3,
  Dices,
  Smartphone,
  Search,
  X,
} from "lucide-react";
import { SupabaseConfig, CloudSyncStatus } from "@/types/manga";

interface HeaderProps {
  supabaseConfig: SupabaseConfig;
  syncStatus: CloudSyncStatus;
  mangasCount?: number;
  lastSyncedAt?: Date | null;
  isSyncing: boolean;
  onSync: () => void;
  onOpenSettings: () => void;
  onOpenBackup: () => void;
  onOpenInstallPwa?: () => void;
  onOpenStats: () => void;
  onOpenRandom: () => void;
  onOpenAdd: () => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onCheckUpdates?: () => void;
  isCheckingUpdates?: boolean;
  checkProgress?: { current: number; total: number } | null;
  isDiscreetMode?: boolean;
  onToggleDiscreet?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  supabaseConfig,
  syncStatus,
  mangasCount = 0,
  lastSyncedAt,
  isSyncing,
  onSync,
  onOpenSettings,
  onOpenBackup,
  onOpenInstallPwa,
  onOpenStats,
  onOpenRandom,
  onOpenAdd,
  searchQuery,
  onSearchChange,
  onCheckUpdates,
  isCheckingUpdates = false,
  checkProgress = null,
  isDiscreetMode = false,
  onToggleDiscreet,
}) => {
  // Format time for tooltip
  const formattedSyncTime = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#090D16]/90 border-b border-[#1E293B] pt-safe">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-600/30 shrink-0">
              <BookMarked className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base sm:text-xl font-bold bg-gradient-to-r from-white via-violet-200 to-indigo-300 bg-clip-text text-transparent tracking-tight truncate">
                  MangaHub
                </h1>
                {mangasCount > 0 && (
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-md bg-violet-950/90 text-violet-300 border border-violet-700/50 shrink-0 tabular-nums"
                    title={`มีการ์ตูนทั้งหมด ${mangasCount} เรื่องในชั้นหนังสือ`}
                  >
                    {mangasCount} เรื่อง
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                สมุดบันทึกตอนการ์ตูน & ซิงค์ข้ามอุปกรณ์
              </p>
            </div>
          </div>

          {/* Search Bar (Desktop) */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="ค้นหาชื่อเรื่อง, ชื่อรอง, แท็ก หรือเว็บที่อ่าน..."
                aria-label="ค้นหาการ์ตูน"
                className="w-full bg-[#131B2E] border border-[#1E293B] focus:border-violet-500 rounded-xl pl-10 pr-9 py-2 text-sm text-gray-100 placeholder-slate-400 outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange("")}
                  aria-label="ล้างคำค้นหา"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Discreet Mode Toggle (Blur 18+ Covers) */}
            {onToggleDiscreet && (
              <button
                onClick={onToggleDiscreet}
                aria-label={isDiscreetMode ? "ปิดโหมดซ่อนปก 18+" : "เปิดโหมดซ่อนปก 18+"}
                aria-pressed={isDiscreetMode}
                className={`flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border transition active:scale-95 ${
                  isDiscreetMode
                    ? "bg-rose-950/60 border-rose-700/60 text-rose-300 hover:bg-rose-900/60 shadow-lg shadow-rose-950/50"
                    : "bg-[#131B2E] border-[#1E293B] text-slate-300 hover:text-white hover:bg-[#1E293B]"
                }`}
                title={
                  isDiscreetMode
                    ? "กำลังเปิดโหมดซ่อนปก 18+ (คลิกเพื่อแสดงรูปปกตามปกติ)"
                    : "เปิดโหมดซ่อนปก 18+ (เบลอหน้าปกโดจิน/NTR เวลาอยู่นอกบ้าน)"
                }
              >
                {isDiscreetMode ? (
                  <>
                    <EyeOff className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="hidden xl:inline">ซ่อนปก 18+</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 text-slate-300 shrink-0" />
                    <span className="hidden xl:inline">ปกปกติ</span>
                  </>
                )}
              </button>
            )}

            {/* Random Manga Picker Button */}
            <button
              onClick={onOpenRandom}
              aria-label="สุ่มการ์ตูนอ่าน"
              className="flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border bg-gradient-to-r from-amber-950/40 to-orange-950/40 border-amber-700/40 text-amber-300 hover:bg-amber-900/40 transition active:scale-95"
              title="วันนี้อ่านเรื่องอะไรดี? สุ่มการ์ตูนจากชั้นหนังสือ"
            >
              <Dices className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="hidden lg:inline">สุ่มอ่าน</span>
            </button>

            {/* Reading Stats Dashboard Button */}
            <button
              onClick={onOpenStats}
              aria-label="สถิติการอ่านส่วนตัว"
              className="hidden sm:flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border bg-[#131B2E] border-[#1E293B] text-violet-300 hover:text-white hover:bg-[#1E293B] transition active:scale-95"
              title="ดูสถิติการอ่านส่วนตัวของคุณ (Reading Stats)"
            >
              <BarChart3 className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="hidden lg:inline">สถิติ</span>
            </button>

            {/* Check Online Chapter Updates Button */}
            {onCheckUpdates && (
              <button
                onClick={onCheckUpdates}
                disabled={isCheckingUpdates}
                aria-label="ตรวจหาตอนใหม่จากเว็บ"
                className={`flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border transition active:scale-95 tabular-nums ${
                  isCheckingUpdates
                    ? "bg-orange-950/50 border-orange-700/60 text-orange-300 cursor-wait"
                    : "bg-orange-950/30 border-orange-800/50 text-orange-300 hover:bg-orange-900/40"
                }`}
                title="ตรวจสอบตอนใหม่ล่าสุดจากหน้าเว็บทุกเรื่อง"
              >
                <Flame
                  className={`w-4 h-4 text-orange-400 shrink-0 ${
                    isCheckingUpdates ? "animate-bounce" : ""
                  }`}
                />
                <span className="hidden lg:inline">
                  {isCheckingUpdates && checkProgress
                    ? `เช็กตอนใหม่ (${checkProgress.current}/${checkProgress.total})`
                    : "เช็กตอนใหม่"}
                </span>
              </button>
            )}

            {/* Cloud Sync Status Badge */}
            <button
              onClick={supabaseConfig.enabled ? onSync : onOpenSettings}
              disabled={isSyncing || syncStatus === "syncing"}
              aria-label="สถานะการซิงค์ข้อมูล Cloud"
              className={`flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border transition active:scale-95 ${
                !supabaseConfig.enabled || syncStatus === "disabled"
                  ? "bg-[#131B2E] border-[#1E293B] text-slate-300 hover:text-gray-100"
                  : syncStatus === "syncing" || isSyncing
                  ? "bg-amber-950/40 border-amber-700/50 text-amber-300 animate-pulse"
                  : syncStatus === "offline"
                  ? "bg-rose-950/50 border-rose-700/60 text-rose-300 hover:bg-rose-900/50"
                  : "bg-emerald-950/40 border-emerald-800/50 text-emerald-300 hover:bg-emerald-900/40"
              }`}
              title={
                !supabaseConfig.enabled || syncStatus === "disabled"
                  ? "คลิกเพื่อตั้งค่าการซิงค์ข้อมูลข้ามอุปกรณ์ (Supabase Cloud)"
                  : syncStatus === "syncing" || isSyncing
                  ? "🟡 กำลังซิงค์ข้อมูลกับ Supabase Cloud..."
                  : syncStatus === "offline"
                  ? "🔴 ออฟไลน์ / ซิงค์ไม่สำเร็จ (คลิกเพื่อลองซิงค์ใหม่)"
                  : `🟢 ข้อมูลตรงกับ Cloud สมบูรณ์แล้ว${
                      formattedSyncTime ? ` (อัปเดตล่าสุด ${formattedSyncTime})` : ""
                    } - คลิกเพื่อซิงค์ใหม่`
              }
            >
              {!supabaseConfig.enabled || syncStatus === "disabled" ? (
                <>
                  <Cloud className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="hidden md:inline">ตั้งค่าซิงค์</span>
                </>
              ) : syncStatus === "syncing" || isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                  <span className="hidden sm:inline">กำลังซิงค์...</span>
                </>
              ) : syncStatus === "offline" ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="hidden sm:inline">ออฟไลน์</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 hidden sm:inline shrink-0" />
                  <span className="hidden sm:inline">ซิงค์แล้ว</span>
                </>
              )}
            </button>

            {/* Add / Rescue Tab Button */}
            <button
              onClick={onOpenAdd}
              aria-label="กู้ชีพแท็บหรือเพิ่มการ์ตูนใหม่"
              className="hidden sm:flex items-center gap-1.5 min-h-[40px] bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold px-3.5 py-2 rounded-xl text-xs sm:text-sm shadow-lg shadow-violet-600/25 transition active:scale-95"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>กู้ชีพแท็บ / เพิ่มเรื่อง</span>
            </button>

            {/* Install App on iPhone / Mobile PWA Button */}
            {onOpenInstallPwa && (
              <button
                onClick={onOpenInstallPwa}
                aria-label="ติดตั้งแอปลงหน้าจอมือถือ"
                className="flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-700/50 text-indigo-300 text-xs font-bold transition active:scale-95"
                title="วิธีติดตั้งแอป MangaHub ลงหน้าจอโฮม iPhone / Android"
              >
                <Smartphone className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="hidden xl:inline">ติดตั้งแอป</span>
              </button>
            )}

            {/* Quick Backup & Restore JSON / CSV Button */}
            <button
              onClick={onOpenBackup}
              aria-label="สำรองข้อมูลและกู้คืนไฟล์"
              className="flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl bg-emerald-950/30 hover:bg-emerald-900/40 border border-emerald-800/50 text-emerald-300 text-xs font-bold transition active:scale-95"
              title="สำรองข้อมูลลงแฟลชไดรฟ์ / กู้คืนไฟล์ Backup JSON & Excel CSV"
            >
              <Database className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="hidden xl:inline">สำรองข้อมูล</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={onOpenSettings}
              aria-label="ตั้งค่าระบบและหมวดหมู่"
              className="flex items-center justify-center min-w-[40px] min-h-[40px] p-2 rounded-xl bg-[#131B2E] hover:bg-[#1E293B] border border-[#1E293B] text-slate-300 hover:text-white transition active:scale-95"
              title="ตั้งค่าระบบ & จัดการหมวดหมู่"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar (Mobile) — uses text-base (16px) to prevent iOS Safari auto-zoom on focus */}
        <div className="mt-2.5 md:hidden">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="ค้นหาชื่อเรื่อง, แท็ก หรือเว็บอ่าน..."
              aria-label="ค้นหาการ์ตูน"
              className="w-full bg-[#131B2E] border border-[#1E293B] focus:border-violet-500 rounded-xl pl-10 pr-9 py-2 text-base text-gray-100 placeholder-slate-400 outline-none transition"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                aria-label="ล้างคำค้นหา"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
