import { Manga, MangaSource, MangaBackupData } from "@/types/manga";
import { getSupabaseClient, syncMangaToRemote, deleteRemoteManga, fetchRemoteMangas } from "./supabase";
import { getStoredCategories, addCategory } from "./categories";

const LOCAL_STORAGE_KEY = "mangahub_local_mangas";
const STORAGE_CLEAN_VERSION_KEY = "mangahub_cleaned_v3";

// Helper to normalize manga title for robust duplicate detection
export function normalizeTitle(title: string): string {
  return (title || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

// Clean title of translation/chapter/site suffixes for matching
export function cleanTitleForMatch(title: string): string {
  if (!title) return "";
  return title
    .replace(/(?:ตอนที่|ch|chapter|ep|episode)\s*\d+(?:\.\d+)?/gi, "")
    .replace(/แปลไทย|จบแล้ว|จบss|รอจีนอัพ|มังงะออนไลน์|อ่านออนไลน์/g, "")
    .replace(/\|\s*[^|]+$/g, "")
    .replace(/\s*-\s*(?:Oremanga|ReadToon|Kairew|Go-Manga|Up-Manga|Speed-Manga|Sing-Manga|Fin-Manga|Public Manga|DukeToon|Bully-Manga).*/gi, "")
    .replace(/[-–—]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Helper to extract core slug from URL for matching across different sites
export function extractCoreSlug(urlStr: string): string {
  if (!urlStr) return "";
  try {
    const u = new URL(urlStr);
    const parts = decodeURIComponent(u.pathname).split("/").filter(Boolean);
    const ignore = /^(?:manga|comic|comics|cartoon|cartoons|read|reader|book|books|episode|series|content)$/i;
    const meaningful = parts.filter((p) => !ignore.test(p) && !/^\d+$/.test(p));
    let last = meaningful.pop() || "";
    last = last.replace(/[-_]?(?:chapter|ch|ep|episode|ตอนที่|ตอน)?[-_]?\d+(?:\.\d+)?$/i, "");
    last = last.replace(/[-_]?(?:แปลไทย|raw|thai).*$/i, "");
    last = last.replace(/^\d+[-_]/, "");
    return last.toLowerCase().replace(/[^a-z0-9]+/g, "");
  } catch {
    return "";
  }
}

// Check if a manga or URL is junk (non-manga utility or error page)
export function isJunkManga(m: Manga): boolean {
  if (!m || !m.title) return true;
  const sources = m.sources || [];
  if (sources.length === 0) return true;

  const JUNK_DOMAINS = [
    "shopee.",
    "google.",
    "cad.go.th",
    "mdes.go.th",
    "smart4m",
    "mangahub-seven.vercel.app",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
  ];

  for (const s of sources) {
    const urlStr = s.base_url || s.current_chapter_url || (s as any).url || "";
    try {
      const u = new URL(urlStr);
      if (JUNK_DOMAINS.some((d) => u.hostname.includes(d))) return true;
      const p = u.pathname.replace(/\/$/, "");
      if (p === "" || /^\/(?:manga|comics|comic|read|page\/\d+|topup|payments?|auth|login|signin|register|search)$/i.test(p)) {
        return true;
      }
      if (u.searchParams.has("s") && u.searchParams.get("s") && p === "") {
        return true;
      }
    } catch {
      return true;
    }
  }

  const cleanT = m.title.trim();
  if (["เข้าสู่ระบบ", "Google Search", "Shp App Link", "MangaHub", "การ์ตูนเรื่องที่ 43", "/", "Up", "Fin"].includes(cleanT)) {
    return true;
  }

  return false;
}

// Check if two manga entries refer to the same story across sites
export function areMangasEquivalent(a: Manga, b: Manga): boolean {
  if (!a || !b) return false;
  if (a.id === b.id) return true;

  const tA = cleanTitleForMatch(a.title);
  const tB = cleanTitleForMatch(b.title);
  const normA = normalizeTitle(tA);
  const normB = normalizeTitle(tB);

  if (normA && normB) {
    if (normA === normB) return true;
    if (normA.length > 8 && normB.length > 8) {
      if (normA.includes(normB) || normB.includes(normA)) {
        return true;
      }
    }
  }

  const slugsA = (a.sources || []).map((s) => extractCoreSlug(s.base_url || s.current_chapter_url || (s as any).url || "")).filter((s) => s.length >= 5);
  const slugsB = (b.sources || []).map((s) => extractCoreSlug(s.base_url || s.current_chapter_url || (s as any).url || "")).filter((s) => s.length >= 5);

  for (const sa of slugsA) {
    for (const sb of slugsB) {
      if (sa === sb) return true;
      if (sa.length >= 10 && sb.length >= 10 && (sa.includes(sb) || sb.includes(sa))) {
        return true;
      }
    }
  }

  const aliases = [
    ["returnofthesssclassranker", "thesssrankerreturns", "returnsssclass", "returnsssclassranker"],
    ["ibecamethetyrantofadefensegame", "ibecamethetyrantofadefencegame"],
    ["demonicevolution", "demonicevolution140"],
    ["sololeveling"],
    ["theworldsbestengineer", "worldsbestengineer"],
  ];

  for (const group of aliases) {
    const matchA = group.some((x) => normA.includes(x) || slugsA.some((s) => s.includes(x)));
    const matchB = group.some((x) => normB.includes(x) || slugsB.some((s) => s.includes(x)));
    if (matchA && matchB) {
      return true;
    }
  }

  return false;
}

// Helper to remove duplicates across ID, title containment, and URL slugs
export function deduplicateMangas(mangas: Manga[]): Manga[] {
  if (!Array.isArray(mangas)) return [];
  const valid = mangas.filter((m) => !isJunkManga(m));
  const result: Manga[] = [];

  for (const m of valid) {
    if (!m || !m.title) continue;

    const existingIdx = result.findIndex((existing) => areMangasEquivalent(existing, m));

    if (existingIdx === -1) {
      result.push(m);
    } else {
      const existing = result[existingIdx];
      const isUuid = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const bestId = isUuid(existing.id) ? existing.id : isUuid(m.id) ? m.id : existing.id;

      // Determine which record is newer (winner)
      const existingTime = new Date(existing.updated_at || 0).getTime();
      const mTime = new Date(m.updated_at || 0).getTime();
      const isMNewer = mTime > existingTime;
      const winner = isMNewer ? m : existing;
      const loser = isMNewer ? existing : m;

      // Pick best descriptive title (e.g. Thai + English or longer title)
      const bestTitle = (winner.title && winner.title.length >= loser.title.length)
        ? winner.title
        : loser.title;

      // Merge sources: Winner (newer record) is the primary source of truth!
      const winnerSources = Array.isArray(winner.sources) ? winner.sources : [];
      const loserSources = Array.isArray(loser.sources) ? loser.sources : [];
      const combinedSources = [...winnerSources];

      loserSources.forEach((ls) => {
        const lsUrl = (ls.base_url || ls.current_chapter_url || "").toLowerCase().replace(/\/$/, "");
        if (!lsUrl) return;
        const existsInWinner = combinedSources.some((ws) => {
          const wsUrl = (ws.base_url || ws.current_chapter_url || "").toLowerCase().replace(/\/$/, "");
          return wsUrl === lsUrl;
        });
        if (!existsInWinner) {
          combinedSources.push({
            ...ls,
            is_primary: false, // Winner's primary source remains primary
          });
        }
      });

      // Cover URL: Always prioritize winner's non-empty cover
      const chosenCover = (winner.cover_url && winner.cover_url.trim())
        ? winner.cover_url.trim()
        : (loser.cover_url && loser.cover_url.trim()) || "";

      // Category & notes: Prioritize winner's values
      const chosenCategory = winner.category || loser.category || "การ์ตูนทั่วไป";
      const chosenNotes = winner.notes !== undefined ? winner.notes : loser.notes || "";
      const chosenStatus = winner.status || loser.status || "reading";
      const chosenTier = (winner.tier && winner.tier !== "none") ? winner.tier : (loser.tier || "none");
      const chosenTags = Array.from(new Set([...(winner.tags || []), ...(loser.tags || [])]));

      const mergedManga: Manga = {
        ...loser,
        ...winner,
        id: bestId,
        title: bestTitle,
        current_chapter: Math.max(existing.current_chapter || 0, m.current_chapter || 0),
        latest_available_chapter:
          Math.max(existing.latest_available_chapter || 0, m.latest_available_chapter || 0) || undefined,
        sources: combinedSources,
        notes: chosenNotes,
        category: chosenCategory,
        tags: chosenTags,
        cover_url: chosenCover,
        status: chosenStatus,
        tier: chosenTier,
        updated_at: new Date(Math.max(existingTime, mTime, 0)).toISOString(),
      };


      result[existingIdx] = mergedManga;
    }
  }

  return result;
}

export function getLocalMangas(): Manga[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return deduplicateMangas(parsed);
      }
    }
  } catch (e) {
    console.error("Error reading local mangas:", e);
  }
  return [];
}

export function saveLocalMangas(mangas: Manga[]) {
  if (typeof window === "undefined") return;
  try {
    const deduped = deduplicateMangas(mangas);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(deduped));
  } catch (e) {
    console.error("Error saving local mangas:", e);
  }
}

