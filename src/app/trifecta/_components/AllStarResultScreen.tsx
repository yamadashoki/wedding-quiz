'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

export interface Participant {
    id: string;
    name: string;
    score: number;
}

export interface RankedParticipant {
    id: string;
    name: string;
    score: number;
    rank: number;
    isTie: boolean;
}

interface AllStarResultScreenProps {
    participants: Participant[];
    onClose?: () => void;
    canClose?: boolean;
}

// --------------------------------------------------------------
// 紙吹雪パーティクル（Canvas）: 1位発表時に豪華に舞い散る
// --------------------------------------------------------------
function ConfettiCanvas({ active }: { active: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!active) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let w = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
        let h = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

        const colors = ['#f59e0b', '#fbbf24', '#f43f5e', '#ec4899', '#3b82f6', '#10b981', '#ffffff'];
        const particles: Array<{
            x: number;
            y: number;
            size: number;
            color: string;
            speedX: number;
            speedY: number;
            rotation: number;
            rotSpeed: number;
        }> = [];

        for (let i = 0; i < 90; i++) {
            particles.push({
                x: Math.random() * w,
                y: Math.random() * -h * 0.5,
                size: Math.random() * 8 + 6,
                color: colors[Math.floor(Math.random() * colors.length)],
                speedX: (Math.random() - 0.5) * 4,
                speedY: Math.random() * 3 + 2.5,
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 6,
            });
        }

        let animId: number;
        const render = () => {
            ctx.clearRect(0, 0, w, h);
            particles.forEach((p) => {
                p.x += p.speedX;
                p.y += p.speedY;
                p.rotation += p.rotSpeed;
                if (p.y > h) {
                    p.y = -20;
                    p.x = Math.random() * w;
                }
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                ctx.restore();
            });
            animId = requestAnimationFrame(render);
        };
        render();

        return () => {
            cancelAnimationFrame(animId);
        };
    }, [active]);

    if (!active) return null;
    return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-30 w-full h-full" />;
}

