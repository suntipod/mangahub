import { Manga, MangaSource, MangaBackupData } from "@/types/manga";
import { getSupabaseClient, syncMangaToRemote, deleteRemoteManga, fetchRemoteMangas, ensureUUID } from "./supabase";
import { getStoredCategories, addCategory } from "./categories";

const LOCAL_STORAGE_KEY = "mangahub_local_mangas";
const DELETED_IDS_KEY = "mangahub_deleted_ids";

let lastSyncError: string | null = null;

export function getLastSyncError(): string | null {
  return lastSyncError;
}

export function clearLastSyncError(): void {
  lastSyncError = null;
}

// Safe decodeURIComponent that never throws on malformed % sequences
export function safeDecodeURIComponent(str: string): string {
  if (!str || typeof str !== "string") return "";
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

// Normalize a source URL for reliable comparison across encoded/decoded variants
export function normalizeSourceUrl(urlStr?: string): string {
  if (!urlStr || typeof urlStr !== "string") return "";
  const trimmed = urlStr.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = safeDecodeURIComponent(u.pathname).replace(/\/+$/, "").toLowerCase();
    const params = new URLSearchParams(u.search);
    ["fbclid", "gclid", "utm_source", "utm_medium", "utm_campaign"].forEach((k) => params.delete(k));
    const search = params.toString() ? `?${params.toString().toLowerCase()}` : "";
    return `${u.protocol}//${host}${path}${search}`;
  } catch {
    return safeDecodeURIComponent(trimmed).toLowerCase().replace(/\/+$/, "");
  }
}

function isSeriesRootPath(urlStr?: string): boolean {
  if (!urlStr) return false;
  try {
    const u = new URL(urlStr);
    const p = safeDecodeURIComponent(u.pathname).replace(/\/+$/, "");
    if (/^\/(?:manga|comics?|read|series|content)$/i.test(p) || /^\/manga\/read$/i.test(p)) {
      return false;
    }
    if (/^\/cartoon\/[^\/]+\/\d+-/i.test(p)) {
      return true;
    }
    return (
      /^\/(?:manga|series|comics?|content)\/[^\/]+$/i.test(p) &&
      !/(?:[-_/\s]*(?:ตอนที่|ตอน|chapter|ch|ep|episode)[-_/\s]*\d+(?:\.\d+)?)$/i.test(p)
    );
  } catch {
    return false;
  }
}

// Normalize a source URL to its canonical host + series slug key so series-root and chapter URLs on the same site deduplicate cleanly
export function normalizeSeriesRootKey(urlStr?: string): string {
  if (!urlStr || typeof urlStr !== "string") return "";
  const trimmed = urlStr.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = safeDecodeURIComponent(u.pathname).replace(/\/+$/, "").toLowerCase();

    // Kairew book IDs: /cartoon/<translator>/<bookId>-<slug> or /cartoon/book/<bookId>/read/<chapterId>
    const kairewMatch = path.match(/^\/cartoon\/(?:[^\/]+\/(\d+)-|book\/(\d+)(?:\/|$))/i);
    if (kairewMatch) {
      const bookId = kairewMatch[1] || kairewMatch[2];
      return `${host}/kairew-book-${bookId}`;
    }

    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) return "";

    const containerPrefixes = new Set([
      "manga",
      "series",
      "comic",
      "comics",
      "content",
      "episode",
      "episodes",
      "read",
      "reader",
      "book",
      "books",
      "cartoon",
      "cartoons",
      "webtoon",
      "title",
      "titles",
      "novel",
      "novels",
    ]);

    let idx = 0;
    while (idx < parts.length - 1 && containerPrefixes.has(parts[idx])) {
      idx++;
    }

    const remaining = parts.slice(idx);
    if (
      remaining.length > 1 &&
      /^(?:(?:ตอนที่|ตอน|chapter|ch|ep|episode)[-_.\s]*\d+(?:\.\d+)?|\d+(?:\.\d+)?)$/i.test(
        remaining[remaining.length - 1]
      )
    ) {
      remaining.pop();
    }

    let slug = remaining[0] || "";
    const strippedKeyword = slug.replace(
      /[-_.\s]*(?:ตอนที่|ตอน|chapter|ch|ep|episode)[-_.\s]*\d+(?:\.\d+)?$/i,
      ""
    );
    if (strippedKeyword.length >= 2) {
      slug = strippedKeyword;
    }
    const strippedTrailingNum = slug.replace(/[-_]\d+(?:\.\d+)?$/, "");
    if (strippedTrailingNum.length >= 3 && !/^\d+$/.test(strippedTrailingNum)) {
      slug = strippedTrailingNum;
    }

    if (!slug || slug.length < 2 || containerPrefixes.has(slug)) return "";
    return `${host}/${slug}`;
  } catch {
    return "";
  }
}

