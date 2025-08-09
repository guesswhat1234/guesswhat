import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// YouTube suggest endpoint（免金鑰）
// 備註：若未來封鎖，會回退用 Data API 搜尋標題/頻道做簡單關聯。
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ suggestions: [] });

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error("suggest failed");
    const arr = await res.json(); // ["q", ["s1","s2",...]]
    const list = Array.isArray(arr?.[1]) ? arr[1] : [];
    // 簡單過濾：長度 2~40，去重
    const seen = new Set();
    const suggestions = [];
    for (const s of list) {
      const t = String(s || "").trim();
      if (t.length < 2 || t.length > 40) continue;
      if (seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      suggestions.push(t);
      if (suggestions.length >= 8) break;
    }
    return NextResponse.json({ suggestions });
  } catch(e) {
    // 失敗就回空清單
    return NextResponse.json({ suggestions: [] });
  }
}
