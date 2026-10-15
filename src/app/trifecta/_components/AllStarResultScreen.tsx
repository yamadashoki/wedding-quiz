'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

export interface Participant {
    id: string;
    name: string;
    score: number;
}

export interface RankedGroup {
    rank: number;
    score: number;
    members: Participant[];
}

interface AllStarResultScreenProps {
    participants: Participant[];
    onClose?: () => void;
    canClose?: boolean;
}

// --------------------------------------------------------------
// サウンド合成（Web Audio API）: 外部ファイル不要で確実に鳴る
// --------------------------------------------------------------
class SoundEffects {
    private ctx: AudioContext | null = null;
    private drumInterval: any = null;

    private getContext(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    // ロール中の「ピッ」「ポッ」というデジタルカウント音
    playTick(high = false) {
        try {
            const ctx = this.getContext();
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(high ? 880 : 587.33, ctx.currentTime);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

            osc.start();
            osc.stop(ctx.currentTime + 0.06);
        } catch { /* noop */ }
    }

    // 緊張のドラムロール開始
    startDrumroll() {
        this.stopDrumroll();
        try {
            const ctx = this.getContext();
            if (!ctx) return;
            this.drumInterval = setInterval(() => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(140 + Math.random() * 50, ctx.currentTime);
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
                osc.start();
                osc.stop(ctx.currentTime + 0.04);
            }, 60);
        } catch { /* noop */ }
    }

    stopDrumroll() {
        if (this.drumInterval) {
            clearInterval(this.drumInterval);
            this.drumInterval = null;
        }
    }

    // 1位発表時のドカンというシンバル＋ファンファーレ
    playFanfare() {
        this.stopDrumroll();
        try {
            const ctx = this.getContext();
            if (!ctx) return;
            const now = ctx.currentTime;

            // ドカン（低音クラッシュ）
            const oscCrash = ctx.createOscillator();
            const gainCrash = ctx.createGain();
            oscCrash.type = 'triangle';
            oscCrash.frequency.setValueAtTime(110, now);
            oscCrash.frequency.exponentialRampToValueAtTime(40, now + 0.4);
            gainCrash.gain.setValueAtTime(0.3, now);
            gainCrash.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
            oscCrash.connect(gainCrash);
            gainCrash.connect(ctx.destination);
            oscCrash.start(now);
            oscCrash.stop(now + 0.8);

            // 明るいファンファーレ和音 (C major chord: C5, E5, G5, C6)
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.07);
                gain.gain.setValueAtTime(0.12, now + idx * 0.07);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.07);
                osc.stop(now + 1.2);
            });
        } catch { /* noop */ }
    }
}

const sfx = new SoundEffects();

