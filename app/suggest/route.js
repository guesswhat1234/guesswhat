import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const looksLikeArtist = (s="") => {
  const t = s.toLowerCase();
  // 排除泛詞
  if (/(mv|lyrics?|歌詞|完整版|官方|official|reaction|cover|翻唱|現場|live|舞台|舞蹈|remix|audio|shorts)/i.test(t)) return false;
  // 偏向姓名/團名：含空白、含非拉丁（中/日/韓）或首字大寫等
  if (/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(s)) return true;
  if (/\s/.test(s)) return true;
  if (/^[A-Z][a-z]/.test(s)) return true;
  // 長度門檻
  return s.length >= 2 && s.length <= 24;
};

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

    const out = [];
    const seen = new Set();
    for (const s of list) {
      const t = String(s || "").trim();
      if (!t) continue;
      if (seen.has(t.toLowerCase())) continue;
      if (!looksLikeArtist(t)) continue;
      seen.add(t.toLowerCase());
      out.push(t);
      if (out.length >= 8) break; // 先拿 8，前端再取 4
    }
    return NextResponse.json({ suggestions: out });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
