import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mobile-fullscreen flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-pink-800 to-rose-700 animated-gradient text-white p-6">
      <div className="text-center max-w-md mx-auto">
        <div className="mb-8">
          <h1 className="font-display text-5xl md:text-6xl font-black mb-4 text-gold-gradient drop-shadow-lg">
            1人を目指せ！
          </h1>
          <p className="font-display text-2xl md:text-3xl font-bold text-wedding-champagne">
            YES/NOゲーム
          </p>
        </div>

        <div className="mb-4 text-lg text-pink-200 opacity-80">
          結婚式二次会ゲーム
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
            className="block w-full py-3 px-8 rounded-2xl bg-white/20 backdrop-blur-sm text-white text-base font-medium border border-white/30 hover:bg-white/30 transition-all duration-200 text-center"
          >
            🎤 司会者ログイン
          </Link>
        </div>

        <p className="mt-8 text-sm text-pink-300/60">
          スマートフォンからアクセスしてお楽しみください
        </p>
      </div>
    </main>
  );
}
