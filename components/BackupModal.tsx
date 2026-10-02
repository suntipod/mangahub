"use client";

import React, { useState, useRef } from "react";
import { Manga, MangaBackupData } from "@/types/manga";
import {
  X,
  Download,
  Upload,
  Database,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  FileText,
  Cloud,
  CheckCircle2,
  ShieldCheck,
  Layers,
  BookOpen,
  FileSpreadsheet,
} from "lucide-react";
import { exportBackupData, exportMangasToCsv, parseCsvToMangas, restoreBackupData } from "@/lib/storage";
import { getStoredCategories } from "@/lib/categories";

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  mangas: Manga[];
  supabaseEnabled: boolean;
  onDataRestored: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  mangas,
  supabaseEnabled,
  onDataRestored,
}) => {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [isCopied, setIsCopied] = useState(false);

  // Import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<MangaBackupData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [syncSupabase, setSyncSupabase] = useState(supabaseEnabled);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ current: number; total: number } | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<{ count: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const categories = getStoredCategories();
  const totalSources = mangas.reduce((acc, m) => acc + (m.sources?.length || 0), 0);

  // Handle Export JSON File Download
  const handleDownloadBackup = () => {
    const backupData = exportBackupData(mangas);
    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const filename = `mangahub-backup-${dateStr}-${timeStr}.json`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Handle Export Excel / CSV File Download
  const handleDownloadCsv = () => {
    const csvString = exportMangasToCsv(mangas);
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const filename = `mangahub-mangas-${dateStr}-${timeStr}.csv`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Handle Copy JSON to Clipboard
  const handleCopyJson = async () => {
    try {
      const backupData = exportBackupData(mangas);
      const jsonString = JSON.stringify(backupData, null, 2);
      await navigator.clipboard.writeText(jsonString);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy JSON:", err);
    }
  };

  // Handle File Selection & Parsing (Supports both JSON & Excel CSV)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImportError(null);
    setRestoreSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;

        // Check if file is CSV
        if (file.name.toLowerCase().endsWith(".csv")) {
          const { mangas: parsedMangas, categories: parsedCategories } = parseCsvToMangas(text);

          if (parsedMangas.length === 0) {
            setImportError("ไม่พบรายการมังงะในไฟล์ CSV กรุณาตรวจสอบว่ามีหัวตารางถูกต้อง");
            setParsedData(null);
            return;
          }

          const totalSrcs = parsedMangas.reduce((acc, m) => acc + (m.sources?.length || 0), 0);

          setParsedData({
            app: "MangaHub",
            version: 2,
            exportedAt: new Date().toISOString(),
            stats: {
              totalMangas: parsedMangas.length,
              totalSources: totalSrcs,
              totalCategories: parsedCategories.length,
            },
            categories: parsedCategories,
            mangas: parsedMangas,
          });
          return;
        }

        // Standard JSON Parsing
        const parsed = JSON.parse(text);

        let validatedMangas: Manga[] = [];
        let validatedCategories: string[] = [];

        if (Array.isArray(parsed)) {
          validatedMangas = parsed;
        } else if (typeof parsed === "object" && parsed !== null) {
          if (Array.isArray(parsed.mangas)) {
            validatedMangas = parsed.mangas;
          }
          if (Array.isArray(parsed.categories)) {
            validatedCategories = parsed.categories;
          }
        }

        if (validatedMangas.length === 0) {
          setImportError("ไม่พบรายการมังงะในไฟล์ที่เลือก กรุณาตรวจสอบไฟล์ .json หรือ .csv");
          setParsedData(null);
          return;
        }

        const validList = validatedMangas.filter((m) => m && m.title);
        if (validList.length === 0) {
          setImportError("ข้อมูลมังงะในไฟล์ไม่ถูกต้องหรือไม่สมบูรณ์");
          setParsedData(null);
          return;
        }

        const totalSrcs = validList.reduce((acc, m) => acc + (m.sources?.length || 0), 0);

        setParsedData({
          app: parsed.app || "MangaHub",
          version: parsed.version || 1,
          exportedAt: parsed.exportedAt || new Date().toISOString(),
          stats: {
            totalMangas: validList.length,
            totalSources: totalSrcs,
            totalCategories: validatedCategories.length,
          },
          categories: validatedCategories,
          mangas: validList,
        });
      } catch (err: any) {
        setImportError(`ไม่สามารถอ่านไฟล์ได้: ${err.message || "รูปแบบไฟล์ไม่ถูกต้อง"}`);
        setParsedData(null);
      }
    };
    reader.readAsText(file);
  };

  // Handle Start Restore
  const handleStartRestore = async () => {
    if (!parsedData) return;

    setIsRestoring(true);
    setImportError(null);
    setRestoreProgress({ current: 0, total: parsedData.mangas.length });

    try {
      const res = await restoreBackupData(
        parsedData,
        {
          mode: importMode,
          syncSupabase: syncSupabase && supabaseEnabled,
        },
        (cur, tot) => {
          setRestoreProgress({ current: cur, total: tot });
        }
      );

      if (res.success) {
        setRestoreSuccess({ count: res.count });
        onDataRestored();
      } else {
        setImportError(res.error || "เกิดข้อผิดพลาดในการกู้คืนข้อมูล");
      }
    } catch (err: any) {
      setImportError(`เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setIsRestoring(false);
      setRestoreProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-[#0F172A] border border-[#1E293B] rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E293B] bg-[#0A0F1D]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>สำรองและกู้คืนข้อมูล</span>
                <span className="text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                  JSON Safe
                </span>
              </h2>
              <p className="text-[11px] text-gray-400">
                เซฟลงแฟลชไดรฟ์เพื่อนำไปเปิดเครื่องอื่น หรือกู้คืนข้อมูลกลับมาได้ 100%
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#1E293B] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-[#1E293B] bg-[#0A0F1D]/60 p-1.5 gap-1.5">
          <button
            onClick={() => setActiveTab("export")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "export"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-[#1E293B]/50"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>ส่งออกไฟล์สำรอง (Export)</span>
          </button>
          <button
            onClick={() => setActiveTab("import")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "import"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-[#1E293B]/50"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>กู้คืนข้อมูล (Restore / Import)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "export" ? (
            /* EXPORT TAB */
            <div className="space-y-4">
              {/* Library Summary Card */}
              <div className="bg-[#131D31] border border-[#1E293B] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>ข้อมูลที่จะถูกส่งออก</span>
                  </span>
                  <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-lg">
                    พร้อมส่งออก
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-3 text-center">
                    <BookOpen className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                    <div className="text-base font-bold text-white">{mangas.length}</div>
                    <div className="text-[10px] text-gray-400">เรื่องทั้งหมด</div>
                  </div>
                  <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-3 text-center">
                    <Layers className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                    <div className="text-base font-bold text-white">{totalSources}</div>
                    <div className="text-[10px] text-gray-400">เว็บต้นทาง/สำรอง</div>
                  </div>
                  <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-3 text-center">
                    <FileText className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                    <div className="text-base font-bold text-white">{categories.length}</div>
                    <div className="text-[10px] text-gray-400">หมวดหมู่</div>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
                  ไฟล์นี้จะบันทึกข้อมูลทุกอย่าง: เลขตอนที่อ่านถึง, ตอนล่าสุดในเว็บ, ลิงก์สำรองทุกเว็บ, รูปหน้าปก AniList, ป้าย Tier (S/A/B/C) และประวัติอ่านล่าสุด
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                <button
                  onClick={handleDownloadBackup}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm py-3 px-4 rounded-2xl shadow-lg shadow-emerald-600/30 transition active:scale-[0.99]"
                >
                  <Download className="w-4 h-4" />
                  <span>ดาวน์โหลดไฟล์สำรอง (.json) - กู้คืนได้ 100%</span>
                </button>

                <button
                  onClick={handleDownloadCsv}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-700 to-cyan-700 hover:from-teal-600 hover:to-cyan-600 text-white font-bold text-sm py-3 px-4 rounded-2xl shadow-lg shadow-cyan-700/25 transition active:scale-[0.99]"
                >
                  <FileSpreadsheet className="w-4 h-4 text-cyan-200" />
                  <span>ดาวน์โหลดตาราง Excel / CSV (.csv) - เปิดดูในคอมได้ทันที</span>
                </button>

                <button
                  onClick={handleCopyJson}
                  className="w-full flex items-center justify-center gap-2 bg-[#1E293B]/70 hover:bg-[#1E293B] text-gray-200 font-semibold text-xs py-2.5 px-4 rounded-xl border border-[#334155] transition"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300 font-bold">คัดลอก JSON ลงคลิปบอร์ดแล้ว!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-gray-400" />
                      <span>คัดลอก JSON ทั้งหมดลงคลิปบอร์ด (Clipboard)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Flash Drive Advice */}
              <div className="bg-[#0B1120] border border-[#1E293B] rounded-2xl p-3.5 text-[11px] text-gray-400 space-y-1.5">
                <p className="font-semibold text-gray-300 flex items-center gap-1.5">
                  <span>💡 คำแนะนำสำหรับสำรองข้อมูล:</span>
                </p>
                <p>
                  • <strong>ไฟล์ .json</strong>: บันทึกข้อมูลครบถ้วนที่สุด เหมาะสำหรับสำรองไว้กู้คืนข้อมูลหรือย้ายเครื่อง
                </p>
                <p>
                  • <strong>ไฟล์ .csv</strong>: เปิดดูใน Microsoft Excel หรือ Google Sheets ได้ทันที ภาษาไทยไม่เพี้ยน
                </p>
              </div>
            </div>
          ) : (
            /* IMPORT TAB */
            <div className="space-y-4">
              {/* File Upload Zone */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {!selectedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#1E293B] hover:border-violet-500/70 bg-[#131D31]/50 hover:bg-[#131D31] rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2 group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-violet-600/10 group-hover:bg-violet-600/20 text-violet-400 flex items-center justify-center transition">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">คลิกเพื่อเลือกไฟล์สำรอง (.json หรือ .csv Excel)</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">หรือลากไฟล์มาวางในช่องนี้</div>
                  </div>
                </div>
              ) : (
                /* Selected File Card */
                <div className="bg-[#131D31] border border-[#1E293B] rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-bold text-white truncate max-w-[220px]">
                        {selectedFile.name}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setParsedData(null);
                        setImportError(null);
                        setRestoreSuccess(null);
                      }}
                      className="text-[11px] text-gray-400 hover:text-red-400 transition"
                    >
                      เปลี่ยนไฟล์
                    </button>
                  </div>

                  {parsedData && (
                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-2.5">
                        <span className="text-gray-400 block text-[10px]">พบมังงะในไฟล์</span>
                        <span className="text-base font-bold text-emerald-400">
                          {parsedData.mangas.length} เรื่อง
                        </span>
                      </div>
                      <div className="bg-[#0B1120] border border-[#1E293B] rounded-xl p-2.5">
                        <span className="text-gray-400 block text-[10px]">เว็บอ่านทั้งหมด</span>
                        <span className="text-base font-bold text-cyan-400">
                          {parsedData.stats?.totalSources || 0} ลิงก์
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error Message */}
              {importError && (
                <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Success Message */}
              {restoreSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>
                    🎉 กู้คืนข้อมูลสำเร็จจำนวน {restoreSuccess.count} เรื่องเรียบร้อยแล้ว!
                  </span>
                </div>
              )}

              {/* Restore Options (Shown when file is parsed) */}
              {parsedData && !restoreSuccess && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-300 block">
                      รูปแบบการกู้คืนข้อมูล:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setImportMode("merge")}
                        className={`p-3 rounded-xl border text-left transition ${
                          importMode === "merge"
                            ? "bg-violet-950/50 border-violet-500 text-white"
                            : "bg-[#131D31] border-[#1E293B] text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center justify-between">
                          <span>ผสานข้อมูล (Merge)</span>
                          {importMode === "merge" && <Check className="w-3.5 h-3.5 text-violet-400" />}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                          ไม่ลบเรื่องเดิม เพิ่มเรื่องใหม่และอัปเดตข้อมูลเรื่องที่ตรงกัน
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImportMode("replace")}
                        className={`p-3 rounded-xl border text-left transition ${
                          importMode === "replace"
                            ? "bg-amber-950/50 border-amber-500 text-white"
                            : "bg-[#131D31] border-[#1E293B] text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center justify-between text-amber-300">
                          <span>เขียนทับทั้งหมด (Replace)</span>
                          {importMode === "replace" && <Check className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 leading-snug">
                          แทนที่ข้อมูลทั้งหมดด้วยไฟล์สำรอง (เหมาะกับย้ายเครื่องใหม่)
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Supabase Sync Checkbox */}
                  {supabaseEnabled && (
                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#131D31] border border-[#1E293B] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={syncSupabase}
                        onChange={(e) => setSyncSupabase(e.target.checked)}
                        className="rounded border-[#1E293B] text-violet-600 focus:ring-violet-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                          <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                          <span>ซิงค์ขึ้น Supabase Cloud ทันที</span>
                        </div>
                        <p className="text-[10px] text-gray-400">
                          อัปโหลดข้อมูลเข้าฐานข้อมูลออนไลน์ เพื่อให้อุปกรณ์อื่นๆ เข้าถึงได้ทันที
                        </p>
                      </div>
                    </label>
                  )}

                  {/* Restore Action Button */}
                  <button
                    onClick={handleStartRestore}
                    disabled={isRestoring}
                    className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm py-3 px-4 rounded-2xl shadow-lg shadow-violet-600/30 transition active:scale-[0.99] disabled:opacity-50"
                  >
                    {isRestoring ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          {restoreProgress
                            ? `กำลังกู้คืนข้อมูล... (${restoreProgress.current}/${restoreProgress.total})`
                            : "กำลังกู้คืนข้อมูล..."}
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>เริ่มกู้คืนข้อมูลทันที</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#1E293B] bg-[#0A0F1D]">
          <span className="text-[11px] text-gray-500">
            MangaHub Backup System • v2.0
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};
