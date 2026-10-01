import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Manga } from "@/types/manga";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "mangas.json");

const INITIAL_MANGAS: Manga[] = [
  {
    id: "manga-sample-1",
    title: "Nano Machine นาโนมาชิน",
    alt_title: "Nano Mashin",
    cover_url: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80",
    current_chapter: 118,
    latest_available_chapter: 250,
    status: "reading",
    tier: "S",
    notes: "พระเอกสายโหด มีระบบนาโนแมชชีนคอยช่วยอัปเกรดวิทยายุทธ",
    sources: [
      {
        id: "source-1-1",
        manga_id: "manga-sample-1",
        site_name: "Up-Manga",
        base_url: "https://www.up-manga.com/manga/nano-machine",
        current_chapter_url: "https://www.up-manga.com/manga/nano-machine/118",
        is_primary: true,
        is_active: true,
      },
      {
        id: "source-1-2",
        manga_id: "manga-sample-1",
        site_name: "Slow-Manga",
        base_url: "https://www.slow-manga.com/manga/nano-machine",
        current_chapter_url: "https://www.slow-manga.com/manga/nano-machine/118",
        is_primary: false,
        is_active: true,
      },
    ],
    last_read_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "manga-sample-2",
    title: "Mercenary Enrollment พี่ชายบอดี้การ์ด",
    alt_title: "Teenage Mercenary",
    cover_url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
    current_chapter: 278,
    latest_available_chapter: 280,
    status: "reading",
    tier: "S",
    notes: "สนุกมาก อดีตทหารรับจ้างกลับมาปกป้องน้องสาวและครอบครัว",
    sources: [
      {
        id: "source-2-1",
        manga_id: "manga-sample-2",
        site_name: "Up-Manga",
        base_url: "https://www.up-manga.com/manga/mercenary-enrollment",
        current_chapter_url: "https://www.up-manga.com/manga/mercenary-enrollment/278",
        is_primary: true,
        is_active: true,
      },
    ],
    last_read_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "manga-sample-3",
    title: "Pick Me Up, Infinite Gacha",
    alt_title: "Pick Me Up!",
    cover_url: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
    current_chapter: 206,
    latest_available_chapter: 210,
    status: "reading",
    tier: "A",
    notes: "ผู้เล่นอันดับ 1 หลุดเข้าไปในเกมมือถือสุดโหดที่ตายแล้วตายเลย",
    sources: [
      {
        id: "source-3-1",
        manga_id: "manga-sample-3",
        site_name: "Slow-Manga",
        base_url: "https://www.slow-manga.com/manga/pick-me-up",
        current_chapter_url: "https://www.slow-manga.com/manga/pick-me-up/206",
        is_primary: true,
        is_active: true,
      },
    ],
    last_read_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function readServerData(): Manga[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_MANGAS, null, 2), "utf-8");
      return INITIAL_MANGAS;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return INITIAL_MANGAS;
  } catch (e) {
    console.error("Error reading server data:", e);
    return INITIAL_MANGAS;
  }
}

function writeServerData(data: Manga[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing server data:", e);
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
        const existing = map.get(item.id);
        if (!existing || new Date(item.updated_at) >= new Date(existing.updated_at)) {
          map.set(item.id, item);
        }
      });
    } else if (body && body.id) {
      // Single upsert
      const item = body as Manga;
      map.set(item.id, {
        ...item,
        updated_at: new Date().toISOString(),
      });
    } else {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    const updatedList = Array.from(map.values()).sort(
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
