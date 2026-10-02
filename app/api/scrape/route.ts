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

// Function to query AniList for HD cover and English/Romaji title
async function searchAniListCoverAndTitle(title: string): Promise<{ coverUrl: string; englishTitle?: string }> {
  if (!title || title.startsWith("การ์ตูนจาก")) return { coverUrl: "" };

  const candidates: string[] = [];

  // Extract English/Romaji substring if title contains non-ASCII and ASCII
  const romajiMatches = title.match(/[a-zA-Z0-9\s':,-]{4,}/g);
  if (romajiMatches) {
    romajiMatches.forEach((rm) => {
      const c = rm.trim();
      if (c.length > 3) candidates.push(c);
    });
  }
  candidates.push(title);

  // Add variations (e.g. "Juu Kishi" -> "Juukishi", first 3-4 words)
  const expanded: string[] = [];
  for (const c of candidates) {
    expanded.push(c);
    if (c.includes("Juu Kishi")) expanded.push(c.replace(/Juu Kishi/g, "Juukishi"));
    const words = c.split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      expanded.push(words.slice(0, 3).join(" "));
      expanded.push(words.slice(0, 4).join(" "));
    }
  }

  const uniqueCandidates = Array.from(new Set(expanded)).filter((c) => c && c.length >= 3);

  for (const queryStr of uniqueCandidates.slice(0, 4)) {
    try {
      const aniRes = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query ($search: String) { Media(search: $search, type: MANGA) { title { romaji english native } coverImage { extraLarge large } } }`,
          variables: { search: queryStr },
        }),
        signal: AbortSignal.timeout(3500),
      });
      if (aniRes.ok) {
        const aniData = await aniRes.json();
        const media = aniData?.data?.Media;
        const cover = media?.coverImage?.extraLarge || media?.coverImage?.large;
        if (cover) {
          const engTitle = media?.title?.english || media?.title?.romaji;
          return { coverUrl: cover, englishTitle: engTitle };
        }
      }
    } catch {}
  }
  return { coverUrl: "" };
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

        fetchSuccess = true;
      }
    } catch (fetchErr) {
      // Scrape timed out or blocked (Cloudflare), fallback gracefully
    }

    // Fallback: If title extraction failed or returned empty/junk, use providedTitle or smart URL derivation
    if (!title || title.length < 2) {
      title = cleanProvidedTitle || urlDerived.title;
    }

    // Final fallback: derive from site name
    if (!title) {
      title = `การ์ตูนจาก ${siteName}`;
    }

    // Handle relative cover URLs
    if (coverUrl && !coverUrl.startsWith("http")) {
      try {
        coverUrl = new URL(coverUrl, parsedUrl.origin).href;
      } catch {
        // Keep as is
      }
    }

    // If cover is missing or from protected domain, enrich from AniList
    if (!coverUrl || coverUrl.includes("nobuild.pro") || !fetchSuccess) {
      const aniResult = await searchAniListCoverAndTitle(title);
      if (aniResult.coverUrl) {
        coverUrl = aniResult.coverUrl;
      }
      if (!fetchSuccess && aniResult.englishTitle && (!title || title.startsWith("การ์ตูนจาก"))) {
        title = aniResult.englishTitle;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        title,
        cover_url: coverUrl,
        current_chapter: detectedChapter || 1,
        site_name: siteName,
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
