import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { isSafeExternalUrl, safeDecodeURIComponent } from "@/lib/ssrf";

// Dedicated chapter container selectors across all major manga platforms/themes (WordPress Madara, MangaStream, MangaThemesia, Niceoppai, etc.)
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
  ".chlist__rows",
  "ul.lst",
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
    const path = safeDecodeURIComponent(parsed.pathname);

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
    let pathname = safeDecodeURIComponent(u.pathname).replace(/\/+$/, "");

    // Strip leading chapter prefix or number e.g. /14-return-of-the-legend -> /return-of-the-legend
    pathname = pathname.replace(/^\/?\d+[-_]/, "/");

    // Strip trailing chapter patterns e.g. -ตอนที่-39, -chapter-39, /168, /1.0
    pathname = pathname
      .replace(/[-_](?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/\d+(?:\.\d+)?$/, "")
      .replace(/[-_](\d+(?:\.\d+)?)$/, "");

    const segments = pathname.split("/").filter(Boolean);
    if (
      segments.length >= 2 &&
      (segments[0] === "manga" || segments[0] === "series" || segments[0] === "comic" || segments[0] === "content")
    ) {
      return segments[1].toLowerCase();
    }
    const slug = segments[segments.length - 1] || "";
    if (slug === "manga" || slug === "series" || slug === "comic" || slug === "content") {
      return (segments[segments.length - 2] || "").toLowerCase();
    }
    return slug.toLowerCase();
  } catch {
    return "";
  }
}

async function queryReadRealmBook(bookId: string): Promise<number | null> {
  // 1. Primary: getBookHomePage directly gives book_chapter_count accurately
  try {
    const homeRes = await fetch(
      `https://api.readrealm.co/reader/book/getBookHomePage?book_type=comic&book_id=${bookId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 0 },
      }
    );
    if (homeRes.ok) {
      const json = await homeRes.json();
      if (
        json &&
        typeof json.book_chapter_count === "number" &&
        json.book_chapter_count > 0 &&
        json.book_chapter_count < 3000
      ) {
        return json.book_chapter_count;
      }
    }
  } catch {}

  // 2. Fallback: getListChaptersSectionPage
  try {
    const apiUrl = `https://api.readrealm.co/reader/book/getListChaptersSectionPage?book_type=comic&book_id=${bookId}&start_index=1&sort=desc`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 0 },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data && Array.isArray(json.data) && json.data.length > 0) {
        const chapters: number[] = [];
        for (const item of json.data) {
          const titleMatch = (item.book_chapter_title || "").match(
            /(?:ตอนที่|ตอน|ch|chapter)?\s*(\d+(?:\.\d+)?)/i
          );
          if (titleMatch) {
            const num = parseFloat(titleMatch[1]);
            if (!isNaN(num) && num > 0 && num < 3000) chapters.push(num);
          }
        }
        if (chapters.length > 0) {
          return Math.max(...chapters);
        }
      }
    }
  } catch {}

  return null;
}

