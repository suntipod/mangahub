"use client";

import React from "react";
import { BookOpen, PlusCircle, Flame, Dices, BarChart3 } from "lucide-react";

interface BottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenAdd: () => void;
  onOpenSettings: () => void;
  onOpenRandom: () => void;
  onOpenStats: () => void;
  unreadCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  onOpenAdd,
  onOpenRandom,
  onOpenStats,
  unreadCount = 0,
}) => {
  return (
    <nav
      aria-label="เมนูนำทางด้านล่างสำหรับมือถือ"
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0F19]/95 backdrop-blur-xl border-t border-[#1F2E45] px-2 pt-1.5 pb-safe"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        <button
          onClick={() => onTabChange("all")}
          aria-label="ชั้นหนังสือทั้งหมด"
          className={`relative flex flex-col items-center justify-center min-h-[44px] min-w-[56px] py-1 px-2 rounded-xl transition active:scale-95 ${
            currentTab === "all" ? "text-violet-400" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <div className="relative">
            <BookOpen className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-orange-500 text-white text-[9px] font-black px-1 min-w-[16px] h-4 rounded-full flex items-center justify-center tabular-nums shadow">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1 font-semibold">ชั้นหนังสือ</span>
        </button>

        <button
          onClick={() => onTabChange("reading")}
          aria-label="การ์ตูนที่กำลังอ่าน"
          className={`flex flex-col items-center justify-center min-h-[44px] min-w-[56px] py-1 px-2 rounded-xl transition active:scale-95 ${
            currentTab === "reading" ? "text-orange-400" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Flame className="w-5 h-5" />
          <span className="text-[10px] mt-1 font-semibold">กำลังอ่าน</span>
        </button>

        {/* Center Highlight Action Button */}
        <button
          onClick={onOpenAdd}
          aria-label="กู้ชีพแท็บหรือเพิ่มการ์ตูนใหม่"
          className="flex flex-col items-center justify-center -mt-5 bg-gradient-to-tr from-violet-600 to-indigo-500 text-white p-3 rounded-2xl shadow-lg shadow-violet-600/40 active:scale-95 transition border border-violet-400/30"
        >
          <PlusCircle className="w-6 h-6" />
        </button>

        <button
          onClick={onOpenRandom}
          aria-label="สุ่มเรื่องอ่าน"
          className="flex flex-col items-center justify-center min-h-[44px] min-w-[56px] py-1 px-2 rounded-xl text-amber-400 hover:text-amber-300 transition active:scale-95"
        >
          <Dices className="w-5 h-5" />
          <span className="text-[10px] mt-1 font-bold">สุ่มอ่าน</span>
        </button>

        <button
          onClick={onOpenStats}
          aria-label="ดูสถิติการอ่าน"
          className="flex flex-col items-center justify-center min-h-[44px] min-w-[56px] py-1 px-2 rounded-xl text-slate-400 hover:text-violet-300 transition active:scale-95"
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] mt-1 font-semibold">สถิติ</span>
        </button>
      </div>
    </nav>
  );
};
