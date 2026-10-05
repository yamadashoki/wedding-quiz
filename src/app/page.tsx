import Link from "next/link";

export default function GameSelectPage() {
  return (
    <main className="mobile-fullscreen flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-pink-800 to-rose-700 animated-gradient text-white p-6">
      <div className="text-center max-w-lg mx-auto w-full">
        {/* ヘッダータイトル */}
        <div className="mb-10">
          <div className="inline-block px-4 py-1.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs md:text-sm font-semibold tracking-wider uppercase mb-3 shadow-sm">
            ✨ Wedding Party Games ✨
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-black mb-3 text-gold-gradient drop-shadow-lg neon-glow">
            ゲームを選択してください
          </h1>
          <p className="text-base md:text-lg text-pink-200/90 font-medium">
            パーティーを盛り上げるゲームを選んでスタート！
          </p>
        </div>

        {/* ゲーム選択ボタン一覧 */}
        <div className="space-y-5 w-full">
          {/* 3連単アンケートゲーム */}
          <Link
            href="/trifecta"
            className="group relative block w-full p-6 rounded-3xl bg-gradient-to-r from-amber-500/90 via-orange-500/90 to-red-500/90 hover:from-amber-400 hover:via-orange-400 hover:to-red-400 text-white shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300 border border-amber-300/40 overflow-hidden text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-4xl md:text-5xl group-hover:scale-110 transition-transform duration-300">
                  🎯
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-2xl md:text-3xl font-black text-white drop-shadow-sm">
                      3連単アンケートゲーム
                    </h2>
                  </div>
                  <p className="text-xs md:text-sm text-amber-100/90 mt-1">
                    上位3つを予想して連続的中を目指せ！（準備中）
                  </p>
                </div>
              </div>
              <span className="text-2xl opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                ➔
              </span>
            </div>
          </Link>

          {/* アンケートビンゴ */}
          <Link
            href="/fifty"
            className="group relative block w-full p-6 rounded-3xl bg-gradient-to-r from-pink-500/90 via-rose-500/90 to-purple-600/90 hover:from-pink-400 hover:via-rose-400 hover:to-purple-500 text-white shadow-xl hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300 border border-pink-300/40 overflow-hidden text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-4xl md:text-5xl group-hover:scale-110 transition-transform duration-300">
                  🎰
                </span>
                <div>
                  <h2 className="font-display text-2xl md:text-3xl font-black text-white drop-shadow-sm">
                    アンケートビンゴ
                  </h2>
                  <p className="text-xs md:text-sm text-pink-100/90 mt-1">
                    会場参加型のYES/NOリアルタイムアンケートゲーム！
                  </p>
                </div>
              </div>
              <span className="text-2xl opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                ➔
              </span>
            </div>
          </Link>
        </div>

        {/* フッターコメント */}
        <p className="mt-10 text-xs text-pink-300/60">
          結婚式二次会・各種パーティー向けリアルタイムインタラクティブゲーム
        </p>
      </div>
    </main>
  );
}
