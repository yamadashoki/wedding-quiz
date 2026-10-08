import DerbyApp from '../_components/DerbyApp';

export const metadata = { title: 'ウェディングサンレンタン！｜参加者' };

// 参加者スマホ用（QRコードで配布するURL）
export default function Page() {
    return <DerbyApp role="play" basePath="/trifecta" />;
}
