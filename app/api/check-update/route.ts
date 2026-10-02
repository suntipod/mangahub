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

// Elements that should never be searched for chapters of the current manga (sidebars, popular lists, recommendations, ads, comments)
const EXCLUDED_CONTAINERS = [
  ".sidebar",
  "#sidebar",
  ".widget",
  ".bsx",
  ".listupd",
  ".relat",
  ".series-recomend",
  ".bixbox:has(.listupd)",
  ".bixbox:has(.bsx)",
  ".related",
  ".popular",
  "footer",
  "#footer",
  ".quickfilter",
  ".adds",
  ".ads",
  ".ad",
  ".advertisement",
  ".advertising",
  ".sponsor",
  ".pop-widget",
  "#comments",
  ".comments",
  ".comment-list",
  "#respond",
  ".fb-comments",
];

// Helper to extract chapter number directly from URL path
function extractChapterFromUrl(urlString: string): number | undefined {
  try {
    const parsed = new URL(urlString);
    const path = decodeURIComponent(parsed.pathname);

    // If path is like /cartoon/book/714/read/25347, 25347 is an internal chapter ID, NOT chapter number
    if (/(?:cartoon|book|read)\/\d+\/read\/\d+/i.test(path)) {
      return undefined;
    }

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
  } catch {}
  return undefined;
}

