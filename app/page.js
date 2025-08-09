"use client";
import { useRef, useState, useEffect } from "react";

export default function Page() {
  const [kw, setKw] = useState("");
  const [lastKw, setLastKw] = useState("");      // 記住最近一次關鍵字，方便自動下一題
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const playerRef = useRef(null);
  const playerObj = useRef(null);
  const [picked, setPicked] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);         // 總分
  const [qCount, setQCount] = useState(0);       // 題數

  // 載入 YouTube API
  useEffect(() => {
    if (window.YT && window.YT.Player) { setYtReady(true); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
  }, []);

  // 建立 Player
  useEffect(() => {
    if (!ytReady || !playerRef.current || playerObj.current) return;
    playerObj.current = new window.YT.Player(playerRef.current, {
      width: "100%", height: "100%",
      videoId: "",
      playerVars: {
        controls: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3
      },
      events: { onReady: () => {} },
    });
  }, [ytReady]);

  // 出題（可傳入固定 kw，否則用輸入框）
  const startRound = async (fixedKw) => {
    const key = (fixedKw ?? kw).trim();
    if (!key) return alert("請先輸入關鍵字");
    setLastKw(key);
    setLoading(true);
    setRevealed(false);
    setPicked(null);

    try {
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(key)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Pick failed");
      setCurrent(data);

      // 載入影片並跳到隨機秒數，立刻暫停
      playerObj.current?.loadVideoById(data.videoId);
      const handler = (e) => {
        if (e.data === window.YT.PlayerState.PLAYING) {
          playerObj.current.seekTo(data.t, true);
          setTimeout(() => playerObj.current.pauseVideo(), 120);
          playerObj.current.removeEventListener("onStateChange", handler);
        }
      };
      playerObj.current.addEventListener("onStateChange", handler);
      setQCount(prev => prev + 1);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 選擇答案：立即判分，2 秒後自動下一題
  const choose = (idx) => {
    if (!current || revealed) return;
    setPicked(idx);
    const correct = idx === current.correctIndex;
    setScore(s => s + (correct ? 100 : 0));  // 目前：答對 +100 分
    setRevealed(true);

    // 2 秒後自動下一題（沿用最新關鍵字）
    setTimeout(() => {
      startRound(lastKw);
    }, 2000);
  };

  const isCorrect = revealed && picked === current?.correctIndex;

  return (
    <main className="container">
      <h1 className="h1">🎵 GuessWhat — YouTube MV 猜歌（四選一連續出題）</h1>

      <div className="row">
        <input
          value={kw}
          onChange={(e)=>setKw(e.target.value)}
          placeholder="輸入歌手/關鍵字（例：周杰倫、抒情、2000s）"
          className="input"
          inputMode="search"
        />
        <button onClick={()=>startRound()} disabled={loading} className="button">
          {loading ? "出題中…" : (current ? "下一題（手動）" : "開始
