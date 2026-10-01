"use client";

import React from "react";
import { BookOpen, RefreshCw, Settings, Plus, Cloud, Wifi, Flame, Loader2 } from "lucide-react";
import { SupabaseConfig } from "@/types/manga";

interface HeaderProps {
  supabaseConfig: SupabaseConfig;
  isSyncing: boolean;
  onSync: () => void;
  onOpenSettings: () => void;
  onOpenAdd: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCheckUpdates?: () => void;
  isCheckingUpdates?: boolean;
  checkProgress?: { current: number; total: number } | null;
}

export const Header: React.FC<HeaderProps> = ({
  supabaseConfig,
  isSyncing,
  onSync,
  onOpenSettings,
  onOpenAdd,
  searchQuery,
  onSearchChange,
  onCheckUpdates,
  isCheckingUpdates,
  checkProgress,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#090D16]/90 backdrop-blur-md border-b border-[#1F2E45] px-4 py-3 sm:px-6">
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
            <div className="flex items-center gap-1.5 text-xs">
              {supabaseConfig.enabled ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Cloud className="w-3 h-3" /> Supabase Cloud Synced
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400/90 font-medium">
                  <Wifi className="w-3 h-3 text-emerald-400" /> Wi-Fi Network Synced
                </span>
              )}
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

          <button
            onClick={onOpenSettings}
            title="ตั้งค่า Supabase / สำรองข้อมูล"
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
