import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

// Dedicated chapter container selectors across all major manga platforms/themes (WordPress Madara, MangaStream, MangaThemesia, etc.)
const CHAPTER_CONTAINER_SELECTORS = [
  "#chapterlist",
  ".eplister",
  "#manga-chapters-holder",
  ".listing-chapters_wrap",
  ".bxcl",
  ".clstyle",
  "ul.sub-chap",
  "li.wp-manga-chapter",
  ".chapters-list",
  "#chapters-list",
  ".chapter-list",
  "ul.chapters",
  ".epcheck",
  ".listing-chapters",
  "div.version-chap",
];

// Elements that should never be searched for chapters of the current manga (sidebars, popular lists, recommendations)
const EXCLUDED_CONTAINERS = [
  ".sidebar",
  "#sidebar",
  ".widget",
  ".bsx",
  ".related",
  ".popular",
  "footer",
  "#footer",
  ".quickfilter",
];

// Extract clean series slug from URL to filter unrelated links
function extractSeriesSlug(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    let pathname = decodeURIComponent(u.pathname).replace(/\/+$/, "");

    pathname = pathname
      .replace(/[-_](?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/\d+(?:\.\d+)?$/, "")
      .replace(/[-_](\d+)$/, "");

    const segments = pathname.split("/").filter(Boolean);
    const slug = segments[segments.length - 1] || "";
    if (slug === "manga" || slug === "series" || slug === "comic") {
      return segments[segments.length - 2] || "";
    }
    return slug.toLowerCase();
  } catch {
    return "";
  }
}

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

// Fallback to derive series root page from a chapter URL path
function deriveSeriesUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    let pathname = decodeURIComponent(u.pathname).replace(/\/+$/, "");

    const cleanPath = pathname
      .replace(/[-_](?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/\d+(?:\.\d+)?$/, "")
      .replace(/[-_](\d+)$/, "");

    if (cleanPath && cleanPath !== pathname && cleanPath !== "") {
      return `${u.origin}${cleanPath}/`;
    }
  } catch {}
  return null;
}