// Fetch from Server API and merge with LocalStorage
export async function syncWithServer(): Promise<Manga[]> {
  try {
    const res = await fetch("/api/mangas");
    if (!res.ok) throw new Error("Failed to fetch from server");
    const json = await res.json();
    const serverMangas: Manga[] = json.data || [];
    const localMangas = getLocalMangas();

    // Check if there are local mangas on this device that are NOT yet on the server and are NOT junk or duplicates
    const serverIds = new Set(serverMangas.map((m) => m.id));
    const unuploaded = localMangas.filter(
      (m) =>
        !isJunkManga(m) &&
        !serverIds.has(m.id) &&
        !serverMangas.some((sm) => areMangasEquivalent(sm, m))
    );

    if (unuploaded.length > 0) {
      try {
        await fetch("/api/mangas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(unuploaded),
        });
      } catch (err) {
        console.error("Failed to push local unuploaded mangas to server:", err);
      }
    }

    // Merge local and server data safely (local first to preserve local edits!)
    const merged = deduplicateMangas([...localMangas, ...serverMangas]);
    saveLocalMangas(merged);
    return merged;
  } catch (e) {
    console.warn("Could not reach server database, using local cache:", e);
    return getLocalMangas();
  }
}

// Update chapter url helper with multi-pattern reader URL prediction
export function computeNextChapterUrl(url: string, nextChapter: number): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    let pathname = decodeURIComponent(parsed.pathname);

    // 1. Leading number in slug e.g. /14-return-of-the-legend/ -> /15-return-of-the-legend/
    const leadMatch = pathname.match(/^(\/?)(\d+(?:\.\d+)?)([-_][a-zA-Z].*)/);
    if (leadMatch) {
      pathname = `${leadMatch[1]}${nextChapter}${leadMatch[3]}`;
      return `${parsed.origin}${pathname}${parsed.search || ""}`;
    }

    // 2. Chapter keyword pattern e.g. /chapter-118, /ตอนที่-39, /ch-118, /ep-118
    const kwMatch = pathname.match(/((?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_.:/]?)(\d+(?:\.\d+)?)/i);
    if (kwMatch) {
      pathname = pathname.replace(kwMatch[0], `${kwMatch[1]}${nextChapter}`);
      return `${parsed.origin}${pathname}${parsed.search || ""}`;
    }

    // 3. Trailing hyphen/underscore number e.g. /regressor-of-the-fallen-family-126/ -> /regressor-of-the-fallen-family-127/
    const trailMatch = pathname.match(/([-_])(\d+(?:\.\d+)?)([\/]?)$/);
    if (trailMatch) {
      pathname = pathname.replace(/([-_])(\d+(?:\.\d+)?)([\/]?)$/, `$1${nextChapter}$3`);
      return `${parsed.origin}${pathname}${parsed.search || ""}`;
    }

    // 4. Trailing number after slash e.g. /heavyknight/116/ or /nano-machine/118
    const slashMatch = pathname.match(/\/(\d+(?:\.\d+)?)([\/]?)$/);
    if (slashMatch) {
      pathname = pathname.replace(/\/(\d+(?:\.\d+)?)([\/]?)$/, `/${nextChapter}$2`);
      return `${parsed.origin}${pathname}${parsed.search || ""}`;
    }

    return `${parsed.origin}${pathname.replace(/\/$/, "")}/${nextChapter}${parsed.search || ""}`;
  } catch {
    return url;
  }
}

