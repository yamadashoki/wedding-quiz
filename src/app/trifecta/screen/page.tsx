import DerbyApp from '../_components/DerbyApp';

export const metadata = { title: 'ウェディングサンレンタン！｜会場スクリーン' };

// 会場プロジェクター用（3D中継）
export default function Page() {
    return <DerbyApp role="screen" basePath="/trifecta" />;
}
