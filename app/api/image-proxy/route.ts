import { NextRequest, NextResponse } from "next/server";
import { isSafeExternalUrl } from "@/lib/ssrf";
import { isSafeExternalUrlAsync, safeFetch, SsrfBlockedError } from "@/lib/ssrf-server";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing image url" }, { status: 400 });
  }

  if (!isSafeExternalUrl(url) || !(await isSafeExternalUrlAsync(url))) {
    return NextResponse.json({ error: "Invalid or unsafe URL" }, { status: 400 });
  }

  const parsed = new URL(url.trim());
  let cleanup: (() => void) | null = null;

  try {
    const fetched = await safeFetch(parsed.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: `${parsed.origin}/`,
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
      },
      timeoutMs: 10000,
      next: { revalidate: 86400 },
    });
    cleanup = fetched.cleanup;
    const imageRes = fetched.response;

    if (!imageRes.ok) {
      try {
        await imageRes.body?.cancel();
      } catch {}
      return NextResponse.json(
        { error: `Upstream error: ${imageRes.status}` },
        { status: imageRes.status }
      );
    }

    const rawContentType = (imageRes.headers.get("content-type") || "").toLowerCase().trim();
    if (!rawContentType.startsWith("image/") || rawContentType.includes("svg")) {
      try {
        await imageRes.body?.cancel();
      } catch {}
      return NextResponse.json(
        { error: "Upstream resource is not a valid raster image" },
        { status: 415 }
      );
    }

    const contentLengthHeader = imageRes.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_IMAGE_BYTES) {
      try {
        await imageRes.body?.cancel();
      } catch {}
      return NextResponse.json(
        { error: "Image exceeds maximum allowed size (10MB)" },
        { status: 413 }
      );
    }

    // Stream and bound body size in memory to protect serverless workers from OOM
    const reader = imageRes.body?.getReader();
    let bufferBytes: Uint8Array;
    if (reader) {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_IMAGE_BYTES) {
            try {
              await reader.cancel();
            } catch {}
            return NextResponse.json(
              { error: "Image exceeds maximum allowed size (10MB)" },
              { status: 413 }
            );
          }
          chunks.push(value);
        }
      }
      bufferBytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bufferBytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } else {
      const ab = await imageRes.arrayBuffer();
      if (ab.byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "Image exceeds maximum allowed size (10MB)" },
          { status: 413 }
        );
      }
      bufferBytes = new Uint8Array(ab);
    }

    return new Response(bufferBytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": rawContentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    if (error instanceof SsrfBlockedError || error?.code === "SSRF_BLOCKED") {
      return NextResponse.json(
        { error: "Unsafe redirect or internal address blocked" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error?.message || "Failed to proxy image" },
      { status: 502 }
    );
  } finally {
    cleanup?.();
  }
}