// Sync with Supabase (bidirectional)
export async function syncWithSupabase(): Promise<{ synced: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { synced: 0 };
  }

  try {
    const remoteMangas = await fetchRemoteMangas(client);
    const localMangas = getLocalMangas();

    // Deduplicate combined local and remote by ID, title, and source URL
    // LOCAL MANGAS FIRST to prioritize user's local edits!
    const mergedList = deduplicateMangas([...localMangas, ...remoteMangas]);
    saveLocalMangas(mergedList);

    // Push local edits that are newer than remote up to Supabase
    for (const m of mergedList) {
      if (isJunkManga(m)) continue;
      const remoteItem = remoteMangas.find((rm) => rm.id === m.id || areMangasEquivalent(rm, m));
      if (remoteItem) {
        const mTime = new Date(m.updated_at || 0).getTime();
        const rTime = new Date(remoteItem.updated_at || 0).getTime();
        if (mTime > rTime) {
          try {
            await syncMangaToRemote(client, { ...m, id: remoteItem.id });
          } catch (err) {
            console.error("Failed to sync updated manga to Supabase:", m.title, err);
          }
        }
      } else {
        // Truly newly created local manga not yet in Supabase
        try {
          await syncMangaToRemote(client, m);
        } catch (err) {
          console.error("Failed to sync new manga to Supabase:", m.title, err);
        }
      }
    }

    // Also push merged to local server cache in background
    try {
      fetch("/api/mangas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mergedList),
      }).catch(() => {});
    } catch {}

    return { synced: mergedList.length };
  } catch (e: any) {
    console.error("Supabase sync error:", e);
    return { synced: 0, error: e.message };
  }
}

