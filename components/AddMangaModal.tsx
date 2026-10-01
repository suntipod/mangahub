"use client";

import React, { useState } from "react";
import { Manga, MangaSource } from "@/types/manga";
import { X, Sparkles, Loader2, Plus, Globe, Check, AlertCircle } from "lucide-react";

interface AddMangaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddManga: (newManga: Manga) => void;
}

export const AddMangaModal: React.FC<AddMangaModalProps> = ({
  isOpen,
  onClose,
  onAddManga,
}) => {
  if (!isOpen) return null;

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [warningMsg, setWarningMsg] = useState("");

  // Extracted/Edited fields
  const [title, setTitle] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [chapter, setChapter] = useState<number>(1);
  const [siteName, setSiteName] = useState("");
  const [keepOpenForBatch, setKeepOpenForBatch] = useState(true);
  const [addedSuccess, setAddedSuccess] = useState(false);

  // Auto-scrape URL
  const handleScrape = async () => {
    if (!url.trim()) {
      setErrorMsg("กรุณาวาง URL หน้าเรื่องการ์ตูนก่อนครับ");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setWarningMsg("");

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "ไม่สามารถดึงข้อมูลได้");
      }

      const data = json.data;
      setTitle(data.title || "");
      setCoverUrl(data.cover_url || "");
      if (data.current_chapter) {
        setChapter(data.current_chapter);
      }
      setSiteName(data.site_name || "Manga Site");

      if (json.warning) {
        setWarningMsg(json.warning);
      }
    } catch (e: any) {
      setErrorMsg(e.message || "เกิดข้อผิดพลาดในการดึงข้อมูล กรุณากรอกข้อมูลเองด้านล่าง");
      // Fallback site name
      try {
        const u = new URL(url);
        setSiteName(u.hostname.replace(/^www\./, "").split(".")[0]);
      } catch {
        setSiteName("เว็บอ่าน");
      }
    } finally {
      setLoading(false);
    }
  };

  // Submit and save manga
  const handleSave = () => {
    if (!title.trim()) {
      setErrorMsg("กรุณาระบุชื่อเรื่องการ์ตูน");
      return;
    }

    const mangaId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `manga-${Date.now()}`;
    const initialSource: MangaSource = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `src-${Date.now()}`,
      manga_id: mangaId,
      site_name: siteName || "เว็บหลัก",
      base_url: url.trim(),
      current_chapter_url: url.trim(),
      is_primary: true,
      is_active: true,
    };

    const newManga: Manga = {
      id: mangaId,
      title: title.trim(),
      cover_url: coverUrl.trim(),
      current_chapter: chapter,
      status: "reading",
      tier: "none",
      sources: [initialSource],
      last_read_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onAddManga(newManga);
    setAddedSuccess(true);

    if (keepOpenForBatch) {
      // Clear inputs for next Safari tab rescue
      setTimeout(() => {
        setUrl("");
        setTitle("");
        setCoverUrl("");
        setChapter(1);
        setSiteName("");
        setErrorMsg("");
        setWarningMsg("");
        setAddedSuccess(false);
      }, 1000);
    } else {
      setTimeout(() => {
        setAddedSuccess(false);
        onClose();
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-[#111827] border border-[#1F2E45] rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2E45]/80 bg-[#0E1524]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-600/30 text-violet-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                กู้ชีพแท็บ Safari (เพิ่มการ์ตูน)
              </h2>
              <p className="text-[11px] text-gray-400">
                วางลิงก์จากแท็บ Safari แล้วระบบจะดึงรูปปกและชื่อเรื่องให้อัตโนมัติ
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

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* URL Input Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
              <span>URL หน้าเรื่อง หรือหน้าตอนล่าสุดที่เปิดค้างไว้</span>
              <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://www.up-manga.com/manga/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleScrape();
                }}
                className="flex-1 bg-[#131B2E] border border-[#1F2E45] focus:border-violet-500 rounded-xl px-3.5 py-2.5 text-xs text-gray-200 outline-none transition"
              />
              <button
                onClick={handleScrape}
                disabled={loading}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-violet-600/30 transition shrink-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังดึง...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>ดึงข้อมูล</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {warningMsg && (
            <div className="flex items-center gap-2 p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{warningMsg}</span>
            </div>
          )}

          {/* Scraped / Preview Section */}
          <div className="bg-[#141E33] border border-[#1F2E45] rounded-2xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              พรีวิวและรายละเอียดเรื่อง
            </h3>

            <div className="flex gap-4 items-start">
              {/* Cover Preview */}
              <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden bg-[#0B0F19] border border-[#1F2E45] shrink-0 shadow-md">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                    onError={() => setCoverUrl("")}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-gray-600">
                    <Globe className="w-6 h-6 mb-1 text-gray-500" />
                    <span className="text-[10px]">ไม่มีรูปปก</span>
                  </div>
                )}
              </div>

              {/* Form fields */}
              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                    ชื่อเรื่องการ์ตูน
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น Nano Machine นาโนมาชิน"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-[#0D1322] border border-[#1F2E45] rounded-xl px-3 py-2 text-xs text-gray-200 outline-none focus:border-violet-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                      ตอนที่อ่านถึง
                    </label>
                    <input
                      type="number"
                      value={chapter}
                      onChange={(e) => setChapter(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#0D1322] border border-[#1F2E45] rounded-xl px-3 py-2 text-xs text-violet-400 font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                      ชื่อเว็บที่อ่าน
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น Up-Manga"
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      className="w-full bg-[#0D1322] border border-[#1F2E45] rounded-xl px-3 py-2 text-xs text-gray-200 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-400 block mb-1">
                    URL รูปภาพปก (แก้ได้ถ้าต้องการ)
                  </label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    className="w-full bg-[#0D1322] border border-[#1F2E45] rounded-xl px-3 py-2 text-xs text-gray-300 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Batch Mode Checkbox */}
          <div className="flex items-center gap-2 p-2">
            <input
              type="checkbox"
              id="batch-mode"
              checked={keepOpenForBatch}
              onChange={(e) => setKeepOpenForBatch(e.target.checked)}
              className="w-4 h-4 rounded bg-[#131B2E] border-[#1F2E45] text-violet-600 focus:ring-0"
            />
            <label
              htmlFor="batch-mode"
              className="text-xs text-gray-300 select-none cursor-pointer"
            >
              โหมดทยอยกู้ชีพแท็บ (บันทึกแล้วเคลียร์ช่องเพื่อวางแท็บถัดไปทันที)
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#1F2E45] bg-[#0E1524]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition"
          >
            ปิดหน้าต่าง
          </button>

          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 shadow-lg shadow-violet-600/30 transition active:scale-95"
          >
            {addedSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>บันทึกสำเร็จ! ปิดแท็บ Safari ได้เลย</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>บันทึกเข้าชั้นหนังสือ</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
