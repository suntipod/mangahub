import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Manga, MangaSource, SupabaseConfig } from "@/types/manga";

const CONFIG_KEY = "mangahub_supabase_config";

const FALLBACK_SUPABASE_URL = "https://ciykssexuqlsphjrhmbk.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpeWtzc2V4dXFsc3BoanJobWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzI4ODgsImV4cCI6MjEwNjQwODg4OH0.Kvn6vaM37zrBlUWmb_hDE_5nGzsAUYDbJDjSvquryVY";

export const DEFAULT_SUPABASE_CONFIG: SupabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
  enabled: true,
};

// Helper to ensure any ID is a valid PostgreSQL UUID
export function ensureUUID(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  // Deterministic hex hash for string IDs
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0, ch; i < id.length; i++) {
    ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (h1 >>> 0).toString(16).padStart(8, '0') + 
              (h2 >>> 0).toString(16).padStart(8, '0') + 
              ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0') + 
              (h1 >>> 0).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function loadSupabaseConfig(): SupabaseConfig {
  if (typeof window === "undefined") {
    return DEFAULT_SUPABASE_CONFIG;
  }
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.url && parsed.anonKey) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Failed to load Supabase config:", e);
  }
  return DEFAULT_SUPABASE_CONFIG;
}

export function saveSupabaseConfig(config: SupabaseConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

let cachedClient: SupabaseClient | null = null;
let lastClientKey = "";

export function getSupabaseClient(config?: SupabaseConfig): SupabaseClient | null {
  const currentConfig = config || loadSupabaseConfig();
  if (!currentConfig.enabled || !currentConfig.url || !currentConfig.anonKey) {
    return null;
  }

  const key = `${currentConfig.url}-${currentConfig.anonKey}`;
  if (cachedClient && lastClientKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(currentConfig.url, currentConfig.anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    lastClientKey = key;
    return cachedClient;
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
    return null;
  }
}

// Test Supabase connection
export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { error } = await client.from("mangas").select("id").limit(1);
    if (error) {
      return { success: false, message: `เชื่อมต่อไม่สำเร็จ: ${error.message}` };
    }
    return { success: true, message: "เชื่อมต่อกับ Supabase สำเร็จเรียบร้อยแล้ว!" };
  } catch (e: any) {
    return { success: false, message: `ข้อผิดพลาด: ${e.message || "ไม่สามารถเชื่อมต่อได้"}` };
  }
}

// Helpers to preserve manga category & tags in Supabase notes field safely
export function decodeNotesAndCategory(rawNotes?: string): { notes: string; category: string; tags: string[] } {
  if (!rawNotes) return { notes: "", category: "การ์ตูนทั่วไป", tags: [] };
  let category = "การ์ตูนทั่วไป";
  let tags: string[] = [];
  let remaining = rawNotes;

  const catMatch = remaining.match(/\[category:([^\]]+)\]/i);
  if (catMatch) {
    category = catMatch[1].trim() || "การ์ตูนทั่วไป";
    remaining = remaining.replace(catMatch[0], "");
  }

  const tagMatch = remaining.match(/\[tags:([^\]]+)\]/i);
  if (tagMatch) {
    tags = tagMatch[1]
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);
    remaining = remaining.replace(tagMatch[0], "");
  }

  return {
    category,
    tags,
    notes: remaining.trim(),
  };
}

export function encodeNotesWithCategory(notes?: string, category?: string, tags?: string[]): string {
  const cat = category || "การ์ตูนทั่วไป";
  const cleanNotes = (notes || "")
    .replace(/\[category:[^\]]+\]\s*/gi, "")
    .replace(/\[tags:[^\]]+\]\s*/gi, "")
    .trim();
  const cleanTags = (tags || []).map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
  const tagStr = cleanTags.length > 0 ? ` [tags:${cleanTags.join(",")}]` : "";
  return `[category:${cat}]${tagStr} ${cleanNotes}`.trim();
}

let remoteSupportsCategoryColumns: boolean | null = null;

// Fetch all mangas and their sources from Supabase
export async function fetchRemoteMangas(client: SupabaseClient): Promise<Manga[]> {
  const { data: mangasData, error: mError } = await client
    .from("mangas")
    .select("*")
    .order("last_read_at", { ascending: false });

  if (mError) throw mError;
  if (!mangasData) return [];

  if (mangasData.length > 0 && typeof mangasData[0] === "object" && mangasData[0] !== null) {
    remoteSupportsCategoryColumns = "category" in mangasData[0] && "tags" in mangasData[0];
  }

  const { data: sourcesData, error: sError } = await client
    .from("manga_sources")
    .select("*");

  if (sError) throw sError;

  const sourcesByMangaId = new Map<string, MangaSource[]>();
  (sourcesData || []).forEach((s: any) => {
    const list = sourcesByMangaId.get(s.manga_id) || [];
    list.push({
      id: s.id,
      manga_id: s.manga_id,
      site_name: s.site_name,
      base_url: s.base_url,
      current_chapter_url: s.current_chapter_url,
      is_primary: Boolean(s.is_primary),
      is_active: s.is_active !== false,
    });
    sourcesByMangaId.set(s.manga_id, list);
  });

  return mangasData.map((m: any) => {
    const { notes: decodedNotes, category: decodedCat, tags: decodedTags } = decodeNotesAndCategory(m.notes);
    const hasExplicitNotesCat = /\[category:[^\]]+\]/i.test(m.notes || "");
    const resolvedCategory =
      m.category && m.category !== "การ์ตูนทั่วไป"
        ? m.category
        : hasExplicitNotesCat
        ? decodedCat
        : m.category || decodedCat;
    const resolvedTags =
      Array.isArray(m.tags) && m.tags.length > 0 ? m.tags : decodedTags;

    return {
      id: m.id,
      title: m.title,
      alt_title: m.alt_title,
      cover_url: m.cover_url || "",
      current_chapter: Number(m.current_chapter) || 0,
      latest_available_chapter:
        m.latest_available_chapter != null ? Number(m.latest_available_chapter) : undefined,
      status: m.status,
      tier: m.tier || "none",
      category: resolvedCategory,
      tags: resolvedTags,
      notes: decodedNotes,
      sources: sourcesByMangaId.get(m.id) || [],
      last_read_at: m.last_read_at,
      created_at: m.created_at,
      updated_at: m.updated_at,
    };
  });
}

