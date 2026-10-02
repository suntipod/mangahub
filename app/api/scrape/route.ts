import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

// Helper to extract a friendly site name from URL
function getSiteNameFromUrl(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.replace(/^www\./, "");
    const parts = host.split(".");
    if (parts.length >= 2) {
      const name = parts[0];
      return name
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("-");
    }
    return host;
  } catch {
    return "Unknown Site";
  }
}

// Helper to extract chapter number from URL path
function extractChapterFromUrl(urlString: string): number | undefined {
  try {
    const parsed = new URL(urlString);
    const path = decodeURIComponent(parsed.pathname);

    // If path is like /cartoon/book/714/read/25347, 25347 is an internal chapter ID, NOT chapter number
    if (/(?:cartoon|book|read)\/\d+\/read\/\d+/i.test(path)) {
      return undefined;
    }

    // Patterns like /chapter-118, /ep-118, /ch-118, /118, /ตอนที่-118, -91/
    const match =
      path.match(/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?(\d+(?:\.\d+)?)/i) ||
      path.match(/[-_](\d+(?:\.\d+)?)\/?$/) ||
      path.match(/\/(\d+(?:\.\d+)?)\/?$/);
    if (match && match[1]) {
      const num = parseFloat(match[1]);
      if (!isNaN(num) && num > 0) {
        // Discard large internal database auto-increment IDs (e.g. /read/25347)
        if (num > 3000 && /\/read\/\d+$/i.test(path)) {
          return undefined;
        }
        return num;
      }
    }
  } catch {
    // Ignore error
  }
  return undefined;
}

// Clean up title from common website suffixes and prefixes
function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  let title = rawTitle.trim();

  // Decode common HTML entities
  title = title
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8212;|&mdash;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

  // Remove leading slashes, markdown syntax, or numbering
  title = title.replace(/^[\s/]+/, "");
  title = title.replace(/^\d+\s*(?:เรื่อง|ตอน)\s*[-:–]?\s*/gi, ""); // e.g. "16 เรื่อง ข้าคือจอมวายร้าย..."

  // Remove leading "อ่าน...", "อ่านการ์ตูนเรื่อง..."
  title = title.replace(/^(?:อ่านการ์ตูนเรื่อง|อ่านการ์ตูน|อ่านมังงะ|อ่าน)\s*/gi, "");

  // Remove site domain and branding suffixes (e.g. | ReadRealm, - SING-MANGA, | Go, | Kairew)
  title = title.replace(/\s*[-–|•]\s*[\w\s.-]+(?:com|net|org|xyz|to|in|co|app)\s*$/gi, "");
  title = title.replace(
    /\s*[-–|•]\s*(?:ReadRealm|SING-MANGA|Up-Manga|Slow-Manga|Dark-Manga|Go-Manga|Ped-Manga|Zen-Manga|Nano-Manga|Murim|MyNovel|Niceoppai|ReadToon|Kairew|Pengi|DukeToon|Public Manga).*/gi,
    ""
  );

  // Remove trailing chapter references like "ตอนที่ 182 แปลไทย", "Chapter 40", "ตอนที่ 1"
  title = title.replace(
    /\s*(?:[-–|•]\s*)?(?:ตอนที่|ตอน|chapter|ch|ep)\s*[-_]?\d+(?:\.\d+)?(?:\s*(?:แปลไทย|raw|th).*|\s*[-–|•].*)?$/gi,
    ""
  );
  title = title.replace(/\s*[-–|•]\s*(?:แปลไทย|อ่านมังงะ|มังงะแปลไทย).*$/gi, "");

  return title.trim();
}