// Extract chapters strictly belonging to this manga
function extractChaptersFromHtml(html: string, seriesSlug: string = "", currentChapter: number = 1): number[] {
  const $ = cheerio.load(html);
  const foundChapters = new Set<number>();

  const isReasonable = (num: number): boolean => {
    if (isNaN(num) || num <= 0) return false;
    if (num >= 1990 && num <= 2030 && (currentChapter < 1500 || currentChapter > 2100)) return false;
    if ((num === 200 || num === 404 || num === 500) && currentChapter < 150) return false;
    if (num > 5000 && currentChapter < 4000) return false;
    return true;
  };

  // 1. FIRST PRIORITY: Dedicated Chapter Containers
  // If found here, we immediately return to avoid picking up sidebar/recommendation chapters!
  for (const sel of CHAPTER_CONTAINER_SELECTORS) {
    const containers = $(sel);
    if (containers.length > 0) {
      containers.each((_, container) => {
        $(container).find("li, .chapter-item, a, .eph-num, .wp-manga-chapter").each((_, item) => {
          const text = $(item).find(".chapternum, .chapter-manhwa-title").text().trim() || $(item).text().trim();
          const href = $(item).attr("href") || $(item).find("a").attr("href") || "";

          // Match chapter pattern in text
          const mText = text.match(/(?:ตอนที่|ตอน|chapter|ch|ep|episode)\s*[:=.-]?\s*(\d+(?:\.\d+)?)/i);
          if (mText) {
            const num = parseFloat(mText[1]);
            if (isReasonable(num)) foundChapters.add(num);
          }

          // Match chapter pattern in href
          const mHref =
            href.match(/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/](\d+(?:\.\d+)?)/i) ||
            href.match(/[-_](\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/) ||
            href.match(/\/(\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/);
          if (mHref) {
            const num = parseFloat(mHref[1]);
            if (isReasonable(num)) foundChapters.add(num);
          }
        });
      });

      if (foundChapters.size > 0) {
        return Array.from(foundChapters);
      }
    }
  }

  // 2. SECOND PRIORITY: Chapter Dropdown Selects (e.g. inside reader pages)
  $("select option").each((_, el) => {
    const text = $(el).text().trim();
    const val = $(el).attr("value") || "";
    const m =
      text.match(/(?:ตอนที่|ตอน|chapter|ch|ep)?\s*[:=.-]?\s*(\d+(?:\.\d+)?)/i) ||
      val.match(/(?:chapter|ch|ep|ตอน)[-_/]?(\d+(?:\.\d+)?)/i);
    if (m) {
      const num = parseFloat(m[1]);
      if (isReasonable(num)) foundChapters.add(num);
    }
  });

  if (foundChapters.size > 0) {
    return Array.from(foundChapters);
  }

  // 3. THIRD PRIORITY: Fallback to General Links with Strict Slug Filtering
  // Remove widgets, sidebars, popular items to prevent cross-manga contamination
  EXCLUDED_CONTAINERS.forEach((exSel) => {
    $(exSel).remove();
  });

  $("a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") || "";

    // If we have a series slug, the link's href MUST contain the slug!
    if (seriesSlug && seriesSlug.length > 3) {
      const decodedHref = decodeURIComponent(href).toLowerCase();
      if (!decodedHref.includes(seriesSlug)) {
        return; // Skip unrelated links!
      }
    }

    const textMatch = text.match(/(?:ตอนที่|ตอน|chapter|ch|ep|episode)\s*[:=.-]?\s*(\d+(?:\.\d+)?)/i);
    if (textMatch) {
      const num = parseFloat(textMatch[1]);
      if (isReasonable(num)) foundChapters.add(num);
    }

    const hrefMatch =
      href.match(/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/](\d+(?:\.\d+)?)/i) ||
      href.match(/[-_](\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/);
    if (hrefMatch) {
      const num = parseFloat(hrefMatch[1]);
      if (isReasonable(num)) foundChapters.add(num);
    }
  });

  return Array.from(foundChapters);
}

// Fetch helper with standard browser headers
async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, currentChapter = 1 } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "กรุณาระบุ URL ที่ต้องการตรวจสอบ" },
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

    const seriesSlug = extractSeriesSlug(parsedUrl.href);
    let maxFoundChapter = Number(currentChapter);
    const checkedChapters: number[] = [];

    // 1. Fetch primary URL provided
    const primaryHtml = await fetchPageHtml(parsedUrl.href);
    if (primaryHtml) {
      const chapters = extractChaptersFromHtml(primaryHtml, seriesSlug, Number(currentChapter));
      checkedChapters.push(...chapters);
    }

    // 2. If URL is a chapter page, also find and fetch the series root page for the complete chapter list
    const breadcrumbSeriesUrl = primaryHtml ? findSeriesUrlFromHtml(primaryHtml, parsedUrl.href) : null;
    const derivedSeriesUrl = deriveSeriesUrl(parsedUrl.href);
    const seriesUrlToFetch = breadcrumbSeriesUrl || derivedSeriesUrl;

    if (seriesUrlToFetch && seriesUrlToFetch !== parsedUrl.href) {
      const seriesHtml = await fetchPageHtml(seriesUrlToFetch);
      if (seriesHtml) {
        const seriesChapters = extractChaptersFromHtml(seriesHtml, seriesSlug, Number(currentChapter));
        checkedChapters.push(...seriesChapters);
      }
    }

    if (checkedChapters.length > 0) {
      const highest = Math.max(...checkedChapters);
      if (highest > maxFoundChapter) {
        maxFoundChapter = highest;
      }
    }

    const hasUpdate = maxFoundChapter > Number(currentChapter);

    return NextResponse.json({
      success: true,
      latestChapter: maxFoundChapter,
      currentChapter: Number(currentChapter),
      hasUpdate,
      totalDetectedChapters: checkedChapters.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "ไม่สามารถตรวจสอบตอนใหม่ได้",
      },
      { status: 500 }
    );
  }
}