// Add or update a manga (saves to both Supabase Cloud & LocalStorage)
export async function upsertManga(manga: Manga): Promise<Manga[]> {
  const current = getLocalMangas();
  const index = current.findIndex((m) => m.id === manga.id || areMangasEquivalent(m, manga));
  const targetId = index >= 0 ? current[index].id : manga.id;
  const now = new Date().toISOString();

  // Normalize source manga_id to targetId
  const fixedSources = (manga.sources || []).map((s) => ({
    ...s,
    manga_id: targetId,
  }));

  const updatedManga: Manga = {
    ...(index >= 0 ? current[index] : {}),
    ...manga,
    id: targetId,
    sources: fixedSources,
    updated_at: now,
  };

  let newList: Manga[];
  if (index >= 0) {
    newList = [...current];
    newList[index] = updatedManga;
  } else {
    newList = [updatedManga, ...current];
  }

  saveLocalMangas(newList);

  // Directly sync to Supabase - AWAIT so cloud database is guaranteed to be saved!
  const client = getSupabaseClient();
  if (client) {
    try {
      await syncMangaToRemote(client, updatedManga);
    } catch (err) {
      console.error("Supabase sync failed in upsertManga:", err);
    }
  }

  // Push to server database in background without overwriting local cache
  try {
    fetch("/api/mangas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedManga),
    }).catch(() => {});
  } catch (err) {}

  return newList;
}

// Batch add or update multiple mangas at once
export async function upsertMangas(mangasToAdd: Manga[]): Promise<Manga[]> {
  if (mangasToAdd.length === 0) return getLocalMangas();

  const current = getLocalMangas();
  const now = new Date().toISOString();
  const stampedToAdd = mangasToAdd.map((m) => ({
    ...m,
    updated_at: now,
  }));

  const newList = deduplicateMangas([...stampedToAdd, ...current]);
  saveLocalMangas(newList);

  // Sync to Supabase
  const client = getSupabaseClient();
  if (client) {
    for (const m of stampedToAdd) {
      try {
        await syncMangaToRemote(client, m);
      } catch (err) {
        console.error("Supabase batch sync failed for:", m.title, err);
      }
    }
  }

  // Push batch to server API in background without overwriting local cache
  try {
    fetch("/api/mangas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mangasToAdd),
    }).catch(() => {});
  } catch (err) {}

  return newList;
}

export interface ReadLogEntry {
  manga_id: string;
  title: string;
  chapter: number;
  delta: number;
  type: 'increment' | 'open' | 'sync';
  timestamp: string;
}

// Record reading activity event in localStorage
export function recordReadEvent(
  mangaId: string,
  title: string,
  chapter: number,
  delta: number = 1,
  type: 'increment' | 'open' | 'sync' = 'increment'
) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("mangahub_read_logs");
    const logs: ReadLogEntry[] = raw ? JSON.parse(raw) : [];
    logs.unshift({
      manga_id: mangaId,
      title,
      chapter,
      delta,
      type,
      timestamp: new Date().toISOString(),
    });
    if (logs.length > 500) logs.length = 500;
    localStorage.setItem("mangahub_read_logs", JSON.stringify(logs));
  } catch (e) {
    console.warn("Failed to save read log:", e);
  }
}

// Get all recorded read activity logs
export function getReadLogs(): ReadLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("mangahub_read_logs");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Quick increment chapter (+1)
export async function incrementChapter(id: string): Promise<Manga[]> {
  const current = getLocalMangas();
  const target = current.find((m) => m.id === id);
  if (!target) return current;

  const nextChapter = target.current_chapter + 1;
  const updatedSources = target.sources.map((s) => ({
    ...s,
    current_chapter_url: computeNextChapterUrl(s.current_chapter_url || s.base_url, nextChapter),
  }));

  const updated: Manga = {
    ...target,
    current_chapter: nextChapter,
    sources: updatedSources,
    last_read_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("mangahub_last_read_manga_id", id);
    recordReadEvent(id, target.title, nextChapter, 1, 'increment');
  }

  return upsertManga(updated);
}

