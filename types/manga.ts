export type ReadingStatus = 'reading' | 'on_hold' | 'completed' | 'plan_to_read';

export type TierRating = 'S' | 'A' | 'B' | 'C' | 'D' | 'none';

export interface MangaSource {
  id: string;
  manga_id?: string;
  site_name: string;        // e.g. "Up-Manga", "Slow-Manga", "Chibi-Manga"
  base_url: string;         // e.g. "https://www.up-manga.com/manga/nano-machine"
  current_chapter_url: string; // direct link: "https://www.up-manga.com/manga/nano-machine/118"
  is_primary: boolean;      // Default site to open on 1-Tap Read
  is_active: boolean;       // If site is alive or dead
}

export interface Manga {
  id: string;
  title: string;
  alt_title?: string;
  cover_url: string;
  current_chapter: number;
  latest_available_chapter?: number;
  status: ReadingStatus;
  tier: TierRating;
  category?: string;        // e.g. "การ์ตูนทั่วไป", "Dojin", "NTR"
  notes?: string;
  sources: MangaSource[];
  last_read_at: string;     // ISO timestamp
  created_at: string;       // ISO timestamp
  updated_at: string;       // ISO timestamp
}

export const DEFAULT_CATEGORIES = [
  "การ์ตูนทั่วไป",
  "Dojin",
  "NTR",
];

export interface ScrapedMangaData {
  title: string;
  cover_url: string;
  current_chapter?: number;
  site_name: string;
  original_url: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
}

export interface MangaBackupData {
  app: string;
  version: number;
  exportedAt: string;
  stats?: {
    totalMangas: number;
    totalSources: number;
    totalCategories?: number;
  };
  categories?: string[];
  mangas: Manga[];
}

export type CloudSyncStatus = "synced" | "syncing" | "offline" | "disabled";


