import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

// 從 YouTube 搜尋關鍵字，回傳「相似歌手/團體」名稱（以 channelTitle 為主）
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ suggestions: [] });

  const key = process.env.YT_API_KEY;
  const region = process.env.REGION_CODE || "TW";
  const lang = process.env.RELEVANCE_LANGUAGE || "zh-Hant";
  if (!key) return NextResponse.json({ suggestions: [] });

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("key", key);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("videoCategoryId", "10");
    url.searchParams.set("maxResults", "25");
    url.searchParams.set("q", q);
    url.searchParams.set("regionCode", region);
    url.searchParams.set("relevanceLanguage", lang);
    url.searchParams.set("fields", "items(snippet/channelTitle)");

    const r = await fetch(url.toString());
    if (!r.ok) throw new Error("yt search fail");
    const j = await r.json();

    const seen = new Map();
    for (const it of j.items || []) {
      const name = (it?.snippet?.channelTitle || "").trim();
      if (!name) continue;
      seen.set(name, (seen.get(name) || 0) + 1);
    }
    // 依頻率排序，排除與原關鍵字完全相同大小寫的名稱
    const base = q.toLowerCase();
    const list = Array.from(seen.entries())
      .filter(([name]) => name.toLowerCase() !== base)
      .sort((a,b)=> b[1]-a[1])
      .map(([name]) => name)
      .slice(0, 8);

    // 取前 4 個；若不足，用 fallback
    const suggestions = (list.length >= 4 ? list.slice(0,4)
      : [...list, `${q} 經典`, `${q} 熱門`, `${q} 合作`].slice(0,4));

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [`${q} 經典`, `${q} 熱門`, `${q} 合作`, `${q} 精選`] });
  }
}
