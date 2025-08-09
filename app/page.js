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
  const [score, setScore] = useState(0);   // 總分
  const [qCount, setQCount] = useState(0); // 題數

  // 載入 YouTube IFrame API
  useEffect(() => {
    if (window.YT && window.YT.Player) { setYtReady(true); return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    // @ts-ignore
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
  }, []);

  // 建立 Player
  useEffect(() => {
    if (!ytReady || !playerRef.current || playerObj.current) return;
    // @ts-ignore
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

  // 出題（可帶入固定 kw；未帶入則用輸入框）
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

      // 載入影片並跳到隨機秒數，立即暫停
      playerObj.current?.loadVideoById(data.videoId);
      const handler = (e) => {
        // @ts-ignore
        if (e.data === window.YT.PlayerState.PLAYING) {
          playerObj.current.seekTo(data.t, true);
          setTimeout(() => playerObj.current.pauseVideo(), 120);
          // @ts-ignore
          playerObj.current.removeEventListener("onStateChange", handler);
        }
      };
      // @ts-ignore
      playerObj.current.addEventListener("onStateChange", handler);
      setQCount(prev => prev + 1);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 點選答案：立即判分，2 秒後自動下一題
  const choose = (idx) => {
    if (!current || revealed) return;
    setPicked(idx);
    const correct = idx === current.correctIndex;
    setScore(s => s + (correct ? 100 : 0)); // 策略：答對 +100 分
    setRevealed(true);
    setTimeout(() => startRound(lastKw), 2000);
  };

  return (
    <main className="container">
      <h1 className="h1">🎵 GuessWhat — YouTube MV 猜歌（四選一連續出題）</h1>

      {/* 搜尋 + 手動下一題 */}
      <div className="row">
        <input
          value={kw}
          onChange={(e)=>setKw(e.target.value)}
          placeholder="輸入歌手/關鍵字（例：周杰倫、抒情、2000s）"
          className="input"
          inputMode="search"
        />
        <button onClick={()=>startRound()} disabled={loading} className="button">
          {loading ? "出題中…" : (current ? "下一題（手動）" : "開始出題")}
        </button>
      </div>

      {/* 計分板 */}
      <div style={{marginTop: 8, fontSize: 14, color:"#444"}}>
        題數：<strong>{qCount}</strong>　分數：<strong>{score}</strong>
      </div>

      {/* 題目區：播放器 + 強力遮蔽 */}
      <div className="stage" style={{ marginTop: 12, position: "relative" }}>
        <div id="player" ref={playerRef} style={{ width: "100%", height: "100%" }}/>
        {current && (
          <>
            {/* 1) 直接覆蓋頂部 28% 的實心黑條（最有效擋標題） */}
            <div style={{
              position:"absolute", left:0, right:0, top:0, height:"28%",
              background:"#000", pointerEvents:"none"
            }}/>
            {/* 2) 再加一層由上往下的漸層，避免邊界明顯 */}
            <div style={{
              position:"absolute", left:0, right:0, top:0, height:"36%",
              background:"linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0))",
              pointerEvents:"none"
            }}/>
            {/* 3) 下方遮蔽（字幕/控制列） */}
            <div style={{
              position:"absolute", left:0, right:0, bottom:0, height:"18%",
              background:"linear-gradient(0deg, rgba(0,0,0,0.5), rgba(0,0,0,0))",
              pointerEvents:"none"
            }}/>
            {/* 4) 輕微全域遮罩，讓殘留字樣更難辨識 */}
            <div style={{
              position:"absolute", inset:0,
              background:"rgba(0,0,0,0.12)",
              pointerEvents:"none"
            }}/>
          </>
        )}
      </div>

      {/* 四選一 */}
      {current && (
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

      {!current && (
        <p className="small" style={{marginTop:12}}>
          提示：輸入歌手名最準（例如「周杰倫」「張學友」），按「開始出題」後即可連續作答。
        </p>
      )}
    </main>
  );
}