// --------------------------------------------------------------
// メインコンポーネント
// --------------------------------------------------------------
export default function AllStarResultScreen({
    participants,
    onClose,
    canClose = true,
}: AllStarResultScreenProps) {
    // 参加者をスコア降順で並べ、ユーザーごとに同率順位でも独立した枠（1行）を付与
    const rankedList = useMemo<RankedParticipant[]>(() => {
        if (!participants || participants.length === 0) return [];
        const sorted = [...participants].sort((a, b) => b.score - a.score);

        // 各スコアの出現回数をカウント（同率タイ判定用）
        const scoreCounts = new Map<number, number>();
        sorted.forEach((p) => {
            scoreCounts.set(p.score, (scoreCounts.get(p.score) ?? 0) + 1);
        });

        const list: RankedParticipant[] = [];
        let currentRank = 1;
        for (let i = 0; i < sorted.length; i++) {
            const p = sorted[i];
            if (i > 0 && p.score < sorted[i - 1].score) {
                currentRank = i + 1;
            }
            list.push({
                id: p.id,
                name: p.name,
                score: p.score,
                rank: currentRank,
                isTie: (scoreCounts.get(p.score) ?? 0) > 1,
            });
        }
        return list;
    }, [participants]);

    // 演出フェーズ: 'intro' | 'rolling' | 'winner_standby' | 'winner'
    const [phase, setPhase] = useState<'intro' | 'rolling' | 'winner_standby' | 'winner'>('intro');
    const [isPaused, setIsPaused] = useState(false);

    // スクロールコンテナ
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    // 現在のハイライト行（最下位から1位へ向かうインデックス）
    const [highlightIndex, setHighlightIndex] = useState<number | null>(null);

    // 演出開始
    const startPresentation = useCallback(() => {
        if (rankedList.length === 0) {
            setPhase('winner');
            return;
        }
        setPhase('rolling');
        setIsPaused(false);

        // 最下位ユーザーからスタート
        const bottomIndex = rankedList.length - 1;
        setHighlightIndex(bottomIndex);

        // 初期スクロール位置を最下部に
        requestAnimationFrame(() => {
            const container = scrollContainerRef.current;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });
    }, [rankedList]);

    // 自動開始（マウント後少し間を置いてスタート）
    useEffect(() => {
        const timer = setTimeout(() => {
            startPresentation();
        }, 1200);
        return () => clearTimeout(timer);
    }, [startPresentation]);

    // スクロールアニメーション進行ループ
    useEffect(() => {
        if (phase !== 'rolling' || isPaused || highlightIndex === null) return;

        // 1位の行（ランク1）に到達したか？
        const currentItem = rankedList[highlightIndex];
        const isCurrentRank1 = currentItem && currentItem.rank === 1;

        if (isCurrentRank1) {
            // 1位発表前のタメ演出（煽りテロップ）
            setPhase('winner_standby');

            const timer = setTimeout(() => {
                setPhase('winner');
            }, 2500); // 2.5秒の緊張のタメ

            return () => clearTimeout(timer);
        }

        // 次の順位へ進める速度（上位になるにつれて少しタメを作る）
        const isNearTop = currentItem && currentItem.rank <= 3;
        const delay = isNearTop ? 1200 : 750;

        const timer = setTimeout(() => {
            const nextIdx = highlightIndex - 1;
            setHighlightIndex(nextIdx);

            // スクロール位置をスムーズに追従
            const targetEl = itemRefs.current.get(nextIdx);
            const container = scrollContainerRef.current;
            if (targetEl && container) {
                const targetTop = targetEl.offsetTop - container.offsetTop;
                const scrollPos = Math.max(0, targetTop - container.clientHeight / 2 + 50);
                container.scrollTo({ top: scrollPos, behavior: 'smooth' });
            }
        }, delay);

        return () => clearTimeout(timer);
    }, [phase, isPaused, highlightIndex, rankedList]);

    // スキップして即座に結果を表示
    const handleSkip = () => {
        setPhase('winner');
        setHighlightIndex(0);
        const container = scrollContainerRef.current;
        if (container) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // もう一度最初から
    const handleReplay = () => {
        startPresentation();
    };

    // 1位のユーザーたち（同率1位がいる場合も全員）
    const winners = useMemo(() => {
        return rankedList.filter((p) => p.rank === 1);
    }, [rankedList]);

    return (
        <div className="absolute inset-0 z-50 bg-slate-950 text-white flex flex-col overflow-hidden select-none">
            {/* 背景：オールスター感謝祭風 サイバー＆スポットライトエフェクト */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-600/20 via-blue-950/40 to-slate-950 pointer-events-none" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b08_1px,transparent_1px),linear-gradient(to_bottom,#1e293b08_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

            {/* 紙吹雪 */}
            <ConfettiCanvas active={phase === 'winner'} />

            {/* -------------------------------------------------------- */}
            {/* ヘッダー：タイトル＆司会操作バー                          */}
            {/* -------------------------------------------------------- */}
            <header className="relative z-20 shrink-0 border-b border-amber-500/30 bg-slate-950/80 backdrop-blur-md px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shadow-2xl">
                <div className="flex items-center gap-3">
                    <span className="text-2xl sm:text-3xl animate-bounce">🏆</span>
                    <div>
                        <div className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-amber-400 uppercase">
                            All-Star Grand Finale
                        </div>
                        <h1 className="text-lg sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-300 drop-shadow">
                            総合成績発表
                        </h1>
                    </div>
                </div>

                {/* 司会コントロールパネル（効果音は不要との指定により音声ボタンなし） */}
                <div className="flex items-center gap-2">
                    {phase === 'rolling' && (
                        <button
                            onClick={() => setIsPaused((prev) => !prev)}
                            className="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-600 hover:bg-blue-500 text-white shadow"
                        >
                            {isPaused ? '▶ 再開' : '⏸ 一時停止'}
                        </button>
                    )}

                    {phase !== 'winner' && (
                        <button
                            onClick={handleSkip}
                            className="px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow"
                        >
                            ⏩ スキップ
                        </button>
                    )}

                    {phase === 'winner' && (
                        <button
                            onClick={handleReplay}
                            className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 shadow"
                        >
                            🔄 最初から見る
                        </button>
                    )}

                    {canClose && onClose && (
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                        >
                            ✕ 閉じる
                        </button>
                    )}
                </div>
            </header>

            {/* -------------------------------------------------------- */}
            {/* メインステージ                                          */}
            {/* -------------------------------------------------------- */}
            <main className="relative z-10 flex-1 flex flex-col items-center justify-start p-3 sm:p-6 overflow-hidden max-w-4xl w-full mx-auto">
                {/* 1位直前の煽りメッセージ（タメ時） */}
                {phase === 'winner_standby' && (
                    <div className="absolute top-8 inset-x-4 z-40 flex justify-center animate-pulse">
                        <div className="bg-gradient-to-r from-red-600 via-amber-500 to-red-600 text-white font-black text-lg sm:text-2xl px-6 py-2.5 rounded-full shadow-[0_0_40px_rgba(239,68,68,0.8)] border-2 border-yellow-200 uppercase tracking-widest text-center">
                            さあ！いよいよ第1位の発表です…！！
                        </div>
                    </div>
                )}

                {/* 1位発表時の特大ポップアップバナー（同率1位でも各ユーザーが独立枠で並ぶ） */}
                {phase === 'winner' && winners.length > 0 && (
                    <div className="w-full mb-3 shrink-0 bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border-2 border-amber-400 rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-center shadow-[0_0_60px_rgba(245,158,11,0.4)] backdrop-blur-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                        <div className="text-2xl sm:text-4xl font-black mb-1 drop-shadow animate-bounce">
                            👑 CHAMPION 👑
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-amber-300 tracking-widest uppercase mb-2">
                            {winners.length > 1 ? `第1位 優勝（同率 ${winners.length}名）` : '第1位 優勝'}
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 my-2">
                            {winners.map((m) => (
                                <div
                                    key={m.id}
                                    className="px-5 sm:px-8 py-2 sm:py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 shadow-xl border-2 border-white flex items-center gap-3"
                                >
                                    <span className="font-black text-lg sm:text-2xl">{m.name}</span>
                                    <span className="font-black font-mono text-base sm:text-xl text-amber-950 bg-amber-200/80 px-2.5 py-0.5 rounded-lg">
                                        {m.score} pt
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ---------------------------------------------------- */}
                {/* オールスター感謝祭 スクロール電光掲示板（1人1枠）      */}
                {/* ---------------------------------------------------- */}
                <div className="w-full flex-1 flex flex-col min-h-0 bg-slate-950/70 border-2 border-blue-900/60 rounded-2xl sm:rounded-3xl p-2.5 sm:p-4 shadow-2xl backdrop-blur-md relative">
                    <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-blue-900/50 mb-2 text-xs font-mono text-blue-300">
                        <span>RANKING BOARD</span>
                        <span>参加者 {rankedList.length} 名</span>
                    </div>

                    {rankedList.length === 0 ? (
                        <div className="m-auto text-slate-400 text-sm font-bold">参加者がいません</div>
                    ) : (
                        <div
                            ref={scrollContainerRef}
                            className="flex-1 overflow-y-auto space-y-2 pr-1.5 scroll-smooth"
                        >
                            {rankedList.map((item, idx) => {
                                const isHighlight = highlightIndex === idx;
                                const isTop1 = item.rank === 1;
                                const isTop2 = item.rank === 2;
                                const isTop3 = item.rank === 3;

                                // オールスター感謝祭風 ランク別カラーリング（同率順位でも1人1枠独立）
                                const cardStyle = isTop1
                                    ? 'border-2 border-amber-400 bg-gradient-to-r from-amber-500/30 via-slate-900 to-amber-950/40 shadow-[0_0_25px_rgba(245,158,11,0.3)]'
                                    : isTop2
                                    ? 'border-2 border-slate-300/80 bg-gradient-to-r from-slate-400/20 via-slate-900 to-slate-900'
                                    : isTop3
                                    ? 'border-2 border-amber-700/80 bg-gradient-to-r from-amber-900/25 via-slate-900 to-slate-900'
                                    : 'border border-blue-900/70 bg-gradient-to-r from-blue-950/30 via-slate-900/90 to-slate-950 hover:border-blue-700/80';

                                const badgeStyle = isTop1
                                    ? 'bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 ring-2 ring-yellow-200'
                                    : isTop2
                                    ? 'bg-gradient-to-r from-slate-200 to-slate-300 text-slate-950'
                                    : isTop3
                                    ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white'
                                    : 'bg-blue-950 text-cyan-300 border border-cyan-500/40';

                                return (
                                    <div
                                        key={item.id}
                                        ref={(el) => {
                                            if (el) itemRefs.current.set(idx, el);
                                            else itemRefs.current.delete(idx);
                                        }}
                                        className={`transition-all duration-300 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 flex items-center justify-between gap-3 ${cardStyle} ${
                                            isHighlight
                                                ? 'ring-4 ring-amber-400 scale-[1.02] shadow-[0_0_35px_rgba(245,158,11,0.6)]'
                                                : ''
                                        }`}
                                    >
                                        {/* 左：順位バッジ */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div
                                                className={`w-14 sm:w-16 h-10 sm:h-11 rounded-xl flex flex-col items-center justify-center font-black shadow-md ${badgeStyle}`}
                                            >
                                                <div className="text-xs sm:text-sm leading-none flex items-center gap-0.5">
                                                    {isTop1 ? '👑' : isTop2 ? '🥈' : isTop3 ? '🥉' : ''}
                                                    <span>{item.rank}位</span>
                                                </div>
                                                {item.isTie && (
                                                    <span className="text-[9px] font-bold opacity-80 leading-tight">
                                                        同率
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* 中央：参加者ネーム（ユーザーごとに独立枠） */}
                                        <div className="flex-1 min-w-0 px-1 sm:px-2">
                                            <div
                                                className={`text-sm sm:text-lg font-black truncate ${
                                                    isTop1
                                                        ? 'text-amber-200'
                                                        : isTop2
                                                        ? 'text-slate-100'
                                                        : isTop3
                                                        ? 'text-amber-200'
                                                        : 'text-white'
                                                }`}
                                            >
                                                {item.name}
                                            </div>
                                        </div>

                                        {/* 右：スコア（電光LED風） */}
                                        <div className="shrink-0 text-right font-mono">
                                            <div
                                                className={`text-base sm:text-xl font-black ${
                                                    isTop1
                                                        ? 'text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                                                        : isTop2
                                                        ? 'text-slate-200'
                                                        : isTop3
                                                        ? 'text-amber-400'
                                                        : 'text-cyan-400'
                                                }`}
                                            >
                                                {item.score}{' '}
                                                <span className="text-xs font-sans font-bold text-slate-400">
                                                    pt
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
