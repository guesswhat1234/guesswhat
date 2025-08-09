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
const parseArtist = (title, channel) => {
  if (title.includes(" - ")) {
    const left = title.split(" - ")[0].trim();
    if (left && left.length <= 60) return left;
  }
  return channel || "";
};

// 更像官方 MV 的判斷（加分 / 減分）
const looksLikeMV = (title, desc, channel) => {
  const include =
    /(official|music\s*video|mv|官方|完整版)/i.test(title) ||
    /(official|music\s*video|mv|官方)/i.test(desc || "") ||
    /vevo|official/i.test(channel || "");
  const exclude =
    /(lyric|lyrics|舞蹈|dance|cover|翻唱|reaction|reac|live|現場|舞台|彩排|teaser|trailer|audio|full album|topic)/i
      .test(title);
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

  // 1) search：抓多一點候選
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("key", key);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoCategoryId", "10");
  searchUrl.searchParams.set("maxResults", "50");
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

  // 3) 篩選：≥120 秒 + MV 加分
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

  // 4) 依分數排序，擴大 pool，之後才挑 1 正解 + 3 干擾
  const sorted = all.sort((a,b)=> b.score - a.score);
  const pool = sorted.slice(0, 30);

  // 正解
  const pick = pickRand(pool);
  const answerTitle = clean(pick.title);
  const answerArtist = parseArtist(pick.title, pick.channel);

  // 5) 干擾選項：先嚴格（不同歌手 + 不同歌），不夠再放寬（同歌手但不同歌）
  const seen = new Set();
  const keyOf = (t,a) => `${norm(t)}|${norm(a)}`;
  const targetKey = keyOf(answerTitle, answerArtist);

  const strictCandidates = pool
    .concat(sorted.slice(30)) // 先用 pool，不夠再用其餘候選
    .filter(c => {
      const t = clean(c.title);
      const a = parseArtist(c.title, c.channel);
      const k = keyOf(t, a);
      if (k === targetKey) return false;
      // 嚴格：不同歌手且不同歌
      return norm(a) !== norm(answerArtist) && norm(t) !== norm(answerTitle);
    });

  const relaxedCandidates = pool
    .concat(sorted.slice(30))
    .filter(c => {
      const t = clean(c.title);
      const a = parseArtist(c.title, c.channel);
      const k = keyOf(t, a);
      if (k === targetKey) return false;
      // 放寬：允許同歌手但不同歌名
      return norm(t) !== norm(answerTitle);
    });

  const distractors = [];
  const pushUnique = (arr) => {
    for (const c of arr) {
      const t = clean(c.title);
      const a = parseArtist(c.title, c.channel);
      const k = keyOf(t, a);
      if (seen.has(k)) continue;
      seen.add(k);
      distractors.push({ title: t, artist: a });
      if (distractors.length >= 3) break;
    }
  };
  // 先嚴格再放寬，保證至少 3 個，不再用 "—"
  pushUnique(shuffle(strictCandidates));
  if (distractors.length < 3) pushUnique(shuffle(relaxedCandidates));
  if (distractors.length < 3) {
    // 實在不夠就從全部裡補
    pushUnique(shuffle(sorted));
  }
  if (distractors.length < 3) return NextResponse.json({ error: "Not enough choices" }, { status: 502 });

  const choices = shuffle([{ title: answerTitle, artist: answerArtist }, ...distractors.slice(0,3)]);
  const correctIndex = choices.findIndex(c => keyOf(c.title, c.artist) === targetKey);

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

// Fisher–Yates shuffle
function shuffle(arr) {
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
