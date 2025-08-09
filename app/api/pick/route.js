
import { NextResponse } from "next/server";
import { ISO8601toSeconds, cleanTitle, parseArtist, pickRandom, clamp } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const kw = (searchParams.get("kw") || "").trim();
  if (!kw) return NextResponse.json({ error: "Missing kw" }, { status: 400 });

  const key = process.env.YT_API_KEY;
  const region = process.env.REGION_CODE || "TW";
  const lang = process.env.RELEVANCE_LANGUAGE || "zh-Hant";
  if (!key) return NextResponse.json({ error: "Missing YT_API_KEY" }, { status: 500 });

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("key", key);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoCategoryId", "10");
  searchUrl.searchParams.set("maxResults", "25");
  searchUrl.searchParams.set("safeSearch", "moderate");
  searchUrl.searchParams.set("regionCode", region);
  searchUrl.searchParams.set("relevanceLanguage", lang);
  searchUrl.searchParams.set("q", kw);

  const sRes = await fetch(searchUrl.toString());
  if (!sRes.ok) {
    return NextResponse.json({ error: "YouTube search failed" }, { status: 502 });
  }
  const sJson = await sRes.json();
  const ids = (sJson.items || []).map(i => i.id?.videoId).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "No results" }, { status: 404 });

  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("key", key);
  videosUrl.searchParams.set("part", "contentDetails,snippet");
  videosUrl.searchParams.set("id", ids.join(","));

  const vRes = await fetch(videosUrl.toString());
  if (!vRes.ok) {
    return NextResponse.json({ error: "YouTube videos lookup failed" }, { status: 502 });
  }
  const vJson = await vRes.json();

  const candidates = (vJson.items || []).filter(v => {
    const dur = ISO8601toSeconds(v.contentDetails?.duration || "PT0S");
    if (dur < 120) return false;
    return true;
  });
  if (!candidates.length) return NextResponse.json({ error: "No playable candidates" }, { status: 404 });

  const pick = pickRandom(candidates);
  const duration = ISO8601toSeconds(pick.contentDetails?.duration || "PT0S");
  const t = Math.floor(clamp(duration * (0.2 + Math.random() * 0.6), 1, Math.max(1, duration - 1)));
  const answerTitle = cleanTitle(pick.snippet?.title || "");
  const answerArtist = parseArtist(pick.snippet);

  return NextResponse.json({ videoId: pick.id, duration, t, answerTitle, answerArtist });
}
