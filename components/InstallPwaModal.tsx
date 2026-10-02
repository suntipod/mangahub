"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Smartphone,
  Share,
  PlusSquare,
  CheckCircle2,
  Sparkles,
  Download,
  ExternalLink,
  Laptop,
  Check,
} from "lucide-react";

interface InstallPwaModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt?: any;
  onPromptAccepted?: () => void;
}

export const InstallPwaModal: React.FC<InstallPwaModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  onPromptAccepted,
}) => {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [isStandalone, setIsStandalone] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect standalone mode
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standaloneMode);

    // Detect OS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIPhoneOrIPad =
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIPhoneOrIPad) {
      setPlatform("ios");
    } else if (/android/.test(ua)) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        onPromptAccepted?.();
        onClose();
      }
    } catch (e) {
      console.error("Install prompt error:", e);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#0D1322] border border-violet-500/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1F2E45] bg-gradient-to-r from-violet-950/40 via-[#101726] to-[#0D1322] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-violet-600/30">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>ติดตั้ง MangaHub บนมือถือ</span>
                <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-full font-semibold">
                  PWA
                </span>
              </h2>
              <p className="text-xs text-gray-400">เปิดใช้งานได้เต็มจอ เหมือนโหลดแอปจริง 100%</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-gray-200 flex-1">
          {/* Standalone Success State */}
          {isStandalone ? (
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">ติดตั้งและเปิดในโหมดแอปเรียบร้อยแล้ว!</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                คุณกำลังใช้งาน MangaHub ในรูปแบบ Progressive Web App เต็มจอ ไร้แถบ URL หรือแถบนำทางเรียบร้อยแล้ว
              </p>
            </div>
          ) : (
            <>
              {/* Platform Selector Tabs */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#131B2E] border border-[#1F2E45] rounded-xl text-xs font-bold">
                <button
                  onClick={() => setPlatform("ios")}
                  className={`py-1.5 rounded-lg transition ${
                    platform === "ios"
                      ? "bg-violet-600 text-white shadow"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  🍎 iPhone / iPad
                </button>
                <button
                  onClick={() => setPlatform("android")}
                  className={`py-1.5 rounded-lg transition ${
                    platform === "android"
                      ? "bg-violet-600 text-white shadow"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  🤖 Android
                </button>
                <button
                  onClick={() => setPlatform("desktop")}
                  className={`py-1.5 rounded-lg transition ${
                    platform === "desktop"
                      ? "bg-violet-600 text-white shadow"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  💻 PC / Mac
                </button>
              </div>

              {/* iOS Safari Guide */}
              {platform === "ios" && (
                <div className="space-y-3 animate-fade-in">
                  <div className="bg-[#131B2E] border border-[#1F2E45] rounded-2xl p-4 space-y-3">
                    <p className="text-xs text-violet-300 font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      <span>ขั้นตอนง่ายๆ บน Safari (iPhone / iPad):</span>
                    </p>

                    <div className="space-y-2.5 text-xs text-gray-300">
                      <div className="flex items-start gap-2.5 bg-[#0D1322] p-2.5 rounded-xl border border-[#1F2E45]">
                        <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          1
                        </span>
                        <div>
                          <span>แตะปุ่ม </span>
                          <strong className="text-white">แชร์ (Share)</strong>
                          <Share className="w-3.5 h-3.5 inline mx-1 text-blue-400" />
                          <span> ที่แถบเครื่องมือด้านล่างของ Safari</span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 bg-[#0D1322] p-2.5 rounded-xl border border-[#1F2E45]">
                        <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          2
                        </span>
                        <div>
                          <span>เลื่อนลงมาแล้วแตะเมนู </span>
                          <strong className="text-white">&quot;เพิ่มไปยังหน้าจอโฮม&quot;</strong>
                          <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-emerald-400" />
                          <span className="text-gray-400">(Add to Home Screen)</span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 bg-[#0D1322] p-2.5 rounded-xl border border-[#1F2E45]">
                        <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          3
                        </span>
                        <div>
                          <span>แตะปุ่ม </span>
                          <strong className="text-white">&quot;เพิ่ม&quot; (Add)</strong>
                          <span> ที่มุมขวาบนของหน้าจอ</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-violet-950/30 border border-violet-500/30 rounded-xl text-xs text-violet-300 flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>
                      จะได้ไอคอน MangaHub บนหน้าจอโฮมทันที เปิดอ่านได้เต็มจอ ไม่มีแถบ Safari กวนสายตา
                    </span>
                  </div>
                </div>
              )}

              {/* Android Guide */}
              {platform === "android" && (
                <div className="space-y-3 animate-fade-in">
                  {deferredPrompt ? (
                    <button
                      onClick={handleInstallClick}
                      disabled={installing}
                      className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2 transition active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>{installing ? "กำลังติดตั้ง..." : "กดเพื่อติดตั้งแอป MangaHub ทันที 📲"}</span>
                    </button>
                  ) : (
                    <div className="bg-[#131B2E] border border-[#1F2E45] rounded-2xl p-4 space-y-3">
                      <p className="text-xs text-violet-300 font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                        <span>ขั้นตอนบน Chrome (Android):</span>
                      </p>

                      <div className="space-y-2.5 text-xs text-gray-300">
                        <div className="flex items-start gap-2.5 bg-[#0D1322] p-2.5 rounded-xl border border-[#1F2E45]">
                          <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            1
                          </span>
                          <div>
                            <span>แตะเมนู </span>
                            <strong className="text-white">จุดสามจุด (⋮)</strong>
                            <span> ที่มุมขวาบนของ Chrome</span>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 bg-[#0D1322] p-2.5 rounded-xl border border-[#1F2E45]">
                          <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            2
                          </span>
                          <div>
                            <span>เลือก </span>
                            <strong className="text-white">&quot;ติดตั้งแอป&quot;</strong>
                            <span> หรือ </span>
                            <strong className="text-white">&quot;เพิ่มลงในหน้าจอหลัก&quot;</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-violet-950/30 border border-violet-500/30 rounded-xl text-xs text-violet-300 flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>แอปจะถูกติดตั้งลง App Drawer เหมือนแอปจาก Play Store ทันที</span>
                  </div>
                </div>
              )}

              {/* Desktop Guide */}
              {platform === "desktop" && (
                <div className="space-y-3 animate-fade-in">
                  <div className="bg-[#131B2E] border border-[#1F2E45] rounded-2xl p-4 space-y-3">
                    <p className="text-xs text-violet-300 font-semibold flex items-center gap-1.5">
                      <Laptop className="w-4 h-4 text-violet-400" />
                      <span>ติดตั้งบนคอมพิวเตอร์ (Google Chrome / Edge):</span>
                    </p>

                    <div className="space-y-2 text-xs text-gray-300">
                      <p>
                        1. ดูที่แถบพิมพ์ที่อยู่เว็บ (Address Bar) ด้านขวาบน จะมีไอคอน{" "}
                        <strong className="text-white">ติดตั้งแอป (Install App)</strong>
                      </p>
                      <p>
                        2. คลิกปุ่มติดตั้ง จะได้หน้าต่างแอปแยกต่างหาก รวดเร็ว ไม่ต้องเปิดผ่านเบราว์เซอร์
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Benefits Feature Card */}
          <div className="bg-[#090D16] border border-[#1F2E45] rounded-2xl p-3.5 space-y-2 text-xs text-gray-400">
            <span className="font-bold text-gray-300 block">✨ ข้อดีเมื่อติดตั้งเป็นแอป:</span>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-gray-300">
                <span className="text-emerald-400">✔</span>
                <span>เต็มจอ ไร้แถบ URL</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <span className="text-emerald-400">✔</span>
                <span>เปิดแอปได้เร็วใน 1 วิ</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <span className="text-emerald-400">✔</span>
                <span>ซิงค์ข้อมูลกับ PC ทันที</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <span className="text-emerald-400">✔</span>
                <span>รองรับออฟไลน์แคช</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#1F2E45] bg-[#0A0F1A] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#1C2940] hover:bg-[#253654] text-white text-xs font-bold transition"
          >
            เข้าใจแล้ว
          </button>
        </div>
      </div>
    </div>
  );
};
