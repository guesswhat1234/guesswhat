import { NextResponse } from "next/server";

// utils
const ISO8601toSeconds = (iso) => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || 0, 10);
  const min = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  return h * 3600 + min * 60 + s;
};
const clean = (s = "") => s.replace(/\s*\(.*?\)|\s*\[.*?\]/g, "").trim();
const norm = (s = "") => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
const pickRand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// 像官方 MV 的判斷（加分 / 減分）
const looksLikeMV = (title, desc, channel) => {
  const include = /(official|music\s*video|mv|官方|完整版)/i.test(title)
               || /(official|music\s*video|mv|官方)/i.test(desc || "")
               || /vevo|official/i.test(channel || "");
  const exclude = /(lyric|lyrics|舞蹈|dance|cover|翻唱|reaction|reac|live|現場|舞台|彩排|teaser|trailer|audio|full album|topic)/i.test(title);
  return include && !exclude;
};

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const kw = (searchParams.get("kw") || "").trim();
  if (!kw) return NextResponse.json({ error: "Missing kw" }, { status: 400 });

  const key = process.env.YT_API_KEY;
  const region = process.env.REGION_CODE || "TW";
  const lang = process.env.RELEVANCE_LANGUAGE || "zh-Hant";
  if (!key) return NextResponse.json({ error: "Missing YT_API_KEY" }, { status: 500 });

  // 1) search
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("key", key);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoCategoryId", "10"); // Music
  searchUrl.searchParams.set("maxResults", "40");
  searchUrl.searchParams.set("safeSearch", "moderate");
  searchUrl.searchParams.set("regionCode", region);
  searchUrl.searchParams.set("relevanceLanguage", lang);
  searchUrl.searchParams.set("q", kw);

  const sRes = await fetch(searchUrl.toString());
  if (!sRes.ok) return NextResponse.json({ error: "YouTube search failed" }, { status: 502 });
  const sJson = await sRes.json();
  const ids = (sJson.items || []).map(i => i.id?.videoId).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "No results" }, { status: 404 });

  // 2) videos
  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("key", key);
  videosUrl.searchParams.set("part", "contentDetails,snippet");
  videosUrl.searchParams.set("id", ids.join(","));
  const vRes = await fetch(videosUrl.toString());
  if (!vRes.ok) return NextResponse.json({ error: "YouTube videos lookup failed" }, { status: 502 });
  const vJson = await vRes.json();

  // 3) 篩選：≥120 秒，且更像官方 MV
  const all = (vJson.items || []).map(v => {
    const duration = ISO8601toSeconds(v.contentDetails?.duration || "PT0S");
    const title = v.snippet?.title || "";
    const desc = v.snippet?.description || "";
    const channel = v.snippet?.channelTitle || "";
    const score =
      (looksLikeMV(title, desc, channel) ? 2 : 0) +
      (/vevo|official/i.test(channel) ? 1 : 0) +
      (/(official|mv|music\s*video|官方)/i.test(title) ? 1 : 0);
    return { raw: v, duration, title, desc, channel, score };
  }).filter(x => x.duration >= 120);

  if (!all.length) return NextResponse.json({ error: "No playable candidates" }, { status: 404 });

  const sorted = all.sort((a,b)=> b.score - a.score);
  const pool = sorted.slice(0, 15);

  // 4) 正解
  const pick = pickRand(pool);
  const answerTitle = clean(pick.title);
  const parseArtist = (title, channel) => {
    if (title.includes(" - ")) {
      const left = title.split(" - ")[0].trim();
      if (left && left.length <= 60) return left;
    }
    return channel || "";
  };
  const answerArtist = parseArtist(pick.title, pick.channel);

  // 5) 生成 3 個干擾選項
  const distractors = [];
  for (const cand of pool) {
    if (distractors.length >= 3) break;
    const t = clean(cand.title);
    const a = parseArtist(cand.title, cand.channel);
    if (norm(t) === norm(answerTitle) && norm(a) === norm(answerArtist)) continue;
    if (norm(a) === norm(answerArtist)) continue; // 盡量不同歌手
    if (distractors.find(x => norm(x.title) === norm(t))) continue;
    distractors.push({ title: t, artist: a });
  }
  while (distractors.length < 3) distractors.push({ title: "—", artist: "—" });

  const choices = [{ title: answerTitle, artist: answerArtist }, ...distractors.slice(0,3)]
    .sort(() => Math.random() - 0.5);
  const correctIndex = choices.findIndex(c => norm(c.title) === norm(answerTitle) && norm(c.artist) === norm(answerArtist));

  // 6) 隨機時間（避開片頭片尾）
  const t = Math.floor(clamp(pick.duration * (0.25 + Math.random() * 0.5), 1, Math.max(1, pick.duration - 1)));

  return NextResponse.json({
    videoId: pick.raw.id,
    duration: pick.duration,
    t,
    answerTitle,
    answerArtist,
    choices,
    correctIndex
  });
}
