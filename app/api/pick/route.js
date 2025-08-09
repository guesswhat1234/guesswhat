import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ suggestions: [] });

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      // 盡量避免 Vercel/Edge 快取與被擋
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error("suggest failed");
    const arr = await res.json(); // ["q", ["s1","s2",...]]
    const list = Array.isArray(arr?.[1]) ? arr[1] : [];
    const seen = new Set();
    const suggestions = [];
    for (const s of list) {
      const t = String(s || "").trim();
      if (t.length < 2 || t.length > 50) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      suggestions.push(t);
      if (suggestions.length >= 10) break;
    }
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