// Deduplicate sources within a single manga and enforce at most 1 (and if non-empty, 1) primary source
export function deduplicateSources(sources?: MangaSource[], mangaId?: string): MangaSource[] {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const deduped: MangaSource[] = [];

  for (const raw of sources) {
    if (!raw || typeof raw !== "object") continue;
    const baseUrl = (raw.base_url || raw.current_chapter_url || (raw as any).url || "").trim();
    const curUrl = (raw.current_chapter_url || raw.base_url || (raw as any).url || "").trim();
    if (!baseUrl && !curUrl) continue;

    const normBase = normalizeSourceUrl(baseUrl);
    const normCur = normalizeSourceUrl(curUrl);
    const rootKey = normalizeSeriesRootKey(baseUrl) || normalizeSeriesRootKey(curUrl);
    const rawSite = (raw.site_name || "").trim().toLowerCase();

    const existingIdx = deduped.findIndex((ex) => {
      const exBase = normalizeSourceUrl(ex.base_url);
      const exCur = normalizeSourceUrl(ex.current_chapter_url);
      if (
        (normBase && (normBase === exBase || normBase === exCur)) ||
        (normCur && (normCur === exCur || normCur === exBase))
      ) {
        return true;
      }
      const exRootKey = normalizeSeriesRootKey(ex.base_url) || normalizeSeriesRootKey(ex.current_chapter_url);
      if (rootKey && exRootKey && rootKey === exRootKey) {
        return true;
      }
      const exSite = (ex.site_name || "").trim().toLowerCase();
      if (rawSite && exSite && rawSite === exSite && rootKey && exRootKey && rootKey.split("/")[0] === exRootKey.split("/")[0]) {
        const sA = extractCoreSlug(baseUrl || curUrl);
        const sB = extractCoreSlug(ex.base_url || ex.current_chapter_url);
        if (sA && sB && sA === sB) return true;
      }
      return false;
    });

    if (existingIdx === -1) {
      deduped.push({
        id: raw.id || `src-${Date.now()}-${deduped.length}`,
        manga_id: mangaId || raw.manga_id,
        site_name: raw.site_name || "เว็บอ่านหลัก",
        base_url: baseUrl || curUrl,
        current_chapter_url: curUrl || baseUrl,
        is_primary: Boolean(raw.is_primary),
        is_active: raw.is_active !== false,
      });
    } else {
      const ex = deduped[existingIdx];
      // Prefer a proper series root base_url if one of the two has it
      const bestBase =
        !isSeriesRootPath(ex.base_url) && isSeriesRootPath(baseUrl)
          ? baseUrl
          : /^https?:\/\/[^\/]+\/manga\/read\/?$/i.test(ex.base_url) && baseUrl
          ? baseUrl
          : ex.base_url;
      // Prefer a chapter-specific URL over a bare series root for current_chapter_url
      const bestCur =
        isSeriesRootPath(ex.current_chapter_url) && curUrl && !isSeriesRootPath(curUrl)
          ? curUrl
          : ex.current_chapter_url || curUrl;
      deduped[existingIdx] = {
        ...ex,
        base_url: bestBase,
        current_chapter_url: bestCur,
        is_primary: Boolean(ex.is_primary || raw.is_primary),
        is_active: ex.is_active !== false && raw.is_active !== false,
      };
    }
  }

  if (deduped.length > 0) {
    const primaryIdx = deduped.findIndex((s) => s.is_primary);
    const targetPrimaryIdx = primaryIdx >= 0 ? primaryIdx : 0;
    return deduped.map((s, idx) => ({
      ...s,
      manga_id: mangaId || s.manga_id,
      is_primary: idx === targetPrimaryIdx,
    }));
  }

  return deduped;
}

// Deleted manga tombstones management
export function getDeletedMangaIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DELETED_IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {}
  return new Set();
}

export function addDeletedMangaId(id: string): void {
  if (typeof window === "undefined" || !id) return;
  try {
    const set = getDeletedMangaIds();
    set.add(id);
    set.add(ensureUUID(id));
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export function removeDeletedMangaId(id: string): void {
  if (typeof window === "undefined" || !id) return;
  try {
    const set = getDeletedMangaIds();
    const changed = set.delete(id) || set.delete(ensureUUID(id));
    if (changed) {
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(set)));
    }
  } catch {}
}

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
    const parts = safeDecodeURIComponent(u.pathname).split("/").filter(Boolean);
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

export const JUNK_DOMAINS = [
  "shopee.co.th",
  "shopee.com",
  "lazada.co.th",
  "lazada.com",
  "google.com",
  "google.co.th",
  "cad.go.th",
  "mdes.go.th",
  "smart4m.com",
  "mangahub-seven.vercel.app",
  "vercel.app",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
];

