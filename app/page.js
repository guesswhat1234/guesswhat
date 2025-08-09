"use client";
import { useRef, useState, useEffect } from "react";

export default function Page() {
  // ===== 狀態 =====
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

  // 同局不重複的 videoId 集合
  const seenRef = useRef(new Set());

  // ===== 載入 YouTube IFrame API =====
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

  // ===== 計時器 =====
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

  // ===== 出題（可帶 fixedKw；未帶則用輸入框）=====
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
      // 同局不重複：把 seen 的 videoId 傳給後端
      const exclude = encodeURIComponent(Array.from(seenRef.current).join(","));
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(key)}&exclude=${exclude}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Pick failed");
      setCurrent(data);
      seenRef.current.add(String(data.videoId));

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
      console.error(e);
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ===== 作答：即判分，2 秒後自動下一題 =====
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

  // ===== 重來 =====
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
    seenRef.current = new Set();
  };

  const accuracy = qCount ? Math.round((correctCount / qCount) * 100) : 0;

  // ===== 一鍵複製戰報 =====
  const copySummary = async () => {
    const url = window.location.href;
    const text = `我在 GuessWhat MV 猜歌拿到 ${score} 分！\\n題數：${qCount}（正確 ${correctCount}、錯誤 ${wrongCount}，命中率 ${accuracy}%）\\n一起玩：${url}`;
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

  return (
    <main className="container">
      <h1 className="h1">🎵 GuessWhat — MV 猜歌（60 秒挑戰）</h1>

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

      {/* HUD（大字體，手機友善） */}
      <div className="hud">
        <div className="pill">⏱ {timeLeft}s</div>
        <div className="pill">🎯 命中 {accuracy}%</div>
        <div className="pill">📊 題數 {qCount}</div>
        <div className="pill">⭐ 分數 {score}</div>
      </div>

      {/* 題目區：播放器 + 強力遮蔽（頂部 15% 實心 + 漸層，下方漸層 + 全域淡遮罩 + 右上遮擋） */}
      <div className="stage" style={{ marginTop: 12, position: "relative" }}>
        <div id="player" ref={playerRef} style={{ width: "100%", height: "100%" }}/>
        {current && !gameOver && (
          <>
            {/* 頂部 15% 黑條 */}
            <div style={{ position:"absolute", left:0, right:0, top:0, height:"15%", background:"#000", pointerEvents:"none" }}/>
            {/* 頂部漸層銜接 */}
            <div style={{ position:"absolute", left:0, right:0, top:"15%", height:"12%", background:"linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0))", pointerEvents:"none" }}/>
            {/* 下方遮蔽（字幕/控制列） */}
            <div style={{ position:"absolute", left:0, right:0, bottom:0, height:"18%", background:"linear-gradient(0deg, rgba(0,0,0,0.5), rgba(0,0,0,0))", pointerEvents:"none" }}/>
            {/* 輕微全域遮罩 */}
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.12)", pointerEvents:"none" }}/>
            {/* 右上擋住「更多影片/關閉」區域（無法跨域點擊，只能遮） */}
            <div style={{ position:"absolute", top:0, right:0, width:"40%", height:"30%", background:"rgba(0,0,0,0.7)", pointerEvents:"none" }}/>
          </>
        )}
      </div>

      {/* 四選一 */}
      {current && !gameOver && (
        <div style={{ marginTop: 12, display:"grid", gap: 10 }}>
          {current.choices?.map((c, idx) => {
            const chosen = picked === idx;
            const correct = revealed && idx === current.correctIndex;
            const wrong = revealed && chosen && idx !== current.correctIndex;
            const style = {
              textAlign:"left",
              borderRadius: "14px",
              padding: "12px 14px",
              border: chosen ? "2px solid #888" : "1px solid #ccc",
              background: correct ? "#2e7d32" : wrong ? "#b71c1c" : "#111",
              color: "#fff"
            };
            return (
              <button key={idx} onClick={() => choose(idx)} style={style} disabled={revealed}>
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
          <div>正確：<strong>{correctCount}</strong>　錯誤：<strong>{wrongCount}</strong>　命中率：<strong>{accuracy}%</strong></div>
          <div style={{display:"flex", gap:8, flexWrap:"wrap", marginTop:8}}>
            <button className="button" onClick={copySummary}>📋 複製戰報＆連結</button>
            <button className="button" onClick={()=>{ const k = lastKw || kw; restart(); setKw(k); startRound(k); }}>再玩一次</button>
          </div>
        </div>
      )}
    </main>
  );
}
