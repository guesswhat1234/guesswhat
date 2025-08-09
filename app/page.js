"use client";
import { useRef, useState, useEffect } from "react";

export default function Page() {
  // …（你原本的 state 都保留）

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

  const seenRef = useRef(new Set());

  // ---- 載入 YouTube IFrame API（保證只載一次）----
  useEffect(() => {
    if (window.YT && window.YT.Player) { setYtReady(true); return; }
    if (document.getElementById("yt-iframe-api")) { return; }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.id = "yt-iframe-api";
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
  }, []);

  // ---- 建立 Player：加上 origin / host，並預設靜音 ----
  useEffect(() => {
    if (!ytReady || !playerRef.current || playerObj.current) return;
    playerObj.current = new window.YT.Player(playerRef.current, {
      width: "100%", height: "100%",
      videoId: "",
      host: "https://www.youtube.com",
      playerVars: {
        controls: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3,
        origin: window.location.origin, // 重要：帶上你的網域
      },
      events: {
        onReady: (e) => {
          // 行動裝置政策：先靜音，之後短播 120ms 就能顯示畫面
          try { e.target.mute(); } catch {}
        }
      },
    });
  }, [ytReady]);

  // ---- 顯示指定影片的某時間點：cue → seek → 播 120ms → 暫停（穩定產生畫面）----
  const displayFrame = (videoId, tSec) => {
    const p = playerObj.current;
    if (!p) return;
    // 先靜音，確保行動裝置允許短暫播放
    try { p.mute(); } catch {}
    // 先 cue（不會直接播放）
    p.cueVideoById({ videoId, startSeconds: Math.max(0, tSec - 0.2) });
    // 等到狀態變成 CUED 再 seek + 播放一下
    const onState = (e) => {
      if (e.data === window.YT.PlayerState.CUED) {
        p.seekTo(tSec, true);
        p.playVideo();
        setTimeout(() => {
          p.pauseVideo();
          // 保險：再 seek 一次目標秒，確保畫面停在該點
          p.seekTo(tSec, true);
        }, 120);
        p.removeEventListener("onStateChange", onState);
      }
    };
    p.addEventListener("onStateChange", onState);
  };

  // ===== 你的出題流程：把過去用 loadVideoById + PLAYING 的地方換成 displayFrame =====
  const startRound = async (fixedKw) => {
    if (gameOver) return;
    const key = (fixedKw ?? kw).trim();
    if (!key) return alert("請先輸入關鍵字");
    setLastKw(key);
    setPicked(null);
    setRevealed(false);

    setLoading(true);
    try {
      // 省略：你原本取題的 fetch 流程（/api/pick …）
      const exclude = encodeURIComponent(Array.from(seenRef.current).join(","));
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(key)}&exclude=${exclude}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Pick failed");

      setCurrent(data);
      seenRef.current.add(String(data.videoId));
      setQCount((c) => c + 1);

      // 這一行是關鍵：用 displayFrame 來顯示目標畫面
      displayFrame(data.videoId, data.t);
    } catch (e) {
      console.error(e);
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ====== 其餘 UI / 計分 / 倒數 / 結束畫面等你的現有程式可原封保留 ======
  // （略：請把你現有的四選一、HUD、結束畫面、建議三選項等邏輯接在下面）
  return (
    <main className="container">
      {/* 你的原本 JSX，記得保留播放器容器 */}
      <div style={{ position:"relative", width:"100%", aspectRatio:"16/9", background:"#000", borderRadius:12 }}>
        <div id="player" ref={playerRef} style={{ position:"absolute", inset:0 }}/>
        {/* 上方 15% 黑遮蔽 */}
        {current && !gameOver && (
          <div style={{ position:"absolute", left:0, right:0, top:0, height:"15%", background:"#000", pointerEvents:"none" }}/>
        )}
      </div>

      {/* …其餘 HUD / 選項 / 結束畫面 */}
    </main>
  );
}
