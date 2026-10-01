import { Manga, MangaSource } from "@/types/manga";
import { getSupabaseClient, syncMangaToRemote, deleteRemoteManga, fetchRemoteMangas } from "./supabase";

const LOCAL_STORAGE_KEY = "mangahub_local_mangas";

export function getLocalMangas(): Manga[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
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
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mangas));
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

    // Merge server data with local cache
    saveLocalMangas(serverMangas);
    return serverMangas;
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

    const mergedMap = new Map<string, Manga>();
    localMangas.forEach((m) => mergedMap.set(m.id, m));

    remoteMangas.forEach((rm) => {
      const local = mergedMap.get(rm.id);
      if (!local || new Date(rm.updated_at) > new Date(local.updated_at)) {
        mergedMap.set(rm.id, rm);
      }
    });

    const mergedList = Array.from(mergedMap.values());
    saveLocalMangas(mergedList);

    // Also push merged to local server
    try {
      await fetch("/api/mangas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mergedList),
      });
    } catch {}

    // Push all to remote
    for (const m of mergedList) {
      await syncMangaToRemote(client, m);
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
  const currentMap = new Map<string, Manga>();
  current.forEach((m) => currentMap.set(m.id, m));

  const now = new Date().toISOString();
  mangasToAdd.forEach((m) => {
    currentMap.set(m.id, {
      ...m,
      updated_at: now,
    });
  });

  const newList = Array.from(currentMap.values());
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

// Check updates for a single manga from its online source
export async function checkMangaOnlineUpdate(manga: Manga): Promise<{ latestChapter: number; hasUpdate: boolean }> {
  const primarySource = manga.sources.find((s) => s.is_primary) || manga.sources[0];
  const urlToCheck = primarySource?.base_url || primarySource?.current_chapter_url;

  if (!urlToCheck) {
    return { latestChapter: manga.current_chapter, hasUpdate: false };
  }

  try {
    const res = await fetch("/api/check-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: urlToCheck,
        currentChapter: manga.current_chapter,
      }),
    });
    if (!res.ok) throw new Error("API check failed");
    const json = await res.json();
    if (json.success && typeof json.latestChapter === "number") {
      return {
        latestChapter: json.latestChapter,
        hasUpdate: json.hasUpdate,
      };
    }
  } catch (e) {
    console.error(`Check update failed for ${manga.title}:`, e);
  }

  return { latestChapter: manga.current_chapter, hasUpdate: false };
}
