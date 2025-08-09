"use client";
import { useRef, useState, useEffect } from "react";

export default function Page() {
  const [kw, setKw] = useState("");
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const playerRef = useRef(null);
  const playerObj = useRef(null);
  const [picked, setPicked] = useState(null);     // 使用者選了哪個 index
  const [revealed, setRevealed] = useState(false);// 是否已揭曉

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
        iv_load_policy: 3, // 關閉註解卡
      },
      events: { onReady: () => {} },
    });
  }, [ytReady]);

  const startRound = async () => {
    if (!kw) return alert("請先輸入關鍵字");
    setLoading(true);
    setRevealed(false);
    setPicked(null);

    try {
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(kw)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Pick failed");
      setCurrent(data);

      // 載入影片並跳到隨機秒數，立刻暫停
      playerObj.current?.loadVideoById(data.videoId);
      const handler = (e) => {
        if (e.data === window.YT.PlayerState.PLAYING) {
          playerObj.current.seekTo(data.t, true);
          setTimeout(() => playerObj.current.pauseVideo(), 120); // 快速暫停，避免頂部 UI
          playerObj.current.removeEventListener("onStateChange", handler);
        }
      };
      playerObj.current.addEventListener("onStateChange", handler);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    if (picked == null) return alert("請先選一個答案");
    setRevealed(true);
  };

  const isCorrect = revealed && picked === current?.correctIndex;

  return (
    <main className="container">
      <h1 className="h1">🎵 GuessWhat — YouTube MV 猜歌（四選一）</h1>

      <div className="row">
        <input
          value={kw}
          onChange={(e)=>setKw(e.target.value)}
          placeholder="輸入歌手/關鍵字（例：周杰倫、抒情、2000s）"
          className="input"
          inputMode="search"
        />
        <button onClick={startRound} disabled={loading} className="button">
          {loading ? "出題中…" : "開始出題"}
        </button>
      </div>

      {/* 題目區：加上上/下遮蔽條，避免 YouTube 介面顯示標題/頻道名 */}
      <div className="stage" style={{ marginTop: 12, position: "relative" }}>
        <div id="player" ref={playerRef} style={{ width: "100%", height: "100%" }}/>
        {/* 上方遮蔽（擋住 ytp-title-ui） */}
        {current && (
          <>
            <div style={{
              position:"absolute", left:0, right:0, top:0, height:"22%",
              background:"linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0))",
              pointerEvents:"none"
            }}/>
            {/* 下方遮蔽（擋字幕/控制列） */}
            <div style={{
              position:"absolute", left:0, right:0, bottom:0, height:"18%",
              background:"linear-gradient(0deg, rgba(0,0,0,0.5), rgba(0,0,0,0))",
              pointerEvents:"none"
            }}/>
            {/* 中央淡遮罩，保留可見度但更難讀文字 */}
            <div style={{
              position:"absolute", inset:0,
              background:"rgba(0,0,0,0.15)",
              pointerEvents:"none"
            }}/>
          </>
        )}
      </div>

      {/* 四選一區 */}
      {current && (
        <div style={{ marginTop: 12, display:"grid", gap: 8 }}>
          {current.choices.map((c, idx) => {
            const chosen = picked === idx;
            const showCorrect = revealed && idx === current.correctIndex;
            const showWrong = revealed && chosen && idx !== current.correctIndex;
            return (
              <button
                key={idx}
                onClick={() => setPicked(idx)}
                className="button"
                style={{
                  textAlign:"left",
                  border: chosen ? "2px solid #555" : "1px solid #ccc",
                  background: showCorrect ? "#d9f7be" : showWrong ? "#ffd8bf" : "#111",
                  color: "#fff"
                }}
              >
                {String.fromCharCode(65+idx)}. {c.artist}《{c.title}》
              </button>
            );
          })}

          {!revealed ? (
            <button onClick={submit} className="button">確認答案</button>
          ) : (
            <div className="card">
              {isCorrect ? "✅ 恭喜答對！" : "❌ 差一點！"}<br/>
              正解：<strong>{current.choices[current.correctIndex].artist}《{current.choices[current.correctIndex].title}》</strong><br/>
              影片：<a href={`https://www.youtube.com/watch?v=${current.videoId}`} target="_blank" rel="noreferrer">
                https://www.youtube.com/watch?v={current.videoId}
              </a>
              <div className="small" style={{marginTop:6}}>
                題目時間點：{current.t}s / {current.duration}s
              </div>
            </div>
          )}
        </div>
      )}

      {!current && (
        <p className="small" style={{marginTop:12}}>提示：輸入關鍵字（歌手名最準，例如「周杰倫」「張學友」）再點開始出題</p>
      )}

      <p className="small" style={{marginTop: 12}}>
        本遊戲以 YouTube IFrame Player API 呈現畫面並暫停，不下載或儲存任何影片影像。
      </p>
    </main>
  );
}
