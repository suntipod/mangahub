import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

// Helper to derive series root page from a chapter URL
function deriveSeriesUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    // Remove chapter pattern at the end: /chapter-118, /118, /ep-118, /ตอนที่-118
    const cleanPath = u.pathname
      .replace(/\/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?\d+(?:\.\d+)?\/?$/i, "")
      .replace(/\/\d+(?:\.\d+)?\/?$/, "");

    if (cleanPath && cleanPath !== u.pathname && cleanPath !== "/") {
      return `${u.origin}${cleanPath}`;
    }
  } catch {}
  return null;
}

// Extract all valid chapter numbers from HTML
function extractChaptersFromHtml(html: string, currentChapter: number): number[] {
  const $ = cheerio.load(html);
  const foundChapters = new Set<number>();

  const isReasonableChapter = (num: number): boolean => {
    if (isNaN(num) || num <= 0) return false;
    // Filter out typical calendar years (1990 - 2030) unless current chapter is close to it
    if (num >= 1990 && num <= 2030 && (currentChapter < 1500 || currentChapter > 2100)) {
      return false;
    }
    // Filter out common HTTP codes or giant numbers
    if ((num === 200 || num === 404 || num === 500) && currentChapter < 150) {
      return false;
    }
    if (num > 5000 && currentChapter < 4000) {
      return false;
    }
    return true;
  };

  // 1. Check all links (a href & a text)
  $("a").each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") || "";

    // Match Thai & Eng patterns e.g. "ตอนที่ 123", "ตอน 123", "Ch.123", "Chapter 123"
    const textMatch = text.match(/(?:ตอนที่|ตอน|chapter|ch|ep|episode)\s*[:=.-]?\s*(\d+(?:\.\d+)?)/i);
    if (textMatch) {
      const num = parseFloat(textMatch[1]);
      if (isReasonableChapter(num)) foundChapters.add(num);
    }

    // Match URL path patterns
    const hrefMatch =
      href.match(/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/](\d+(?:\.\d+)?)/i) ||
      href.match(/\/(\d+(?:\.\d+)?)\/?(?:#.*|\?.*)?$/);
    if (hrefMatch) {
      const num = parseFloat(hrefMatch[1]);
      if (isReasonableChapter(num)) foundChapters.add(num);
    }
  });

  // 2. Check dropdown options (select option)
  $("select option").each((_, el) => {
    const text = $(el).text().trim();
    const val = $(el).attr("value") || "";
    const m =
      text.match(/(?:ตอนที่|ตอน|chapter|ch|ep)?\s*[:=.-]?\s*(\d+(?:\.\d+)?)/i) ||
      val.match(/(?:chapter|ch|ep|ตอน)[-_/]?(\d+(?:\.\d+)?)/i);
    if (m) {
      const num = parseFloat(m[1]);
      if (isReasonableChapter(num)) foundChapters.add(num);
    }
  });

  // 3. Check elements with chapter classes
  $(".eplister, .chapter-list, .chapters, .listing-chapters, ul.sub-chap, .chapter-item")
    .find("a, span, li")
    .each((_, el) => {
      const text = $(el).text();
      const m = text.match(/(\d+(?:\.\d+)?)/);
      if (m) {
        const num = parseFloat(m[1]);
        if (isReasonableChapter(num)) foundChapters.add(num);
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

    let maxFoundChapter = Number(currentChapter);
    const checkedChapters: number[] = [];

    // 1. Fetch primary URL provided
    const primaryHtml = await fetchPageHtml(parsedUrl.href);
    if (primaryHtml) {
      const chapters = extractChaptersFromHtml(primaryHtml, currentChapter);
      checkedChapters.push(...chapters);
    }

    // 2. If URL looks like a chapter URL, also check the series main page for full chapter list
    const seriesUrl = deriveSeriesUrl(parsedUrl.href);
    if (seriesUrl && seriesUrl !== parsedUrl.href) {
      const seriesHtml = await fetchPageHtml(seriesUrl);
      if (seriesHtml) {
        const seriesChapters = extractChaptersFromHtml(seriesHtml, currentChapter);
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