// Extract clean series slug from URL to filter unrelated links
function extractSeriesSlug(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    let pathname = decodeURIComponent(u.pathname).replace(/\/+$/, "");

    // Strip leading chapter prefix or number e.g. /14-return-of-the-legend -> /return-of-the-legend
    pathname = pathname.replace(/^\/?\d+[-_]/, "/");

    // Strip trailing chapter patterns e.g. -ตอนที่-39, -chapter-39, /168
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

// Special API handler for ReadRealm (SPA site with REST API)
async function checkReadRealm(urlStr: string): Promise<number | null> {
  try {
    const u = new URL(urlStr);
    let bookId: string | null = null;
    const isChapter = u.pathname.includes("/chapter/");

    if (isChapter) {
      const html = await fetchPageHtml(urlStr);
      if (html) {
        const m = html.match(/book_ID[\\\"':]+([a-zA-Z0-9_-]{10,40})/i);
        if (m) bookId = m[1];
      }
    } else {
      const m = u.pathname.match(/\/comic\/([a-zA-Z0-9_-]+)/);
      if (m && m[1] !== "chapter") {
        bookId = m[1];
      }
    }

    if (!bookId) return null;

    // 1. Primary: getBookHomePage directly gives book_chapter_count accurately
    try {
      const homeRes = await fetch(
        `https://api.readrealm.co/reader/book/getBookHomePage?book_type=comic&book_id=${bookId}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json",
          },
          next: { revalidate: 0 },
        }
      );
      if (homeRes.ok) {
        const json = await homeRes.json();
        if (json && typeof json.book_chapter_count === "number" && json.book_chapter_count > 0) {
          return json.book_chapter_count;
        }
      }
    } catch {}

    // 2. Fallback: getListChaptersSectionPage
    const apiUrl = `https://api.readrealm.co/reader/book/getListChaptersSectionPage?book_type=comic&book_id=${bookId}&start_index=1&sort=desc`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      const chapters: number[] = [];
      for (const item of json.data) {
        const titleMatch = (item.book_chapter_title || "").match(
          /(?:ตอนที่|ตอน|ch|chapter)?\s*(\d+(?:\.\d+)?)/i
        );
        if (titleMatch) {
          const num = parseFloat(titleMatch[1]);
          if (!isNaN(num) && num > 0) chapters.push(num);
        }
      }
      if (chapters.length > 0) {
        return Math.max(...chapters);
      }
    }
  } catch (e) {
    console.warn("ReadRealm check error:", e);
  }
  return null;
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

    pathname = pathname.replace(/^\/?\d+[-_]/, "/");

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

  // Strip all ads, popups, sidebars, comments, and unrelated widgets UPFRONT before any scanning
  EXCLUDED_CONTAINERS.forEach((exSel) => {
    $(exSel).remove();
  });

  const isReasonable = (num: number): boolean => {
    if (isNaN(num) || num <= 0) return false;
    if (num >= 1990 && num <= 2030 && (currentChapter < 1500 || currentChapter > 2100)) return false;
    if ((num === 404 || num === 500) && currentChapter < 150) return false;
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

          // If href points to a completely different series slug, ignore it!
          if (href && seriesSlug && seriesSlug.length > 3) {
            const decodedHref = decodeURIComponent(href).toLowerCase();
            if (
              decodedHref.includes("http") &&
              !decodedHref.includes(seriesSlug) &&
              !decodedHref.includes("/read/") &&
              !decodedHref.includes("/chapter/") &&
              !decodedHref.includes("/ep-")
            ) {
              return;
            }
          }

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
    const mText = text.match(/(?:ตอนที่|ตอน|chapter|ch|ep)\s*[:=.-]?\s*(\d+(?:\.\d+)?)/i);
    const mVal = val.match(/(?:chapter|ch|ep|ตอน)[-_/]?(\d+(?:\.\d+)?)/i);
    const m = mText || mVal;
    if (m) {
      const num = parseFloat(m[1]);
      if (isReasonable(num)) foundChapters.add(num);
    }
  });

  if (foundChapters.size > 0) {
    return Array.from(foundChapters);
  }

  // 3. THIRD PRIORITY: Fallback to General Links with Strict Slug Filtering
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

    const cloned = $(el).clone();
    cloned.find("span, div, b, small, p").each((_, subEl) => {
      const subText = $(subEl).text();
      if (/เหรียญ|บาท|coins?|baht/i.test(subText)) {
        $(subEl).remove();
      }
    });
    let cleanText = cloned.text().trim().replace(/\d+\s*(?:เหรียญ|coins?|บาท|baht)/gi, "");

    const textMatch = cleanText.match(/(?:ตอนที่|ตอน|chapter|ch|ep|episode)\s*[:=.-]?\s*(\d+(?:\.\d+)?)/i);
    const hrefMatch =
      href.match(/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/](\d+(?:\.\d+)?)/i) ||
      href.match(/[-_](\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/) ||
      href.match(/\/(\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/);

    if (hrefMatch && textMatch) {
      const hNum = parseFloat(hrefMatch[1]);
      const tNum = parseFloat(textMatch[1]);
      // If text concatenation caused a spurious extra digit like 1662 from 166 + 2 coins
      if (tNum.toString().startsWith(hNum.toString()) && tNum > hNum) {
        if (isReasonable(hNum)) foundChapters.add(hNum);
      } else {
        if (isReasonable(tNum)) foundChapters.add(tNum);
        if (isReasonable(hNum)) foundChapters.add(hNum);
      }
    } else if (textMatch) {
      const num = parseFloat(textMatch[1]);
      if (isReasonable(num)) foundChapters.add(num);
    } else if (hrefMatch) {
      const num = parseFloat(hrefMatch[1]);
      if (isReasonable(num)) foundChapters.add(num);
    }
  });

  return Array.from(foundChapters);
}

// Fetch helper with standard browser headers and timeout
async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-CH-UA": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: controller.signal,
      next: { revalidate: 0 },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`Fetch ${url} failed with status: ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e: any) {
    console.warn(`Fetch error for ${url}:`, e?.message || e);
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

    // 1. Check specialized platforms (e.g. ReadRealm API)
    if (parsedUrl.hostname.includes("readrealm.co")) {
      const rrLatest = await checkReadRealm(parsedUrl.href);
      if (rrLatest !== null) {
        return NextResponse.json({
          success: true,
          latestChapter: rrLatest,
          currentChapter: Number(currentChapter),
          hasUpdate: rrLatest > Number(currentChapter),
          totalDetectedChapters: 1,
        });
      }
    }

    const seriesSlug = extractSeriesSlug(parsedUrl.href);
    const checkedChapters: number[] = [];

    // 2. Fetch primary URL provided
    const primaryHtml = await fetchPageHtml(parsedUrl.href);
    if (primaryHtml) {
      const chapters = extractChaptersFromHtml(primaryHtml, seriesSlug, Number(currentChapter));
      checkedChapters.push(...chapters);
    }

    // 3. If URL is a chapter page, also find and fetch the series root page for the complete chapter list
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

    // 4. Fallback: If 0 chapters were detected from HTML (e.g. Cloudflare protection or single-page reader),
    // extract chapter directly from the URL itself (e.g. ...-ตอนที่-91/ or .../ch-91/)
    if (checkedChapters.length === 0) {
      const urlChapter = extractChapterFromUrl(parsedUrl.href);
      if (urlChapter && urlChapter > 0) {
        checkedChapters.push(urlChapter);
      }
    }

    if (checkedChapters.length > 0) {
      const highest = Math.max(...checkedChapters);
      const hasUpdate = highest > Number(currentChapter);
      return NextResponse.json({
        success: true,
        latestChapter: highest,
        currentChapter: Number(currentChapter),
        hasUpdate,
        totalDetectedChapters: checkedChapters.length,
      });
    }

    // If 0 chapters were detected, do NOT pretend that currentChapter is the latest!
    return NextResponse.json({
      success: false,
      error: "ไม่พบข้อมูลตอนในหน้าเว็บ หรือหน้าเว็บอาจมีระบบป้องกัน",
      latestChapter: null,
      currentChapter: Number(currentChapter),
      hasUpdate: false,
      totalDetectedChapters: 0,
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
