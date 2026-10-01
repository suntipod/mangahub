"use client";

import React, { useState } from "react";
import { Manga, MangaSource } from "@/types/manga";
import { getStoredCategories } from "@/lib/categories";
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
  BookOpen,
  Trash2,
  Edit3,
  Folder,
  ClipboardPaste,
  ClipboardCheck,
} from "lucide-react";

interface AddMangaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddManga: (newManga: Manga) => void;
  onAddMangas?: (newMangas: Manga[]) => void;
}

interface BatchItem {
  id: string;
  url: string;
  chapter: number;
  siteName: string;
}

function parseLinesToBatchItems(text: string): BatchItem[] {
  const lines = text.split(/[\r\n]+/);
  const items: BatchItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const urlMatch = line.match(/(https?:\/\/[^\s,]+)/i);
    if (!urlMatch) continue;
    const itemUrl = urlMatch[1];
    if (seen.has(itemUrl)) continue;
    seen.add(itemUrl);

    // 1. Check if user typed explicit chapter after URL on the same line (e.g. "https://... 155")
    const rest = line.replace(itemUrl, "").trim();
    const explicitMatch = rest.match(/(?:ตอนที่|ตอน|ch|chapter)?\s*[:=,-]?\s*(\d+(?:\.\d+)?)/i);

    // 2. Or auto-extract chapter from URL (e.g. /chapter/155, /155)
    const urlChMatch =
      itemUrl.match(/(?:chapter|ch|ep|ตอนที่|ตอน)[-_/]?(\d+(?:\.\d+)?)/i) ||
      itemUrl.match(/\/(\d+(?:\.\d+)?)\/?$/);

    let chapter = 1;
    if (explicitMatch) {
      chapter = parseFloat(explicitMatch[1]);
    } else if (urlChMatch) {
      chapter = parseFloat(urlChMatch[1]);
    }

    let siteName = "เว็บอ่าน";
    try {
      const u = new URL(itemUrl);

      // Filter out non-manga URLs (homepages, top-up, search, self app)
      if (
        (u.pathname === "/" || u.pathname === "") ||
        /^\/(?:topup|search|comics|manga|page\/\d+)\/?$/i.test(u.pathname) ||
        u.hostname.includes("vercel.app")
      ) {
        continue;
      }

      siteName = u.hostname.replace(/^www\./, "").split(".")[0];
      if (u.hostname.includes("google.") && u.searchParams.has("q")) {
        siteName = "Google ค้นหา";
      }
    } catch {}

    items.push({
      id: `item-${i}-${Date.now()}`,
      url: itemUrl,
      chapter,
      siteName,
    });
  }
  return items;
}

