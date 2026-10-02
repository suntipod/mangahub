import { NextRequest, NextResponse } from "next/server";
import { findBestCovers } from "@/lib/cover-search";

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

    const { bestCover, cleanQuery, results } = await findBestCovers(queryTitle);

    return NextResponse.json({
      success: true,
      query: queryTitle,
      cleanQuery,
      bestCover,
      results,
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
