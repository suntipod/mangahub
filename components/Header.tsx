"use client";

import React from "react";
import { BookOpen, RefreshCw, Settings, Plus, Cloud, CloudOff, Wifi, Flame, Loader2, Eye, EyeOff, Database } from "lucide-react";
import { SupabaseConfig, CloudSyncStatus } from "@/types/manga";

interface HeaderProps {
  supabaseConfig: SupabaseConfig;
  syncStatus?: CloudSyncStatus;
  mangasCount?: number;
  lastSyncedAt?: Date | null;
  isSyncing: boolean;
  onSync: () => void;
  onOpenSettings: () => void;
  onOpenBackup?: () => void;
  onOpenAdd: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCheckUpdates?: () => void;
  isCheckingUpdates?: boolean;
  checkProgress?: { current: number; total: number } | null;
  isDiscreetMode?: boolean;
  onToggleDiscreet?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  supabaseConfig,
  syncStatus = "synced",
  mangasCount,
  lastSyncedAt,
  isSyncing,
  onSync,
  onOpenSettings,
  onOpenBackup,
  onOpenAdd,
  searchQuery,
  onSearchChange,
  onCheckUpdates,
  isCheckingUpdates,
  checkProgress,
  isDiscreetMode = false,
  onToggleDiscreet,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#090D16]/95 backdrop-blur-md border-b border-[#1F2E45] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Brand / Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
              Manga<span className="text-violet-400">Hub</span>
            </h1>
            <div className="flex items-center gap-1.5 text-xs pt-0.5">
              <button
                type="button"
                onClick={onSync}
                disabled={isSyncing}
                title={
                  syncStatus === "syncing"
                    ? "กำลังซิงค์ข้อมูลกับ Cloud... (โปรดรอสักครู่ก่อนปิดแท็บ)"
                    : syncStatus === "synced"
                    ? `🟢 ข้อมูลในเครื่องกับ Supabase ตรงกันสมบูรณ์ (${mangasCount || 0} เรื่อง) ${
                        lastSyncedAt
                          ? `• ซิงค์ล่าสุด ${lastSyncedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`
                          : ""
                      } - คลิกเพื่อซิงค์ใหม่อีกครั้ง`
                    : syncStatus === "offline"
                    ? "🔴 ออฟไลน์ / ไม่สามารถเชื่อมต่อ Supabase ได้ (บันทึกในเครื่องเรียบร้อยแล้ว) - คลิกเพื่อลองใหม่"
                    : `⚪ บันทึกในเครื่อง (${mangasCount || 0} เรื่อง) - คลิกเพื่อเปิดการตั้งค่า Supabase`
                }
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition border active:scale-95 text-left ${
                  syncStatus === "syncing"
                    ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                    : syncStatus === "synced"
                    ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40"
                    : syncStatus === "offline"
                    ? "bg-rose-950/50 border-rose-500/40 text-rose-300 hover:bg-rose-900/40"
                    : "bg-[#131B2E] border-[#1F2E45] text-gray-400 hover:text-gray-300"
                }`}
              >
                {syncStatus === "syncing" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-amber-300">Syncing...</span>
                  </>
                ) : syncStatus === "synced" ? (
                  <>
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-bold text-emerald-300">Synced</span>
                    {typeof mangasCount === "number" && (
                      <span className="text-[10px] text-emerald-400/80 hidden sm:inline">
                        ({mangasCount})
                      </span>
                    )}
                  </>
                ) : syncStatus === "offline" ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0"></span>
                    <span className="text-[11px] font-semibold text-rose-300">Offline</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="text-[11px] text-gray-400">Local ({mangasCount || 0})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>


        {/* Search input (Hidden on small screens) */}
        <div className="flex-1 max-w-md hidden sm:block">
          <input
            type="text"
            placeholder="ค้นหาชื่อการ์ตูน..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#131B2E] border border-[#1F2E45] focus:border-violet-500 rounded-xl px-4 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none transition"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Check Updates Button */}
          {onCheckUpdates && (
            <button
              onClick={onCheckUpdates}
              disabled={isCheckingUpdates}
              title="ตรวจหาตอนใหม่จากเว็บทั้งหมด"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                isCheckingUpdates
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/30 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white shadow-orange-500/20 active:scale-95"
              }`}
            >
              {isCheckingUpdates ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Flame className="w-3.5 h-3.5" />
              )}
              <span className="hidden md:inline">
                {isCheckingUpdates && checkProgress
                  ? `ตรวจ ${checkProgress.current}/${checkProgress.total}`
                  : "ตรวจหาตอนใหม่"}
              </span>
            </button>
          )}

          {/* Discreet 18+ Blur Toggle Button */}
          {onToggleDiscreet && (
            <button
              onClick={onToggleDiscreet}
              title={
                isDiscreetMode
                  ? "โหมดเซฟตี้ 18+ (เปิดเบลอปกอยู่) - คลิกเพื่อปิด"
                  : "โหมดเซฟตี้ 18+ (ปิดอยู่) - คลิกเพื่อเปิดเบลอปก Dojin/NTR เมื่ออยู่นอกบ้าน"
              }
              className={`flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold transition shadow-sm active:scale-95 ${
                isDiscreetMode
                  ? "bg-rose-950/60 text-rose-300 border border-rose-500/60 shadow-rose-950/50"
                  : "bg-[#131B2E] text-gray-400 hover:text-gray-200 border border-[#1F2E45]"
              }`}
            >
              {isDiscreetMode ? (
                <>
                  <EyeOff className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="hidden lg:inline text-[11px] text-rose-300">เบลอ 18+ [ON]</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="hidden lg:inline text-[11px]">เบลอ 18+</span>
                </>
              )}
            </button>
          )}

          {/* Manual Refresh / Sync Button */}
          <button
            onClick={onSync}
            disabled={isSyncing}
            title="รีเฟรช / ซิงค์ข้อมูล"
            className={`p-2.5 rounded-xl bg-[#131B2E] hover:bg-[#1C2940] border border-[#1F2E45] text-gray-300 transition ${
              isSyncing ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-violet-400" : ""}`} />
          </button>

          <button
            onClick={onOpenAdd}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm shadow-md shadow-violet-600/30 transition"
          >
            <Plus className="w-4 h-4" />
            <span>กู้ชีพแท็บ Safari</span>
          </button>

          {/* Backup & Restore JSON Button */}
          {onOpenBackup && (
            <button
              onClick={onOpenBackup}
              title="สำรองและกู้คืนข้อมูล (Backup & Restore JSON)"
              className="p-2.5 rounded-xl bg-[#131B2E] hover:bg-[#1C2940] border border-[#1F2E45] text-emerald-400 hover:text-emerald-300 transition"
            >
              <Database className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenSettings}
            title="ตั้งค่าระบบ / Supabase"
            className="p-2.5 rounded-xl bg-[#131B2E] hover:bg-[#1C2940] border border-[#1F2E45] text-gray-300 transition"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>


      {/* Mobile Search input */}
      <div className="mt-2.5 sm:hidden">
        <input
          type="text"
          placeholder="ค้นหาชื่อการ์ตูน..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-[#131B2E] border border-[#1F2E45] focus:border-violet-500 rounded-xl px-3.5 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none transition"
        />
      </div>
    </header>
  );
};
