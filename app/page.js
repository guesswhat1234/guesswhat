
"use client";

import { useRef, useState, useEffect } from "react";

export default function Page() {
  const [kw, setKw] = useState("");
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const playerRef = useRef(null);
  const playerObj = useRef(null);
  const [userTitle, setUserTitle] = useState("");
  const [userArtist, setUserArtist] = useState("");
  const [result, setResult] = useState(null);

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
      width: '100%', height: '100%',
      videoId: '',
      playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
      events: { onReady: () => {} },
    });
  }, [ytReady]);

  const startRound = async () => {
    if (!kw) return alert("請先輸入關鍵字");
    setLoading(true);
    setResult(null);
    setUserTitle(''); setUserArtist('');

    try {
      const r = await fetch(`/api/pick?kw=${encodeURIComponent(kw)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Pick failed");
      setCurrent(data);

      playerObj.current?.loadVideoById(data.videoId);
      const handler = (e) => {
        if (e.data === window.YT.PlayerState.PLAYING) {
          playerObj.current.seekTo(data.t, true);
          setTimeout(() => playerObj.current.pauseVideo(), 100);
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

  const checkAnswer = async () => {
    if (!current) return;
    const r = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: { title: userTitle, artist: userArtist },
        answer: { title: current.answerTitle, artist: current.answerArtist },
      }),
    });
    const data = await r.json();
    setResult({ ...data, answer: current });
  };

  return (
    <main className="container">
      <h1 className="h1">🎵 YouTube MV 猜歌遊戲</h1>

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

      <div className="stage" style={{marginTop: 12}}>
        <div id="player" ref={playerRef} style={{width:'100%', height:'100%'}}/>
        {current && <div className="mask">Guess the MV</div>}
      </div>

      <div className="grid">
        <input
          value={userTitle}
          onChange={(e)=>setUserTitle(e.target.value)}
          placeholder="歌名"
          className="input"
          inputMode="text"
        />
        <input
          value={userArtist}
          onChange={(e)=>setUserArtist(e.target.value)}
          placeholder="歌手"
          className="input"
          inputMode="text"
        />
        <button onClick={checkAnswer} disabled={!current} className="button">確認</button>
      </div>

      {result && (
        <div className="card">
          <div style={{fontSize:16, fontWeight:600}}>
            {result.correct ? '✅ 恭喜答對！' : '❌ 差一點！'}
          </div>
          <div style={{marginTop:6}}>
            正解：<strong>{result.answer.answerArtist}《{result.answer.answerTitle}》</strong>
          </div>
          <div style={{marginTop:6}}>
            連結：<a href={`https://www.youtube.com/watch?v=${result.answer.videoId}`} target="_blank" rel="noreferrer">
              https://www.youtube.com/watch?v={result.answer.videoId}
            </a>
          </div>
          <div className="small" style={{marginTop:6}}>
            時間點：{result.answer.t}s / {result.answer.duration}s
          </div>
        </div>
      )}

      <p className="small" style={{marginTop: 12}}>
        本遊戲以 YouTube IFrame Player API 呈現畫面並暫停，不下載或儲存任何影片影像。
      </p>
    </main>
  );
}
