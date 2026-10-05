import Link from "next/link";

export default function TrifectaPage() {
  return (
    <main className="mobile-fullscreen flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-pink-800 to-rose-700 animated-gradient text-white p-6">
      <div className="text-center max-w-md mx-auto bg-black/30 backdrop-blur-md p-8 rounded-3xl border border-white/20 shadow-2xl">
        <div className="text-6xl mb-6 animate-bounce">🎯</div>
        <h1 className="font-display text-3xl md:text-4xl font-black mb-3 text-gold-gradient drop-shadow-md">
          3連単アンケートゲーム
        </h1>
        <div className="inline-block px-4 py-1.5 rounded-full bg-pink-500/30 border border-pink-300/40 text-pink-200 text-sm font-semibold mb-6">
          Coming Soon!
        </div>
        <p className="text-lg text-pink-100/90 mb-8 font-medium">
          このゲームは現在準備中です。
          <br />
          お楽しみに！
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 w-full py-4 px-6 rounded-2xl bg-white/20 hover:bg-white/30 text-white font-bold border border-white/40 shadow-lg transform hover:scale-105 transition-all duration-200"
        >
          👈 ゲーム選択画面に戻る
        </Link>
      </div>
    </main>
  );
}
