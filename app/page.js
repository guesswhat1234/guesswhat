"use client";
import { useRef, useState, useEffect } from "react";

export default function Page() {
  // -------- 狀態 --------
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
  const excludeQS = () => encodeURIComponent(Array.from(seenRef.current).join(","));

  // 建議（關鍵字 & 相似歌手）
  const [suggestions, setSuggestions] = useState([]);        // 關鍵字建議（舊）
  const [artistSuggestions, setArtistSuggestions] = useState([]); // 相似歌手/團體（新）

  const fetchSuggest = async (q) => {
    try {
      const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      setSuggestions((j?.suggestions || []).slice(0, 4));
    } catch { setSuggestions([]); }
  };
  const fetchRelatedArtists = async (q) => {
    try {
      const r = await fetch(`/api/related?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      setArtistSuggestions((j?.suggestions || []).slice(0, 4));
    } catch { setArtistSuggestions([]); }
  };

  // -------- YouTube IFrame（單一 onStateChange，避免閃爍） --------
  const roundTokenRef = useRef(0); // 每題一個 token，避免舊事件干擾

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
      width: "100%", height: "100%", videoId: "",
      playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, disablekb: 1, iv_load_policy: 3 },
      events: {
        onStateChange: (e) => {
          // 只處理「CUED」狀態，避免播放造成閃爍
          if (e.data === window.YT.PlayerState.CUED) {
            const token = roundTokenRef.current;
            const meta = (playerObj.current && playerObj.current.__meta) || null;
            if (!meta || meta.token !== token) return;
            try {
              playerObj.current.seekTo(meta.t, true);
              // 不要 play；直接確保停在該幀
              playerObj.current.pauseVideo();
            } catch {}
          }
        }
      },
    });
  }, [ytReady]);

  const cueClip = (videoId, t) => {
    if (!playerObj.current) return;
    roundTokenRef.current += 1;
    const token = roundTokenRef.current;
    playerObj.current.__meta = { token, t };
    // 用「cueVideoById」直接載入到目標秒數，不播放 → 不會閃
    playerObj.current.cueVideoById({ videoId, startSeconds: t });
  };

  // -------- 計時器 --------
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
          // 結束：抓相似歌手/團體（主）以及關鍵字建議（備用）
          const base = lastKw || kw;
          fetchRelatedArtists(base);
          fetchSuggest(base);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // -------- 預取 & 出題 --------
  const prefetchNext = async (key) => {
    try {
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(key)}&exclude=${excludeQS()}`);
      const data = await r.json();
      if (r.ok) setPrefetched(data);
    } catch {}
  };

  const startRound = async (fixedKw) => {
    if (gameOver) return;
    const key = (fixedKw ?? kw).trim();
    if (!key) return alert("請先輸入關鍵字");
    setLastKw(key);
    startTimerIfNeeded();

    setPicked(null);
    setRevealed(false);

    if (prefetched && prefetched.videoId && !seenRef.current.has(String(prefetched.videoId))) {
      const data = prefetched; setPrefetched(null); setCurrent(data);
      pushSeen(data.videoId);
      cueClip(data.videoId, data.t);
      setQCount(v=>v+1);
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
      cueClip(data.videoId, data.t);
      setQCount(v=>v+1);
      prefetchNext(key);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // -------- 作答 --------
  const choose = (idx) => {
    if (!current || revealed || gameOver) return;
    setPicked(idx);
    const correct = idx === current.correctIndex;
    setScore(s => s + (correct ? 100 : 0));
    setCorrectCount(c => c + (correct ? 1 : 0));
    setWrongCount(w => w + (correct ? 0 : 1));
    setRevealed(true);
    setTimeout(() => { if (!gameOver && timeLeft > 0) startRound(lastKw); }, 1500);
  };

  // -------- 重來 --------
  const restart = () => {
    setScore(0); setQCount(0); setCorrectCount(0); setWrongCount(0);
    setTimeLeft(60); setGameStarted(false); setGameOver(false);
    setCurrent(null); setPicked(null); setRevealed(false);
    setPrefetched(null); setSuggestions([]); setArtistSuggestions([]);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    seenRef.current = new Set();
  };

  const accuracy = qCount ? Math.round((correctCount / qCount) * 100) : 0;

  // -------- 版面（維持一屏、不換行 HUD） --------
  const layout = {
    height: "100dvh",
    display: "grid",
    gridTemplateRows: "6dvh 9dvh 8dvh 34dvh 1fr",
    gap: "1.2dvh",
    padding: "2.2dvw",
    boxSizing: "border-box",
  };
  const titleStyle = { fontSize: "clamp(16px,4.2vw,20px)", margin: 0, alignSelf: "center" };
  const hudGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: "1.2dvw",
    alignItems: "stretch",
  };
  const hudItem = {
    background: "#111", color: "#fff", borderRadius: "2.8dvw",
    textAlign: "center", fontWeight: 900,
    fontSize: "clamp(12px,3.4vw,15px)", // 再小一點，確保單行
    padding: "0.8dvh 0.6dvw",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
  };
  const choiceBtn = (state) => ({
    textAlign:"left",
    border: state.chosen ? "0.6vw solid #888" : "0.4vw solid #ccc",
    background: state.correct ? "#2e7d32" : state.wrong ? "#b71c1c" : "#111",
    color: "#fff",
    fontSize: "clamp(13px,3.6vw,16px)",
    padding: "1.2dvh 1.8dvw",
    borderRadius: "3.4dvw",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
  });

  return (
    <main className="container" style={layout}>
      {/* 1) 標題 */}
      <h1 className="h1" style={titleStyle}>🎵 GuessWhat — MV 猜歌（60 秒挑戰）</h1>

      {/* 2) 搜尋列 */}
      <div className="row" style={{display:"grid", gridTemplateColumns:"1fr auto", gap:"1.2dvw", alignItems:"center"}}>
        <input
          value={kw}
          onChange={(e)=>setKw(e.target.value)}
          placeholder="輸入歌手/關鍵字（例：周杰倫、抒情、2000s）"
          className="input"
          inputMode="search"
          disabled={gameOver}
          style={{fontSize:"clamp(13px,3.6vw,16px)", padding:"1.2dvh 1.6dvw"}}
        />
        <button onClick={()=>startRound()} disabled={loading || gameOver} className="button"
          style={{fontSize:"clamp(13px,3.6vw,16px)", padding:"1.2dvh 1.8dvw"}}>
          {loading ? "出題…" : (current ? "下一題" : "開始")}
        </button>
      </div>

      {/* 3) HUD */}
      <div style={hudGrid}>
        <div style={hudItem}>⏱ {timeLeft}s</div>
        <div style={hudItem}>⭐ {score}</div>
        <div style={hudItem}>🧮 {qCount}</div>
        <div style={hudItem}>🎯 {accuracy}%</div>
      </div>

      {/* 4) 播放器（16:9）+ 上方 15% 遮蔽 */}
      <div style={{ position:"relative", width:"100%", height:"100%", background:"#000", borderRadius:"3vw" }}>
        <div style={{ position:"absolute", inset:0, display:"grid", placeItems:"center" }}>
          <div style={{ width:"100%", height:"100%", maxHeight:"100%", aspectRatio:"16/9", position:"relative" }}>
            <div id="player" ref={playerRef} style={{ position:"absolute", inset:0 }}/>
          </div>
        </div>
        {(current && !gameOver) && (
          <div style={{ position:"absolute", left:0, right:0, top:0, height:"15%", background:"#000", pointerEvents:"none" }}/>
        )}
        {(loading && !current) && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", background:"rgba(0,0,0,.25)", fontSize:"clamp(14px,3.8vw,18px)" }}>
            出題中…
          </div>
        )}
      </div>

      {/* 5) 選項 / 結束 */}
      <div style={{ overflow:"hidden" }}>
        {/* 四選一 */}
        {current && !gameOver && (
          <div style={{ display:"grid", gap:"0.9dvh" }}>
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

        {/* 結束畫面：優先顯示「相似歌手/團體」4 個建議 → 一點即開局 */}
        {gameOver && (
          <div className="card" style={{padding:"1.2dvh 1.6dvw"}}>
            <div style={{fontSize:"clamp(14px,3.8vw,18px)", fontWeight:800, marginBottom:"0.6dvh"}}>⏱️ 時間到！</div>
            <div style={{fontSize:"clamp(12px,3.2vw,16px)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
              分數 <b>{score}</b> ／ 題數 <b>{qCount}</b> ／ 正確 <b>{correctCount}</b> ／ 錯誤 <b>{wrongCount}</b> ／ 命中率 <b>{accuracy}%</b>
            </div>

            {/* 相似歌手/團體（主） */}
            <div style={{marginTop:"1dvh"}}>
              <div className="small" style={{marginBottom:"0.6dvh"}}>再玩一次（與「{lastKw || kw}」相似的歌手/團體）：</div>
              <div style={{display:"grid", gap:"0.8dvh", gridTemplateColumns:"repeat(2,1fr)"}}>
                {(artistSuggestions.length ? artistSuggestions : suggestions.length ? suggestions : [lastKw||kw, `${lastKw||kw} MV`, `${lastKw||kw} 熱門`, `${lastKw||kw} 精選`]).slice(0,4).map((s, i)=>(
                  <button
                    key={i}
                    className="button"
                    onClick={()=>{ restart(); setKw(s); startRound(s); }}
                    title={s}
                    style={{fontSize:"clamp(13px,3.6vw,16px)", padding:"1.2dvh 1.6dvw"}}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
