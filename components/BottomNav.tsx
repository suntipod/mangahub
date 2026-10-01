"use client";

import React from "react";
import { BookOpen, PlusCircle, Settings, Bookmark } from "lucide-react";

interface BottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenAdd: () => void;
  onOpenSettings: () => void;
  unreadCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  onOpenAdd,
  onOpenSettings,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 sm:hidden bg-[#090D16]/95 backdrop-blur-lg border-t border-[#1F2E45] px-6 py-2.5 pb-[calc(0.6rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-around">
        {/* Bookshelf Tab */}
        <button
          onClick={() => onTabChange("all")}
          className={`flex flex-col items-center gap-1 transition ${
            currentTab === "all" ? "text-violet-400" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[11px] font-medium">ชั้นหนังสือ</span>
        </button>

        {/* Big Add Button (Center Thumb-Zone) */}
        <button
          onClick={onOpenAdd}
          className="flex flex-col items-center -mt-5"
        >
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/40 border-2 border-[#090D16] active:scale-95 transition">
            <PlusCircle className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-semibold text-violet-300 mt-1">กู้ชีพแท็บ</span>
        </button>

        {/* Settings Tab */}
        <button
          onClick={onOpenSettings}
          className="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-200 transition"
        >
          <Settings className="w-5 h-5" />
          <span className="text-[11px] font-medium">ตั้งค่า</span>
        </button>
      </div>
    </nav>
  );
};
