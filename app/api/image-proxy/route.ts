import { NextRequest, NextResponse } from "next/server";
import { isSafeExternalUrl } from "@/lib/ssrf";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing image url" }, { status: 400 });
  }

  if (!isSafeExternalUrl(url)) {
    return NextResponse.json({ error: "Invalid or unsafe URL" }, { status: 400 });
  }

  const parsed = new URL(url.trim());

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const imageRes = await fetch(parsed.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": `${parsed.origin}/`,
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
      },
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    clearTimeout(timeout);

    if (imageRes.url && !isSafeExternalUrl(imageRes.url)) {
      return NextResponse.json({ error: "Unsafe redirect blocked" }, { status: 400 });
    }

    if (!imageRes.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${imageRes.status}` },
        { status: imageRes.status }
      );
    }

    const rawContentType = (imageRes.headers.get("content-type") || "").toLowerCase().trim();
    if (!rawContentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Upstream resource is not a valid image" },
        { status: 415 }
      );
    }

    const arrayBuffer = await imageRes.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": rawContentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to proxy image" },
      { status: 502 }
    );
  }
}
