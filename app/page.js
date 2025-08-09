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

  const [timeLeft, setTimeLeft] = useState(60);     // 1 分鐘
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const timerRef = useRef(null);

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
      playerVars: {
        controls: 0, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, disablekb: 1, iv_load_policy: 3
      },
      events: { onReady: () => {} },
    });
  }, [ytReady]);

  // 啟動計時器
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

  // 出題（可帶 fixedKw；未帶則用輸入框）
  const startRound = async (fixedKw) => {
    if (gameOver) return; // 時間到就不再出題
    const key = (fixedKw ?? kw).trim();
    if (!key) return alert("請先輸入關鍵字");
    setLastKw(key);
    startTimerIfNeeded();

    setLoading(true);
    setRevealed(false);
    setPicked(null);

    try {
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(key)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Pick failed");
      setCurrent(data);

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

  // 點選答案：即判分，2 秒後自動下一題（若仍在倒數內）
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
    setScore(0);
    setQCount(0);
    setCorrectCount(0);
    setWrongCount(0);
    setTimeLeft(60);
    setGameStarted(false);
    setGameOver(false);
    setCurrent(null);
    setPicked(null);
    setRevealed(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const accuracy = qCount ? Math.round((correctCount / qCount) * 100) : 0;

  return (
    <main className="container">
      <h1 className="h1">🎵 GuessWhat — YouTube MV 猜歌（60 秒挑戰）</h1>

      {/* 搜尋 + 手動下一題 */}
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

      {/* 計分板 + 倒數 */}
      <div style={{marginTop: 8, fontSize: 14, color:"#444", display:"flex", gap:12, flexWrap:"wrap"}}>
        <span>⏱️ 時間：<strong>{timeLeft}s</strong></span>
        <span>題數：<strong>{qCount}</strong></span>
        <span>分數：<strong>{score}</strong></span>
        <span>正確：<strong>{correctCount}</strong></span>
        <span>錯誤：<strong>{wrongCount}</strong></span>
        <span>命中率：<strong>{accuracy}%</strong></span>
      </div>

      {/* 題目區：播放器 + 強力遮蔽（頂部實心 + 漸層，下方漸層 + 全域淡遮罩） */}
      <div className="stage" style={{ marginTop: 12, position: "relative" }}>
        <div id="player" ref={playerRef} style={{ width: "100%", height: "100%" }}/>
        {current && !gameOver && (
          <>
            <div style={{ position:"absolute", left:0, right:0, top:0, height:"18%", background:"#000", pointerEvents:"none" }}/>
            <div style={{ position:"absolute", left:0, right:0, top:0, height:"36%", background:"linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0))", pointerEvents:"none" }}/>
            <div style={{ position:"absolute", left:0, right:0, bottom:0, height:"18%", background:"linear-gradient(0deg, rgba(0,0,0,0.5), rgba(0,0,0,0))", pointerEvents:"none" }}/>
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.12)", pointerEvents:"none" }}/>
          </>
        )}
      </div>

      {/* 四選一 */}
      {current && !gameOver && (
        <div style={{ marginTop: 12, display:"grid", gap: 8 }}>
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
                  color: "#fff"
                }}
                disabled={revealed} // 已揭曉就不再點
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

      {/* 結算畫面 */}
      {gameOver && (
        <div className="card" style={{marginTop:12}}>
          <h3 style={{margin:"8px 0"}}>⏱️ 時間到！成績單</h3>
          <div>總題數：<strong>{qCount}</strong></div>
          <div>總分：<strong>{score}</strong></div>
          <div>正確：<strong>{correctCount}</strong>　錯誤：<strong>{wrongCount}</strong></div>
          <div>命中率：<strong>{accuracy}%</strong></div>
          <div style={{marginTop:10, display:"flex", gap:8}}>
            <button className="button" onClick={restart}>再玩一次</button>
            {lastKw && <button className="button" onClick={()=>{ restart(); setKw(lastKw); startRound(lastKw); }}>用同關鍵字再玩</button>}
          </div>
        </div>
      )}
    </main>
  );
}
