// Clean raw title and extract search keywords for manga databases
export function extractSearchCandidates(rawTitle: string): string[] {
  if (!rawTitle) return [];

  // Remove common website suffixes, chapter patterns, and translation notes
  let cleaned = rawTitle
    .replace(/\s*[-–|•]\s*[\w\s.-]+(?:com|net|org|xyz|to|in|co|app)\s*$/gi, "")
    .replace(
      /\s*[-–|•]\s*(?:ReadRealm|SING-MANGA|Up-Manga|Slow-Manga|Dark-Manga|Go-Manga|Ped-Manga|Zen-Manga|Nano-Manga|Murim|MyNovel|Niceoppai|ReadToon|Kairew|Pengi|DukeToon|Public Manga).*/gi,
      ""
    )
    .replace(/(?:ตอนที่|ch|chapter|ep|episode)\s*\d+(?:\.\d+)?/gi, "")
    .replace(/แปลไทย|จบแล้ว|จบss\d*|มังงะออนไลน์|อ่านออนไลน์|มังฮวา|มังงะ/gi, "")
    .replace(/\((?:Remake|นิยาย|ฉบับการ์ตูน|มังงะ|Webtoon|Manhwa)[^)]*\)/gi, "")
    .replace(/\|\s*[^|]+$/g, "")
    .trim();

  const candidates: string[] = [];

  // 1. Extract English/Romaji words (at least 3 characters)
  const englishMatches = cleaned.match(/[a-zA-Z0-9\s':,-]{3,}/g);
  if (englishMatches) {
    for (const match of englishMatches) {
      const trimmed = match.replace(/[_\-:]/g, " ").replace(/\s+/g, " ").trim();
      if (trimmed.length >= 3 && !candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }
    }
  }

  // 2. Full cleaned title without Thai-specific brackets/symbols
  const fullClean = cleaned.replace(/[_\-:]/g, " ").replace(/\s+/g, " ").trim();
  if (fullClean && !candidates.includes(fullClean)) {
    candidates.push(fullClean);
  }

  // 3. Variations (e.g. "Leveling Up with the Gods" -> "Level Up with the Gods", "Leveling with the Gods")
  const variations: string[] = [];
  for (const c of candidates) {
    if (/\bleveling\s+up\b/i.test(c)) {
      variations.push(c.replace(/\bleveling\s+up\b/i, "Level Up"));
      variations.push(c.replace(/\bleveling\s+up\b/i, "Leveling"));
    }
    if (/\bacademys\b/i.test(c)) {
      variations.push(c.replace(/\bacademys\b/i, "Academy's"));
    }
    if (/\bfallen\s+family\b/i.test(c)) {
      variations.push(c.replace(/\bfallen\s+family\b/i, "Fallen Family"));
    }
  }

  for (const v of variations) {
    if (!candidates.includes(v)) {
      candidates.push(v);
    }
  }

  return candidates;
}

export interface CoverSearchResult {
  title: string;
  coverUrl: string;
  source: string;
}

// 1. Search AniList (High quality official manga/manhwa posters)
export async function searchAniList(query: string): Promise<CoverSearchResult[]> {
  try {
    const anilistQuery = `
      query ($search: String) {
        Page(page: 1, perPage: 3) {
          media(search: $search, type: MANGA) {
            id
            title {
              english
              romaji
              native
            }
            coverImage {
              extraLarge
              large
            }
          }
        }
      }
    `;

    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: anilistQuery,
        variables: { search: query },
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const media = data?.data?.Page?.media || [];
    return media
      .map((m: any) => {
        const img = m.coverImage?.extraLarge || m.coverImage?.large;
        const title = m.title?.english || m.title?.romaji || m.title?.native || query;
        return {
          title,
          coverUrl: img,
          source: "AniList (HD)",
        };
      })
      .filter((r: CoverSearchResult) => Boolean(r.coverUrl));
  } catch {
    return [];
  }
}

// 2. Search Kitsu API (High-res Manhwa/Manga posters with Romanized Korean titles)
export async function searchKitsu(query: string): Promise<CoverSearchResult[]> {
  try {
    const res = await fetch(
      `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(query)}&page[limit]=3`,
      {
        headers: { Accept: "application/vnd.api+json" },
        signal: AbortSignal.timeout(4000),
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || [])
      .map((item: any) => {
        const title =
          item.attributes?.canonicalTitle ||
          item.attributes?.titles?.en ||
          item.attributes?.titles?.en_jp ||
          query;
        const img =
          item.attributes?.posterImage?.large ||
          item.attributes?.posterImage?.original ||
          item.attributes?.posterImage?.medium;
        return {
          title,
          coverUrl: img,
          source: "Kitsu (HD)",
        };
      })
      .filter((r: CoverSearchResult) => Boolean(r.coverUrl));
  } catch {
    return [];
  }
}

// 3. Search MangaDex API (512px cover art)
export async function searchMangaDex(query: string): Promise<CoverSearchResult[]> {
  try {
    const res = await fetch(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=3&includes[]=cover_art`,
      { signal: AbortSignal.timeout(4000) }
    );

    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || [])
      .map((m: any) => {
        const coverRel = m.relationships?.find((r: any) => r.type === "cover_art");
        const fileName = coverRel?.attributes?.fileName;
        const coverUrl = fileName
          ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.512.jpg`
          : "";
        const title =
          m.attributes?.title?.en ||
          Object.values(m.attributes?.title || {})[0] ||
          query;
        return {
          title: String(title),
          coverUrl,
          source: "MangaDex (HD)",
        };
      })
      .filter((r: CoverSearchResult) => Boolean(r.coverUrl));
  } catch {
    return [];
  }
}

// 4. Search DuckDuckGo Images (Direct Thai / Manhwa Poster search)
export async function searchDDGImages(query: string): Promise<CoverSearchResult[]> {
  try {
    const q = `${query} มังงะ poster cover`;
    const tokenRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!tokenRes.ok) return [];
    const html = await tokenRes.text();
    const vqdMatch = html.match(/vqd=['"]?([0-9-]+)['"]?/i) || html.match(/vqd=([0-9-]+)/);
    if (!vqdMatch) return [];

    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(q)}&vqd=${vqdMatch[1]}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://duckduckgo.com/",
        },
        signal: AbortSignal.timeout(4000),
      }
    );

    if (!imgRes.ok) return [];
    const imgData = await imgRes.json();
    return (imgData.results || [])
      .slice(0, 6)
      .map((r: any) => ({
        title: r.title,
        coverUrl: r.image,
        source: "Web Search (HD)",
      }))
      .filter((r: CoverSearchResult) => Boolean(r.coverUrl) && !r.coverUrl.includes("favicon"));
  } catch {
    return [];
  }
}

