
const ISO8601toSeconds = (iso) => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || 0, 10);
  const min = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  return h * 3600 + min * 60 + s;
};

const cleanTitle = (s="") => s.replace(/\s*\(.*?\)|\s*\[.*?\]/g, "").trim();

const parseArtist = (snippet) => {
  const channel = snippet?.channelTitle || "";
  const title = snippet?.title || "";
  if (title.includes(" - ")) {
    const parts = title.split(" - ");
    if (parts.length >= 2) {
      const left = parts[0].trim();
      return left.length <= 60 ? left : channel;
    }
  }
  return channel;
};

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

export { ISO8601toSeconds, cleanTitle, parseArtist, pickRandom, clamp };
