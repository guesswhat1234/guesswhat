"use client";
import { useRef, useState, useEffect } from "react";

export default function Page() {
  // 狀態
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

  // 同局排重（只保留最近 40 題，避免把池子玩乾）
  const seenRef = useRef(new Set());
  const pushSeen = (vid) => {
    seenRef.current.add(String(vid));
    if (seenRef.current.size > 40) {
      // 移除最舊的
      const first = seenRef.current.values().next().value;
      seenRef.current.delete(first);
    }
  };

  // 蒐集出現過的「歌手/頻道」，供結束時推薦
  const artistCountRef = useRef(new Map());
  const countArtist = (name) => {
    const k = String(name || "").trim();
    if (!k) return;
    const cur = artistCountRef.current.get(k) || 0;
    artistCountRef.current.set(k, cur + 1);
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
      events: { onReady: () => {} },
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
      pushSeen(data.videoId);
      countArtist(data.answerArtist);

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
      console.error(e);
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 作答：即判分，2 秒後自動下一題
  const choose = (idx) => {
    if (!current || revealed || gameOver) return;
    setPicked(idx);
    const correct = idx === current.correctIndex;
    setScore(s => s + (correct ? 100 : 0));
    setCorrectCount(c => c + (correct ? 1 : 0));
    setWrongCount(w => w + (correct ? 0 : 1));
    setRevealed(true);

    setTimeout(() => {
      if (!gameOver && timeLeft > 0) startRound(lastKw);
    }, 2000);
  };

  // 重新開始
  const restart = () => {
    setScore(0); setQCount(0); setCorrectCount(0); setWrongCount(0);
    setTimeLeft(60); setGameStarted(false); setGameOver(false);
    setCurrent(null); setPicked(null); setRevealed(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    seenRef.current = new Set();
    artistCountRef.current = new Map();
  };

  const accuracy = qCount ? Math.round((correctCount / qCount) * 100) : 0;

  // 複製戰報
  const copySummary = async () => {
    const url = window.location.href;
    const text = `我在 GuessWhat MV 猜歌拿到 ${score} 分！\n題數：${qCount}（正確 ${correctCount}、錯誤 ${wrongCount}，命中率 ${accuracy}%）\n一起玩：${url}`;
    try {
      await navigator.clipboard.writeText(text);
      alert("已複製戰報與連結！");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      alert("已複製戰報與連結！");
    }
  };

  // 取出本局出現最多的 4 個歌手/團體供推薦
  const topArtists = () => {
    const arr = Array.from(artistCountRef.current.entries());
    arr.sort((a,b)=> b[1]-a[1]);
    return arr.slice(0,4).map(([name])=>name);
  };

  // 大字體 HUD（時間/分數）— 手機清楚
  const hudStyle = {
    position: "sticky",
    top: 0,
    zIndex: 3,
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    background: "#fff",
    padding: "8px 0"
  };
  const pillStyle = {
    background: "#111",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: "clamp(18px, 5.5vw, 28px)",
    letterSpacing: "0.5px"
  };

  return (
    <main className="container">
      <h1 className="h1">🎵 GuessWhat — MV 猜歌（60 秒挑戰）</h1>

      {/* 搜尋列 */}
      <div className="row">
        <input
          value={kw}
          onChange={(e)=>setKw(e.target.value)}
          placeholder="輸入歌手/關鍵字（例：周杰倫、抒情、2000s）"
          className="input"
          inputMode="search"
          disabled={gameOver}
        />
        <button onClick={()=>startRound()} disabled={loading || gameOver} className="button">
          {loading ? "出題中…" : (current ? "下一題（手動）" : "開始出題")}
        </button>
      </div>

      {/* 放大 HUD */}
      <div style={hudStyle}>
        <div style={pillStyle}>⏱ {timeLeft}s</div>
        <div style={pillStyle}>⭐ {score}</div>
        <div style={pillStyle}>📊 {qCount} 題</div>
        <div style={pillStyle}>🎯 {accuracy}%</div>
      </div>

      {/* 題目區：只保留「上方 15% 全黑」遮蔽 */}
      <div className="stage" style={{ marginTop: 12, position: "relative" }}>
        <div id="player" ref={playerRef} style={{ width: "100%", height: "100%" }}/>
        {current && !gameOver && (
          <div
            style={{
              position:"absolute", left:0, right:0, top:0, height:"15%",
              background:"#000", pointerEvents:"none"
            }}
          />
        )}
      </div>

      {/* 四選一（用原始上載方名稱） */}
      {current && !gameOver && (
        <div style={{ marginTop: 12, display:"grid", gap: 10 }}>
          {current.choices?.map((c, idx) => {
            const chosen = picked === idx;
            const correct = revealed && idx === current.correctIndex;
            const wrong = revealed && chosen && idx !== current.correctIndex;
            return (
              <button
                key={idx}
                onClick={() => choose(idx)}
                className="button"
                style={{
                  textAlign:"left",
                  border: chosen ? "2px solid #888" : "1px solid #ccc",
                  background: correct ? "#2e7d32" : wrong ? "#b71c1c" : "#111",
                  color: "#fff",
                  fontSize: "clamp(16px, 4.8vw, 20px)",
                  padding: "14px 16px",
                  borderRadius: 14
                }}
                disabled={revealed}
              >
                {String.fromCharCode(65+idx)}. {c.artist}《{c.title}》
              </button>
            );
          })}

          {revealed && (
            <div className="card">
              {picked === current?.correctIndex ? "✅ 答對 +100" : "❌ 答錯 0 分"}（2 秒後自動下一題）
              <div className="small" style={{marginTop:6}}>
                正解：{current.choices[current.correctIndex].artist}《{current.choices[current.correctIndex].title}》　
                時間點：{current.t}s / {current.duration}s　
                影片：<a href={`https://www.youtube.com/watch?v=${current.videoId}`} target="_blank" rel="noreferrer">
                  https://www.youtube.com/watch?v={current.videoId}
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 結束畫面（含依本局最常見歌手的再玩選項） */}
      {gameOver && (
        <div className="card" style={{marginTop:12}}>
          <h3 style={{margin:"8px 0"}}>⏱️ 時間到！成績單</h3>
          <div>總題數：<strong>{qCount}</strong></div>
          <div>總分：<strong>{score}</strong></div>
          <div>正確：<strong>{correctCount}</strong>　錯誤：<strong>{wrongCount}</strong>　命中率：<strong>{accuracy}%</strong></div>

          {/* 推薦四個歌手/團體（按本局統計） */}
          <div style={{marginTop:10}}>
            <div className="small" style={{marginBottom:6}}>再玩一次（依你本局常見的歌手/團體）：</div>
            <div style={{display:"grid", gap:8}}>
              {topArtists().map((name, i)=>(
                <button
                  key={i}
                  className="button"
                  onClick={()=>{ const k = name; restart(); setKw(k); startRound(k); }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div style={{display:"flex", gap:8, flexWrap:"wrap", marginTop:10}}>
            <button className="button" onClick={copySummary}>📋 複製戰報＆連結</button>
            <button className="button" onClick={()=>{ const k = lastKw || kw; restart(); setKw(k); startRound(k); }}>
              用相同關鍵字再玩
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