// Smart Title Extraction from URL Slug or Search Queries
function smartDeriveFromUrl(urlString: string): { title: string; isJunk: boolean } {
  try {
    const parsed = new URL(urlString);

    // 1. Identify non-manga domains (Google, Shopee, government sites, social media, app domain)
    const JUNK_DOMAINS = [
      "google.",
      "shopee.",
      "lazada.",
      "cad.go.th",
      "mdes.go.th",
      "smart4m",
      "facebook.com",
      "instagram.com",
      "twitter.com",
      "x.com",
      "tiktok.com",
      "youtube.com",
      "youtu.be",
      "vercel.app",
    ];
    if (JUNK_DOMAINS.some((d) => parsed.hostname.toLowerCase().includes(d))) {
      return { title: "", isJunk: true };
    }

    // 2. Identify utility URLs (homepages, top-up, auth, search pages, catalog roots)
    const pathname = parsed.pathname.replace(/\/$/, "");
    if (
      pathname === "" ||
      /^\/(?:topup|payments?|auth|login|signin|register|search|comics?|manga|page\/\d+)$/i.test(pathname) ||
      (parsed.searchParams.has("s") && parsed.searchParams.get("s") && pathname === "")
    ) {
      return { title: "", isJunk: true };
    }

    // 3. Extract meaningful slug segments
    const segments = pathname.split("/").filter(Boolean);
    const meaningfulSegments = segments.filter(
      (s) =>
        !/^(?:comic|comics|manga|content|episode|series|book|books|cartoon|cartoons|read|reader|chapter|page|p|detail|view)$/i.test(s) &&
        !/^\d+$/.test(s)
    );

    let rawSlug = meaningfulSegments.pop() || segments.pop() || "";
    if (!rawSlug) return { title: "", isJunk: false };

    try {
      rawSlug = decodeURIComponent(rawSlug);
    } catch {}

    // Reject hex hashes (e.g. f6d7407c349bfea9ac8c4094febea095) or Firestore document IDs
    if (
      /^[a-fA-F0-9]{16,64}$/.test(rawSlug) ||
      /^[a-zA-Z0-9_-]{20,}$/.test(rawSlug) ||
      (/^\d+$/.test(rawSlug))
    ) {
      return { title: "", isJunk: false };
    }

    // Remove leading ID numbers like "14-return-of-the-legend"
    rawSlug = rawSlug.replace(/^\d+[-_]/, "");

    // Remove trailing chapter references like "-58", "-ตอนที่-91", "-chapter-120"
    rawSlug = rawSlug.replace(/[-_]?(?:chapter|ch|ep|episode|ตอนที่|ตอน)?[-_]?\d+(?:\.\d+)?$/i, "");
    rawSlug = rawSlug.replace(/[-_]?(?:แปลไทย|raw|thai).*$/i, "");

    // Convert hyphens and underscores to spaces
    const cleanSlug = rawSlug.replace(/[-_]+/g, " ").trim();
    if (!cleanSlug) return { title: "", isJunk: false };

    // Format Title Case
    const formatted = cleanSlug
      .split(/\s+/)
      .map((w, idx) => {
        if (/^[^\x00-\x7F]+$/.test(w)) return w; // Thai/Unicode as-is
        const lower = w.toLowerCase();
        if (
          idx > 0 &&
          ["of", "the", "in", "to", "and", "a", "an", "for", "with", "by", "as", "on"].includes(lower)
        ) {
          return lower;
        }
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ");

    return { title: formatted, isJunk: false };
  } catch {
    return { title: "", isJunk: false };
  }
}

import { findBestCovers } from "@/lib/cover-search";

// Find link back to series root from reader breadcrumb or "All Chapters"
function findSeriesUrlFromHtml(html: string, currentUrl: string): string | null {
  const $ = cheerio.load(html);
  let seriesUrl: string | null = null;
  try {
    const currentOrigin = new URL(currentUrl).origin;
    $(".breadcrumb a, .allc a, .ts-breadcrumb a, .c-breadcrumb a, [itemprop='itemListElement'] a, .headpost a, a.allc").each((_, el) => {
      if (seriesUrl) return;
      const href = $(el).attr("href");
      if (!href) return;
      try {
        const target = new URL(href, currentUrl);
        if (target.origin !== currentOrigin) return;
        const path = target.pathname.replace(/\/$/, "");
        if (!path || path === "" || path === "/manga" || path === "/series" || path === "/comics") {
          return;
        }
        if (target.href === currentUrl) return;
        if (target.protocol.startsWith("http")) {
          seriesUrl = target.href;
        }
      } catch {}
    });
  } catch {}
  return seriesUrl;
}

// Derive candidate series root page
function deriveSeriesUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    let pathname = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    pathname = pathname.replace(/^\/?\d+[-_]/, "/");
    const cleanPath = pathname
      .replace(/[-_](?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/\d+(?:\.\d+)?$/, "")
      .replace(/[-_](\d+)$/, "");

    const segments = cleanPath.split("/").filter(Boolean);
    const slug = segments[segments.length - 1] || "";
    const isAlreadyRoot =
      segments.length === 2 &&
      (segments[0] === "manga" || segments[0] === "series" || segments[0] === "comic" || segments[0] === "content");

    if (isAlreadyRoot) {
      return `${u.origin}/${segments[0]}/${segments[1]}/`;
    } else if (slug && slug !== "manga" && slug !== "series" && slug !== "comic" && slug !== "content") {
      return `${u.origin}/manga/${slug}/`;
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, providedTitle } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "กรุณาระบุ URL" },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return NextResponse.json(
        { success: false, error: "รูปแบบ URL ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const siteName = getSiteNameFromUrl(parsedUrl.href);
    const detectedChapter = extractChapterFromUrl(parsedUrl.href);
    const urlDerived = smartDeriveFromUrl(parsedUrl.href);
    const cleanProvidedTitle = typeof providedTitle === "string" ? cleanTitle(providedTitle) : "";

    // If it's a non-manga utility URL (like topup, search, homepage)
    if (urlDerived.isJunk) {
      return NextResponse.json({
        success: false,
        error: "ลิงก์นี้ไม่ใช่หน้าการ์ตูน (เป็นหน้าค้นหา, หน้าแรก, หน้าชำระเงิน หรือไม่ใช่เว็บอ่านการ์ตูน)",
      });
    }

    let title = "";
    let coverUrl = "";
    let fetchSuccess = false;

    let seriesUrl = "";

    // Fetch the webpage with realistic browser User-Agent
    try {
      const response = await fetch(parsedUrl.href, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const html = await response.text();
        const $ = cheerio.load(html);

        // 1. Extract Title
        const rawTitle =
          $('meta[property="og:title"]').attr("content") ||
          $('meta[name="twitter:title"]').attr("content") ||
          $("h1.entry-title").text() ||
          $("h1.post-title").text() ||
          $("h1").first().text() ||
          $("title").text();

        title = cleanTitle(rawTitle);

        // 2. Extract Cover Image
        coverUrl =
          $('meta[property="og:image"]').attr("content") ||
          $('meta[name="twitter:image"]').attr("content") ||
          $('.thumb img, .featured-image img, .summary_image img, .manga-poster img, .series-thumb img').attr("src") ||
          $('img[src*="cover"], img[src*="thumb"]').first().attr("src") ||
          "";

        // ReadToon bug fix: replace localhost:3000 leak with public CDN domain
        if (coverUrl.includes("localhost:3000")) {
          if (parsedUrl.hostname.includes("readtoon.com")) {
            coverUrl = coverUrl.replace(/https?:\/\/localhost:3000/, "https://w.nobuild.pro");
          } else {
            coverUrl = "";
          }
        }

        // 3. Extract Canonical Series URL from reader breadcrumb
        const breadcrumbSeries = findSeriesUrlFromHtml(html, parsedUrl.href);
        if (breadcrumbSeries) {
          seriesUrl = breadcrumbSeries;
        }

        fetchSuccess = true;
      }
    } catch (fetchErr) {
      // Scrape timed out or blocked (Cloudflare), fallback gracefully
    }

    // Fallback: If title extraction failed or returned empty/junk, use providedTitle or smart URL derivation
    if (!title || title.length < 2) {
      title = cleanProvidedTitle || urlDerived.title;
    }

    // Strip trailing chapter number from title if it matches detectedChapter (e.g. "Regressor of the Fallen family 126" -> "Regressor of the Fallen family")
    if (detectedChapter && title.length > 5) {
      const chStr = detectedChapter.toString();
      if (title.endsWith(` ${chStr}`) || title.endsWith(`-${chStr}`) || title.endsWith(`_${chStr}`)) {
        title = title.slice(0, title.length - chStr.length - 1).trim();
      }
    }

    // Final fallback: derive from site name
    if (!title) {
      title = `การ์ตูนจาก ${siteName}`;
    }

    // If seriesUrl was not found in breadcrumbs, derive from URL structure
    if (!seriesUrl) {
      seriesUrl = deriveSeriesUrl(parsedUrl.href) || parsedUrl.href;
    }

    // Handle relative cover URLs
    if (coverUrl && !coverUrl.startsWith("http")) {
      try {
        coverUrl = new URL(coverUrl, parsedUrl.origin).href;
      } catch {
        // Keep as is
      }
    }

    // Check if cover image is missing, broken, or a chapter interior panel
    const isPanelOrBroken =
      !coverUrl ||
      coverUrl.includes("nobuild.pro") ||
      /(?:chapter|ep|ch|page)[-_]?\d+[-_]\(\d+\)|ep\d+[-_]\(\d+\)|\/data\/manga_.*\/.*(?:ep|ch)\d+/i.test(coverUrl);

    if (isPanelOrBroken || !fetchSuccess) {
      try {
        const coverSearch = await findBestCovers(title);
        if (coverSearch.bestCover) {
          coverUrl = coverSearch.bestCover;
        }
        if (!fetchSuccess && coverSearch.cleanQuery && (!title || title.startsWith("การ์ตูนจาก"))) {
          title = coverSearch.cleanQuery;
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      data: {
        title,
        cover_url: coverUrl,
        current_chapter: detectedChapter || 1,
        site_name: siteName,
        series_url: seriesUrl || parsedUrl.href,
        original_url: parsedUrl.href,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "เกิดข้อผิดพลาดในการดึงข้อมูลจาก URL",
      },
      { status: 500 }
    );
  }
}