// Special API handler for ReadRealm (SPA site with REST API)
async function checkReadRealm(urlStr: string): Promise<{ latestChapter: number; resolvedSeriesUrl?: string } | null> {
  try {
    const u = new URL(urlStr);
    let candidateId: string | null = null;
    const isChapter = u.pathname.includes("/chapter/");

    const mPath = u.pathname.match(/\/(?:comic|manga)\/(?:chapter\/)?([a-zA-Z0-9_-]+)/);
    if (mPath && mPath[1] !== "chapter") {
      candidateId = mPath[1];
    }

    // If not explicitly a chapter URL, try candidateId directly as book_id first
    if (!isChapter && candidateId) {
      const directCount = await queryReadRealmBook(candidateId);
      if (directCount !== null) {
        return {
          latestChapter: directCount,
          resolvedSeriesUrl: `https://readrealm.co/comic/${candidateId}`,
        };
      }
    }

    // Otherwise (or if direct book_id lookup returned null because candidateId is a chapter_id),
    // fetch the chapter page HTML to extract the parent book_ID!
    const chapterPageUrl = isChapter
      ? urlStr
      : candidateId
      ? `https://readrealm.co/comic/chapter/${candidateId}`
      : urlStr;
    const html = await fetchPageHtml(chapterPageUrl);
    if (html) {
      const m = html.match(/book_ID[\\\"':]+([a-zA-Z0-9_-]{10,40})/i);
      if (m && m[1]) {
        const realBookId = m[1];
        const count = await queryReadRealmBook(realBookId);
        if (count !== null) {
          return {
            latestChapter: count,
            resolvedSeriesUrl: `https://readrealm.co/comic/${realBookId}`,
          };
        }
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

  try {
    const currentOrigin = new URL(currentUrl).origin;
    const isValidSeriesCandidate = (href: string | undefined): string | null => {
      if (!href) return null;
      try {
        const target = new URL(href, currentUrl);
        if (target.origin !== currentOrigin) return null;
        if (!target.protocol.startsWith("http")) return null;
        if (target.href.replace(/\/$/, "") === currentUrl.replace(/\/$/, "")) return null;

        const path = safeDecodeURIComponent(target.pathname).replace(/\/$/, "");
        if (
          !path ||
          path === "" ||
          /^\/(?:manga|series|comics?|content|book|cartoon)$/i.test(path) ||
          /\/(?:genre|manga-genre|category|tag|author|type|page|search)\//i.test(path + "/")
        ) {
          return null;
        }
        return target.href;
      } catch {
        return null;
      }
    };

    // 1. Explicit "All chapters" link on MangaStream / Themesia reader pages (.allc a, a.allc, .headpost a)
    let explicitSeriesUrl: string | null = null;
    $(".allc a, a.allc, .headpost a").each((_, el) => {
      if (explicitSeriesUrl) return;
      const valid = isValidSeriesCandidate($(el).attr("href"));
      if (valid) explicitSeriesUrl = valid;
    });
    if (explicitSeriesUrl) return explicitSeriesUrl;

    // 2. Breadcrumb trail: Home > Manga > [Genre] > Series > Current Chapter
    // Pick the LAST valid link in the breadcrumb trail (closest parent to the chapter)
    const breadcrumbCandidates: string[] = [];
    $(".breadcrumb a, .ts-breadcrumb a, .c-breadcrumb a, [itemprop='itemListElement'] a").each((_, el) => {
      const valid = isValidSeriesCandidate($(el).attr("href"));
      if (valid) breadcrumbCandidates.push(valid);
    });
    if (breadcrumbCandidates.length > 0) {
      return breadcrumbCandidates[breadcrumbCandidates.length - 1];
    }
  } catch {}

  return null;
}

// Derive prioritized candidate series root URLs from a chapter reader path
function getSeriesCandidates(urlStr: string): string[] {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    let pathname = safeDecodeURIComponent(u.pathname).replace(/\/+$/, "");

    pathname = pathname.replace(/^\/?\d+[-_]/, "/");

    const cleanPath = pathname
      .replace(/[-_](?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?\d+(?:\.\d+)?$/i, "")
      .replace(/\/\d+(?:\.\d+)?$/, "")
      .replace(/[-_](\d+(?:\.\d+)?)$/, "");

    const segments = cleanPath.split("/").filter(Boolean);
    const hasPrefixDir =
      segments.length >= 2 &&
      (segments[0] === "manga" || segments[0] === "series" || segments[0] === "comic" || segments[0] === "content");

    // Extract raw slug: if path is /manga/{slug}/season-1/ch-235, segments[1] is the true series slug!
    const rawSlug = hasPrefixDir ? segments[1] : segments[segments.length - 1] || "";
    if (!rawSlug || /^(?:manga|series|comics?|content|ซีซั่น)$/i.test(rawSlug)) {
      return [];
    }

    const slugVariants = Array.from(
      new Set([
        rawSlug,
        rawSlug.toLowerCase(),
        rawSlug.toLowerCase().startsWith("the-") ? rawSlug.slice(4) : rawSlug,
      ])
    ).filter(Boolean);

    const candidates: string[] = [];

    // 1. Content-based platforms (WhyToon, DukeToon)
    if (host.includes("whytoon.com") || host.includes("duketoon.com")) {
      for (const s of slugVariants) {
        candidates.push(`${u.origin}/content/${s}`);
        candidates.push(`${u.origin}/content/${s}/`);
      }
      return Array.from(new Set(candidates));
    }

    // 2. Root-slug platforms where /manga/ either 404s or hangs (dark-manga, niceoppai, reborntrans)
    if (host.includes("dark-manga.com") || host.includes("niceoppai.net") || host.includes("reborntrans.com")) {
      for (const s of slugVariants) {
        candidates.push(`${u.origin}/${s}/`);
        candidates.push(`${u.origin}/${s}`);
        candidates.push(`${u.origin}/manga/${s}/`);
      }
      return Array.from(new Set(candidates));
    }

    // 3. Standard WordPress MangaStream / Madara platforms (sing-manga, up-manga, go-manga, manga-zaa, etc.)
    for (const s of slugVariants) {
      candidates.push(`${u.origin}/manga/${s}/`);
      candidates.push(`${u.origin}/${s}/`);
      candidates.push(`${u.origin}/series/${s}/`);
    }

    return Array.from(new Set(candidates));
  } catch {
    return [];
  }
}

// Statistical outlier filter to remove rogue typos (e.g. [1255, 211, 210, ...] -> 1255 is an anomaly)
function filterChapterOutliers(chapters: number[]): number[] {
  if (chapters.length < 3) return chapters;
  const sorted = Array.from(new Set(chapters)).sort((a, b) => b - a);
  while (
    sorted.length >= 3 &&
    sorted[0] > 100 &&
    sorted[1] > 0 &&
    sorted[0] > sorted[1] * 2 &&
    sorted[0] - sorted[1] > 50
  ) {
    sorted.shift();
  }
  return sorted;
}

// Extract chapters strictly belonging to this manga
function extractChaptersFromHtml(html: string, seriesSlug: string = "", currentChapter: number = 1): number[] {
  const $ = cheerio.load(html);
  const foundChapters = new Set<number>();

  const isReasonable = (num: number): boolean => {
    if (isNaN(num) || num <= 0) return false;
    if (num >= 1990 && num <= 2030 && (currentChapter < 1500 || currentChapter > 2100)) return false;
    if ((num === 404 || num === 500) && currentChapter < 150) return false;
    if (num > 3000 && currentChapter <= 1000) return false;
    if (currentChapter > 0 && currentChapter < 500 && num > currentChapter + 1500) return false;
    if (num > 5000 && currentChapter < 4000) return false;
    return true;
  };

  // 0. Check embedded SSR/RSC JSON metadata (e.g. MyNovel "totalChapters":402)
  const totalChaptersMatch = html.match(/\\?"totalChapters\\?"\s*:\s*(\d+)/);
  if (totalChaptersMatch && totalChaptersMatch[1]) {
    const totalNum = parseInt(totalChaptersMatch[1], 10);
    if (isReasonable(totalNum)) {
      foundChapters.add(totalNum);
    }
  }

  // Strip all ads, popups, sidebars, comments, and unrelated widgets UPFRONT before any DOM scanning
  EXCLUDED_CONTAINERS.forEach((exSel) => {
    $(exSel).remove();
  });

  // 1. FIRST PRIORITY: Dedicated Chapter Containers
  // If found here, we immediately return to avoid picking up sidebar/recommendation chapters!
  for (const sel of CHAPTER_CONTAINER_SELECTORS) {
    const containers = $(sel);
    if (containers.length > 0) {
      containers.each((_, container) => {
        $(container).find("li, .chapter-item, a, .eph-num, .wp-manga-chapter").each((_, item) => {
          const href = $(item).attr("href") || $(item).find("a").attr("href") || "";

          // If href points to a completely different series slug, ignore it!
          if (href && seriesSlug && seriesSlug.length > 3) {
            const decodedHref = safeDecodeURIComponent(href).toLowerCase();
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

          const explicitNumEl = $(item).find(".chapternum, .chapter-manhwa-title");
          const cloned = $(item).clone();
          cloned.find("span, div, b, small, p").each((_, subEl) => {
            const subText = $(subEl).text();
            if (/เหรียญ|บาท|coins?|baht/i.test(subText)) {
              $(subEl).remove();
            }
          });
          const cleanText = cloned.text().trim().replace(/\d+\s*(?:เหรียญ|coins?|บาท|baht)/gi, "");

          // Match chapter pattern in text (including #140 style on Niceoppai) and in href
          const mText =
            (explicitNumEl.text().trim() || cleanText).match(
              /(?:ตอนที่|ตอน|chapter|ch|ep|episode)\s*[:=.-]?\s*(\d+(?:\.\d+)?)/i
            ) || cleanText.match(/^#(\d+(?:\.\d+)?)\b/);
          const mHref =
            href.match(/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/](\d+(?:\.\d+)?)/i) ||
            href.match(/[-_](\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/) ||
            href.match(/\/(\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/);

          let chosenNum: number | null = null;
          if (mText && mHref) {
            const tNum = parseFloat(mText[1]);
            const hNum = parseFloat(mHref[1]);
            if (tNum === hNum) {
              chosenNum = tNum;
            } else if (hNum.toString().startsWith(tNum.toString()) && hNum > tNum) {
              chosenNum = tNum;
            } else if (tNum.toString().startsWith(hNum.toString()) && tNum > hNum) {
              chosenNum = hNum;
            } else {
              chosenNum = explicitNumEl.length > 0 ? tNum : hNum;
            }
          } else if (mText) {
            chosenNum = parseFloat(mText[1]);
          } else if (mHref) {
            chosenNum = parseFloat(mHref[1]);
          }

          if (chosenNum !== null && isReasonable(chosenNum)) {
            foundChapters.add(chosenNum);
          }
        });
      });

      if (foundChapters.size > 0) {
        return filterChapterOutliers(Array.from(foundChapters));
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
    return filterChapterOutliers(Array.from(foundChapters));
  }

  // 3. THIRD PRIORITY: Fallback to General Links with Strict Slug Filtering
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";

    // If we have a series slug, the link's href MUST contain the slug!
    if (seriesSlug && seriesSlug.length > 3) {
      const decodedHref = safeDecodeURIComponent(href).toLowerCase();
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
    const cleanText = cloned.text().trim().replace(/\d+\s*(?:เหรียญ|coins?|บาท|baht)/gi, "");

    const textMatch = cleanText.match(/(?:ตอนที่|ตอน|chapter|ch|ep|episode)\s*[:=.-]?\s*(\d+(?:\.\d+)?)/i);
    const hrefMatch =
      href.match(/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/](\d+(?:\.\d+)?)/i) ||
      href.match(/[-_](\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/) ||
      href.match(/\/(\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/);

    let chosenNum: number | null = null;
    if (hrefMatch && textMatch) {
      const hNum = parseFloat(hrefMatch[1]);
      const tNum = parseFloat(textMatch[1]);
      if (tNum === hNum) {
        chosenNum = tNum;
      } else if (hNum.toString().startsWith(tNum.toString()) && hNum > tNum) {
        chosenNum = tNum;
      } else if (tNum.toString().startsWith(hNum.toString()) && tNum > hNum) {
        chosenNum = hNum;
      } else {
        chosenNum = hNum;
      }
    } else if (textMatch) {
      chosenNum = parseFloat(textMatch[1]);
    } else if (hrefMatch) {
      chosenNum = parseFloat(hrefMatch[1]);
    }

    if (chosenNum !== null && isReasonable(chosenNum)) {
      foundChapters.add(chosenNum);
    }
  });

  return filterChapterOutliers(Array.from(foundChapters));
}

// Fetch helper with standard browser headers and timeout covering body read
async function fetchPageHtml(url: string, timeoutMs: number = 8000): Promise<string | null> {
  if (!isSafeExternalUrl(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
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
    if (res.url && !isSafeExternalUrl(res.url)) {
      return null;
    }
    if (!res.ok) {
      console.warn(`Fetch ${url} failed with status: ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e: any) {
    console.warn(`Fetch error for ${url}:`, e?.message || e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveLatestFromTargetUrl(
  targetUrl: string,
  currentChapter: number
): Promise<{
  latestChapter: number | null;
  totalDetectedChapters: number;
  resolvedSeriesUrl?: string;
}> {
  const parsedUrl = new URL(targetUrl.trim());

  // 1. Check specialized platforms (e.g. ReadRealm API)
  if (parsedUrl.hostname.includes("readrealm.co")) {
    const rrResult = await checkReadRealm(parsedUrl.href);
    if (rrResult !== null) {
      return {
        latestChapter: rrResult.latestChapter,
        totalDetectedChapters: 1,
        resolvedSeriesUrl: rrResult.resolvedSeriesUrl,
      };
    }
  }

  const seriesSlug = extractSeriesSlug(parsedUrl.href);
  const checkedChapters: number[] = [];
  let resolvedSeriesUrl: string | undefined = undefined;

  const hasChapterInPath = Boolean(extractChapterFromUrl(parsedUrl.href));
  const candidateSeriesUrls = getSeriesCandidates(parsedUrl.href)
    .filter((candUrl) => candUrl !== parsedUrl.href)
    .slice(0, 4);

  // 2. If the URL looks like a chapter reader page, try candidate series root URLs in parallel
  if (hasChapterInPath && candidateSeriesUrls.length > 0) {
    const candidateResults = await Promise.all(
      candidateSeriesUrls.map(async (candUrl) => {
        const candHtml = await fetchPageHtml(candUrl, 5000);
        if (!candHtml) return { candUrl, chapters: [] as number[] };
        return {
          candUrl,
          chapters: extractChaptersFromHtml(candHtml, extractSeriesSlug(candUrl) || seriesSlug, currentChapter),
        };
      })
    );
    for (const res of candidateResults) {
      if (res.chapters.length > 1) {
        checkedChapters.push(...res.chapters);
        resolvedSeriesUrl = res.candUrl;
        break;
      }
    }
  }

  // 3. Fetch primary URL if we haven't found a multi-chapter TOC yet
  let primaryHtml: string | null = null;
  if (checkedChapters.length === 0) {
    primaryHtml = await fetchPageHtml(parsedUrl.href, 7000);
    if (primaryHtml) {
      const chapters = extractChaptersFromHtml(primaryHtml, seriesSlug, currentChapter);
      checkedChapters.push(...chapters);
      if (!hasChapterInPath && chapters.length > 1) {
        resolvedSeriesUrl = parsedUrl.href;
      }
    } else if (!hasChapterInPath && candidateSeriesUrls.length > 0) {
      // Primary series URL failed (e.g. /manga/{slug}/ 404'd when actual root is /{slug}/ or without "the-")
      const altResults = await Promise.all(
        candidateSeriesUrls.map(async (candUrl) => {
          const candHtml = await fetchPageHtml(candUrl, 5000);
          if (!candHtml) return { candUrl, chapters: [] as number[] };
          return {
            candUrl,
            chapters: extractChaptersFromHtml(candHtml, extractSeriesSlug(candUrl) || seriesSlug, currentChapter),
          };
        })
      );
      for (const res of altResults) {
        if (res.chapters.length > 0) {
          checkedChapters.push(...res.chapters);
          resolvedSeriesUrl = res.candUrl;
          break;
        }
      }
    }
  }

  // 4. If primary URL was fetched and we still don't have a multi-chapter TOC,
  // follow the reader page's breadcrumb / .allc link to the canonical series page!
  if (primaryHtml && checkedChapters.length <= 1) {
    const breadcrumbSeriesUrl = findSeriesUrlFromHtml(primaryHtml, parsedUrl.href);
    if (
      breadcrumbSeriesUrl &&
      breadcrumbSeriesUrl !== parsedUrl.href &&
      !candidateSeriesUrls.includes(breadcrumbSeriesUrl)
    ) {
      const seriesHtml = await fetchPageHtml(breadcrumbSeriesUrl, 6000);
      if (seriesHtml) {
        const bcSlug = extractSeriesSlug(breadcrumbSeriesUrl) || seriesSlug;
        const seriesChapters = extractChaptersFromHtml(seriesHtml, bcSlug, currentChapter);
        if (seriesChapters.length > 0) {
          checkedChapters.push(...seriesChapters);
          resolvedSeriesUrl = breadcrumbSeriesUrl;
        }
      }
    }
  }

  const validChapters = filterChapterOutliers(checkedChapters);
  if (validChapters.length > 0) {
    const highest = Math.max(...validChapters);
    const urlChapter = extractChapterFromUrl(parsedUrl.href);

    // Guard against single-chapter reader page only detecting its own chapter number
    if (hasChapterInPath && urlChapter && validChapters.length === 1 && highest === urlChapter) {
      return { latestChapter: null, totalDetectedChapters: 0 };
    }

    return {
      latestChapter: highest,
      totalDetectedChapters: validChapters.length,
      resolvedSeriesUrl,
    };
  }

  return { latestChapter: null, totalDetectedChapters: 0 };
}

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { url, fallbackUrl, currentChapter = 1 } = body || {};

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "กรุณาระบุ URL ที่ต้องการตรวจสอบ" },
        { status: 400 }
      );
    }

    if (!isSafeExternalUrl(url.trim())) {
      return NextResponse.json(
        { success: false, error: "รูปแบบ URL ไม่ถูกต้องหรือไม่อนุญาต" },
        { status: 400 }
      );
    }

    const numCurrent = Number(currentChapter) || 1;
    let result = await resolveLatestFromTargetUrl(url.trim(), numCurrent);

    // Automatic Fallback: If primary URL (e.g. corrupted base_url) failed or returned 0 chapters,
    // automatically test fallbackUrl (e.g. current_chapter_url) which can self-heal via breadcrumbs!
    if (
      result.latestChapter === null &&
      typeof fallbackUrl === "string" &&
      fallbackUrl.trim() &&
      fallbackUrl.trim() !== url.trim() &&
      isSafeExternalUrl(fallbackUrl.trim())
    ) {
      result = await resolveLatestFromTargetUrl(fallbackUrl.trim(), numCurrent);
    }

    if (result.latestChapter !== null && result.latestChapter > 0) {
      const hasUpdate = result.latestChapter > numCurrent;
      return NextResponse.json({
        success: true,
        latestChapter: result.latestChapter,
        currentChapter: numCurrent,
        hasUpdate,
        totalDetectedChapters: result.totalDetectedChapters,
        resolvedSeriesUrl: result.resolvedSeriesUrl,
      });
    }

    return NextResponse.json({
      success: false,
      error: "ไม่พบข้อมูลตอนในหน้าเว็บ หรือหน้าเว็บอาจมีระบบป้องกัน",
      latestChapter: null,
      currentChapter: numCurrent,
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