// Orchestrator to find all best covers for a given raw title
export async function findBestCovers(rawTitle: string): Promise<{
  bestCover: string;
  cleanQuery: string;
  results: CoverSearchResult[];
}> {
  const candidates = extractSearchCandidates(rawTitle);
  const cleanQuery = candidates[0] || rawTitle;
  const results: CoverSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const keyword of candidates.slice(0, 3)) {
    const [ani, kitsu, md] = await Promise.all([
      searchAniList(keyword),
      searchKitsu(keyword),
      searchMangaDex(keyword),
    ]);

    for (const item of [...ani, ...kitsu, ...md]) {
      if (!seenUrls.has(item.coverUrl)) {
        seenUrls.add(item.coverUrl);
        results.push(item);
      }
    }

    if (results.length >= 4) break;
  }

  // Fallback to web search if fewer than 2 results or pure Thai
  if (results.length < 2) {
    const webResults = await searchDDGImages(candidates[0] || rawTitle);
    for (const item of webResults) {
      if (!seenUrls.has(item.coverUrl)) {
        seenUrls.add(item.coverUrl);
        results.push(item);
      }
    }
  }

  const bestCover = results.length > 0 ? results[0].coverUrl : "";

  return {
    bestCover,
    cleanQuery,
    results,
  };
}
