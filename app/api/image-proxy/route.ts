import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing image url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

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

    if (!imageRes.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${imageRes.status}` },
        { status: imageRes.status }
      );
    }

    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await imageRes.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to proxy image" },
      { status: 502 }
    );
  }
}