// Quick +1 chapter and return predicted next URL for immediate opening
export async function incrementAndOpenNextChapter(id: string): Promise<{
  updatedList: Manga[];
  nextUrl: string | null;
  nextChapter: number;
}> {
  const current = getLocalMangas();
  const target = current.find((m) => m.id === id);
  if (!target) return { updatedList: current, nextUrl: null, nextChapter: 0 };

  const nextChapter = target.current_chapter + 1;
  const primarySource = target.sources?.find((s) => s.is_primary) || target.sources?.[0];
  const targetSourceUrl = primarySource?.current_chapter_url || primarySource?.base_url || "";
  const nextUrl = targetSourceUrl ? computeNextChapterUrl(targetSourceUrl, nextChapter) : null;

  const updatedSources = target.sources.map((s) => ({
    ...s,
    current_chapter_url: computeNextChapterUrl(s.current_chapter_url || s.base_url, nextChapter),
  }));

  const updated: Manga = {
    ...target,
    current_chapter: nextChapter,
    sources: updatedSources,
    last_read_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("mangahub_last_read_manga_id", id);
    recordReadEvent(id, target.title, nextChapter, 1, 'increment');
  }

  const updatedList = await upsertManga(updated);
  return { updatedList, nextUrl, nextChapter };
}

// Touch manga last_read_at when user opens reader or clicks read
export async function touchMangaRead(id: string): Promise<Manga[]> {
  const current = getLocalMangas();
  const target = current.find((m) => m.id === id);
  if (!target) return current;

  const now = new Date().toISOString();
  if (typeof window !== "undefined") {
    localStorage.setItem("mangahub_last_read_manga_id", id);
    recordReadEvent(id, target.title, target.current_chapter, 0, 'open');
  }

  const updated: Manga = {
    ...target,
    last_read_at: now,
    updated_at: now,
  };

  return upsertManga(updated);
}

// Quick set chapter directly (e.g. Sync to latest available chapter)
export async function setChapter(id: string, chapterNumber: number): Promise<Manga[]> {
  const current = getLocalMangas();
  const target = current.find((m) => m.id === id);
  if (!target) return current;

  const updatedSources = target.sources.map((s) => ({
    ...s,
    current_chapter_url: computeNextChapterUrl(s.current_chapter_url || s.base_url, chapterNumber),
  }));

  const updated: Manga = {
    ...target,
    current_chapter: chapterNumber,
    sources: updatedSources,
    last_read_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("mangahub_last_read_manga_id", id);
    const diff = Math.max(0, chapterNumber - target.current_chapter);
    recordReadEvent(id, target.title, chapterNumber, diff, 'sync');
  }

  return upsertManga(updated);
}

// Delete a manga
export async function removeManga(id: string): Promise<Manga[]> {
  const current = getLocalMangas();
  const newList = current.filter((m) => m.id !== id);
  saveLocalMangas(newList);

  try {
    await fetch(`/api/mangas?id=${id}`, { method: "DELETE" });
  } catch (err) {
    console.warn("Could not delete from server API:", err);
  }

  const client = getSupabaseClient();
  if (client) {
    deleteRemoteManga(client, id).catch((err) =>
      console.error("Remote Supabase delete failed:", err)
    );
  }

  return newList;
}

// Check updates for a manga across all its sources (primary + backups)
export async function checkMangaOnlineUpdate(manga: Manga): Promise<{ latestChapter: number; hasUpdate: boolean; foundFromWeb: boolean }> {
  if (!manga.sources || manga.sources.length === 0) {
    return { latestChapter: manga.current_chapter, hasUpdate: false, foundFromWeb: false };
  }

  let maxFoundFromWeb = 0;
  let foundUpdate = false;

  // Check all active sources to find the absolute highest chapter available across all web sources!
  const activeSources = manga.sources.filter((s) => s.is_active);
  const sourcesToCheck = activeSources.length > 0 ? activeSources : manga.sources;

  for (const source of sourcesToCheck) {
    const urlToCheck = source.base_url || source.current_chapter_url;
    if (!urlToCheck) continue;

    try {
      const res = await fetch("/api/check-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlToCheck,
          currentChapter: manga.current_chapter,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && typeof json.latestChapter === "number" && json.latestChapter > 0) {
          if (json.latestChapter > maxFoundFromWeb) {
            maxFoundFromWeb = json.latestChapter;
          }
          if (json.hasUpdate) {
            foundUpdate = true;
          }
        }
      }
    } catch (e) {
      console.warn(`Check update failed for ${manga.title} on ${source.site_name}:`, e);
    }
  }

  const latestChapter = maxFoundFromWeb > 0 ? maxFoundFromWeb : (manga.latest_available_chapter || manga.current_chapter);

  return {
    latestChapter,
    hasUpdate: (maxFoundFromWeb > 0 && maxFoundFromWeb > manga.current_chapter) || foundUpdate,
    foundFromWeb: maxFoundFromWeb > 0,
  };
}

