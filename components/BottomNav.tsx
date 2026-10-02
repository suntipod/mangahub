"use client";

import React from "react";
import { BookOpen, PlusCircle, Settings, Dices, BarChart3 } from "lucide-react";

interface BottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenAdd: () => void;
  onOpenSettings: () => void;
  onOpenRandom?: () => void;
  onOpenStats?: () => void;
  unreadCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  onOpenAdd,
  onOpenSettings,
  onOpenRandom,
  onOpenStats,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 sm:hidden bg-[#090D16]/95 backdrop-blur-lg border-t border-[#1F2E45] px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-around">
        {/* Bookshelf Tab */}
        <button
          onClick={() => onTabChange("all")}
          className={`flex flex-col items-center gap-0.5 transition ${
            currentTab === "all" ? "text-violet-400" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] font-medium">ชั้นหนังสือ</span>
        </button>

        {/* Random Picker Button */}
        {onOpenRandom && (
          <button
            onClick={onOpenRandom}
            className="flex flex-col items-center gap-0.5 text-amber-400/80 hover:text-amber-300 transition"
          >
            <Dices className="w-5 h-5" />
            <span className="text-[10px] font-medium">สุ่มอ่าน 🎲</span>
          </button>
        )}

        {/* Big Add Button (Center Thumb-Zone) */}
        <button
          onClick={onOpenAdd}
          className="flex flex-col items-center -mt-4"
        >
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/40 border-2 border-[#090D16] active:scale-95 transition">
            <PlusCircle className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-semibold text-violet-300 mt-0.5">กู้ชีพ</span>
        </button>

        {/* Stats Button */}
        {onOpenStats && (
          <button
            onClick={onOpenStats}
            className="flex flex-col items-center gap-0.5 text-violet-400/80 hover:text-violet-300 transition"
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-medium">สถิติ 📊</span>
          </button>
        )}

        {/* Settings Tab */}
        <button
          onClick={onOpenSettings}
          className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-gray-200 transition"
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium">ตั้งค่า</span>
        </button>
      </div>
    </nav>
  );
};
