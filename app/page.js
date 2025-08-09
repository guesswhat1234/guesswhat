"use client";
import { useRef, useState, useEffect } from "react";

export default function Page() {
  const [kw, setKw] = useState("");
  const [lastKw, setLastKw] = useState("");
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const playerRef = useRef(null);
  const playerObj = useRef(null);

  const [picked, setPicked] = useState(null);
  const [revealed, setRevealed] = useState(false);

  const [score, setScore] = useState(0);
  const [qCount, setQCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

  const [timeLeft, setTimeLeft] = useState(60);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const timerRef = useRef(null);

  const seenRef = useRef(new Set()); // 同局不重複
  const kwHistoryRef = useRef([]); // 搜尋歷史

  // 記錄搜尋關鍵字
  const pushKw = (key) => {
    const k = String(key || "").trim();
    if (!k) return;
    const arr = kwHistoryRef.current;
    if (arr[arr.length - 1] !== k) arr.push(k);
    if (arr.length > 100) arr.shift();
  };

  // 歷史建議（最多 4 個，去重，排除最後一次）
  const historySuggestions = () => {
    const seen = new Set();
    const out = [];
    const last = (lastKw || kw || "").trim().toLowerCase();
    for (let i = kwHistoryRef.current.length - 1; i >= 0; i--) {
      const v = String(kwHistoryRef.current[i] || "").trim();
      if (!v) continue;
      const low = v.toLowerCase();
      if (low === last) continue;
      if (seen.has(low)) continue;
      seen.add(low);
      out.push(v);
      if (out.length >= 4) break;
    }
    return out;
  };

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
      playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, disablekb: 1, iv_load_policy: 3 },
    });
  }, [ytReady]);

  // 計時器
  const startTimerIfNeeded = () => {
    if (gameStarted) return;
    setGameStarted(true);
    setTimeLeft(60);
    setGameOver(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setGameOver(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 出題
  const startRound = async (fixedKw) => {
    if (gameOver) return;
    const key = (fixedKw ?? kw).trim();
    if (!key) return alert("請先輸入關鍵字");
    setLastKw(key);
    pushKw(key);
    startTimerIfNeeded();
    setLoading(true);
    setRevealed(false);
    setPicked(null);
    try {
      const exclude = encodeURIComponent(Array.from(seenRef.current).join(","));
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(key)}&exclude=${exclude}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Pick failed");
      setCurrent(data);
      seenRef.current.add(String(data.videoId));
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

  // 選答案
  const choose = (idx) => {
    if (!current || revealed || gameOver) return;
    setPicked(idx);
    const correct = idx === current.correctIndex;
    setScore(s => s + (correct ? 100 : 0));
    setCorrectCount(c => c + (correct ? 1 : 0));
    setWrongCount(w => w + (correct ? 0 : 1));
    setRevealed(true);
    setTimeout(() => { if (!gameOver && timeLeft > 0) startRound(lastKw); }, 2000);
  };

  // 重來
  const restart = () => {
    setScore(0); setQCount(0); setCorrectCount(0); setWrongCount(0);
    setTimeLeft(60); setGameStarted(false); setGameOver(false);
    setCurrent(null); setPicked(null); setRevealed(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    seenRef.current = new Set();
  };

  const accuracy = qCount ? Math.round((correctCount / qCount) * 100) : 0;

  return (
    <main style={{ padding: "1vh 2vw", fontSize: "clamp(12px,3vw,18px)" }}>
      <h1 style={{ fontSize: "clamp(18px,5vw,28px)", margin: "0.5vh 0" }}>🎵 GuessWhat MV 猜歌</h1>

      {!gameOver && (
        <>
          <div style={{ display: "flex", gap: "1vw", marginBottom: "1vh" }}>
            <input value={kw} onChange={(e)=>setKw(e.target.value)} placeholder="輸入關鍵字"
              style={{ flex: 1, fontSize: "clamp(14px,4vw,18px)", padding: "0.5vh" }} />
            <button onClick={()=>startRound()} disabled={loading}
              style={{ fontSize: "clamp(14px,4vw,18px)", padding: "0.5vh 1vw" }}>
              {loading ? "出題中…" : (current ? "下一題" : "開始")}
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", fontSize: "clamp(14px,4.5vw,20px)" }}>
            <div>⏱ {timeLeft}s</div><div>🎯 {accuracy}%</div><div>📊 {qCount}</div><div>⭐ {score}</div>
          </div>
          <div style={{ marginTop: "1vh", position: "relative", aspectRatio: "16/9" }}>
            <div ref={playerRef} style={{ width: "100%", height: "100%" }}/>
            {current && !gameOver && (
              <div style={{ position:"absolute", left:0, right:0, top:0, height:"15%", background:"#000" }}/>
            )}
          </div>
          {current && (
            <div style={{ marginTop: "1vh", display: "grid", gap: "0.5vh" }}>
              {current.choices?.map((c, idx) => (
                <button key={idx} onClick={() => choose(idx)}
                  style={{ padding: "0.6vh", fontSize: "clamp(12px,3.8vw,18px)" }} disabled={revealed}>
                  {String.fromCharCode(65+idx)}. {c.title}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {gameOver && (
        <div style={{ marginTop: "1vh" }}>
          <h3>⏱️ 時間到！成績單</h3>
          <div>題數：{qCount}　分數：{score}　正確：{correctCount}　錯誤：{wrongCount}　命中率：{accuracy}%</div>
          <button onClick={()=>{ const k=(lastKw||kw).trim(); if(!k) return; restart(); setKw(k); startRound(k); }}
            style={{ marginTop:"1vh", padding:"0.6vh", fontSize:"clamp(14px,4vw,18px)" }}>
            🔁 再一次遊玩
          </button>
          {historySuggestions().length > 0 && (
            <div style={{ marginTop:"1vh" }}>
              <div>歷史搜尋建議：</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"0.5vh" }}>
                {historySuggestions().map((s, i)=>(
                  <button key={i} onClick={()=>{ restart(); setKw(s); startRound(s); }}
                    style={{ padding:"0.6vh", fontSize:"clamp(12px,3.8vw,18px)" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
