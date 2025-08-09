import { NextResponse } from "next/server";

// ===== utils =====
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
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pickRand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const parseArtist = (title, channel) => {
  if (title.includes(" - ")) {
    const left = title.split(" - ")[0].trim();
    if (left && left.length <= 60) return left;
  }
  return channel || "";
};
const keyOf = (t,a) => `${norm(t)}|${norm(a)}`;

// 更像 MV 的判斷（強化）
const looksLikeMV = (title, desc, channel) => {
  const t = (title||"").toLowerCase();
  const d = (desc||"").toLowerCase();
  const c = (channel||"").toLowerCase();

  const INCLUDE = /(official(?!\s*audio)|music\s*video|mv|官方|完整版)/i.test(title) ||
                  /(official(?!\s*audio)|music\s*video|mv|官方)/i.test(desc) ||
                  /vevo|official/i.test(channel);

  const EXCLUDE_WORDS = /(lyric|lyrics|字幕|歌詞|舞蹈|dance|practice|mirror|翻唱|cover|reaction|reac|live|現場|舞台|舞台直拍|fancam|fan cam|直拍|teaser|trailer|audio|visualizer|full album|topic|shorts)/i;
  const EXCLUDE = EXCLUDE_WORDS.test(title) || EXCLUDE_WORDS.test(desc) || /topic/i.test(channel);

  return INCLUDE && !EXCLUDE;
};

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const kw = (searchParams.get("kw") || "").trim();
  if (!kw) return NextResponse.json({ error: "Missing kw" }, { status: 400 });

  // 前端會傳 exclude=vid1,vid2,... 讓同局不重複
  const exclude = (searchParams.get("exclude") || "")
    .split(",")
    .map(s=>s.trim())
    .filter(Boolean);

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
  const ids = (sJson.items || [])
    .map(i => i.id?.videoId)
    .filter(Boolean)
    .filter(id => !exclude.includes(id)); // 先在 id 層級排除

  if (!ids.length) return NextResponse.json({ error: "No results" }, { status: 404 });

  // 2) videos：取長度與完整 snippet
  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("key", key);
  videosUrl.searchParams.set("part", "contentDetails,snippet");
  videosUrl.searchParams.set("id", ids.join(","));
  const vRes = await fetch(videosUrl.toString());
  if (!vRes.ok) return NextResponse.json({ error: "YouTube videos lookup failed" }, { status: 502 });
  const vJson = await vRes.json();

  // 3) 篩 MV + 去除被排除清單
  let all = (vJson.items || []).map(v => {
    const duration = ISO8601toSeconds(v.contentDetails?.duration || "PT0S");
    const title = v.snippet?.title || "";
    const desc = v.snippet?.description || "";
    const channel = v.snippet?.channelTitle || "";
    const score =
      (looksLikeMV(title, desc, channel) ? 2 : 0) +
      (/vevo|official/i.test(channel) ? 1 : 0) +
      (/(official(?!\s*audio)|mv|music\s*video|官方)/i.test(title) ? 1 : 0);
    return { raw: v, id: v.id, duration, title, desc, channel, score };
  })
  .filter(x => x.duration >= 120)
  .filter(x => !exclude.includes(x.id));

  // 若篩完太少，放寬：允許沒明確 "official"，但仍排除歌詞/翻唱/反應等
  if (all.length < 8) {
    all = (vJson.items || []).map(v => {
      const duration = ISO8601toSeconds(v.contentDetails?.duration || "PT0S");
      const title = v.snippet?.title || "";
      const desc = v.snippet?.description || "";
      const channel = v.snippet?.channelTitle || "";
      const score =
        (/vevo|official/i.test(channel) ? 1 : 0) +
        (/(mv|music\s*video|官方)/i.test(title) ? 1 : 0);
      return { raw: v, id: v.id, duration, title, desc, channel, score };
    })
    .filter(x => x.duration >= 120)
    .filter(x => looksLikeMV(x.title, x.desc, x.channel) || x.score >= 1)
    .filter(x => !exclude.includes(x.id));
  }

  if (!all.length) return NextResponse.json({ error: "No playable candidates" }, { status: 404 });

  // 4) 排序 + 擴大 pool（用來生干擾選項）
  const sorted = all.sort((a,b)=> b.score - a.score);
  const pool = sorted.slice(0, 30);

  // 5) 正解
  const pick = pickRand(pool);
  const answerTitle = clean(pick.title);
  const answerArtist = parseArtist(pick.title, pick.channel);
  const targetKey = keyOf(answerTitle, answerArtist);

  // 6) 干擾選項：先不同歌手不同歌，不夠再放寬
  const seen = new Set();
  const strict = pool.filter(c => {
    const t = clean(c.title), a = parseArtist(c.title, c.channel);
    return keyOf(t,a) !== targetKey && norm(t) !== norm(answerTitle) && norm(a) !== norm(answerArtist);
  });
  const relaxed = pool.filter(c => {
    const t = clean(c.title), a = parseArtist(c.title, c.channel);
    return keyOf(t,a) !== targetKey && norm(t) !== norm(answerTitle); // 允許同歌手不同歌
  });

  const distractors = [];
  const pushUnique = (arr) => {
    for (const c of arr) {
      const t = clean(c.title), a = parseArtist(c.title, c.channel);
      const k = keyOf(t,a);
      if (seen.has(k) || k === targetKey) continue;
      seen.add(k);
      distractors.push({ title: t, artist: a });
      if (distractors.length >= 3) break;
    }
  };
  pushUnique(shuffle(strict));
  if (distractors.length < 3) pushUnique(shuffle(relaxed));
  if (distractors.length < 3) pushUnique(shuffle(sorted));
  if (distractors.length < 3) return NextResponse.json({ error: "Not enough choices" }, { status: 502 });

  const choices = shuffle([{ title: answerTitle, artist: answerArtist }, ...distractors.slice(0,3)]);
  const correctIndex = choices.findIndex(c => keyOf(c.title, c.artist) === targetKey);

  // 7) 隨機時間（避開片頭片尾）
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
  for (let i=a.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
