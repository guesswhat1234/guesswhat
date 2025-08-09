
import { NextResponse } from "next/server";

const normalize = (s="") => s.toLowerCase()
  .replace(/\(.*?\)|\[.*?\]|feat\.|ft\./g, "")
  .replace(/[^a-z0-9\u4e00-\u9fa5]/g, "")
  .trim();

const diceCoef = (a, b) => {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = s => {
    const m = new Map();
    for (let i=0; i<s.length-1; i++) {
      const bg = s.slice(i, i+2);
      m.set(bg, (m.get(bg)||0)+1);
    }
    return m;
  };
  const A = bigrams(a), B = bigrams(b);
  let overlap = 0, sizeA = 0, sizeB = 0;
  for (const v of A.values()) sizeA += v;
  for (const v of B.values()) sizeB += v;
  for (const [k, v] of A.entries()) {
    if (B.has(k)) overlap += Math.min(v, B.get(k));
  }
  return (2 * overlap) / (sizeA + sizeB);
};

export async function POST(req) {
  const body = await req.json().catch(()=>({}));
  const user = body?.user || {};
  const answer = body?.answer || {};
  const ua = normalize(user.artist || "");
  const ut = normalize(user.title || "");
  const aa = normalize(answer.artist || "");
  const at = normalize(answer.title || "");

  const artistOK = (ua === aa) || diceCoef(ua, aa) > 0.8 || aa.includes(ua) || ua.includes(aa);
  const titleOK  = (ut === at) || diceCoef(ut, at) > 0.8 || at.includes(ut) || ut.includes(at);

  return NextResponse.json({ correct: artistOK && titleOK, artistOK, titleOK });
}
