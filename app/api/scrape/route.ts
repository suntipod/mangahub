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
    const path = parsed.pathname;
    
    // Patterns like /chapter-118, /ep-118, /ch-118, /118, /ตอนที่-118
    const match = path.match(/(?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?(\d+(?:\.\d+)?)/i) ||
                  path.match(/\/(\d+(?:\.\d+)?)\/?$/);
    if (match && match[1]) {
      const num = parseFloat(match[1]);
      if (!isNaN(num) && num > 0) return num;
    }
  } catch {
    // Ignore error
  }
  return undefined;
}

// Clean up title from common website suffixes
function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  let title = rawTitle.trim();
  
  // Remove suffixes like "| อ่านการ์ตูน", "- Up-Manga", "ตอนที่..."
  title = title.replace(/\s*[-–|•]\s*(?:อ่านการ์ตูน|มังงะ|Manga|Manhwa|Manhua|Webtoon|ตอนที่|\d+).*/gi, "");
  title = title.replace(/\s*[-–|•]\s*[\w\s.-]+(?:com|net|org|xyz|to|in)\s*$/gi, "");
  title = title.replace(/^(?:อ่านการ์ตูนเรื่อง|อ่านการ์ตูน|อ่านมังงะ)\s*[:\s-]/gi, "");
  
  return title.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

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

    // Fetch the webpage with realistic browser User-Agent
    const response = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      // Fallback response with extracted metadata from URL
      return NextResponse.json({
        success: true,
        data: {
          title: cleanTitle(parsedUrl.pathname.split("/").filter(Boolean)[1] || parsedUrl.pathname),
          cover_url: "",
          current_chapter: detectedChapter || 1,
          site_name: siteName,
          original_url: parsedUrl.href,
        },
        warning: `ไม่สามารถดึงรูปหน้าเว็บได้โดยตรง (HTTP ${response.status}) แต่สร้างข้อมูลเบื้องต้นให้แล้ว`,
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 1. Extract Title
    let title =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("h1.entry-title").text() ||
      $("h1.post-title").text() ||
      $("h1").first().text() ||
      $("title").text();

    title = cleanTitle(title);

    // If still empty, derive from URL slug
    if (!title) {
      const slug = parsedUrl.pathname.split("/").filter(Boolean).pop() || "";
      title = slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // 2. Extract Cover Image
    let coverUrl =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $('.thumb img, .featured-image img, .summary_image img, .manga-poster img, .series-thumb img').attr("src") ||
      $('img[src*="cover"], img[src*="thumb"]').first().attr("src") ||
      "";

    // Handle relative cover URLs
    if (coverUrl && !coverUrl.startsWith("http")) {
      try {
        coverUrl = new URL(coverUrl, parsedUrl.origin).href;
      } catch {
        // Keep as is
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
