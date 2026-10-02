import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { Manga } from "@/types/manga";
import { deduplicateMangas, isJunkManga } from "@/lib/storage";

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "mangahub-data")
  : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "mangas.json");
const BUNDLED_FILE = path.join(process.cwd(), "data", "mangas.json");

let memoryCache: Manga[] = [];

function readServerData(): Manga[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache = deduplicateMangas(parsed);
        return memoryCache;
      }
    }
    // Fallback to bundled data file if DATA_FILE not present yet (e.g. on Vercel cold boot)
    if (fs.existsSync(BUNDLED_FILE)) {
      const raw = fs.readFileSync(BUNDLED_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache = deduplicateMangas(parsed);
        return memoryCache;
      }
    }
  } catch (e) {
    // Ignore read errors on serverless
  }
  return memoryCache;
}

function writeServerData(data: Manga[]): void {
  const cleanData = deduplicateMangas(data);
  memoryCache = cleanData;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(cleanData, null, 2), "utf-8");
  } catch (e) {
    // In serverless environments, writing to disk might fail; memory cache persists during instance lifetime
  }
}

// GET /api/mangas - Fetch all mangas from server storage
export async function GET() {
  const data = readServerData();
  return NextResponse.json({ success: true, data });
}

// POST /api/mangas - Upsert a single manga or an array of mangas
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const current = readServerData();
    const map = new Map<string, Manga>();
    current.forEach((m) => map.set(m.id, m));

    if (Array.isArray(body)) {
      // Batch sync
      body.forEach((item: Manga) => {
        if (!item || isJunkManga(item)) return;
        const existing = map.get(item.id);
        if (!existing || new Date(item.updated_at) >= new Date(existing.updated_at)) {
          map.set(item.id, item);
        }
      });
    } else if (body && body.id) {
      // Single upsert
      const item = body as Manga;
      if (!isJunkManga(item)) {
        map.set(item.id, {
          ...item,
          updated_at: new Date().toISOString(),
        });
      }
    } else {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    const updatedList = deduplicateMangas(Array.from(map.values())).sort(
      (a, b) => new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime()
    );

    writeServerData(updatedList);
    return NextResponse.json({ success: true, data: updatedList });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/mangas?id=... - Delete a manga
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing manga ID" }, { status: 400 });
    }

    const current = readServerData();
    const filtered = current.filter((m) => m.id !== id);
    writeServerData(filtered);

    return NextResponse.json({ success: true, data: filtered });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
