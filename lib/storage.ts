import { Manga, MangaSource } from "@/types/manga";
import { getSupabaseClient, syncMangaToRemote, deleteRemoteManga, fetchRemoteMangas } from "./supabase";

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

// Update chapter url helper
export function computeNextChapterUrl(url: string, nextChapter: number): string {
  if (!url) return "";
  try {
    const decodedUrl = decodeURI(url);
    const chapterRegex = /((?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?)(\d+(?:\.\d+)?)/i;
    if (chapterRegex.test(decodedUrl)) {
      return decodedUrl.replace(chapterRegex, `$1${nextChapter}`);
    }
    const endNumberRegex = /([-_/])(\d+(?:\.\d+)?)\/?$/;
    if (endNumberRegex.test(decodedUrl)) {
      return decodedUrl.replace(endNumberRegex, `$1${nextChapter}/`);
    }
    return `${decodedUrl.replace(/\/$/, "")}/${nextChapter}`;
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
  }

  return upsertManga(updated);
}

// Touch manga last_read_at when user opens reader or clicks read
export async function touchMangaRead(id: string): Promise<Manga[]> {
  const current = getLocalMangas();
  const target = current.find((m) => m.id === id);
  if (!target) return current;

  const now = new Date().toISOString();
  if (typeof window !== "undefined") {
    localStorage.setItem("mangahub_last_read_manga_id", id);
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
    const urlToCheck = source.current_chapter_url || source.base_url;
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