export const AddMangaModal: React.FC<AddMangaModalProps> = ({
  isOpen,
  onClose,
  onAddManga,
  onAddMangas,
}) => {
  if (!isOpen) return null;

  // Active Tab: "batch" (default) or "single"
  const [activeTab, setActiveTab] = useState<"batch" | "single">("batch");

  // Available Categories
  const [availableCategories] = useState<string[]>(getStoredCategories());
  const [category, setCategory] = useState<string>("การ์ตูนทั่วไป");
  const [batchCategory, setBatchCategory] = useState<string>("การ์ตูนทั่วไป");

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
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [batchResults, setBatchResults] = useState<
    Array<{ url: string; title: string; chapter: number; coverUrl: string; status: "success" | "fallback" }>
  >([]);
  const [batchFinished, setBatchFinished] = useState(false);
  const [batchError, setBatchError] = useState("");

  // Handle batch text input change
  const handleBatchTextChange = (text: string) => {
    setBatchText(text);
    setBatchItems(parseLinesToBatchItems(text));
    if (batchError) setBatchError("");
  };

  // Update chapter for a specific batch item
  const handleItemChapterChange = (index: number, newChapter: number) => {
    setBatchItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], chapter: isNaN(newChapter) ? 1 : newChapter };
      return copy;
    });
  };

  // Remove a specific batch item
  const handleRemoveItem = (index: number) => {
    setBatchItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Quick Paste feedback states
  const [pasteSingleSuccess, setPasteSingleSuccess] = useState(false);
  const [pasteBatchSuccess, setPasteBatchSuccess] = useState(false);

  // Auto-scrape single URL (supports direct URL parameter from clipboard)
  const handleScrape = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl !== undefined ? overrideUrl : url).trim();
    if (!targetUrl) {
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
        body: JSON.stringify({ url: targetUrl }),
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
        const u = new URL(targetUrl);
        setSiteName(u.hostname.replace(/^www\./, "").split(".")[0]);
      } catch {
        setSiteName("เว็บอ่าน");
      }
    } finally {
      setLoading(false);
    }
  };

  // Quick 1-Tap Paste & Scrape for Single Tab
  const handlePasteAndScrapeSingle = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setErrorMsg("เบราว์เซอร์นี้ไม่อนุญาตให้อ่านคลิปบอร์ดอัตโนมัติ กรุณากดแตะค้างแล้ววางด้วยตนเองครับ");
        return;
      }
      const clipText = await navigator.clipboard.readText();
      if (!clipText || !clipText.trim()) {
        setErrorMsg("ไม่พบข้อความในคลิปบอร์ด กรุณาก๊อปปี้ลิงก์หน้าการ์ตูนมาก่อนครับ");
        return;
      }

      // Extract URL from clipboard text in case user copied a line with extra text
      const urlMatch = clipText.match(/(https?:\/\/[^\s]+)/i);
      const targetUrl = urlMatch ? urlMatch[1] : clipText.trim();

      setUrl(targetUrl);
      setPasteSingleSuccess(true);
      setTimeout(() => setPasteSingleSuccess(false), 1500);

      // Immediately trigger scrape
      handleScrape(targetUrl);
    } catch (err: any) {
      console.warn("Clipboard access denied:", err);
      setErrorMsg("ไม่สามารถเข้าถึงคลิปบอร์ดได้ (เบราว์เซอร์อาจต้องกดยืนยันการอนุญาตสิทธิ์ หรือวางด้วยตนเอง)");
    }
  };

  // Quick 1-Tap Paste for Batch Tab
  const handlePasteBatchFromClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setBatchError("เบราว์เซอร์นี้ไม่อนุญาตให้อ่านคลิปบอร์ดอัตโนมัติ กรุณากดแตะค้างแล้ววางด้วยตนเองครับ");
        return;
      }
      const clipText = await navigator.clipboard.readText();
      if (!clipText || !clipText.trim()) {
        setBatchError("ไม่พบข้อความในคลิปบอร์ด กรุณาก๊อปปี้ลิงก์หน้าการ์ตูนมาก่อนครับ");
        return;
      }

      const newText = batchText.trim() ? `${batchText.trim()}\n${clipText.trim()}` : clipText.trim();
      handleBatchTextChange(newText);
      setPasteBatchSuccess(true);
      setTimeout(() => setPasteBatchSuccess(false), 1500);
    } catch (err: any) {
      console.warn("Clipboard access denied:", err);
      setBatchError("ไม่สามารถเข้าถึงคลิปบอร์ดได้ (เบราว์เซอร์อาจต้องกดยืนยันการอนุญาตสิทธิ์ หรือวางด้วยตนเอง)");
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
      category: category || "การ์ตูนทั่วไป",
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

  // Execute Batch Import
  const handleStartBatch = async () => {
    if (batchItems.length === 0) {
      setBatchError("ไม่พบลิงก์ URL ในข้อความ กรุณาก๊อปปี้ลิงก์หน้าการ์ตูนมาวางครับ");
      return;
    }

    setIsBatchRunning(true);
    setBatchError("");
    setBatchFinished(false);
    setBatchResults([]);
    setBatchProgress({ current: 0, total: batchItems.length, percent: 0 });

    const rescuedMangas: Manga[] = [];
    const results: Array<{ url: string; title: string; chapter: number; coverUrl: string; status: "success" | "fallback" }> = [];

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      let scrapedTitle = "";
      let scrapedCover = "";
      let chosenChapter = item.chapter; // Use user-specified or auto-parsed chapter!
      let scrapedSite = item.siteName || "เว็บอ่าน";
      let status: "success" | "fallback" = "fallback";

      try {
        const res = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: item.url }),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            scrapedTitle = json.data.title || "";
            scrapedCover = json.data.cover_url || "";
            if (item.chapter === 1 && json.data.current_chapter && json.data.current_chapter > 1) {
              chosenChapter = json.data.current_chapter;
            }
            if (json.data.site_name) scrapedSite = json.data.site_name;
            if (scrapedTitle) status = "success";
          }
        }
      } catch (err) {
        // Fallback gracefully without stopping
      }

      // Clean up title in case any stray slashes or hashes were returned
      if (scrapedTitle) {
        scrapedTitle = scrapedTitle.replace(/^[\s/]+/, "").trim();
      }

      // Safe fallback if scraper couldn't extract title
      if (!scrapedTitle || scrapedTitle.length < 2) {
        try {
          const parsed = new URL(item.url);
          const segments = parsed.pathname.split("/").filter(Boolean);
          const slug =
            segments.filter(
              (s) => !/^(?:comic|comics|manga|content|episode|series|book|read|chapter|page|p)$/i.test(s) && !/^\d+$/.test(s)
            ).pop() ||
            segments[0] ||
            `การ์ตูนเรื่องที่ ${i + 1}`;
          const decoded = decodeURIComponent(slug)
            .replace(/^\d+[-_]/, "")
            .replace(/[-_]?(?:chapter|ch|ep|ตอนที่)?[-_]?\d+$/i, "")
            .replace(/[-_]+/g, " ")
            .trim();
          scrapedTitle = decoded || `การ์ตูนเรื่องที่ ${i + 1}`;
        } catch {
          scrapedTitle = `การ์ตูนเรื่องที่ ${i + 1}`;
        }
      }

      const mangaId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `manga-${Date.now()}-${i}`;
      const sourceId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `src-${Date.now()}-${i}`;

      const newManga: Manga = {
        id: mangaId,
        title: scrapedTitle,
        cover_url: scrapedCover,
        current_chapter: chosenChapter,
        status: "reading",
        tier: "none",
        category: batchCategory || "การ์ตูนทั่วไป",
        sources: [
          {
            id: sourceId,
            manga_id: mangaId,
            site_name: scrapedSite,
            base_url: item.url,
            current_chapter_url: item.url,
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
        url: item.url,
        title: scrapedTitle,
        chapter: chosenChapter,
        coverUrl: scrapedCover,
        status,
      });

      setBatchResults([...results]);
      const current = i + 1;
      setBatchProgress({
        current,
        total: batchItems.length,
        percent: Math.round((current / batchItems.length) * 100),
      });

      // Small pause between web requests to prevent Cloudflare rate-limiting
      if (i < batchItems.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
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
                  <span>วิธีใส่ตอนที่อ่านถึง &amp; คัดลอกทุกลิงก์จาก Safari:</span>
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  • <strong>ตรวจจับตอนอัตโนมัติ:</strong> ถ้าลิงก์ที่ก๊อปปี้มาเป็นหน้าตอนที่กำลังอ่านอยู่ (เช่น <code className="text-violet-300 font-mono">/155</code>) ระบบจะดึงเลขตอนให้อัตโนมัติ<br />
                  • <strong>หรือระบุเลขตอนเอง:</strong> เคาะวรรคแล้วพิมพ์เลขตอนต่อท้ายลิงก์ได้เลย เช่น <code className="text-amber-300 font-mono">https://.../manga 155</code><br />
                  • <strong>แก้ไขเลขตอน:</strong> คุณสามารถพิมพ์แก้เลขตอนของแต่ละเรื่องในรายการด้านล่างได้ทันทีก่อนกดบันทึกครับ!
                </p>
              </div>

              {!batchFinished ? (
                <>
                  {/* Category Selector for Batch */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-[#141E33] border border-[#1F2E45] rounded-2xl">
                    <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-violet-400" />
                      <span>จัดเข้าหมวดหมู่:</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {availableCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setBatchCategory(cat)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                            batchCategory === cat
                              ? cat.toLowerCase().includes("dojin")
                                ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                                : cat.toLowerCase().includes("ntr")
                                ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                                : "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                              : "bg-[#0D1322] text-gray-400 hover:text-gray-200 border border-[#1F2E45]"
                          }`}
                        >
                          <span>
                            {cat.toLowerCase().includes("dojin")
                              ? "🔞 "
                              : cat.toLowerCase().includes("ntr")
                              ? "💔 "
                              : "📚 "}
                            {cat}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                        <span>วางลิงก์ทั้งหมดที่ก๊อปปี้มาที่นี่</span>
                        <span className="text-red-400">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        {batchItems.length > 0 && (
                          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                            ตรวจพบ {batchItems.length} เรื่อง
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handlePasteBatchFromClipboard}
                          disabled={isBatchRunning}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition shadow-sm active:scale-95 ${
                            pasteBatchSuccess
                              ? "bg-emerald-600 text-white border border-emerald-500"
                              : "bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 hover:text-white border border-violet-500/40"
                          }`}
                          title="ดึงข้อความจากคลิปบอร์ดมาวางทันที (ไม่ต้องกดจิ้มค้าง)"
                        >
                          {pasteBatchSuccess ? (
                            <>
                              <ClipboardCheck className="w-3.5 h-3.5 text-emerald-300" />
                              <span>วางสำเร็จ!</span>
                            </>
                          ) : (
                            <>
                              <ClipboardPaste className="w-3.5 h-3.5 text-violet-400" />
                              <span>วางจากคลิปบอร์ด</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={4}
                      disabled={isBatchRunning}
                      placeholder={`https://www.up-manga.com/manga/barbarian/155\nhttps://www.slow-manga.com/manga/pick-me-up 206\nhttps://www.up-manga.com/manga/nano-machine (ระบบดึงเลขตอนจาก URL หรือใส่เลขต่อท้ายได้)`}
                      value={batchText}
                      onChange={(e) => handleBatchTextChange(e.target.value)}
                      className="w-full bg-[#131B2E] border border-[#1F2E45] focus:border-violet-500 rounded-2xl p-3.5 text-xs text-gray-200 placeholder-gray-500 outline-none transition font-mono leading-relaxed"
                    />
                  </div>

                  {batchError && (
                    <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{batchError}</span>
                    </div>
                  )}

                  {/* Detected Items with Editable Chapters */}
                  {batchItems.length > 0 && !isBatchRunning && (
                    <div className="space-y-2 bg-[#141E33] border border-[#1F2E45] rounded-2xl p-3.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                          <Edit3 className="w-3.5 h-3.5 text-violet-400" />
                          <span>ตรวจสอบ &amp; ปรับแก้ตอนที่อ่านถึง ({batchItems.length} เรื่อง):</span>
                        </h4>
                        <span className="text-[10px] text-gray-400">คลิกที่ช่องเลขตอนเพื่อแก้ได้</span>
                      </div>

                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {batchItems.map((item, idx) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 p-2 bg-[#0E1524] border border-[#1F2E45] rounded-xl text-xs hover:border-violet-500/40 transition"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-[10px] font-bold text-gray-400 w-4 shrink-0">
                                #{idx + 1}
                              </span>
                              <span className="text-[10px] bg-violet-600/20 text-violet-300 px-1.5 py-0.5 rounded border border-violet-500/30 shrink-0 font-medium">
                                {item.siteName}
                              </span>
                              <span className="text-gray-300 font-mono text-[11px] truncate flex-1" title={item.url}>
                                {item.url}
                              </span>
                            </div>

                            {/* Editable Chapter Input */}
                            <div className="flex items-center gap-1.5 shrink-0 bg-[#141E33] border border-[#1F2E45] px-2 py-1 rounded-lg">
                              <span className="text-[10px] font-bold text-gray-400">ตอนที่:</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={item.chapter}
                                onChange={(e) => handleItemChapterChange(idx, parseFloat(e.target.value))}
                                className="w-16 bg-[#0B0F19] text-violet-300 font-bold text-xs text-center border border-[#1F2E45] focus:border-violet-500 rounded px-1.5 py-0.5 outline-none"
                              />
                            </div>

                            {/* Remove button */}
                            <button
                              onClick={() => handleRemoveItem(idx)}
                              title="ลบลิงก์นี้ออก"
                              className="p-1 text-gray-500 hover:text-red-400 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
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
                            <p className="text-[10px] text-violet-400 font-bold truncate">ตอนที่อ่านถึง: {r.chapter}</p>
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
                      ข้อมูลทั้งหมดรวมถึงตอนล่าสุดถูกบันทึกและซิงค์ขึ้น Supabase Cloud เรียบร้อยแล้ว ตอนนี้คุณสามารถ
                      <strong className="text-emerald-300"> ปิดแท็บทั้งหมดใน Safari ทิ้งได้เลย </strong>
                      ไม่ต้องกลัวหายอีกต่อไปครับ!
                    </p>
                  </div>

                  <div className="flex justify-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setBatchFinished(false);
                        setBatchText("");
                        setBatchItems([]);
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
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                    <span>URL หน้าเรื่อง หรือหน้าตอนล่าสุดที่เปิดค้างไว้</span>
                    <span className="text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteAndScrapeSingle}
                    disabled={loading}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition shadow-sm active:scale-95 ${
                      pasteSingleSuccess
                        ? "bg-emerald-600 text-white border border-emerald-500"
                        : "bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 hover:text-white border border-violet-500/40"
                    }`}
                    title="วางลิงก์จากคลิปบอร์ดและดึงข้อมูลอัตโนมัติทันที"
                  >
                    {pasteSingleSuccess ? (
                      <>
                        <ClipboardCheck className="w-3.5 h-3.5 text-emerald-300" />
                        <span>วาง &amp; กำลังดึง...</span>
                      </>
                    ) : (
                      <>
                        <ClipboardPaste className="w-3.5 h-3.5 text-violet-400" />
                        <span>วาง &amp; ดึงทันที</span>
                      </>
                    )}
                  </button>
                </div>
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
                    onClick={() => handleScrape()}
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
                        หมวดหมู่
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {availableCategories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setCategory(cat)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                              category === cat
                                ? cat.toLowerCase().includes("dojin")
                                  ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                                  : cat.toLowerCase().includes("ntr")
                                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                                  : "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                                : "bg-[#0D1322] text-gray-400 hover:text-gray-200 border border-[#1F2E45]"
                            }`}
                          >
                            <span>
                              {cat.toLowerCase().includes("dojin")
                                ? "🔞 "
                                : cat.toLowerCase().includes("ntr")
                                ? "💔 "
                                : "📚 "}
                              {cat}
                            </span>
                          </button>
                        ))}
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
                disabled={isBatchRunning || batchItems.length === 0}
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
                      {batchItems.length > 0
                        ? `เริ่มกู้ชีพทั้ง ${batchItems.length} แท็บทันที`
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
