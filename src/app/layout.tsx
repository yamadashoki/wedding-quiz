import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "アンケートビンゴ - 結婚式二次会ゲーム",
  description: "結婚式二次会で使えるアンケートビンゴゲーム。参加者がスマホからYES/NOで回答し、リアルタイムで集計します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