// Export all current library data with metadata & categories
export function exportBackupData(mangas?: Manga[]): MangaBackupData {
  const currentMangas = mangas && mangas.length > 0 ? mangas : getLocalMangas();
  const categories = getStoredCategories();
  const totalSources = currentMangas.reduce((acc, m) => acc + (m.sources?.length || 0), 0);

  return {
    app: "MangaHub",
    version: 2,
    exportedAt: new Date().toISOString(),
    stats: {
      totalMangas: currentMangas.length,
      totalSources,
      totalCategories: categories.length,
    },
    categories,
    mangas: currentMangas,
  };
}

const STATUS_LABELS_THAI: Record<string, string> = {
  reading: "กำลังอ่าน",
  on_hold: "ดองไว้ก่อน",
  completed: "อ่านจบแล้ว",
  dropped: "ดรอป/เลิกอ่าน",
  plan_to_read: "อยากอ่าน",
};

// Export library as an Excel-compatible CSV string (with UTF-8 BOM \uFEFF for Thai support)
export function exportMangasToCsv(mangas?: Manga[]): string {
  const currentMangas = mangas && mangas.length > 0 ? mangas : getLocalMangas();

  const headers = [
    "ชื่อเรื่อง",
    "ชื่อเรื่องรอง (Alt Title)",
    "ตอนที่อ่านถึง",
    "ตอนล่าสุดบนเว็บ",
    "สถานะการอ่าน",
    "ระดับความชอบ (Tier)",
    "หมวดหมู่",
    "บันทึกช่วยจำ (Notes)",
    "แท็ก",
    "เว็บอ่านหลัก",
    "ลิงก์ตอนปัจจุบัน",
    "ลิงก์หน้าหลักการ์ตูน",
    "อ่านล่าสุดเมื่อ",
    "ลิงก์รูปหน้าปก",
  ];

  const escapeCsv = (val: any): string => {
    if (val === undefined || val === null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = currentMangas.map((m) => {
    const primarySource = m.sources?.find((s) => s.is_primary) || m.sources?.[0];
    const statusText = STATUS_LABELS_THAI[m.status] || m.status || "กำลังอ่าน";
    const tagsText = Array.isArray(m.tags) ? m.tags.join("; ") : "";
    const tierText = m.tier && m.tier !== "none" ? m.tier : "";

    return [
      escapeCsv(m.title),
      escapeCsv(m.alt_title || ""),
      escapeCsv(m.current_chapter ?? 0),
      escapeCsv(m.latest_available_chapter ?? ""),
      escapeCsv(statusText),
      escapeCsv(tierText),
      escapeCsv(m.category || "การ์ตูนทั่วไป"),
      escapeCsv(m.notes || ""),
      escapeCsv(tagsText),
      escapeCsv(primarySource?.site_name || ""),
      escapeCsv(primarySource?.current_chapter_url || ""),
      escapeCsv(primarySource?.base_url || ""),
      escapeCsv(m.last_read_at || ""),
      escapeCsv(m.cover_url || ""),
    ].join(",");
  });

  // Prepend \uFEFF (UTF-8 BOM) so Microsoft Excel opens Thai text without garbled characters
  return "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
}

// Parse CSV text into 2D string matrix
export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = "";
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    const next = clean[i + 1];

    if (c === '"') {
      if (insideQuotes && next === '"') {
        currentVal += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (c === "," && !insideQuotes) {
      currentRow.push(currentVal);
      currentVal = "";
    } else if ((c === "\r" || c === "\n") && !insideQuotes) {
      if (c === "\r" && next === "\n") i++;
      currentRow.push(currentVal);
      if (currentRow.some((col) => col.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = "";
    } else {
      currentVal += c;
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    if (currentRow.some((col) => col.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// Convert parsed CSV rows into Manga objects & discovered categories
export function parseCsvToMangas(csvText: string): { mangas: Manga[]; categories: string[] } {
  const matrix = parseCsvRows(csvText);
  if (matrix.length === 0) return { mangas: [], categories: [] };

  const firstRow = matrix[0].map((h) => h.trim().toLowerCase());
  let headerIndex = 0;

  // Find column mapping from header
  const findCol = (keywords: string[]): number => {
    return firstRow.findIndex((h) => keywords.some((k) => h.includes(k.toLowerCase())));
  };

  const titleCol = findCol(["ชื่อเรื่อง", "title", "name"]);
  const altTitleCol = findCol(["ชื่อเรื่องรอง", "alt", "secondary"]);
  const curChCol = findCol(["ตอนที่อ่าน", "current", "ch", "chapter"]);
  const latestChCol = findCol(["ตอนล่าสุด", "latest", "update"]);
  const statusCol = findCol(["สถานะ", "status"]);
  const tierCol = findCol(["tier", "ระดับ"]);
  const categoryCol = findCol(["หมวดหมู่", "category", "genre"]);
  const notesCol = findCol(["บันทึก", "note", "memo"]);
  const tagsCol = findCol(["แท็ก", "tag"]);
  const siteCol = findCol(["เว็บ", "site", "source"]);
  const curUrlCol = findCol(["ตอนปัจจุบัน", "chapter_url", "current_url", "url"]);
  const baseCol = findCol(["หน้าหลัก", "base_url", "main_url"]);
  const coverCol = findCol(["รูป", "cover", "image"]);

  // If first row looked like a header row, start from row 1; else row 0
  const dataRows = titleCol !== -1 ? matrix.slice(1) : matrix;

  const mangas: Manga[] = [];
  const categoriesSet = new Set<string>();

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    const getVal = (col: number, fallbackCol?: number) => {
      if (col >= 0 && row[col] !== undefined) return row[col].trim();
      if (fallbackCol !== undefined && fallbackCol >= 0 && row[fallbackCol] !== undefined) {
        return row[fallbackCol].trim();
      }
      return "";
    };

    const title = getVal(titleCol, 0);
    if (!title) continue;

    const altTitle = getVal(altTitleCol, 1);
    const curChRaw = parseFloat(getVal(curChCol, 2)) || 1;
    const latestChRaw = parseFloat(getVal(latestChCol, 3)) || undefined;

    // Map status
    const statusRaw = getVal(statusCol, 4).toLowerCase();
    let status: Manga["status"] = "reading";
    if (statusRaw.includes("ดอง") || statusRaw.includes("hold")) {
      status = "on_hold";
    } else if (statusRaw.includes("จบ") || statusRaw.includes("complete")) {
      status = "completed";
    } else if (statusRaw.includes("ดรอป") || statusRaw.includes("เท") || statusRaw.includes("drop")) {
      status = "dropped";
    } else if (statusRaw.includes("อยาก") || statusRaw.includes("แผน") || statusRaw.includes("plan")) {
      status = "plan_to_read";
    }

    // Map Tier
    const tierRaw = getVal(tierCol, 5).toUpperCase();
    let tier: Manga["tier"] = "none";
    if (["S", "A", "B", "C", "D"].includes(tierRaw)) {
      tier = tierRaw as Manga["tier"];
    }

    // Category
    const category = getVal(categoryCol, 6) || "การ์ตูนทั่วไป";
    categoriesSet.add(category);

    // Notes
    const notes = getVal(notesCol, 7);

    // Tags
    const tagsRaw = getVal(tagsCol, 8);
    const tags = tagsRaw
      ? tagsRaw.split(/[;,]/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean)
      : [];

    // Sources
    const siteName = getVal(siteCol, 9) || "เว็บอ่านหลัก";
    const currentChapterUrl = getVal(curUrlCol, 10);
    const baseUrl = getVal(baseCol, 11) || currentChapterUrl;
    const coverUrl = getVal(coverCol, 13);

    const sources: MangaSource[] = [];
    if (currentChapterUrl || baseUrl) {
      sources.push({
        id: `src-${Date.now()}-${idx}`,
        site_name: siteName,
        base_url: baseUrl,
        current_chapter_url: currentChapterUrl,
        is_primary: true,
        is_active: true,
      });
    }

    const now = new Date().toISOString();
    mangas.push({
      id: `manga-csv-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      alt_title: altTitle || undefined,
      cover_url: coverUrl || "",
      current_chapter: curChRaw,
      latest_available_chapter: latestChRaw,
      status,
      tier,
      category,
      notes: notes || undefined,
      tags,
      sources,
      last_read_at: now,
      created_at: now,
      updated_at: now,
    });
  }

  return { mangas, categories: Array.from(categoriesSet) };
}

// Restore library data from backup payload
export async function restoreBackupData(
  rawPayload: any,
  options: {
    mode: "merge" | "replace";
    syncSupabase?: boolean;
  },
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!rawPayload) {
      return { success: false, count: 0, error: "ไฟล์สำรองไม่มีข้อมูล" };
    }

    let importedMangas: Manga[] = [];
    let importedCategories: string[] = [];

    if (Array.isArray(rawPayload)) {
      importedMangas = rawPayload;
    } else if (typeof rawPayload === "object") {
      if (Array.isArray(rawPayload.mangas)) {
        importedMangas = rawPayload.mangas;
      }
      if (Array.isArray(rawPayload.categories)) {
        importedCategories = rawPayload.categories;
      }
    }

    if (importedMangas.length === 0) {
      return { success: false, count: 0, error: "ไม่พบรายการมังงะในไฟล์ที่เลือก" };
    }

    // Filter valid manga objects
    const validMangas = importedMangas.filter(
      (m) => m && typeof m === "object" && typeof m.title === "string" && m.title.trim().length > 0
    );

    if (validMangas.length === 0) {
      return { success: false, count: 0, error: "ไม่พบข้อมูลมังงะที่ถูกต้องในไฟล์" };
    }

    // Import any custom categories
    if (importedCategories.length > 0) {
      importedCategories.forEach((cat) => {
        if (typeof cat === "string" && cat.trim()) {
          addCategory(cat.trim());
        }
      });
    }

    let finalList: Manga[] = [];
    if (options.mode === "replace") {
      finalList = deduplicateMangas(validMangas);
      saveLocalMangas(finalList);
    } else {
      const current = getLocalMangas();
      finalList = deduplicateMangas([...validMangas, ...current]);
      saveLocalMangas(finalList);
    }

    // If syncSupabase is requested, sync each manga to remote
    if (options.syncSupabase) {
      const client = getSupabaseClient();
      if (client) {
        for (let i = 0; i < validMangas.length; i++) {
          try {
            await syncMangaToRemote(client, validMangas[i]);
          } catch (err) {
            console.error("Supabase restore sync failed for:", validMangas[i].title, err);
          }
          if (onProgress) {
            onProgress(i + 1, validMangas.length);
          }
        }
      }
    }

    // Also push to server API in background
    try {
      fetch("/api/mangas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalList),
      }).catch(() => {});
    } catch {}

    return { success: true, count: validMangas.length };
  } catch (e: any) {
    console.error("Restore backup error:", e);
    return { success: false, count: 0, error: e.message || "เกิดข้อผิดพลาดในการกู้คืนข้อมูล" };
  }
}

// Check if a manga cover is missing or low quality
export function isCoverNeedingEnrichment(coverUrl?: string): boolean {
  if (!coverUrl || coverUrl.trim() === "") return true;
  if (coverUrl.includes("images.unsplash.com")) return true;
  if (coverUrl.includes("nobuild.pro")) return true;
  if (coverUrl.startsWith("data:")) return true;
  // Panel images from chapter reader pages
  if (
    /(?:chapter|ep|ch|page)[-_]?\d+[-_]\(\d+\)|ep\d+[-_]\(\d+\)|\/data\/manga_.*\/.*(?:ep|ch)\d+/i.test(
      coverUrl
    )
  ) {
    return true;
  }
  return false;
}

// Auto-fix covers for all mangas in library that need better covers
export async function autoFixMissingAndBadCovers(
  onProgress?: (current: number, total: number, title: string) => void
): Promise<{ updatedCount: number; totalCandidates: number; errors: number }> {
  const currentMangas = getLocalMangas();
  const candidates = currentMangas.filter((m) => isCoverNeedingEnrichment(m.cover_url));

  if (candidates.length === 0) {
    return { updatedCount: 0, totalCandidates: 0, errors: 0 };
  }

  let updatedCount = 0;
  let errors = 0;
  const updatedMangas = [...currentMangas];

  for (let i = 0; i < candidates.length; i++) {
    const manga = candidates[i];
    if (onProgress) {
      onProgress(i + 1, candidates.length, manga.title);
    }

    try {
      const res = await fetch(`/api/cover-search?title=${encodeURIComponent(manga.title)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.bestCover) {
          const idx = updatedMangas.findIndex((m) => m.id === manga.id);
          if (idx >= 0) {
            const updated: Manga = {
              ...updatedMangas[idx],
              cover_url: json.bestCover,
              updated_at: new Date().toISOString(),
            };
            updatedMangas[idx] = updated;
            await upsertManga(updated);
            updatedCount++;
          }
        }
      }
    } catch (e) {
      console.error(`Auto-fix cover failed for ${manga.title}:`, e);
      errors++;
    }

    // Small delay between requests to be polite to external APIs
    await new Promise((r) => setTimeout(r, 200));
  }

  saveLocalMangas(updatedMangas);
  return { updatedCount, totalCandidates: candidates.length, errors };
}


