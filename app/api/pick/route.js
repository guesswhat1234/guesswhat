import { NextResponse } from "next/server";

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

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const kw = (searchParams.get("kw") || "").trim();
  if (!kw) return NextResponse.json({ error: "Missing kw" }, { status: 400 });

  // 只排重最近幾題（前端傳進來）
  const exclude = (searchParams.get("exclude") || "")
    .split(",").map(s=>s.trim()).filter(Boolean);

  const key = process.env.YT_API_KEY;
  const region = process.env.REGION_CODE || "TW";
  const lang = process.env.RELEVANCE_LANGUAGE || "zh-Hant";
  if (!key) return NextResponse.json({ error: "Missing YT_API_KEY" }, { status: 500 });

  // 用 partial response（fields）減少傳輸，加速
  const buildCandidates = async (ignoreExclude=false) => {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("key", key);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("videoCategoryId", "10");
    searchUrl.searchParams.set("maxResults", "30"); // 由 50 降到 30，夠用且更快
    searchUrl.searchParams.set("safeSearch", "moderate");
    searchUrl.searchParams.set("regionCode", region);
    searchUrl.searchParams.set("relevanceLanguage", lang);
    searchUrl.searchParams.set("q", kw);
    searchUrl.searchParams.set("fields", "items(id/videoId,snippet/title,snippet/description,snippet/channelTitle)");

    const sRes = await fetch(searchUrl.toString());
    if (!sRes.ok) throw new Error("YouTube search failed");
    const sJson = await sRes.json();

    // 先在 search 階段做粗篩（MV 關鍵詞），減少 videos.list 資料量
    let prelim = (sJson.items || []).map(i => ({
      id: i.id?.videoId,
      title: i.snippet?.title || "",
      desc: i.snippet?.description || "",
      channel: i.snippet?.channelTitle || ""
    })).filter(v => v.id);

    if (!ignoreExclude) prelim = prelim.filter(v => !exclude.includes(v.id));
    prelim = prelim.filter(v => looksLikeMV(v.title, v.desc, v.channel));

    if (!prelim.length) return [];

    const ids = prelim.map(v => v.id).join(",");
    const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videosUrl.searchParams.set("key", key);
    videosUrl.searchParams.set("part", "contentDetails,snippet");
    videosUrl.searchParams.set("id", ids);
    videosUrl.searchParams.set("fields", "items(id,contentDetails/duration,snippet/title,snippet/channelTitle,snippet/description)");

    const vRes = await fetch(videosUrl.toString());
    if (!vRes.ok) throw new Error("YouTube videos lookup failed");
    const vJson = await vRes.json();

    return (vJson.items || []).map(v => {
      const duration = ISO8601toSeconds(v.contentDetails?.duration || "PT0S");
      const title = v.snippet?.title || "";
      const desc = v.snippet?.description || "";
      const channel = v.snippet?.channelTitle || "";
      const score =
        (looksLikeMV(title, desc, channel) ? 2 : 0) +
        (/vevo|official/i.test(channel) ? 1 : 0) +
        (/(official(?!\s*audio)|mv|music\s*video|官方)/i.test(title) ? 1 : 0);
      return { id: v.id, duration, title, desc, channel, score };
    }).filter(x => x.duration >= 120);
  };

  // 先尊重排重；若太少，再忽略排重重取（避免玩幾輪就沒題）
  let all = await buildCandidates(false);
  if (all.length < 8 && exclude.length) {
    all = await buildCandidates(true);
  }
  if (!all.length) return NextResponse.json({ error: "No playable candidates" }, { status: 404 });

  const sorted = all.sort((a,b)=> b.score - a.score);
  const pool = sorted.slice(0, 24); // 小一點讓 videos.list 更快且選項更集中

  // 正解（保持原始標題；選項只顯示標題，不顯示上載者）
  const pick = pickRand(pool);
  const answerTitle = pick.title;
  const answerArtist = pick.channel; // 保留給揭曉/統計用（前端不顯示在選項）

  // 干擾：先不同歌/不同頻道，不夠再放寬
  const keyOf = (t,a)=>`${norm(t)}|${norm(a)}`;
  const targetKey = keyOf(answerTitle, answerArtist);
  const strict = pool.filter(c => keyOf(c.title,c.channel)!==targetKey &&
                                  norm(c.title)!==norm(answerTitle) &&
                                  norm(c.channel)!==norm(answerArtist));
  const relaxed = pool.filter(c => keyOf(c.title,c.channel)!==targetKey &&
                                   norm(c.title)!==norm(answerTitle));

  const seen = new Set(), distractors = [];
  const pushUnique = (arr) => {
    for (const c of arr) {
      const k = keyOf(c.title, c.channel);
      if (seen.has(k) || k === targetKey) continue;
      seen.add(k);
      distractors.push(c.title); // 只塞標題
      if (distractors.length >= 3) break;
    }
  };
  pushUnique(shuffle(strict));
  if (distractors.length < 3) pushUnique(shuffle(relaxed));
  if (distractors.length < 3) pushUnique(shuffle(sorted));
  if (distractors.length < 3) return NextResponse.json({ error: "Not enough choices" }, { status: 502 });

  const choices = shuffle([answerTitle, ...distractors.slice(0,3)]);
  const correctIndex = choices.findIndex(t => norm(t) === norm(answerTitle));

  const t = Math.floor(clamp(pick.duration * (0.25 + Math.random() * 0.5), 1, Math.max(1, pick.duration - 1)));

  return NextResponse.json({
    videoId: pick.id,
    duration: pick.duration,
    t,
    answerTitle,      // 用於揭曉
    answerArtist,     // 用於統計/推薦（前端選項不顯示）
    choices,          // <== 只含「標題字串」
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
