"use client";
import { useRef, useState, useEffect } from "react";

export default function Page() {
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

  // —— 排重（只記最近 40 題）——
  const seenRef = useRef(new Set());
  const pushSeen = (vid) => {
    seenRef.current.add(String(vid));
    if (seenRef.current.size > 40) {
      const first = seenRef.current.values().next().value;
      seenRef.current.delete(first);
    }
  };

  // —— 本局歌手統計（供備援建議）——
  const artistCountRef = useRef(new Map());
  const countArtist = (name) => {
    const k = String(name || "").trim();
    if (!k) return;
    artistCountRef.current.set(k, (artistCountRef.current.get(k) || 0) + 1);
  };
  const topArtists = () => {
    const arr = Array.from(artistCountRef.current.entries());
    arr.sort((a,b)=> b[1]-a[1]);
    return arr.slice(0,6).map(([name])=>name);
  };

  // —— 結束畫面建議（保證 3 個）——
  const [endOptions, setEndOptions] = useState([]);
  const buildEndOptions = (apiList, baseKw) => {
    const seen = new Set();
    const out = [];
    const push = (s) => {
      const t = String(s || "").trim();
      if (!t) return;
      const k = t.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(t);
    };
    // 1) 伺服器建議
    (apiList || []).forEach(push);
    // 2) 本局常見歌手/團體
    topArtists().forEach(push);
    // 3) 關鍵字變體
    if (baseKw) {
      push(baseKw);
      push(`${baseKw} MV`);
      push(`${baseKw} 官方`);
      push(`${baseKw} 新歌`);
    }
    // 4) 最終保底
    while (out.length < 3) push("熱門 MV");
    setEndOptions(out.slice(0,3));
  };

  // —— 載入 YouTube API —— 
  useEffect(() => {
    if (window.YT && window.YT.Player) { setYtReady(true); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
  }, []);

  useEffect(() => {
    if (!ytReady || !playerRef.current || playerObj.current) return;
    playerObj.current = new window.YT.Player(playerRef.current, {
      width: "100%", height: "100%",
      videoId: "",
      playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, disablekb: 1, iv_load_policy: 3 },
      events: { onReady: () => {} },
    });
  }, [ytReady]);

  // —— 計時器 —— 
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
          // 結束時載入建議，並保證 3 個
          fetch(`/api/suggest?q=${encodeURIComponent(lastKw || kw)}`)
            .then(r => r.json()).then(j => buildEndOptions(j?.suggestions || [], lastKw || kw))
            .catch(()=> buildEndOptions([], lastKw || kw));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const excludeQS = () => encodeURIComponent(Array.from(seenRef.current).join(","));

  // —— 預取下一題 —— 
  const prefetchNext = async (key) => {
    try {
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(key)}&exclude=${excludeQS()}`);
      const data = await r.json();
      if (r.ok) setPrefetched(data);
    } catch {}
  };

  // —— 出題（優先用預取）——
  const startRound = async (fixedKw) => {
    if (gameOver) return;
    const key = (fixedKw ?? kw).trim();
    if (!key) return alert("請先輸入關鍵字");
    setLastKw(key);
    setPicked(null);
    setRevealed(false);
    setEndOptions([]); // 清空舊建議
    startTimerIfNeeded();

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

  // —— 作答 —— 
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

  // —— 重新開始 —— 
  const restart = () => {
    setScore(0); setQCount(0); setCorrectCount(0); setWrongCount(0);
    setTimeLeft(60); setGameStarted(false); setGameOver(false);
    setCurrent(null); setPicked(null); setRevealed(false);
    setPrefetched(null); setEndOptions([]);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    seenRef.current = new Set();
    artistCountRef.current = new Map();
  };

  const accuracy = qCount ? Math.round((correctCount / qCount) * 100) : 0;

  // —— HUD & UI（等寬四欄 + 自適應）——
  const hudGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: "1.8vw",
    marginTop: "1.5vh",
    alignItems: "stretch"
  };
  const hudItem = {
    background: "#111",
    color: "#fff",
    borderRadius: "3vw",
    padding: "1.6vh 0.8vw",
    textAlign: "center",
    fontWeight: 900,
    fontSize: "clamp(14px, 3.8vw, 20px)",
    lineHeight: 1.05
  };
  const choiceBtn = (state) => ({
    textAlign:"left",
    border: state.chosen ? "0.6vw solid #888" : "0.4vw solid #ccc",
    background: state.correct ? "#2e7d32" : state.wrong ? "#b71c1c" : "#111",
    color: "#fff",
    fontSize: "clamp(14px, 3.8vw, 18px)",
    padding: "1.6vh 2vw",
    borderRadius: "3.5vw",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  });

  return (
    <main className="container" style={{height:"100vh", display:"flex", flexDirection:"column", padding:"2.8vw"}}>
      <h1 className="h1" style={{fontSize:"clamp(18px,5vw,22px)", margin:"0 0 1vh 0"}}>🎵 GuessWhat — MV 猜歌（60 秒挑戰）</h1>

      {/* 搜尋列 */}
      <div className="row" style={{gap:"2.4vw"}}>
        <input
          value={kw}
          onChange={(e)=>setKw(e.target.value)}
          placeholder="輸入歌手/關鍵字（例：周杰倫、抒情、2000s）"
          className="input"
          inputMode="search"
          disabled={gameOver}
          style={{fontSize:"clamp(14px,3.8vw,18px)", padding:"1.6vh 2vw"}}
        />
        <button onClick={()=>startRound()} disabled={loading || gameOver} className="button" style={{fontSize:"clamp(14px,3.8vw,18px)", padding:"1.6vh 2vw"}}>
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

      {/* 播放器：只保留上方 15% 黑遮蔽 */}
      <div style={{ position:"relative", width:"100%", aspectRatio:"16/9", background:"#000", borderRadius:"3vw", marginTop:"1.5vh" }}>
        <div id="player" ref={playerRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}/>
        {(current && !gameOver) && (
          <div style={{ position:"absolute", left:0, right:0, top:0, height:"15%", background:"#000", pointerEvents:"none" }}/>
        )}
        {(loading && !current) && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", background:"rgba(0,0,0,.25)", fontSize:"clamp(16px,4.2vw,22px)" }}>
            出題中…
          </div>
        )}
      </div>

      {/* 四選一（只顯示標題） */}
      {current && !gameOver && (
        <div style={{ display:"grid", gap:"1.2vh", marginTop:"1.2vh", overflow:"hidden" }}>
          {current.choices?.map((title, idx) => {
            const chosen = picked === idx;
            const correct = revealed && idx === current.correctIndex;
            const wrong = revealed && chosen && idx !== current.correctIndex;
            return (
              <button
                key={idx}
                onClick={() => choose(idx)}
                className="button"
                style={choiceBtn({chosen, correct, wrong})}
                disabled={revealed}
                title={title}
              >
                {String.fromCharCode(65+idx)}. {title}
              </button>
            );
          })}
        </div>
      )}

      {/* 結束畫面：一定有 3 個建議，點了立即再玩 */}
      {gameOver && (
        <div style={{ marginTop:"1.5vh" }}>
          <div style={{fontSize:"clamp(16px,4.2vw,22px)", fontWeight:800, marginBottom:"0.8vh"}}>⏱️ 時間到！成績單</div>
          <div style={{fontSize:"clamp(14px,3.8vw,18px)"}}>
            總題數：<strong>{qCount}</strong>　總分：<strong>{score}</strong>　
            正確：<strong>{correctCount}</strong>　錯誤：<strong>{wrongCount}</strong>　
            命中率：<strong>{accuracy}%</strong>
          </div>

          <div style={{marginTop:"1.2vh"}}>
            <div style={{fontSize:"clamp(12px,3.4vw,16px)", color:"#555", marginBottom:"0.6vh"}}>
              再玩一次（基於「{lastKw || kw}」的關聯搜尋）：
            </div>
            <div style={{ display:"grid", gap:"0.8vh", gridTemplateColumns:"repeat(3,1fr)" }}>
              {endOptions.map((s, i)=>(
                <button
                  key={i}
                  className="button"
                  onClick={()=>{ restart(); setKw(s); startRound(s); }}
                  style={{fontSize:"clamp(14px,3.8vw,18px)", padding:"1.4vh 1vw", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}
                  title={s}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
