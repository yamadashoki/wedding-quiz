import DerbyApp from '../_components/DerbyApp';

export const metadata = { title: 'ウェディングサンレンタン！｜幹事' };

// 幹事用。homeHref は既存ホーム画面のURLに合わせて変更してください
export default function Page() {
    return <DerbyApp role="host" homeHref="/" basePath="/trifecta" />;
}
