"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#090D16] text-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#111827] border border-gray-800 rounded-2xl p-6 text-center shadow-2xl space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white">เกิดข้อผิดพลาดในการแสดงผล</h2>
        <p className="text-xs text-gray-400 leading-relaxed">
          {error?.message || "ระบบพบปัญหาที่ไม่คาดคิด กรุณาลองโหลดหน้านี้ใหม่อีกครั้ง"}
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-lg shadow-blue-600/25"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            ลองใหม่อีกครั้ง
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold border border-gray-700 transition-all"
          >
            รีเฟรชหน้าเว็บ
          </button>
        </div>
      </div>
    </div>
  );
}
