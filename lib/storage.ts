import { Manga, MangaSource } from "@/types/manga";
import { getSupabaseClient, syncMangaToRemote, deleteRemoteManga, fetchRemoteMangas } from "./supabase";

const LOCAL_STORAGE_KEY = "mangahub_local_mangas";

// Helper to normalize manga title for robust duplicate detection
export function normalizeTitle(title: string): string {
  return (title || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

// Helper to remove duplicates across ID, normalized title, and primary source URL
export function deduplicateMangas(mangas: Manga[]): Manga[] {
  if (!Array.isArray(mangas)) return [];
  const result: Manga[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Map<string, Manga>();
  const seenUrls = new Map<string, Manga>();

  for (const m of mangas) {
    if (!m || !m.title) continue;
    const normTitle = normalizeTitle(m.title);
    const primaryUrl = (
      m.sources?.find((s) => s.is_primary)?.base_url ||
      m.sources?.[0]?.base_url ||
      ""
    )
      .toLowerCase()
      .replace(/\/$/, "");

    let existing: Manga | undefined = undefined;
    if (seenIds.has(m.id)) {
      existing = result.find((x) => x.id === m.id);
    } else if (normTitle && seenTitles.has(normTitle)) {
      existing = seenTitles.get(normTitle);
    } else if (primaryUrl && seenUrls.has(primaryUrl)) {
      existing = seenUrls.get(primaryUrl);
    }

    if (!existing) {
      seenIds.add(m.id);
      if (normTitle) seenTitles.set(normTitle, m);
      if (primaryUrl) seenUrls.set(primaryUrl, m);
      result.push(m);
    } else {
      // Merge best attributes
      const isUuid = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const bestId = isUuid(existing.id)
        ? existing.id
        : isUuid(m.id)
        ? m.id
        : existing.id;

      const useCurrent =
        new Date(m.updated_at || 0).getTime() >
        new Date(existing.updated_at || 0).getTime();
      const baseWinner = useCurrent ? m : existing;

      // Merge sources cleanly without duplicate URLs
      const combinedSources = [...(existing.sources || [])];
      (m.sources || []).forEach((s) => {
        const hasMatch = combinedSources.some(
          (cs) =>
            (cs.base_url && s.base_url && cs.base_url.toLowerCase() === s.base_url.toLowerCase()) ||
            (cs.site_name && s.site_name && cs.site_name === s.site_name)
        );
        if (!hasMatch) combinedSources.push(s);
      });

      const mergedManga: Manga = {
        ...baseWinner,
        id: bestId,
        current_chapter: Math.max(existing.current_chapter || 0, m.current_chapter || 0),
        latest_available_chapter:
          Math.max(existing.latest_available_chapter || 0, m.latest_available_chapter || 0) ||
          undefined,
        sources: combinedSources,
        notes: existing.notes || m.notes,
        category: existing.category || m.category,
        cover_url: existing.cover_url || m.cover_url,
        updated_at: new Date(
          Math.max(
            new Date(existing.updated_at || 0).getTime(),
            new Date(m.updated_at || 0).getTime()
          )
        ).toISOString(),
      };

      const targetIdx = result.findIndex((x) => x.id === existing!.id);
      if (targetIdx >= 0) {
        result[targetIdx] = mergedManga;
      }
      seenIds.add(bestId);
      if (normTitle) seenTitles.set(normTitle, mergedManga);
      if (primaryUrl) seenUrls.set(primaryUrl, mergedManga);
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

// Fetch from Server API and merge with LocalStorage (Auto-Migrates any iPhone local data)
export async function syncWithServer(): Promise<Manga[]> {
  try {
    const res = await fetch("/api/mangas");
    if (!res.ok) throw new Error("Failed to fetch from server");
    const json = await res.json();
    const serverMangas: Manga[] = json.data || [];

    const localMangas = getLocalMangas();

    // Check if there are local mangas on this device that are NOT yet on the server
    const serverIds = new Set(serverMangas.map((m) => m.id));
    const unuploaded = localMangas.filter((m) => !serverIds.has(m.id));

    if (unuploaded.length > 0) {
      // Automatically push newly added local mangas (from iPhone) to server!
      try {
        const postRes = await fetch("/api/mangas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(unuploaded),
        });
        if (postRes.ok) {
          const postJson = await postRes.json();
          const merged: Manga[] = postJson.data || serverMangas;
          saveLocalMangas(merged);
          return merged;
        }
      } catch (err) {
        console.error("Failed to push local unuploaded mangas to server:", err);
      }
    }

    // Merge server data with local cache safely
    const merged = deduplicateMangas([...serverMangas, ...localMangas]);
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
    const chapterRegex = /((?:chapter|ch|ep|episode|ตอนที่|ตอน)[-_/]?)(\d+(?:\.\d+)?)/i;
    if (chapterRegex.test(url)) {
      return url.replace(chapterRegex, `$1${nextChapter}`);
    }
    const endNumberRegex = /(\/)(\d+(?:\.\d+)?)\/?$/;
    if (endNumberRegex.test(url)) {
      return url.replace(endNumberRegex, `$1${nextChapter}`);
    }
    return `${url.replace(/\/$/, "")}/${nextChapter}`;
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

    // Deduplicate combined remote and local by ID, title, and source URL
    const mergedList = deduplicateMangas([...remoteMangas, ...localMangas]);
    saveLocalMangas(mergedList);

    // Also push merged to local server cache
    try {
      await fetch("/api/mangas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mergedList),
      });
    } catch {}

    // Only push items to remote that are truly new or updated locally
    for (const m of mergedList) {
      const remoteItem = remoteMangas.find((rm) => rm.id === m.id);
      if (!remoteItem || new Date(m.updated_at).getTime() > new Date(remoteItem.updated_at).getTime()) {
        await syncMangaToRemote(client, m);
      }
    }

    return { synced: mergedList.length };
  } catch (e: any) {
    console.error("Supabase sync error:", e);
    return { synced: 0, error: e.message };
  }
}

// Add or update a manga (saves to both Server & LocalStorage)
export async function upsertManga(manga: Manga): Promise<Manga[]> {
  const current = getLocalMangas();
  const index = current.findIndex((m) => m.id === manga.id);
  const updatedManga: Manga = {
    ...manga,
    updated_at: new Date().toISOString(),
  };

  let newList: Manga[];
  if (index >= 0) {
    newList = [...current];
    newList[index] = updatedManga;
  } else {
    newList = [updatedManga, ...current];
  }

  saveLocalMangas(newList);

  // Push to server database
  try {
    const res = await fetch("/api/mangas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedManga),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        saveLocalMangas(json.data);
        return json.data;
      }
    }
  } catch (err) {
    console.warn("Could not save to server API, saved to local cache:", err);
  }

  // Background sync if connected to Supabase
  const client = getSupabaseClient();
  if (client) {
    syncMangaToRemote(client, updatedManga).catch((err) =>
      console.error("Background Supabase sync failed:", err)
    );
  }

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

  // Push batch to server API
  try {
    const res = await fetch("/api/mangas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mangasToAdd),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        saveLocalMangas(json.data);
      }
    }
  } catch (err) {
    console.warn("Could not save batch to server API:", err);
  }

  // Background sync each to Supabase
  const client = getSupabaseClient();
  if (client) {
    for (const m of mangasToAdd) {
      syncMangaToRemote(client, m).catch((err) =>
        console.error("Background batch Supabase sync failed for:", m.title, err)
      );
    }
  }

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
