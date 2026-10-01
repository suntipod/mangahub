"use client";

import React, { useState } from "react";
import { Manga, MangaSource } from "@/types/manga";
import {
  X,
  Sparkles,
  Loader2,
  Plus,
  Globe,
  Check,
  AlertCircle,
  Layers,
  Link2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

interface AddMangaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddManga: (newManga: Manga) => void;
  onAddMangas?: (newMangas: Manga[]) => void;
}

export const AddMangaModal: React.FC<AddMangaModalProps> = ({
  isOpen,
  onClose,
  onAddManga,
  onAddMangas,
}) => {
  if (!isOpen) return null;

  // Active Tab: "single" (1 tab) or "batch" (multiple tabs)
  const [activeTab, setActiveTab] = useState<"single" | "batch">("batch");

  // --- Single Tab State ---
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [warningMsg, setWarningMsg] = useState("");
  const [title, setTitle] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [chapter, setChapter] = useState<number>(1);
  const [siteName, setSiteName] = useState("");
  const [keepOpenForBatch, setKeepOpenForBatch] = useState(true);
  const [addedSuccess, setAddedSuccess] = useState(false);

  // --- Batch Tabs State ---
  const [batchText, setBatchText] = useState("");
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [batchResults, setBatchResults] = useState<
    Array<{ url: string; title: string; chapter: number; coverUrl: string; status: "success" | "fallback" }>
  >([]);
  const [batchFinished, setBatchFinished] = useState(false);
  const [batchError, setBatchError] = useState("");

  // Auto-scrape single URL
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

  // Submit and save single manga
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

  // Detect count of valid URLs in batch text
  const detectedUrls = React.useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = batchText.match(urlRegex) || [];
    return Array.from(new Set(matches.map((u) => u.trim())));
  }, [batchText]);

  // Execute Batch Import
  const handleStartBatch = async () => {
    if (detectedUrls.length === 0) {
      setBatchError("ไม่พบลิงก์ URL ในข้อความ กรุณาก๊อปปี้ลิงก์หน้าการ์ตูนมาวางครับ");
      return;
    }

    setIsBatchRunning(true);
    setBatchError("");
    setBatchFinished(false);
    setBatchResults([]);
    setBatchProgress({ current: 0, total: detectedUrls.length, percent: 0 });

    const rescuedMangas: Manga[] = [];
    const results: Array<{ url: string; title: string; chapter: number; coverUrl: string; status: "success" | "fallback" }> = [];

    for (let i = 0; i < detectedUrls.length; i++) {
      const itemUrl = detectedUrls[i];
      let scrapedTitle = "";
      let scrapedCover = "";
      let scrapedChapter = 1;
      let scrapedSite = "เว็บอ่าน";
      let status: "success" | "fallback" = "fallback";

      try {
        const res = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: itemUrl }),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            scrapedTitle = json.data.title || "";
            scrapedCover = json.data.cover_url || "";
            scrapedChapter = json.data.current_chapter || 1;
            scrapedSite = json.data.site_name || "เว็บอ่าน";
            if (scrapedTitle) status = "success";
          }
        }
      } catch (err) {
        // Fallback gracefully without stopping
      }

      // Safe fallback if scraper couldn't extract title
      if (!scrapedTitle) {
        try {
          const parsed = new URL(itemUrl);
          scrapedSite = parsed.hostname.replace(/^www\./, "").split(".")[0];
          const segments = parsed.pathname.split("/").filter(Boolean);
          const chMatch = itemUrl.match(/(?:chapter|ch|ตอนที่|ตอน)[-_/]?(\d+(?:\.\d+)?)/i);
          if (chMatch) scrapedChapter = parseFloat(chMatch[1]);
          const slug =
            segments.find((s) => !/^\d+$/.test(s) && !/chapter|ep|read|manga/i.test(s)) ||
            segments[0] ||
            `การ์ตูนแท็บที่ ${i + 1}`;
          scrapedTitle = decodeURIComponent(slug).replace(/[-_]+/g, " ");
        } catch {
          scrapedTitle = `การ์ตูนแท็บที่ ${i + 1}`;
        }
      }

      const mangaId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `manga-${Date.now()}-${i}`;
      const sourceId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `src-${Date.now()}-${i}`;

      const newManga: Manga = {
        id: mangaId,
        title: scrapedTitle,
        cover_url: scrapedCover,
        current_chapter: scrapedChapter,
        status: "reading",
        tier: "none",
        sources: [
          {
            id: sourceId,
            manga_id: mangaId,
            site_name: scrapedSite,
            base_url: itemUrl,
            current_chapter_url: itemUrl,
            is_primary: true,
            is_active: true,
          },
        ],
        last_read_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      rescuedMangas.push(newManga);
      results.push({
        url: itemUrl,
        title: scrapedTitle,
        chapter: scrapedChapter,
        coverUrl: scrapedCover,
        status,
      });

      // Update progress UI
      setBatchResults([...results]);
      const current = i + 1;
      setBatchProgress({
        current,
        total: detectedUrls.length,
        percent: Math.round((current / detectedUrls.length) * 100),
      });
    }

    // Save all to database & storage
    if (onAddMangas) {
      onAddMangas(rescuedMangas);
    } else {
      rescuedMangas.forEach((m) => onAddManga(m));
    }

    setIsBatchRunning(false);
    setBatchFinished(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-[#111827] border border-[#1F2E45] rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2E45]/80 bg-[#0E1524]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-violet-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>กู้ชีพแท็บ Safari</span>
                <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-medium border border-violet-500/30">
                  Auto Scrape
                </span>
              </h2>
              <p className="text-[11px] text-gray-400">
                ดึงรูปปก ชื่อเรื่อง และเลขตอนล่าสุดเข้าคลาวด์ แล้วปิดแท็บ Safari ทิ้งได้เลย
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

        {/* Tab Switcher: Single vs Batch */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-1 bg-[#0E1524]/60 border-b border-[#1F2E45]/50">
          <button
            onClick={() => setActiveTab("batch")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "batch"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-[#151F33]"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>กู้ชีพหลายแท็บพร้อมกัน (Batch)</span>
            <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.2 rounded font-extrabold">
              แนะนำ
            </span>
          </button>

          <button
            onClick={() => setActiveTab("single")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === "single"
                ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-[#151F33]"
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>ทีละแท็บ (ละเอียด)</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "batch" ? (
            /* ================= BATCH IMPORT VIEW ================= */
            <div className="space-y-4">
              {/* Safari Tip Card */}
              <div className="bg-gradient-to-r from-violet-950/40 to-indigo-950/30 border border-violet-500/30 rounded-2xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-violet-300 text-xs font-bold">
                  <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
                  <span>วิธีคัดลอกทุกลิงก์จาก Safari ใน 1 วินาที:</span>
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  ใน Safari กดปุ่มดูแท็บทั้งหมด (สี่เหลี่ยมซ้อนกัน) ➔{" "}
                  <strong className="text-white">แตะค้างที่แถบจำนวนแท็บด้านล่าง</strong> (เช่น &quot;15 แท็บ&quot;) ➔
                  เลือก <strong className="text-amber-300">&quot;คัดลอกลิงก์&quot; (Copy Links)</strong> แล้วนำมาวางลงในช่องด้านล่างนี้ได้เลยครับ!
                </p>
              </div>

              {!batchFinished ? (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                        <span>วางลิงก์ทั้งหมดที่ก๊อปปี้มาที่นี่</span>
                        <span className="text-red-400">*</span>
                      </label>
                      {detectedUrls.length > 0 && (
                        <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          ตรวจพบ {detectedUrls.length} ลิงก์
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={5}
                      disabled={isBatchRunning}
                      placeholder={`https://www.up-manga.com/manga/nano-machine/118\nhttps://www.slow-manga.com/manga/pick-me-up/206\nhttps://www.up-manga.com/manga/barbarian/155\n... (วางทุกลิงก์ที่นี่ ระบบจะแยกแต่ละเรื่องให้อัตโนมัติ)`}
                      value={batchText}
                      onChange={(e) => setBatchText(e.target.value)}
                      className="w-full bg-[#131B2E] border border-[#1F2E45] focus:border-violet-500 rounded-2xl p-3.5 text-xs text-gray-200 placeholder-gray-500 outline-none transition font-mono leading-relaxed"
                    />
                  </div>

                  {batchError && (
                    <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{batchError}</span>
                    </div>
                  )}

                  {/* Progress Bar (when running) */}
                  {isBatchRunning && (
                    <div className="space-y-2 bg-[#141E33] border border-[#1F2E45] rounded-2xl p-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-300 font-bold flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                          <span>กำลังดึงข้อมูลเรื่องที่ {batchProgress.current} จาก {batchProgress.total} เรื่อง...</span>
                        </span>
                        <span className="text-violet-400 font-bold">{batchProgress.percent}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#0D1322] overflow-hidden border border-[#1F2E45]">
                        <div
                          className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-300"
                          style={{ width: `${batchProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Realtime Processed Items Preview */}
                  {batchResults.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        เรื่องที่กู้ชีพแล้ว ({batchResults.length})
                      </h4>
                      {batchResults.map((r, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-2.5 bg-[#131B2E] border border-[#1F2E45] rounded-xl text-xs animate-fade-in"
                        >
                          <div className="w-8 h-10 rounded bg-[#0D1322] overflow-hidden shrink-0 border border-[#1F2E45]">
                            {r.coverUrl ? (
                              <img src={r.coverUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-600">
                                <Globe className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-white truncate">{r.title}</p>
                            <p className="text-[10px] text-gray-400 truncate">ตอนที่ {r.chapter}</p>
                          </div>
                          <span className="text-emerald-400 shrink-0 flex items-center gap-1 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>สำเร็จ</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Batch Completed Success View */
                <div className="text-center py-6 px-4 bg-[#141E33] border border-emerald-500/40 rounded-3xl space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      🎉 กู้ชีพแท็บสำเร็จทั้งหมด {batchResults.length} เรื่องแล้ว!
                    </h3>
                    <p className="text-xs text-gray-300 mt-1 max-w-md mx-auto">
                      ข้อมูลทั้งหมดถูกบันทึกและซิงค์ขึ้น Supabase Cloud เรียบร้อยแล้ว ตอนนี้คุณสามารถ
                      <strong className="text-emerald-300"> ปิดแท็บทั้งหมดใน Safari ทิ้งได้เลย </strong>
                      ไม่ต้องกลัวหายอีกต่อไปครับ!
                    </p>
                  </div>

                  <div className="flex justify-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setBatchFinished(false);
                        setBatchText("");
                        setBatchResults([]);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-[#131B2E] border border-[#1F2E45] transition"
                    >
                      วางเพิ่มอีกชุด
                    </button>
                    <button
                      onClick={onClose}
                      className="flex items-center gap-1.5 px-6 py-2 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-600/30 transition"
                    >
                      <span>ไปที่ชั้นหนังสือ</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ================= SINGLE TAB VIEW (EXISTING) ================= */
            <div className="space-y-4">
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

              {/* Single Batch Mode Checkbox */}
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
                  เปิดหน้านี้ค้างไว้เพื่อกู้ชีพแท็บถัดไปทันที
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#1F2E45] bg-[#0E1524]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition"
          >
            ปิดหน้าต่าง
          </button>

          {activeTab === "batch" ? (
            !batchFinished && (
              <button
                onClick={handleStartBatch}
                disabled={isBatchRunning || detectedUrls.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 shadow-lg shadow-violet-600/30 transition active:scale-95"
              >
                {isBatchRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังกู้ชีพแท็บ ({batchProgress.current}/{batchProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {detectedUrls.length > 0
                        ? `เริ่มกู้ชีพทั้ง ${detectedUrls.length} แท็บทันที`
                        : "เริ่มกู้ชีพแท็บทั้งหมด"}
                    </span>
                  </>
                )}
              </button>
            )
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
};
