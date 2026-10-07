import DerbyApp from './_components/DerbyApp';

export const metadata = { title: '3連単アンケートゲーム｜開発用3画面同時' };

// 開発・動作確認用（1台で3画面を並べる）。本番で不要なら削除してください
export default function Page() {
  return <DerbyApp role="multiview" homeHref="/" basePath="/trifecta" />;
}
