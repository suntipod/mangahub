"use client";

import React, { useState } from "react";
import { SupabaseConfig } from "@/types/manga";
import {
  X,
  Cloud,
  Check,
  AlertCircle,
  Download,
  Upload,
  Smartphone,
  Database,
  ExternalLink,
  Loader2,
  Tags,
  Plus,
  Trash2,
  Lock,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import { testSupabaseConnection } from "@/lib/supabase";
import {
  getLocalMangas,
  saveLocalMangas,
  autoFixMissingAndBadCovers,
  isCoverNeedingEnrichment,
} from "@/lib/storage";
import {
  getStoredCategories,
  addCategory,
  deleteCategory,
  DEFAULT_CATEGORIES,
} from "@/lib/categories";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SupabaseConfig;
  onSaveConfig: (config: SupabaseConfig) => void;
  onDataImported: () => void;
  onCategoriesChanged?: () => void;
  onOpenBackup?: () => void;
  onOpenInstallPwa?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onDataImported,
  onCategoriesChanged,
  onOpenBackup,
  onOpenInstallPwa,
}) => {
  if (!isOpen) return null;

  const [url, setUrl] = useState(config.url || "");
  const [anonKey, setAnonKey] = useState(config.anonKey || "");
  const [enabled, setEnabled] = useState(config.enabled || false);

  // Categories state
  const [categories, setCategories] = useState<string[]>(getStoredCategories());
  const [newCategoryName, setNewCategoryName] = useState("");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Auto-Fix Covers state
  const [isFixingCovers, setIsFixingCovers] = useState(false);
  const [fixProgress, setFixProgress] = useState<{
    current: number;
    total: number;
    title: string;
  } | null>(null);
  const [fixResultMsg, setFixResultMsg] = useState<{
    text: string;
    success: boolean;
  } | null>(null);

  const localMangas = getLocalMangas();
  const needingFixCount = localMangas.filter((m) =>
    isCoverNeedingEnrichment(m.cover_url)
  ).length;

  const handleStartFixCovers = async () => {
    setIsFixingCovers(true);
    setFixProgress(null);
    setFixResultMsg(null);
    try {
      const res = await autoFixMissingAndBadCovers((current, total, title) => {
        setFixProgress({ current, total, title });
      });
      if (res.updatedCount > 0) {
        setFixResultMsg({
          text: `🎉 ดึงรูปปก HD สำเร็จจำนวน ${res.updatedCount} เรื่อง (จากที่ตรวจพบ ${res.totalCandidates} เรื่อง)!`,
          success: true,
        });
        onDataImported();
      } else if (res.totalCandidates === 0) {
        setFixResultMsg({
          text: `✅ การ์ตูนทุกเรื่องในชั้นหนังสือของคุณมีรูปปก HD สวยงามครบถ้วนแล้ว`,
          success: true,
        });
      } else {
        setFixResultMsg({
          text: `⚠️ ดึงรูปปกไม่สำเร็จ หรือเครือข่ายขัดข้อง กรุณาลองใหม่อีกครั้ง`,
          success: false,
        });
      }
    } catch (err: any) {
      setFixResultMsg({
        text: `❌ เกิดข้อผิดพลาด: ${err.message}`,
        success: false,
      });
    } finally {
      setIsFixingCovers(false);
      setFixProgress(null);
    }
  };

  const handleTestConnection = async () => {
    if (!url.trim() || !anonKey.trim()) {
      setTestResult({
        success: false,
        message: "กรุณาระบุ Supabase Project URL และ Anon Key ให้ครบถ้วน",
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    const result = await testSupabaseConnection(url.trim(), anonKey.trim());
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = () => {
    onSaveConfig({
      url: url.trim(),
      anonKey: anonKey.trim(),
      enabled,
    });
    onClose();
  };

  // Add Category
  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      alert("มีหมวดหมู่นี้อยู่แล้ว");
      return;
    }
    const updated = addCategory(trimmed);
    setCategories(updated);
    setNewCategoryName("");
    onCategoriesChanged?.();
  };

  // Delete Category
  const handleDeleteCategory = (cat: string) => {
    if (DEFAULT_CATEGORIES.includes(cat)) {
      alert("ไม่สามารถลบหมวดหมู่เริ่มต้นได้");
      return;
    }
    if (confirm(`คุณต้องการลบหมวดหมู่ "${cat}" ใช่หรือไม่?`)) {
      const updated = deleteCategory(cat);
      setCategories(updated);
      onCategoriesChanged?.();
    }
  };

  // Export JSON backup
  const handleExportBackup = () => {
    const mangas = getLocalMangas();
    const blob = new Blob([JSON.stringify(mangas, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mangahub-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  };

  // Import JSON backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          saveLocalMangas(parsed);
          onDataImported();
          alert(`นำเข้าข้อมูลมังงะสำเร็จจำนวน ${parsed.length} เรื่อง!`);
        } else {
          alert("รูปแบบไฟล์ไม่ถูกต้อง");
        }
      } catch (err: any) {
        alert(`เกิดข้อผิดพลาดในการอ่านไฟล์: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-[#111827] border border-[#1F2E45] rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2E45]/80 bg-[#0E1524]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                ตั้งค่าระบบ & Cloud Sync
              </h2>
              <p className="text-[11px] text-gray-400">
                จัดการหมวดหมู่, ซิงค์ Supabase ระหว่าง iPhone และ PC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-[#1A263D] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Categories Management Section */}
          <div className="bg-[#141E33] border border-[#1F2E45] rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center gap-2">
              <Tags className="w-4 h-4 text-violet-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                จัดการหมวดหมู่การ์ตูน (Categories)
              </h3>
            </div>
            <p className="text-[11px] text-gray-400">
              กำหนดหมวดหมู่เพื่อจัดระเบียบชั้นหนังสือ (มี 3 หมวดหมู่หลักให้พร้อมใช้ สามารถเพิ่มหมวดหมู่เองได้)
            </p>

            {/* Existing Categories List */}
            <div className="flex flex-wrap gap-2 pt-1">
              {categories.map((cat) => {
                const isDefault = DEFAULT_CATEGORIES.includes(cat);
                const isDojin = cat.toLowerCase().includes("dojin") || cat.includes("โดจิน");
                const isNTR = cat.toUpperCase().includes("NTR");

                return (
                  <div
                    key={cat}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                      isDojin
                        ? "bg-rose-950/40 text-rose-300 border-rose-800/40"
                        : isNTR
                        ? "bg-purple-950/40 text-purple-300 border-purple-800/40"
                        : "bg-[#0D1322] text-gray-200 border-[#1F2E45]"
                    }`}
                  >
                    <span>
                      {isDojin ? "🔞 " : isNTR ? "💔 " : "📚 "}
                      {cat}
                    </span>

                    {isDefault ? (
                      <span
                        title="หมวดหมู่หลัก"
                        className="text-gray-500 ml-1"
                      >
                        <Lock className="w-3 h-3" />
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        title="ลบหมวดหมู่นี้"
                        className="text-gray-400 hover:text-red-400 p-0.5 rounded transition ml-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add New Category Input */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCategory();
                  }
                }}
                placeholder="พิมพ์ชื่อหมวดหมู่ใหม่ เช่น มังฮวาเกาหลี, Yaoi..."
                className="flex-1 bg-[#0D1322] border border-[#1F2E45] rounded-xl px-3 py-2 text-xs text-gray-200 outline-none focus:border-violet-500 placeholder-gray-500"
              />
              <button
                type="button"
                onClick={handleAddCategory}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-md shadow-violet-600/30 active:scale-95 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่ม</span>
              </button>
            </div>
          </div>

          {/* Auto-Fix Covers Section */}
          <div className="bg-gradient-to-br from-[#141E33] to-[#1a1e38] border border-violet-500/40 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/30">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>ดึงและแก้ไขรูปปก HD อัตโนมัติ (Auto-Fix Covers)</span>
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    ดึงรูปโปสเตอร์ HD สวยๆ จาก AniList, Kitsu, MangaDex และเน็ตมาใส่ให้อัตโนมัติ
                  </p>
                </div>
              </div>

              {needingFixCount > 0 ? (
                <span className="text-[10px] text-amber-300 font-bold bg-amber-950/60 border border-amber-800/40 px-2.5 py-0.5 rounded-full animate-pulse">
                  พบ {needingFixCount} เรื่องที่ต้องแก้ไข
                </span>
              ) : (
                <span className="text-[10px] text-emerald-300 font-bold bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-0.5 rounded-full">
                  รูปปกครบทุกเรื่อง
                </span>
              )}
            </div>

            <p className="text-[11px] text-gray-300 leading-relaxed">
              แก้ปัญหาการ์ตูนไม่มีรูปปก หรือเรื่องที่ได้รูปจากหน้าอ่านตอนแรกมาแทนรูปปก ระบบจะสแกนและดึงรูปหน้าปกความละเอียดสูงมาใส่และบันทึกลงฐานข้อมูลให้ทันทีในคลิกเดียว
            </p>

            <button
              type="button"
              onClick={handleStartFixCovers}
              disabled={isFixingCovers}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md shadow-orange-500/20 transition active:scale-95 disabled:opacity-50"
            >
              {isFixingCovers ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>
                    {fixProgress
                      ? `กำลังดึงรูปปก (${fixProgress.current}/${fixProgress.total}): ${fixProgress.title.slice(0, 25)}...`
                      : "กำลังประมวลผล..."}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-yellow-200 fill-yellow-200" />
                  <span>
                    {needingFixCount > 0
                      ? `⚡ เริ่มดึงรูปปก HD ให้ทั้ง ${needingFixCount} เรื่องทันที`
                      : "⚡ ตรวจสอบและดึงรูปปก HD ซ้ำอีกครั้ง"}
                  </span>
                </>
              )}
            </button>

            {fixResultMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold animate-fade-in flex items-center gap-2 ${
                  fixResultMsg.success
                    ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                    : "bg-rose-950/40 border border-rose-500/30 text-rose-300"
                }`}
              >
                {fixResultMsg.success ? (
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{fixResultMsg.text}</span>
              </div>
            )}
          </div>

          {/* Supabase Section */}
          <div className="bg-[#141E33] border border-[#1F2E45] rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-violet-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Supabase Cloud Database (ฟรีตลอดชีพ)
                </h3>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#1F2E45] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-300 block mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="text"
                  placeholder="https://xyzcompany.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-[#0D1322] border border-[#1F2E45] rounded-xl px-3 py-2 text-xs text-gray-200 outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-300 block mb-1">
                  Supabase Anon Key (Public Key)
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  className="w-full bg-[#0D1322] border border-[#1F2E45] rounded-xl px-3 py-2 text-xs text-gray-200 outline-none focus:border-violet-500 font-mono"
                />
              </div>

              {/* Test connection & Feedback */}
              <div className="pt-1 flex items-center justify-between">
                <button
                  onClick={handleTestConnection}
                  disabled={testing || !url.trim()}
                  className="flex items-center gap-1.5 bg-[#1C2940] hover:bg-[#253754] text-xs font-semibold text-gray-200 px-3 py-1.5 rounded-xl border border-[#2A3E60] transition disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5 text-violet-400" />
                  )}
                  <span>ทดสอบเชื่อมต่อ</span>
                </button>

                <a
                  href="https://supabase.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-violet-400 hover:underline flex items-center gap-1"
                >
                  <span>สมัคร Supabase ฟรี</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {testResult && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-xl text-xs ${
                    testResult.success
                      ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                      : "bg-red-950/40 border border-red-500/30 text-red-300"
                  }`}
                >
                  {testResult.success ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            {/* Schema Guide Note */}
            <div className="bg-[#090D16] p-3 rounded-xl border border-[#1F2E45]/80 text-[11px] text-gray-400 space-y-1">
              <p className="font-semibold text-gray-300">
                💡 วิธีสร้างตารางใน Supabase:
              </p>
              <p>
                1. เปิดโปรเจกต์ใน Supabase แล้วไปที่เมนู <strong>SQL Editor</strong>
              </p>
              <p>
                2. นำโค้ดจากไฟล์ <code>supabase/schema.sql</code> ในโปรเจกต์นี้ไปวางแล้วกด <strong>Run</strong> ได้ทันที
              </p>
            </div>
          </div>

          {/* Backup / Export Section */}
          {/* Backup / Export Section */}
          <div className="bg-gradient-to-br from-[#141E33] to-[#122338] border border-[#1F2E45] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>สำรองและกู้คืนข้อมูล (Backup & Restore)</span>
              </h3>
              <span className="text-[10px] text-emerald-300 font-semibold bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                JSON Safe
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              ดาวน์โหลดไฟล์สำรอง .json เซฟลงแฟลชไดรฟ์เพื่อนำไปเปิดในคอมเครื่องอื่น หรือกู้คืนข้อมูลกลับมาได้ 100%
            </p>

            {onOpenBackup && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBackup();
                }}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold text-xs py-2.5 px-4 rounded-xl border border-emerald-500/30 transition shadow-sm active:scale-95"
              >
                <Database className="w-4 h-4 text-emerald-400" />
                <span>เปิดหน้าต่างสำรองและกู้คืนข้อมูล (Backup Manager)</span>
              </button>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleExportBackup}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#1C2940] hover:bg-[#253754] text-xs font-semibold text-gray-200 py-2 px-3 rounded-xl border border-[#2A3E60] transition"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>ดาวน์โหลด JSON ด่วน</span>
              </button>

              <label className="flex-1 flex items-center justify-center gap-1.5 bg-[#1C2940] hover:bg-[#253754] text-xs font-semibold text-gray-200 py-2 px-3 rounded-xl border border-[#2A3E60] transition cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-violet-400" />
                <span>นำเข้า JSON ด่วน</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* PWA Mobile App Guide */}
          <div className="bg-[#141E33] border border-[#1F2E45] rounded-2xl p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-violet-400" />
              <span>การใช้งานเป็น App บนมือถือ (iPhone & Android)</span>
            </h3>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              เปิดเว็บนี้ใน Safari หรือ Chrome แล้วเลือก <strong>&quot;เพิ่มไปยังหน้าจอโฮม&quot;</strong> เพื่อใช้งานได้เต็มหน้าจอเหมือนแอปพลิเคชันจริงโดยไม่มีแถบ URL กวนใจ!
            </p>
            {onOpenInstallPwa && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInstallPwa();
                }}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600/30 to-indigo-600/30 hover:from-violet-600/50 hover:to-indigo-600/50 text-violet-200 font-bold text-xs py-2 px-3 rounded-xl border border-violet-500/40 transition active:scale-95"
              >
                <Smartphone className="w-4 h-4 text-violet-400" />
                <span>📲 ดูวิธีติดตั้งแอป & เพิ่มลงหน้าจอโฮม</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#1F2E45] bg-[#0E1524]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-600/30 transition active:scale-95"
          >
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
};