export function isJunkDomain(hostname: string): boolean {
  const host = (hostname || "").toLowerCase().replace(/^www\./, "");
  if (!host) return false;
  return JUNK_DOMAINS.some((d) => host === d || host.endsWith("." + d));
}

// Check if a manga or URL is junk (non-manga utility or error page)
export function isJunkManga(m: Manga): boolean {
  if (!m || typeof m.title !== "string") return true;
  const cleanT = m.title.trim();
  if (!cleanT || ["เข้าสู่ระบบ", "Google Search", "Shp App Link", "MangaHub", "การ์ตูนเรื่องที่ 43", "/", "Up", "Fin"].includes(cleanT)) {
    return true;
  }

  const sources = Array.isArray(m.sources) ? m.sources : [];
  // Mangas without online sources yet are still valid titles, do not treat as junk
  if (sources.length === 0) return false;

  for (const s of sources) {
    if (!s) continue;
    const urlStr = s.base_url || s.current_chapter_url || (s as any).url || "";
    if (!urlStr) continue;
    try {
      const u = new URL(urlStr);
      if (isJunkDomain(u.hostname)) return true;
      const p = u.pathname.replace(/\/$/, "");
      if (p === "" || /^\/(?:manga|comics|comic|read|page\/\d+|topup|payments?|auth|login|signin|register|search)$/i.test(p)) {
        return true;
      }
      if (u.searchParams.has("s") && u.searchParams.get("s") && p === "") {
        return true;
      }
    } catch {
      // Invalid URL does not make the whole manga junk if title is valid
    }
  }

  return false;
}

function getNonGenericSourceUrls(m: Manga): string[] {
  const sources = Array.isArray(m.sources) ? m.sources : [];
  return sources
    .flatMap((s) => [normalizeSourceUrl(s?.base_url), normalizeSourceUrl(s?.current_chapter_url)])
    .filter((u) => u.length > 15 && !/\/(?:manga|comics?|read|series|content)$/.test(u));
}

// Check if two manga entries refer to the exact same story (no loose substring/alias merging)
export function areMangasEquivalent(a: Manga, b: Manga): boolean {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;

  const tA = cleanTitleForMatch(a.title);
  const tB = cleanTitleForMatch(b.title);
  const normA = normalizeTitle(tA);
  const normB = normalizeTitle(tB);

  if (normA && normB && normA === normB) {
    return true;
  }

  const urlsA = getNonGenericSourceUrls(a);
  const urlsB = new Set(getNonGenericSourceUrls(b));
  if (urlsA.length > 0 && urlsA.some((u) => urlsB.has(u))) {
    return true;
  }

  const slugsA = (Array.isArray(a.sources) ? a.sources : [])
    .map((s) => extractCoreSlug(s?.base_url || s?.current_chapter_url || (s as any)?.url || ""))
    .filter((s) => s.length >= 6);
  const slugsB = (Array.isArray(b.sources) ? b.sources : [])
    .map((s) => extractCoreSlug(s?.base_url || s?.current_chapter_url || (s as any)?.url || ""))
    .filter((s) => s.length >= 6);

  // Only match by exact core slug if titles don't explicitly disagree
  if (!normA || !normB) {
    for (const sa of slugsA) {
      for (const sb of slugsB) {
        if (sa === sb) return true;
      }
    }
  }

  return false;
}

function sanitizeLatestChapter(latest?: number, currentChapter: number = 0): number | undefined {
  if (latest === undefined || latest === null) return undefined;
  const num = Number(latest);
  if (isNaN(num) || num <= 0) return undefined;
  // Filter known bogus outliers (e.g. 3450, 4927, 1255 when currentChapter is much smaller)
  if (num > 2000 && currentChapter < 500) return undefined;
  if (num === 1255 && currentChapter < 150) return undefined;
  return num;
}

function normalizeMangaRecord(m: Manga): Manga {
  const curCh = Number(m.current_chapter);
  const safeCurCh = !isNaN(curCh) && curCh >= 0 ? curCh : 0;
  return {
    ...m,
    current_chapter: safeCurCh,
    latest_available_chapter: sanitizeLatestChapter(m.latest_available_chapter, safeCurCh),
    sources: deduplicateSources(Array.isArray(m.sources) ? m.sources : [], m.id),
    tags: Array.isArray(m.tags) ? m.tags : [],
    category: m.category || "การ์ตูนทั่วไป",
    tier: m.tier || "none",
    status: m.status || "reading",
  };
}

