# YouTube MV Guess Game — Mobile Friendly (Next.js)

A responsive web game for phones: type a keyword → get a paused random MV frame → guess the title & artist → reveal the answer.

## Quick Start
1) Install
```bash
npm i
```
2) Environment
Create `.env.local` (already generated for you here). If you want to change values:
```
YT_API_KEY=YOUR_YOUTUBE_DATA_API_KEY
REGION_CODE=TW
RELEVANCE_LANGUAGE=zh-Hant
```
3) Run
```bash
npm run dev
```
Open http://localhost:3000

## Deploy (Vercel suggested)
- Import repo on Vercel
- Add `YT_API_KEY`, `REGION_CODE`, `RELEVANCE_LANGUAGE` in Project → Settings → Environment Variables
- Deploy

## Notes
- Uses YouTube IFrame Player API to display/pause video frames (no downloading/recording).
- YouTube Data API v3 called from server routes only.
- Basic mobile-first UI with larger tap targets.
