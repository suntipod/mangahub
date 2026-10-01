import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Manga, MangaSource, SupabaseConfig } from "@/types/manga";

const CONFIG_KEY = "mangahub_supabase_config";

export const DEFAULT_SUPABASE_CONFIG: SupabaseConfig = {
  url: "https://ciykssexuqlsphjrhmbk.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpeWtzc2V4dXFsc3BoanJobWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MzI4ODgsImV4cCI6MjEwNjQwODg4OH0.Kvn6vaM37zrBlUWmb_hDE_5nGzsAUYDbJDjSvquryVY",
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
    const client = createClient(url, anonKey);
    const { data, error } = await client.from("mangas").select("id").limit(1);
    if (error) {
      return { success: false, message: `เชื่อมต่อไม่สำเร็จ: ${error.message}` };
    }
    return { success: true, message: "เชื่อมต่อกับ Supabase สำเร็จเรียบร้อยแล้ว!" };
  } catch (e: any) {
    return { success: false, message: `ข้อผิดพลาด: ${e.message || "ไม่สามารถเชื่อมต่อได้"}` };
  }
}

// Fetch all mangas and their sources from Supabase
export async function fetchRemoteMangas(client: SupabaseClient): Promise<Manga[]> {
  const { data: mangasData, error: mError } = await client
    .from("mangas")
    .select("*")
    .order("last_read_at", { ascending: false });

  if (mError) throw mError;
  if (!mangasData) return [];

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
      is_primary: s.is_primary,
      is_active: s.is_active,
    });
    sourcesByMangaId.set(s.manga_id, list);
  });

  return mangasData.map((m: any) => ({
    id: m.id,
    title: m.title,
    alt_title: m.alt_title,
    cover_url: m.cover_url,
    current_chapter: Number(m.current_chapter),
    latest_available_chapter: m.latest_available_chapter ? Number(m.latest_available_chapter) : undefined,
    status: m.status,
    tier: m.tier || "none",
    notes: m.notes,
    sources: sourcesByMangaId.get(m.id) || [],
    last_read_at: m.last_read_at,
    created_at: m.created_at,
    updated_at: m.updated_at,
  }));
}

// Upsert manga and sources to Supabase
export async function syncMangaToRemote(client: SupabaseClient, manga: Manga): Promise<void> {
  const mangaId = ensureUUID(manga.id);
  const { error: mError } = await client.from("mangas").upsert({
    id: mangaId,
    title: manga.title,
    alt_title: manga.alt_title,
    cover_url: manga.cover_url,
    current_chapter: manga.current_chapter,
    latest_available_chapter: manga.latest_available_chapter,
    status: manga.status,
    tier: manga.tier,
    notes: manga.notes,
    last_read_at: manga.last_read_at,
    updated_at: new Date().toISOString(),
  });

  if (mError) throw mError;

  // Upsert sources
  if (manga.sources && manga.sources.length > 0) {
    const sourcesToUpsert = manga.sources.map((s) => ({
      id: ensureUUID(s.id),
      manga_id: mangaId,
      site_name: s.site_name,
      base_url: s.base_url,
      current_chapter_url: s.current_chapter_url,
      is_primary: s.is_primary,
      is_active: s.is_active,
    }));

    const { error: sError } = await client.from("manga_sources").upsert(sourcesToUpsert);
    if (sError) throw sError;
  }
}

// Delete manga from Supabase
export async function deleteRemoteManga(client: SupabaseClient, mangaId: string): Promise<void> {
  const cleanId = ensureUUID(mangaId);
  const { error } = await client.from("mangas").delete().eq("id", cleanId);
  if (error) throw error;
}
