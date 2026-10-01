import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryTitle = searchParams.get("title")?.trim();

    if (!queryTitle) {
      return NextResponse.json(
        { success: false, error: "กรุณาระบุชื่อเรื่องที่ต้องการค้นหา" },
        { status: 400 }
      );
    }

    const results: Array<{
      title: string;
      coverUrl: string;
      source: string;
    }> = [];

    // 1. Search AniList (High quality manga/manhwa posters)
    const anilistQuery = `
      query ($search: String) {
        Page(page: 1, perPage: 5) {
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

    try {
      const aniRes = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: anilistQuery,
          variables: { search: queryTitle },
        }),
        next: { revalidate: 3600 },
      });

      if (aniRes.ok) {
        const aniData = await aniRes.json();
        const mediaList = aniData?.data?.Page?.media || [];
        for (const item of mediaList) {
          const img = item.coverImage?.extraLarge || item.coverImage?.large;
          if (img) {
            const bestTitle =
              item.title?.english || item.title?.romaji || item.title?.native || queryTitle;
            results.push({
              title: bestTitle,
              coverUrl: img,
              source: "AniList (HD)",
            });
          }
        }
      }
    } catch (err) {
      console.warn("AniList search error:", err);
    }

    // 2. Search MangaDex as backup/secondary
    try {
      const mdRes = await fetch(
        `https://api.mangadex.org/manga?title=${encodeURIComponent(
          queryTitle
        )}&limit=4&includes[]=cover_art`,
        { next: { revalidate: 3600 } }
      );

      if (mdRes.ok) {
        const mdData = await mdRes.json();
        const mdList = mdData?.data || [];
        for (const m of mdList) {
          const coverRel = m.relationships?.find((r: any) => r.type === "cover_art");
          const fileName = coverRel?.attributes?.fileName;
          if (fileName) {
            const coverUrl = `https://uploads.mangadex.org/covers/${m.id}/${fileName}.512.jpg`;
            const title =
              m.attributes?.title?.en ||
              Object.values(m.attributes?.title || {})[0] ||
              queryTitle;
            results.push({
              title: String(title),
              coverUrl,
              source: "MangaDex (HD)",
            });
          }
        }
      }
    } catch (err) {
      console.warn("MangaDex search error:", err);
    }

    // Deduplicate by coverUrl
    const seen = new Set<string>();
    const uniqueResults = results.filter((r) => {
      if (seen.has(r.coverUrl)) return false;
      seen.add(r.coverUrl);
      return true;
    });

    return NextResponse.json({
      success: true,
      query: queryTitle,
      results: uniqueResults,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "เกิดข้อผิดพลาดในการค้นหารูปปก",
      },
      { status: 500 }
    );
  }
}
