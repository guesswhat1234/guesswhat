import "./../styles/globals.css";

export const metadata = {
  title: "YouTube MV 猜歌遊戲",
  description: "輸入關鍵字，從 YouTube 隨機 MV 片段暫停成題目，猜歌名與歌手！",
  viewport: { width: 'device-width', initialScale: 1, maximumScale: 1 },
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