// Helper to remove duplicates and merge using updated_at (last-write-wins)
export function deduplicateMangas(mangas: Manga[]): Manga[] {
  if (!Array.isArray(mangas)) return [];
  const valid = mangas.filter((m) => !isJunkManga(m));
  const result: Manga[] = [];

  for (const rawM of valid) {
    if (!rawM || !rawM.title) continue;
    const m = normalizeMangaRecord(rawM);

    const existingIdx = result.findIndex((existing) => areMangasEquivalent(existing, m));

    if (existingIdx === -1) {
      result.push(m);
    } else {
      const existing = result[existingIdx];
      const isUuid = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const bestId = isUuid(existing.id) ? existing.id : isUuid(m.id) ? m.id : existing.id;

      // Determine which record is newer (winner) using updated_at (last-write-wins)
      const existingTime = new Date(existing.updated_at || 0).getTime();
      const mTime = new Date(m.updated_at || 0).getTime();
      const isMNewer = mTime > existingTime;
      const winner = isMNewer ? m : existing;
      const loser = isMNewer ? existing : m;

      // Never overwrite winner.title with loser.title
      const bestTitle = (winner.title && winner.title.trim()) ? winner.title.trim() : loser.title;

      // For same manga ID, respect winner's sources & tags (so deleted sources/tags stay deleted).
      // For distinct records being deduplicated, combine sources cleanly.
      const isSameRecord = existing.id === m.id;
      const winnerSources = Array.isArray(winner.sources) ? winner.sources : [];
      const loserSources = Array.isArray(loser.sources) ? loser.sources : [];
      const rawCombinedSources = isSameRecord
        ? winnerSources
        : [...winnerSources, ...loserSources.map((ls) => ({ ...ls, is_primary: false }))];

      const combinedSources = deduplicateSources(rawCombinedSources, bestId);

      // Cover URL: Always prioritize winner's non-empty cover
      const chosenCover = (winner.cover_url && winner.cover_url.trim())
        ? winner.cover_url.trim()
        : (loser.cover_url && loser.cover_url.trim()) || "";

      // Last-write-wins for chapter, category, notes, status, tier, tags
      const chosenCurrentChapter =
        typeof winner.current_chapter === "number" && !isNaN(winner.current_chapter)
          ? winner.current_chapter
          : Number(loser.current_chapter) || 0;
      const chosenLatestChapter = sanitizeLatestChapter(
        winner.latest_available_chapter ?? loser.latest_available_chapter,
        chosenCurrentChapter
      );
      const chosenCategory = winner.category || loser.category || "การ์ตูนทั่วไป";
      const chosenNotes = winner.notes !== undefined ? winner.notes : loser.notes || "";
      const chosenAltTitle = isSameRecord ? winner.alt_title : (winner.alt_title ?? loser.alt_title);
      const chosenStatus = winner.status || loser.status || "reading";
      const chosenTier = winner.tier || loser.tier || "none";
      const chosenTags = isSameRecord
        ? Array.isArray(winner.tags)
          ? winner.tags
          : []
        : Array.from(new Set([...(winner.tags || []), ...(loser.tags || [])]));

      const mergedManga: Manga = {
        ...loser,
        ...winner,
        id: bestId,
        title: bestTitle,
        alt_title: chosenAltTitle,
        current_chapter: chosenCurrentChapter,
        latest_available_chapter: chosenLatestChapter,
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
        const deletedIds = getDeletedMangaIds();
        const filtered = parsed.filter(
          (m: Manga) => m && !deletedIds.has(m.id) && !deletedIds.has(ensureUUID(m.id || ""))
        );
        return deduplicateMangas(filtered);
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
    const deletedIds = getDeletedMangaIds();
    const filtered = (Array.isArray(mangas) ? mangas : []).filter(
      (m) => m && !deletedIds.has(m.id) && !deletedIds.has(ensureUUID(m.id || ""))
    );
    const deduped = deduplicateMangas(filtered);
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
    const deletedIds = getDeletedMangaIds();
    const serverMangas: Manga[] = (json.data || []).filter(
      (m: Manga) => m && !deletedIds.has(m.id) && !deletedIds.has(ensureUUID(m.id || ""))
    );
    const localMangas = getLocalMangas();

    // Check if there are local mangas on this device that are NOT yet on the server and are NOT junk or duplicates
    const serverIds = new Set(serverMangas.map((m) => m.id));
    const unuploaded = localMangas.filter(
      (m) =>
        !isJunkManga(m) &&
        !deletedIds.has(m.id) &&
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

    // Merge local and server data safely (last-write-wins via updated_at)
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
    let pathname = safeDecodeURIComponent(parsed.pathname);

    // Do not corrupt internal book/read ID URLs like /cartoon/book/714/read/25347
    if (/(?:cartoon|book|read)\/\d+\/read\/\d+/i.test(pathname)) {
      return url;
    }

    // 1. Chapter keyword pattern with word/segment boundaries, matching the LAST chapter token in pathname
    // e.g. /manga/the-witch-2/chapter-10/ -> /manga/the-witch-2/chapter-11/
    const kwRegex = /(^|[\/_-]|(?<![a-zA-Z0-9_]))((?:(?<![a-zA-Z0-9])(?:chapter|ch|ep|episode)|ตอนที่|ตอน)[-_.:/]?)(\d+(?:\.\d+)?)/gi;
    const kwMatches = Array.from(pathname.matchAll(kwRegex));
    if (kwMatches.length > 0) {
      const lastMatch = kwMatches[kwMatches.length - 1];
      const matchIdx = lastMatch.index ?? 0;
      const prefix = lastMatch[1] || "";
      const kwPart = lastMatch[2] || "";
      const fullMatched = lastMatch[0];
      pathname =
        pathname.slice(0, matchIdx) +
        `${prefix}${kwPart}${nextChapter}` +
        pathname.slice(matchIdx + fullMatched.length);
      return `${parsed.origin}${pathname}${parsed.search || ""}`;
    }

    // Guard: If the URL is a 2-segment series root page (/manga/{slug}, /series/{slug}, /comic/{slug}, /content/{slug})
    // without an explicit chapter keyword, do NOT corrupt the series slug or append a bogus segment.
    const segments = pathname.split("/").filter(Boolean);
    if (
      segments.length === 2 &&
      /^(?:manga|series|comics?|content)$/i.test(segments[0])
    ) {
      return url;
    }

    // 2. Leading number in single-segment slug e.g. /14-return-of-the-legend/ -> /15-return-of-the-legend/
    const leadMatch = pathname.match(/^(\/?)(\d+(?:\.\d+)?)([-_][a-zA-Z][^\/]*\/?)$/);
    if (leadMatch) {
      pathname = `${leadMatch[1]}${nextChapter}${leadMatch[3]}`;
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

    return url;
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
    const rawRemoteMangas = await fetchRemoteMangas(client);
    const deletedIds = getDeletedMangaIds();

    // Delete any zombie records on Supabase that were previously deleted locally
    const zombieRemotes = rawRemoteMangas.filter(
      (rm) => deletedIds.has(rm.id) || deletedIds.has(ensureUUID(rm.id))
    );
    for (const z of zombieRemotes) {
      try {
        await deleteRemoteManga(client, z.id);
      } catch {}
    }

    const remoteMangas = rawRemoteMangas.filter(
      (rm) => !deletedIds.has(rm.id) && !deletedIds.has(ensureUUID(rm.id))
    );
    const localMangas = getLocalMangas();

    // Deduplicate combined local and remote using last-write-wins (updated_at)
    const mergedList = deduplicateMangas([...localMangas, ...remoteMangas]);
    saveLocalMangas(mergedList);

    const syncErrors: string[] = [];

    // Push local edits that are newer than remote up to Supabase
    for (const m of mergedList) {
      if (isJunkManga(m) || deletedIds.has(m.id)) continue;
      const remoteItem = remoteMangas.find((rm) => rm.id === m.id || areMangasEquivalent(rm, m));
      if (remoteItem) {
        const mTime = new Date(m.updated_at || 0).getTime();
        const rTime = new Date(remoteItem.updated_at || 0).getTime();
        if (mTime > rTime) {
          try {
            await syncMangaToRemote(client, { ...m, id: remoteItem.id });
          } catch (err: any) {
            console.error("Failed to sync updated manga to Supabase:", m.title, err);
            syncErrors.push(err?.message || "Sync failed");
          }
        }
      } else {
        // Newly created local manga not yet in Supabase
        try {
          await syncMangaToRemote(client, m);
        } catch (err: any) {
          console.error("Failed to sync new manga to Supabase:", m.title, err);
          syncErrors.push(err?.message || "Sync failed");
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

    if (syncErrors.length > 0) {
      lastSyncError = syncErrors[0];
      return { synced: mergedList.length, error: syncErrors[0] };
    }
    lastSyncError = null;
    return { synced: mergedList.length };
  } catch (e: any) {
    console.error("Supabase sync error:", e);
    lastSyncError = e.message || "Supabase sync error";
    return { synced: 0, error: e.message };
  }
}

// Add or update a manga (saves to both Supabase Cloud & LocalStorage)
export async function upsertManga(manga: Manga): Promise<Manga[]> {
  const current = getLocalMangas();
  const incomingUrls = new Set(getNonGenericSourceUrls(manga));

  // Match existing record strictly by ID or exact normalized source URL (never loose substring title)
  const index = current.findIndex((m) => {
    if (m.id === manga.id) return true;
    if (incomingUrls.size > 0) {
      const mUrls = getNonGenericSourceUrls(m);
      if (mUrls.some((u) => incomingUrls.has(u))) return true;
    }
    return false;
  });

  const targetId = index >= 0 ? current[index].id : manga.id;
  removeDeletedMangaId(targetId);
  const now = new Date().toISOString();

  // Deduplicate and normalize sources for targetId
  const fixedSources = deduplicateSources(manga.sources || [], targetId);

  const updatedManga: Manga = normalizeMangaRecord({
    ...(index >= 0 ? current[index] : {}),
    ...manga,
    id: targetId,
    sources: fixedSources,
    updated_at: now,
  });

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
      lastSyncError = null;
    } catch (err: any) {
      console.error("Supabase sync failed in upsertManga:", err);
      lastSyncError = err?.message || "Supabase sync failed";
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

  return getLocalMangas();
}

// Batch add or update multiple mangas at once
export async function upsertMangas(mangasToAdd: Manga[]): Promise<Manga[]> {
  if (mangasToAdd.length === 0) return getLocalMangas();

  const current = getLocalMangas();
  const now = new Date().toISOString();
  const stampedToAdd = mangasToAdd.map((m) => {
    removeDeletedMangaId(m.id);
    return normalizeMangaRecord({
      ...m,
      updated_at: now,
    });
  });

  const newList = deduplicateMangas([...stampedToAdd, ...current]);
  saveLocalMangas(newList);

  // Sync to Supabase
  const client = getSupabaseClient();
  if (client) {
    let batchErr: string | null = null;
    for (const m of stampedToAdd) {
      try {
        await syncMangaToRemote(client, m);
      } catch (err: any) {
        console.error("Supabase batch sync failed for:", m.title, err);
        batchErr = err?.message || "Supabase batch sync failed";
      }
    }
    lastSyncError = batchErr;
  }

  // Push batch to server API in background without overwriting local cache
  try {
    fetch("/api/mangas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stampedToAdd),
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
  addDeletedMangaId(id);
  const current = getLocalMangas();
  const newList = current.filter((m) => m.id !== id && ensureUUID(m.id) !== ensureUUID(id));
  saveLocalMangas(newList);

  if (typeof window !== "undefined") {
    try {
      if (localStorage.getItem("mangahub_last_read_manga_id") === id) {
        localStorage.removeItem("mangahub_last_read_manga_id");
      }
      const rawLogs = localStorage.getItem("mangahub_read_logs");
      if (rawLogs) {
        const logs: ReadLogEntry[] = JSON.parse(rawLogs);
        if (Array.isArray(logs)) {
          const filteredLogs = logs.filter((l) => l.manga_id !== id);
          localStorage.setItem("mangahub_read_logs", JSON.stringify(filteredLogs));
        }
      }
    } catch {}
  }

  try {
    await fetch(`/api/mangas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (err) {
    console.warn("Could not delete from server API:", err);
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      await deleteRemoteManga(client, id);
      lastSyncError = null;
    } catch (err: any) {
      console.error("Remote Supabase delete failed:", err);
      lastSyncError = err?.message || "Remote Supabase delete failed";
    }
  }

  return newList;
}

// Check updates for a manga across all its sources (primary + backups)
export async function checkMangaOnlineUpdate(manga: Manga): Promise<{
  latestChapter: number;
  hasUpdate: boolean;
  foundFromWeb: boolean;
  updatedSources?: MangaSource[];
}> {
  if (!manga.sources || manga.sources.length === 0) {
    return { latestChapter: manga.current_chapter, hasUpdate: false, foundFromWeb: false };
  }

  let maxFoundFromWeb = 0;
  let foundUpdate = false;
  let sourcesChanged = false;
  const clonedSources = manga.sources.map((s) => ({ ...s }));

  // Check all active sources to find the absolute highest chapter available across all web sources!
  const activeSources = clonedSources.filter((s) => s.is_active);
  const sourcesToCheck = activeSources.length > 0 ? activeSources : clonedSources;

  for (const source of sourcesToCheck) {
    const urlToCheck = source.base_url || source.current_chapter_url;
    const fallbackUrl =
      source.current_chapter_url && source.current_chapter_url !== urlToCheck
        ? source.current_chapter_url
        : undefined;
    if (!urlToCheck) continue;

    try {
      const res = await fetch("/api/check-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlToCheck,
          fallbackUrl,
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
          if (
            typeof json.resolvedSeriesUrl === "string" &&
            json.resolvedSeriesUrl &&
            json.resolvedSeriesUrl !== source.base_url
          ) {
            source.base_url = json.resolvedSeriesUrl;
            sourcesChanged = true;
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
    updatedSources: sourcesChanged ? clonedSources : undefined,
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
  const usedCols = new Set<number>();

  // Find column mapping from header: match exact headers first, then prioritized keywords
  const findCol = (keywords: string[]): number => {
    const lowerKeywords = keywords.map((k) => k.toLowerCase());
    // 1. Exact header match
    for (const kw of lowerKeywords) {
      const exactIdx = firstRow.findIndex((h, idx) => !usedCols.has(idx) && h === kw);
      if (exactIdx !== -1) {
        usedCols.add(exactIdx);
        return exactIdx;
      }
    }
    // 2. Substring match in keyword priority order
    for (const kw of lowerKeywords) {
      const subIdx = firstRow.findIndex((h, idx) => !usedCols.has(idx) && h.includes(kw));
      if (subIdx !== -1) {
        usedCols.add(subIdx);
        return subIdx;
      }
    }
    return -1;
  };

  const titleCol = findCol(["ชื่อเรื่อง", "title", "name"]);
  const altTitleCol = findCol(["ชื่อเรื่องรอง (alt title)", "ชื่อเรื่องรอง", "alt_title", "alt", "secondary"]);
  const curChCol = findCol(["ตอนที่อ่านถึง", "ตอนที่อ่าน", "current_chapter", "current", "ch", "chapter"]);
  const latestChCol = findCol(["ตอนล่าสุดบนเว็บ", "ตอนล่าสุด", "latest_available_chapter", "latest", "update"]);
  const statusCol = findCol(["สถานะการอ่าน", "สถานะ", "status"]);
  const tierCol = findCol(["ระดับความชอบ (tier)", "tier", "ระดับ"]);
  const categoryCol = findCol(["หมวดหมู่", "category", "genre"]);
  const notesCol = findCol(["บันทึกช่วยจำ (notes)", "บันทึก", "notes", "note", "memo"]);
  const tagsCol = findCol(["แท็ก", "tags", "tag"]);
  const siteCol = findCol(["เว็บอ่านหลัก", "ชื่อเว็บหลัก", "ชื่อเว็บ", "site_name", "เว็บ", "site", "source"]);
  const curUrlCol = findCol(["ลิงก์ตอนปัจจุบัน", "ตอนปัจจุบัน", "current_chapter_url", "chapter_url", "current_url", "url"]);
  const baseCol = findCol(["ลิงก์หน้าหลักการ์ตูน", "หน้าหลัก", "base_url", "main_url"]);
  const lastReadCol = findCol(["อ่านล่าสุดเมื่อ", "อ่านล่าสุด", "last_read_at", "last_read"]);
  const coverCol = findCol(["ลิงก์รูปหน้าปก", "รูปหน้าปก", "cover_url", "รูป", "cover", "image"]);

  // If first row looked like a header row, start from row 1; else row 0
  const dataRows = titleCol !== -1 ? matrix.slice(1) : matrix;

  const mangas: Manga[] = [];
  const categoriesSet = new Set<string>();

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    const getVal = (col: number, fallbackCol?: number) => {
      if (col >= 0 && row[col] !== undefined) return row[col].trim();
      if (titleCol === -1 && fallbackCol !== undefined && fallbackCol >= 0 && row[fallbackCol] !== undefined) {
        return row[fallbackCol].trim();
      }
      return "";
    };

    const title = getVal(titleCol, 0);
    if (!title) continue;

    const altTitle = getVal(altTitleCol, 1);
    const curChParsed = parseFloat(getVal(curChCol, 2));
    const curChRaw = !isNaN(curChParsed) && curChParsed >= 0 ? curChParsed : 1;
    const latestChParsed = parseFloat(getVal(latestChCol, 3));
    const latestChRaw = !isNaN(latestChParsed) && latestChParsed > 0 ? latestChParsed : undefined;

    // Map status
    const statusRaw = getVal(statusCol, 4).toLowerCase();
    let status: Manga["status"] = "reading";
    if (statusRaw.includes("ดอง") || statusRaw.includes("hold")) {
      status = "on_hold";
    } else if (statusRaw.includes("จบ") || statusRaw.includes("complete")) {
      status = "completed";
    } else if (statusRaw.includes("ดรอป") || statusRaw.includes("เท") || statusRaw.includes("เลิก") || statusRaw.includes("drop")) {
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
    const lastReadRaw = getVal(lastReadCol, 12);
    const coverUrl = getVal(coverCol, 13);

    const sources: MangaSource[] = [];
    if (currentChapterUrl || baseUrl) {
      sources.push({
        id: `src-${Date.now()}-${idx}`,
        site_name: siteName,
        base_url: baseUrl || currentChapterUrl,
        current_chapter_url: currentChapterUrl || baseUrl,
        is_primary: true,
        is_active: true,
      });
    }

    const now = new Date().toISOString();
    const parsedLastRead =
      lastReadRaw && !isNaN(new Date(lastReadRaw).getTime())
        ? new Date(lastReadRaw).toISOString()
        : now;

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
      last_read_at: parsedLastRead,
      created_at: now,
      updated_at: now,
    });
  }

  return { mangas, categories: Array.from(categoriesSet) };
}

// Normalize arbitrary imported/restored manga objects safely
export function normalizeImportedMangas(items: any[]): Manga[] {
  if (!Array.isArray(items)) return [];
  const now = new Date().toISOString();
  return items
    .filter((m) => m && typeof m === "object" && typeof m.title === "string" && m.title.trim().length > 0)
    .map((m, idx) => {
      const id = (typeof m.id === "string" && m.id.trim()) || `manga-imp-${Date.now()}-${idx}`;
      const curCh = Number(m.current_chapter);
      const safeCurCh = !isNaN(curCh) && curCh >= 0 ? curCh : 1;
      const latestCh = m.latest_available_chapter !== undefined && m.latest_available_chapter !== null
        ? Number(m.latest_available_chapter)
        : undefined;
      return normalizeMangaRecord({
        ...m,
        id,
        title: m.title.trim(),
        cover_url: typeof m.cover_url === "string" ? m.cover_url : "",
        current_chapter: safeCurCh,
        latest_available_chapter: sanitizeLatestChapter(latestCh, safeCurCh),
        status: ["reading", "on_hold", "completed", "dropped", "plan_to_read"].includes(m.status)
          ? m.status
          : "reading",
        tier: ["S", "A", "B", "C", "D", "none"].includes(m.tier) ? m.tier : "none",
        category: m.category || "การ์ตูนทั่วไป",
        tags: Array.isArray(m.tags) ? m.tags : [],
        sources: deduplicateSources(Array.isArray(m.sources) ? m.sources : [], id),
        last_read_at: m.last_read_at && !isNaN(new Date(m.last_read_at).getTime()) ? m.last_read_at : now,
        created_at: m.created_at && !isNaN(new Date(m.created_at).getTime()) ? m.created_at : now,
        updated_at: m.updated_at && !isNaN(new Date(m.updated_at).getTime()) ? m.updated_at : now,
      });
    });
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

    let importedMangas: any[] = [];
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

    const validMangas = normalizeImportedMangas(importedMangas);

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
      const oldLocal = getLocalMangas();
      finalList = deduplicateMangas(validMangas);
      const keepUuids = new Set(finalList.map((m) => ensureUUID(m.id)));
      oldLocal.forEach((oldM) => {
        if (!keepUuids.has(ensureUUID(oldM.id))) {
          addDeletedMangaId(oldM.id);
        }
      });
      finalList.forEach((newM) => removeDeletedMangaId(newM.id));
      saveLocalMangas(finalList);
    } else {
      validMangas.forEach((newM) => removeDeletedMangaId(newM.id));
      const current = getLocalMangas();
      finalList = deduplicateMangas([...validMangas, ...current]);
      saveLocalMangas(finalList);
    }

    // If syncSupabase is requested, sync with remote (and delete old records in replace mode)
    if (options.syncSupabase) {
      const client = getSupabaseClient();
      if (client) {
        if (options.mode === "replace") {
          try {
            const { data: existingRemote } = await client.from("mangas").select("id");
            const keepUuids = new Set(finalList.map((m) => ensureUUID(m.id)));
            const toDelete = (existingRemote || [])
              .map((r: any) => r.id)
              .filter((id: string) => !keepUuids.has(id));
            if (toDelete.length > 0) {
              await client.from("mangas").delete().in("id", toDelete);
            }
          } catch (err) {
            console.error("Failed to clean old remote mangas on replace restore:", err);
          }
        }

        const listToSync = options.mode === "replace" ? finalList : validMangas;
        for (let i = 0; i < listToSync.length; i++) {
          try {
            await syncMangaToRemote(client, listToSync[i]);
          } catch (err) {
            console.error("Supabase restore sync failed for:", listToSync[i].title, err);
          }
          if (onProgress) {
            onProgress(i + 1, listToSync.length);
          }
        }
      }
    }

    // Push to server API (using ?mode=replace when replacing)
    try {
      const endpoint = options.mode === "replace" ? "/api/mangas?mode=replace" : "/api/mangas";
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalList),
      });
    } catch {}

    return { success: true, count: finalList.length };
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
  const initialMangas = getLocalMangas();
  const candidates = initialMangas.filter((m) => isCoverNeedingEnrichment(m.cover_url));

  if (candidates.length === 0) {
    return { updatedCount: 0, totalCandidates: 0, errors: 0 };
  }

  let updatedCount = 0;
  let errors = 0;

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
          // Always read fresh local mangas before saving so concurrent user edits aren't overwritten
          const freshMangas = getLocalMangas();
          const currentTarget = freshMangas.find((m) => m.id === manga.id);
          if (currentTarget) {
            const updated: Manga = {
              ...currentTarget,
              cover_url: json.bestCover,
              updated_at: new Date().toISOString(),
            };
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

  return { updatedCount, totalCandidates: candidates.length, errors };
}