// --------------------------------------------------------------
// 紙吹雪パーティクル（Canvas）
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
    // 参加者をスコア降順でグループ化（同率順位を完全サポート）
    const rankedGroups = useMemo<RankedGroup[]>(() => {
        if (!participants || participants.length === 0) return [];
        const sorted = [...participants].sort((a, b) => b.score - a.score);
        const groups: RankedGroup[] = [];
        let currentRank = 1;

        for (let i = 0; i < sorted.length; i++) {
            const p = sorted[i];
            if (i === 0) {
                groups.push({ rank: 1, score: p.score, members: [p] });
            } else {
                const prev = groups[groups.length - 1];
                if (p.score === prev.score) {
                    prev.members.push(p);
                } else {
                    currentRank = i + 1;
                    groups.push({ rank: currentRank, score: p.score, members: [p] });
                }
            }
        }
        return groups;
    }, [participants]);

    // 演出フェーズ: 'intro' | 'rolling' | 'winner_standby' | 'winner'
    const [phase, setPhase] = useState<'intro' | 'rolling' | 'winner_standby' | 'winner'>('intro');
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [isPaused, setIsPaused] = useState(false);

    // スクロールコンテナ
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    // 現在のハイライト行（最下位グループから1位グループへ向かう）
    const [highlightRankIndex, setHighlightRankIndex] = useState<number | null>(null);

    // 演出開始
    const startPresentation = useCallback(() => {
        if (rankedGroups.length === 0) {
            setPhase('winner');
            return;
        }
        setPhase('rolling');
        setIsPaused(false);

        // 最下位グループからスタート
        const bottomIndex = rankedGroups.length - 1;
        setHighlightRankIndex(bottomIndex);

        // 初期スクロール位置を最下部に
        requestAnimationFrame(() => {
            const container = scrollContainerRef.current;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });
    }, [rankedGroups]);

    // 自動開始（マウント後少し間を置いてスタート）
    useEffect(() => {
        const timer = setTimeout(() => {
            startPresentation();
        }, 1200);
        return () => clearTimeout(timer);
    }, [startPresentation]);

    // スクロールアニメーション進行ループ
    useEffect(() => {
        if (phase !== 'rolling' || isPaused || highlightRankIndex === null) return;

        // 最後の1位グループに到達したか？
        if (highlightRankIndex === 0) {
            // 1位直前のタメ演出
            setPhase('winner_standby');
            if (soundEnabled) sfx.startDrumroll();

            const timer = setTimeout(() => {
                if (soundEnabled) sfx.playFanfare();
                setPhase('winner');
            }, 2600); // 2.6秒の緊張のドラムロール

            return () => clearTimeout(timer);
        }

        // 次の順位へ進める速度（上位になるにつれて少しタメを作る）
        const isNearTop = highlightRankIndex <= 2;
        const delay = isNearTop ? 1400 : 850;

        const timer = setTimeout(() => {
            const nextIdx = highlightRankIndex - 1;
            setHighlightRankIndex(nextIdx);

            if (soundEnabled) {
                sfx.playTick(isNearTop);
            }

            // スクロール位置をスムーズに追従
            const targetEl = itemRefs.current.get(nextIdx);
            const container = scrollContainerRef.current;
            if (targetEl && container) {
                const targetTop = targetEl.offsetTop - container.offsetTop;
                // 中央または少し上に持ってくる
                const scrollPos = Math.max(0, targetTop - container.clientHeight / 2 + 50);
                container.scrollTo({ top: scrollPos, behavior: 'smooth' });
            }
        }, delay);

        return () => clearTimeout(timer);
    }, [phase, isPaused, highlightRankIndex, soundEnabled]);

    // スキップして即座に結果を表示
    const handleSkip = () => {
        sfx.stopDrumroll();
        if (soundEnabled) sfx.playFanfare();
        setPhase('winner');
        setHighlightRankIndex(0);
        const container = scrollContainerRef.current;
        if (container) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // もう一度最初から
    const handleReplay = () => {
        sfx.stopDrumroll();
        startPresentation();
    };

    // 1位グループ
    const topGroup = rankedGroups.length > 0 ? rankedGroups[0] : null;

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

                {/* 司会コントロールパネル */}
                <div className="flex items-center gap-2">
                    {/* 音声トグル */}
                    <button
                        onClick={() => setSoundEnabled((prev) => !prev)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                            soundEnabled
                                ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                        title="サウンド切り替え"
                    >
                        <span>{soundEnabled ? '🔊 ON' : '🔇 OFF'}</span>
                    </button>

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
                            🔄 もう一度見る
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
            <main className="relative z-10 flex-1 flex flex-col items-center justify-start p-3 sm:p-6 overflow-hidden max-w-5xl w-full mx-auto">
                {/* 1位直前の煽りメッセージ（ドラムロール時） */}
                {phase === 'winner_standby' && (
                    <div className="absolute top-8 inset-x-4 z-40 flex justify-center animate-pulse">
                        <div className="bg-gradient-to-r from-red-600 via-amber-500 to-red-600 text-white font-black text-lg sm:text-2xl px-6 py-2.5 rounded-full shadow-[0_0_40px_rgba(239,68,68,0.8)] border-2 border-yellow-200 uppercase tracking-widest text-center">
                            🥁 さあ！いよいよ第1位の発表です…！！ 🥁
                        </div>
                    </div>
                )}

                {/* 1位発表時の特大ポップアップバナー */}
                {phase === 'winner' && topGroup && (
                    <div className="w-full mb-4 shrink-0 bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border-2 border-amber-400 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-center shadow-[0_0_60px_rgba(245,158,11,0.4)] backdrop-blur-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                        <div className="text-3xl sm:text-5xl font-black mb-1 drop-shadow animate-bounce">
                            👑 CHAMPION 👑
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-amber-300 tracking-widest uppercase mb-2">
                            {topGroup.members.length > 1 ? `第1位（同率 ${topGroup.members.length}名）` : '第1位 優勝'}
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 my-2">
                            {topGroup.members.map((m) => (
                                <span
                                    key={m.id}
                                    className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 font-black text-xl sm:text-3xl shadow-lg border-2 border-white"
                                >
                                    {m.name}
                                </span>
                            ))}
                        </div>
                        <div className="mt-2 text-2xl sm:text-4xl font-black font-mono text-amber-300 drop-shadow">
                            {topGroup.score} <span className="text-base sm:text-xl text-amber-200">pt</span>
                        </div>
                    </div>
                )}

                {/* ---------------------------------------------------- */}
                {/* オールスター感謝祭 スクロール電光掲示板               */}
                {/* ---------------------------------------------------- */}
                <div className="w-full flex-1 flex flex-col min-h-0 bg-slate-950/70 border-2 border-blue-900/60 rounded-2xl sm:rounded-3xl p-2.5 sm:p-4 shadow-2xl backdrop-blur-md relative">
                    <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-blue-900/50 mb-2 text-xs font-mono text-blue-300">
                        <span>RANKING BOARD</span>
                        <span>{rankedGroups.length} グループ / 参加者 {participants.length} 名</span>
                    </div>

                    {rankedGroups.length === 0 ? (
                        <div className="m-auto text-slate-400 text-sm font-bold">参加者がいません</div>
                    ) : (
                        <div
                            ref={scrollContainerRef}
                            className="flex-1 overflow-y-auto space-y-2.5 pr-1.5 scroll-smooth"
                        >
                            {rankedGroups.map((group, idx) => {
                                const isHighlight = highlightRankIndex === idx;
                                const isTop1 = group.rank === 1;
                                const isTop2 = group.rank === 2;
                                const isTop3 = group.rank === 3;
                                const isTie = group.members.length > 1;

                                // オールスター感謝祭風 ランク別カラーリング
                                const cardStyle = isTop1
                                    ? 'border-2 border-amber-400 bg-gradient-to-r from-amber-500/30 via-slate-900 to-amber-950/40 shadow-[0_0_30px_rgba(245,158,11,0.35)]'
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
                                        key={group.rank}
                                        ref={(el) => {
                                            if (el) itemRefs.current.set(idx, el);
                                            else itemRefs.current.delete(idx);
                                        }}
                                        className={`transition-all duration-300 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex items-center justify-between gap-3 ${cardStyle} ${
                                            isHighlight
                                                ? 'ring-4 ring-amber-400 scale-[1.02] shadow-[0_0_35px_rgba(245,158,11,0.6)]'
                                                : ''
                                        }`}
                                    >
                                        {/* 左：順位バッジ */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div
                                                className={`w-14 sm:w-20 h-10 sm:h-12 rounded-xl flex flex-col items-center justify-center font-black shadow-md ${badgeStyle}`}
                                            >
                                                <div className="text-xs sm:text-sm leading-none flex items-center gap-0.5">
                                                    {isTop1 ? '👑' : isTop2 ? '🥈' : isTop3 ? '🥉' : 'NO.'}
                                                    <span>{group.rank}位</span>
                                                </div>
                                                {isTie && (
                                                    <span className="text-[9px] font-bold opacity-80 leading-tight">
                                                        同率
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* 中央：参加者ネーム（同率タイの場合も折り返しタグで綺麗に並ぶ） */}
                                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 sm:gap-2">
                                            {group.members.map((m) => (
                                                <span
                                                    key={m.id}
                                                    className={`inline-flex items-center px-2.5 sm:px-3.5 py-1 rounded-lg font-black text-xs sm:text-base border shadow-sm ${
                                                        isTop1
                                                            ? 'bg-amber-400/20 border-amber-300 text-amber-200'
                                                            : isTop2
                                                            ? 'bg-slate-800 border-slate-400 text-slate-100'
                                                            : isTop3
                                                            ? 'bg-amber-950/60 border-amber-600 text-amber-200'
                                                            : 'bg-slate-900 border-slate-700 text-slate-200'
                                                    }`}
                                                >
                                                    {m.name}
                                                </span>
                                            ))}
                                        </div>

                                        {/* 右：スコア（電光LED風） */}
                                        <div className="shrink-0 text-right font-mono">
                                            <div
                                                className={`text-lg sm:text-2xl font-black ${
                                                    isTop1
                                                        ? 'text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                                                        : isTop2
                                                        ? 'text-slate-200'
                                                        : isTop3
                                                        ? 'text-amber-400'
                                                        : 'text-cyan-400'
                                                }`}
                                            >
                                                {group.score}{' '}
                                                <span className="text-xs sm:text-sm font-sans font-bold text-slate-400">
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
