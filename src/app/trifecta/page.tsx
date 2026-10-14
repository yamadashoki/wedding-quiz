import Link from "next/link";

export const metadata = { title: 'ウェディングサンレンタン！' };

// 3連単アンケートゲームの入口（アンケートビンゴの /fifty と同じ構成）
export default function TrifectaModeSelectPage() {
  return (
    <main className="mobile-fullscreen min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6">
      <div className="text-center max-w-md mx-auto w-full">
        <div className="mb-6">
          <span className="inline-block text-4xl mb-2">🏇</span>
          <h1 className="font-display text-3xl md:text-4xl font-black mb-2 text-amber-300 drop-shadow-lg">
            ウェディングサンレンタン！
          </h1>
          <p className="text-base md:text-lg font-bold text-slate-200">
            1〜3位を予想する 3連単アンケートゲーム
          </p>
        </div>

        <div className="mb-6 text-sm text-slate-400">モードを選択してください</div>

        <div className="space-y-4 w-full">
          <Link
            href="/trifecta/play"
            className="block w-full py-5 px-8 rounded-2xl bg-amber-500 text-slate-950 text-xl font-black shadow-lg hover:bg-amber-400 transition-all duration-200 text-center"
          >
            🎉 参加する（ゲスト）
          </Link>
          <Link
            href="/trifecta/screen"
            className="block w-full py-4 px-8 rounded-2xl bg-slate-800 border border-slate-700 text-white text-lg font-bold shadow-lg hover:bg-slate-700 transition-all duration-200 text-center"
          >
            📺 会場スクリーン（3D中継）
          </Link>
          <Link
            href="/trifecta/host"
            className="block w-full py-3.5 px-8 rounded-2xl bg-white/10 text-white text-base font-medium border border-white/20 hover:bg-white/20 transition-all duration-200 text-center"
          >
            🎤 幹事ログイン
          </Link>
          <div className="pt-4">
            <Link href="/" className="inline-flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              👈 ゲーム選択画面に戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
