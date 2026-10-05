import Link from "next/link";

export default function FiftyGamePage() {
  return (
    <main className="mobile-fullscreen flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-pink-800 to-rose-700 animated-gradient text-white p-6">
      <div className="text-center max-w-md mx-auto w-full">
        <div className="mb-6">
          <span className="inline-block text-4xl mb-2">🎰</span>
          <h1 className="font-display text-4xl md:text-5xl font-black mb-2 text-gold-gradient drop-shadow-lg">
            アンケートビンゴ
          </h1>
          <p className="font-display text-xl md:text-2xl font-bold text-wedding-champagne">
            YES/NO リアルタイム集計ゲーム
          </p>
        </div>

        <div className="mb-6 text-sm text-pink-200/80">
          モードを選択してください
        </div>

        <div className="space-y-4 w-full">
          <Link
            href="/play"
            className="block w-full py-5 px-8 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xl font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 text-center"
          >
            🎉 参加する（ゲスト）
          </Link>

          <Link
            href="/screen"
            className="block w-full py-4 px-8 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-lg font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 text-center"
          >
            📺 スクリーン表示
          </Link>

          <Link
            href="/host"
            className="block w-full py-3.5 px-8 rounded-2xl bg-white/20 backdrop-blur-sm text-white text-base font-medium border border-white/30 hover:bg-white/30 transition-all duration-200 text-center"
          >
            🎤 司会者ログイン
          </Link>

          <div className="pt-4">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 text-sm text-pink-200/70 hover:text-white transition-colors"
            >
              👈 ゲーム選択画面に戻る
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs text-pink-300/60">
          スマートフォンからアクセスしてお楽しみください
        </p>
      </div>
    </main>
  );
}
