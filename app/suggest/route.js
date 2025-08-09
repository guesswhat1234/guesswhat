import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 取 YouTube 關聯建議（免金鑰）
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ suggestions: [] });

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error("suggest failed");
    const json = await res.json(); // ["query", ["s1","s2",...]]
    const list = Array.isArray(json?.[1]) ? json[1] : [];
    const seen = new Set();
    const suggestions = [];
    for (const s of list) {
      const t = String(s || "").trim();
      if (t.length < 2 || t.length > 40) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      suggestions.push(t);
      if (suggestions.length >= 4) break;
    }
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
