"use client";
import { useRef, useState, useEffect } from "react";

export default function Page() {
  // 狀態
  const [kw, setKw] = useState("");
  const [lastKw, setLastKw] = useState("");
  const [current, setCurrent] = useState(null);
  const [prefetched, setPrefetched] = useState(null);
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

  // 排重（只記最近 40 題）
  const seenRef = useRef(new Set());
  const pushSeen = (vid) => {
    seenRef.current.add(String(vid));
    if (seenRef.current.size > 40) {
      const first = seenRef.current.values().next().value;
      seenRef.current.delete(first);
    }
  };

  // 統計歌手（僅作內部參考）
  const artistCountRef = useRef(new Map());
  const countArtist = (name) => {
    const k = String(name || "").trim();
    if (!k) return;
    artistCountRef.current.set(k, (artistCountRef.current.get(k) || 0) + 1);
  };

  // 結束畫面的「基於上次搜尋」建議
  const [suggestions, setSuggestions] = useState([]);
  const loadSuggestions = async (q) => {
    try {
      const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      setSuggestions(Array.isArray(j?.suggestions) ? j.suggestions : []);
    } catch { setSuggestions([]); }
  };

  // 載入 YouTube IFrame API
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
          // 結束時載入與上次搜尋相關的建議
          loadSuggestions(lastKw || kw);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const excludeQS = () => encodeURIComponent(Array.from(seenRef.current).join(","));

  // 預取下一題
  const prefetchNext = async (key) => {
    try {
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(key)}&exclude=${excludeQS()}`);
      const data = await r.json();
      if (r.ok) setPrefetched(data);
    } catch {}
  };

  // 出題（優先用預取）
  const startRound = async (fixedKw) => {
    if (gameOver) return;
    const key = (fixedKw ?? kw).trim();
    if (!key) return alert("請先輸入關鍵字");
    setLastKw(key);
    startTimerIfNeeded();

    setPicked(null);
    setRevealed(false);

    // 用預取資料
    if (prefetched && prefetched.videoId && !seenRef.current.has(String(prefetched.videoId))) {
      const data = prefetched; setPrefetched(null); setCurrent(data);
      pushSeen(data.videoId); countArtist(data.answerArtist);
      playerObj.current?.loadVideoById(data.videoId);
      const handler = (e) => {
        if (e.data === window.YT.PlayerState.PLAYING) {
          playerObj.current.seekTo(data.t, true);
          setTimeout(() => playerObj.current.pauseVideo(), 120);
          playerObj.current.removeEventListener("onStateChange", handler);
        }
      };
      playerObj.current.addEventListener("onStateChange", handler);
      setQCount(prev=>prev+1);
      prefetchNext(key);
      return;
    }

    // 即時抓
    setLoading(true);
    try {
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(key)}&exclude=${excludeQS()}`);
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
      setQCount(prev=>prev+1);

      prefetchNext(key);
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
    setTimeout(() => { if (!gameOver && timeLeft > 0) startRound(lastKw); }, 2000);
  };

  // 重新開始
  const restart = () => {
    setScore(0); setQCount(0); setCorrectCount(0); setWrongCount(0);
    setTimeLeft(60); setGameStarted(false); setGameOver(false);
    setCurrent(null); setPicked(null); setRevealed(false);
    setPrefetched(null); setSuggestions([]);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    seenRef.current = new Set();
    artistCountRef.current = new Map();
  };

  const accuracy = qCount ? Math.round((correctCount / qCount) * 100) : 0;

  // HUD 等寬四欄（與播放器同寬），字體自適應
  const hudGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 8,
    marginTop: 10,
    alignItems: "stretch"
  };
  const hudItem = {
    background: "#111",
    color: "#fff",
    borderRadius: 12,
    padding: "12px 10px",
    textAlign: "center",
    fontWeight: 900,
    fontSize: "clamp(16px, 5vw, 24px)"
  };

  return (
    <main className="container" style={{minHeight:"100vh", display:"flex", flexDirection:"column"}}>
      <h1 className="h1" style={{fontSize:"clamp(18px,5vw,22px)", margin:"12px 0"}}>🎵 GuessWhat — MV 猜歌（60 秒挑戰）</h1>

      {/* 搜尋列 */}
      <div className="row" style={{gap:12}}>
        <input
          value={kw}
          onChange={(e)=>setKw(e.target.value)}
          placeholder="輸入歌手/關鍵字（例：周杰倫、抒情、2000s）"
          className="input"
          inputMode="search"
          disabled={gameOver}
          style={{fontSize:"clamp(14px,4.5vw,18px)"}}
        />
        <button onClick={()=>startRound()} disabled={loading || gameOver} className="button" style={{fontSize:"clamp(14px,4.5vw,18px)"}}>
          {loading ? "出題中…" : (current ? "下一題" : "開始出題")}
        </button>
      </div>

      {/* HUD（與播放器同寬，四等分） */}
      <div style={hudGrid}>
        <div style={hudItem}>⏱ {timeLeft}s</div>
        <div style={hudItem}>⭐ {score}</div>
        <div style={hudItem}>📊 {qCount} 題</div>
        <div style={hudItem}>🎯 {accuracy}%</div>
      </div>

      {/* 播放器（16:9），只保留上方 15% 全黑遮擋 */}
      <div style={{ position:"relative", width:"100%", aspectRatio:"16/9", background:"#000", borderRadius:12, marginTop:10 }}>
        <div id="player" ref={playerRef} style={{ position:"absolute", inset:0 }}/>
        {(current && !gameOver) && (
          <div style={{ position:"absolute", left:0, right:0, top:0, height:"15%", background:"#000", pointerEvents:"none" }}/>
        )}
        {(loading && !current) && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", background:"rgba(0,0,0,.25)" }}>
            出題中…
          </div>
        )}
      </div>

      {/* 四選一（只顯示標題） */}
      {current && !gameOver && (
        <div style={{ marginTop: 12, display:"grid", gap: 10 }}>
          {current.choices?.map((title, idx) => {
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
                  borderRadius: 14,
                  whiteSpace:"nowrap",
                  overflow:"hidden",
                  textOverflow:"ellipsis"
                }}
                disabled={revealed}
                title={title}
              >
                {String.fromCharCode(65+idx)}. {title}
              </button>
            );
          })}

          {revealed && (
            <div className="card">
              {picked === current?.correctIndex ? "✅ 答對 +100" : "❌ 答錯 0 分"}（2 秒後自動下一題）
              <div className="small" style={{marginTop:6}}>
                正解：{current.answerTitle}　
                影片：<a href={`https://www.youtube.com/watch?v=${current.videoId}`} target="_blank" rel="noreferrer">
                  https://www.youtube.com/watch?v={current.videoId}
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 結束畫面：顯示基於「上一個搜尋關鍵字」的 4 個建議，點了立即開局 */}
      {gameOver && (
        <div className="card" style={{marginTop:12}}>
          <h3 style={{margin:"8px 0"}}>⏱️ 時間到！成績單</h3>
          <div>總題數：<strong>{qCount}</strong>　總分：<strong>{score}</strong>　正確：<strong>{correctCount}</strong>　錯誤：<strong>{wrongCount}</strong></div>

          {(lastKw || kw) && (
            <div style={{marginTop:10}}>
              <div className="small" style={{marginBottom:6}}>再玩一次（基於「{lastKw || kw}」的關聯搜尋）：</div>
              <div style={{display:"grid", gap:8, gridTemplateColumns:"repeat(2,1fr)"}}>
                {suggestions.map((s, i)=>(
                  <button
                    key={i}
                    className="button"
                    onClick={()=>{ restart(); setKw(s); startRound(s); }}
                    title={s}
                  >
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