// Per-manga serialization queue to avoid race conditions on rapid +1 clicks
const syncQueues = new Map<string, Promise<void>>();

async function doSyncMangaToRemote(client: SupabaseClient, manga: Manga, mangaId: string): Promise<void> {
  const encodedNotes = encodeNotesWithCategory(manga.notes, manga.category, manga.tags);

  const baseRow = {
    id: mangaId,
    title: manga.title,
    alt_title: manga.alt_title || null,
    cover_url: manga.cover_url?.trim() || null,
    current_chapter: Number(manga.current_chapter) || 0,
    latest_available_chapter: manga.latest_available_chapter ?? null,
    status: manga.status,
    tier: manga.tier,
    notes: encodedNotes,
    last_read_at: manga.last_read_at,
    updated_at: manga.updated_at || new Date().toISOString(),
  };

  if (remoteSupportsCategoryColumns !== false) {
    const { error: extError } = await client.from("mangas").upsert({
      ...baseRow,
      category: manga.category || "การ์ตูนทั่วไป",
      tags: Array.isArray(manga.tags) ? manga.tags : [],
    });
    if (!extError) {
      remoteSupportsCategoryColumns = true;
    } else if (/column.*(category|tags)|schema cache|PGRST204/i.test(extError.message || "")) {
      remoteSupportsCategoryColumns = false;
      const { error: mError } = await client.from("mangas").upsert(baseRow);
      if (mError) throw mError;
    } else {
      throw extError;
    }
  } else {
    const { error: mError } = await client.from("mangas").upsert(baseRow);
    if (mError) throw mError;
  }

  const rawSources = Array.isArray(manga.sources) ? manga.sources : [];
  if (rawSources.length > 0) {
    // Enforce exactly 1 primary source
    let primaryAssigned = false;
    const primaryIdx = rawSources.findIndex((s) => s.is_primary);
    const targetPrimaryIdx = primaryIdx >= 0 ? primaryIdx : 0;

    const sourcesToUpsert = rawSources.map((s, idx) => {
      const isPrimary = !primaryAssigned && idx === targetPrimaryIdx;
      if (isPrimary) primaryAssigned = true;
      return {
        id: ensureUUID(s.id),
        manga_id: mangaId,
        site_name: s.site_name || "เว็บอ่าน",
        base_url: s.base_url || s.current_chapter_url || "",
        current_chapter_url: s.current_chapter_url || s.base_url || "",
        is_primary: isPrimary,
        is_active: s.is_active !== false,
      };
    });

    // 1. Upsert current sources first (atomic, never leaves manga with 0 sources during rapid clicks)
    const { error: sError } = await client.from("manga_sources").upsert(sourcesToUpsert, { onConflict: "id" });
    if (sError) throw sError;

    // 2. Delete only removed sources for this mangaId
    const keepIds = new Set(sourcesToUpsert.map((s) => s.id));
    const { data: existingSources } = await client
      .from("manga_sources")
      .select("id")
      .eq("manga_id", mangaId);

    const toDeleteIds = (existingSources || [])
      .map((s: any) => s.id)
      .filter((id: string) => !keepIds.has(id));

    if (toDeleteIds.length > 0) {
      await client.from("manga_sources").delete().in("id", toDeleteIds);
    }
  } else {
    await client.from("manga_sources").delete().eq("manga_id", mangaId);
  }
}

// Upsert manga and sources to Supabase (serialized per mangaId)
export async function syncMangaToRemote(client: SupabaseClient, manga: Manga): Promise<void> {
  const mangaId = ensureUUID(manga.id);
  const prev = syncQueues.get(mangaId) || Promise.resolve();
  let syncError: any = null;

  const next = prev
    .catch(() => {})
    .then(async () => {
      try {
        await doSyncMangaToRemote(client, manga, mangaId);
      } catch (err) {
        syncError = err;
      }
    });

  syncQueues.set(mangaId, next);
  await next;
  if (syncQueues.get(mangaId) === next) {
    syncQueues.delete(mangaId);
  }
  if (syncError) {
    throw syncError;
  }
}

// Delete manga from Supabase
export async function deleteRemoteManga(client: SupabaseClient, mangaId: string): Promise<void> {
  const cleanId = ensureUUID(mangaId);
  const { error } = await client.from("mangas").delete().eq("id", cleanId);
  if (error) throw error;
}
