"use client";

import React, { useEffect, useState } from "react";
import { Share, PlusSquare, X, Smartphone, CheckCircle, Download } from "lucide-react";
import { InstallPwaModal } from "./InstallPwaModal";

export const PWARegister: React.FC = () => {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Service worker active
        })
        .catch((err) => {
          console.warn("SW register failed:", err);
        });
    }

    // 2. Check if already installed & running in Standalone mode
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    setIsStandalone(standaloneMode);

    // 3. Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIPhoneOrIPad =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    setIsIOS(isIPhoneOrIPad);

    // 4. If iOS & NOT standalone & not previously dismissed -> Show prompt
    const dismissed = localStorage.getItem("mangahub_pwa_ios_hint_dismissed");
    if (isIPhoneOrIPad && !standaloneMode && !dismissed) {
      // Delay showing banner slightly so page loads smoothly first
      const timer = setTimeout(() => setShowIOSPrompt(true), 2000);
      return () => clearTimeout(timer);
    }

    // 5. Handle Android / Chrome beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // 6. Listen for manual open trigger from header/settings
    const handleOpenInstall = () => setIsModalOpen(true);

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("mangahub-open-install-pwa", handleOpenInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("mangahub-open-install-pwa", handleOpenInstall);
    };
  }, []);

  const dismissIOSPrompt = () => {
    setShowIOSPrompt(false);
    localStorage.setItem("mangahub_pwa_ios_hint_dismissed", "true");
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setIsModalOpen(true);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <>
      <InstallPwaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        deferredPrompt={deferredPrompt}
        onPromptAccepted={() => setDeferredPrompt(null)}
      />

      {/* Don't render banner if already running standalone */}
      {!isStandalone && (
        <>
      {/* iOS Safari "Add to Home Screen" Floating Hint */}
      {showIOSPrompt && isIOS && (
        <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 max-w-md mx-auto z-50 bg-[#111827]/95 backdrop-blur-xl border border-violet-500/40 rounded-2xl p-4 shadow-2xl shadow-violet-950/60 animate-fade-in text-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>เปิดใช้งานแบบเต็มจอ ไร้แถบ Safari</span>
                  <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded font-semibold">
                    PWA
                  </span>
                </h4>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  เปิด MangaHub ได้เหมือนแอปจริงจาก App Store ไร้แถบ URL กวนใจ:
                </p>
                <div className="pt-1 flex items-center gap-1.5 text-[11px] font-semibold text-violet-300">
                  <span>1. แตะปุ่มแชร์</span>
                  <Share className="w-3.5 h-3.5 text-blue-400" />
                  <span>2. เลื่อนลงเลือก</span>
                  <span className="underline decoration-violet-400 underline-offset-2">
                    &quot;เพิ่มไปยังหน้าจอโฮม&quot;
                  </span>
                  <PlusSquare className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              </div>
            </div>

            <button
              onClick={dismissIOSPrompt}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition shrink-0"
              title="ปิดการแจ้งเตือน"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Android / Chrome Native Install Banner if available */}
      {deferredPrompt && (
        <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 max-w-sm mx-auto z-50 bg-[#111827]/95 backdrop-blur-xl border border-violet-500/40 rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center font-bold text-xs">
              MH
            </div>
            <div>
              <p className="text-xs font-bold text-white">ติดตั้งแอป MangaHub</p>
              <p className="text-[10px] text-gray-400">เพื่อการเปิดใช้งานแบบเต็มจอ</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleInstallClick}
              className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow transition active:scale-95"
            >
              ติดตั้ง
            </button>
            <button
              onClick={() => setDeferredPrompt(null)}
              className="p-1 text-gray-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </>
  );
};
