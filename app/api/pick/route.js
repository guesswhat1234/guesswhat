import { NextResponse } from "next/server";

// ========== utils ==========
const ISO8601toSeconds = (iso) => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || 0, 10);
  const min = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  return h * 3600 + min * 60 + s;
};
const norm = (s = "") => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pickRand = (arr) => arr[Math.floor(Math.random() * arr.length)];

const looksLikeMV = (title, desc, channel) => {
  const INCLUDE = /(official(?!\s*audio)|music\s*video|mv|官方|完整版)/i.test(title) ||
                  /(official(?!\s*audio)|music\s*video|mv|官方)/i.test(desc || "") ||
                  /vevo|official/i.test(channel || "");
  const EX = /(lyric|lyrics|字幕|歌詞|舞蹈|dance|practice|mirror|翻唱|cover|reaction|reac|live|現場|舞台|直拍|fancam|teaser|trailer|audio|visualizer|full album|topic|shorts)/i;
  const EXCLUDE = EX.test(title) || EX.test(desc || "") || /topic/i.test(channel || "");
  return INCLUDE && !EXCLUDE;
};

// ========== handler ==========
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const kw = (searchParams.get("kw") || "").trim();
  if (!kw) return NextResponse.json({ error: "Missing kw" }, { status: 400 });

  const exclude = (searchParams.get("exclude") || "")
    .split(",")
    .map(s=>s.trim())
    .filter(Boolean);

  const key = process.env.YT_API_KEY;
  const region = process.env.REGION_CODE || "TW";
  const lang = process.env.RELEVANCE_LANGUAGE || "zh-Hant";
  if (!key) return NextResponse.json({ error: "Missing YT_API_KEY" }, { status: 500 });

  const buildCandidates = async (ignoreExclude=false) => {
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
    if (!sRes.ok) throw new Error("YouTube search failed");
    const sJson = await sRes.json();
    let ids = (sJson.items || []).map(i => i.id?.videoId).filter(Boolean);
    if (!ignoreExclude) ids = ids.filter(id => !exclude.includes(id));
    if (!ids.length) return [];

    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("key", key);
    videosUrl.searchParams.set("part", "contentDetails,snippet");
    videosUrl.searchParams.set("id", ids.join(","));
    const vRes = await fetch(videosUrl.toString());
    if (!vRes.ok) throw new Error("YouTube videos lookup failed");
    const vJson = await vRes.json();

    const all = (vJson.items || []).map(v => {
      const duration = ISO8601toSeconds(v.contentDetails?.duration || "PT0S");
      const titleRaw = v.snippet?.title || "";
      const channelRaw = v.snippet?.channelTitle || "";
      const desc = v.snippet?.description || "";
      const score =
        (looksLikeMV(titleRaw, desc, channelRaw) ? 2 : 0) +
        (/vevo|official/i.test(channelRaw) ? 1 : 0) +
        (/(official(?!\s*audio)|mv|music\s*video|官方)/i.test(titleRaw) ? 1 : 0);
      return { id: v.id, duration, titleRaw, channelRaw, desc, score };
    }).filter(x => x.duration >= 120);

    return all;
  };

  // 先尊重排重取題；若太少，再「忽略排重」補題（避免玩到沒題目）
  let all = await buildCandidates(false);
  if (all.length < 8 && exclude.length) {
    all = await buildCandidates(true); // reset pool
  }
  if (!all.length) return NextResponse.json({ error: "No playable candidates" }, { status: 404 });

  const sorted = all.sort((a,b)=> b.score - a.score);
  const pool = sorted.slice(0, 30);

  // 正解（原始顯示：上載者名字/原始標題）
  const pick = pickRand(pool);
  const answerArtist = pick.channelRaw; // 不做翻譯/清洗
  const answerTitle  = pick.titleRaw;

  // 干擾：優先不同歌手 + 不同歌；不夠再放寬
  const keyOf = (t,a)=>`${norm(t)}|${norm(a)}`;
  const targetKey = keyOf(answerTitle, answerArtist);
  const strict = pool.filter(c => keyOf(c.titleRaw,c.channelRaw)!==targetKey &&
                                  norm(c.titleRaw)!==norm(answerTitle) &&
                                  norm(c.channelRaw)!==norm(answerArtist));
  const relaxed = pool.filter(c => keyOf(c.titleRaw,c.channelRaw)!==targetKey &&
                                   norm(c.titleRaw)!==norm(answerTitle));

  const seen = new Set(), distractors = [];
  const pushUnique = (arr) => {
    for (const c of arr) {
      const k = keyOf(c.titleRaw, c.channelRaw);
      if (seen.has(k) || k === targetKey) continue;
      seen.add(k);
      distractors.push({ title: c.titleRaw, artist: c.channelRaw });
      if (distractors.length >= 3) break;
    }
  };
  pushUnique(shuffle(strict));
  if (distractors.length < 3) pushUnique(shuffle(relaxed));
  if (distractors.length < 3) pushUnique(shuffle(sorted));
  if (distractors.length < 3) return NextResponse.json({ error: "Not enough choices" }, { status: 502 });

  const choices = shuffle([{ title: answerTitle, artist: answerArtist }, ...distractors.slice(0,3)]);
  const correctIndex = choices.findIndex(c => keyOf(c.title, c.artist) === targetKey);

  const t = Math.floor(clamp(pick.duration * (0.25 + Math.random() * 0.5), 1, Math.max(1, pick.duration - 1)));

  return NextResponse.json({
    videoId: pick.id,
    duration: pick.duration,
    t,
    answerTitle,
    answerArtist,
    choices,
    correctIndex
  });
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
