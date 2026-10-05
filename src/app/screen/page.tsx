"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Game } from "@/lib/types";

interface ScreenGameData {
  game: Game | null;
  yes_count?: number;
  total?: number;
}

// 紙吹雪パーティクルの型
interface ConfettiParticle {
  id: number;
  left: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  rotation: number;
  shape: "square" | "circle" | "triangle";
}

export default function ScreenPage() {
  const [gameData, setGameData] = useState<ScreenGameData>({ game: null });
  const [slotDigitTens, setSlotDigitTens] = useState(0);
  const [slotDigitOnes, setSlotDigitOnes] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [revealedCount, setRevealedCount] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
  const [sparkles, setSparkles] = useState<{ id: number; left: number; top: number; delay: number }[]>([]);
  const slotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const prevGameIdRef = useRef<string | null>(null);

  // ゲーム情報取得
  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch("/api/game?role=screen");
      const data = await res.json();
      if (data.success) {
        setGameData(data.data);
      }
    } catch (err) {
      console.error("Screen fetch error:", err);
    }
  }, []);

  // ポーリング
  useEffect(() => {
    fetchGame();
    pollingRef.current = setInterval(fetchGame, 1500);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchGame]);

  // スロットアニメーション制御
  useEffect(() => {
    const game = gameData.game;
    if (!game) return;

    const currentStatus = game.status;
    const currentGameId = game.id;

    // 新しいゲームが始まったらリセット
    if (prevGameIdRef.current !== currentGameId) {
      prevGameIdRef.current = currentGameId;
      setIsRevealed(false);
      setRevealedCount(null);
      setShowFlash(false);
      setConfetti([]);
      setSparkles([]);
    }

    // ステータス変化を検出
    if (prevStatusRef.current !== currentStatus) {
      const prevStatus = prevStatusRef.current;
      prevStatusRef.current = currentStatus;

      if (currentStatus === "answering") {
        // 回答開始 → スロットアニメーション開始
        setIsRevealed(false);
        setRevealedCount(null);
        setShowFlash(false);
        setConfetti([]);
        setSparkles([]);
        startSlotAnimation();
      } else if (currentStatus === "revealed" && prevStatus === "answering") {
        // 回答締切 → アニメーション停止、結果表示
        stopSlotAnimation();
        const yesCount = gameData.yes_count ?? 0;
        revealResult(yesCount);
      } else if (currentStatus === "revealed") {
        // ページリロードなどで revealed に入った場合
        stopSlotAnimation();
        if (gameData.yes_count !== undefined) {
          setRevealedCount(gameData.yes_count);
          setIsRevealed(true);
        }
      }
    } else if (currentStatus === "revealed" && revealedCount === null && gameData.yes_count !== undefined) {
      // データが遅れて到着した場合
      setRevealedCount(gameData.yes_count);
      setIsRevealed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameData]);

  // スロットアニメーション開始
  const startSlotAnimation = () => {
    stopSlotAnimation();
    slotIntervalRef.current = setInterval(() => {
      setSlotDigitTens(Math.floor(Math.random() * 10));
      setSlotDigitOnes(Math.floor(Math.random() * 10));
    }, 80);
  };

  // スロットアニメーション停止
  const stopSlotAnimation = () => {
    if (slotIntervalRef.current) {
      clearInterval(slotIntervalRef.current);
      slotIntervalRef.current = null;
    }
  };

  // 結果表示演出
  const revealResult = (yesCount: number) => {
    // フラッシュ効果
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 600);

    // 数字表示
    setRevealedCount(yesCount);
    setIsRevealed(true);
  };



  // クリーンアップ
  useEffect(() => {
    return () => {
      stopSlotAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const game = gameData.game;

  // 2桁表示用フォーマット
  const formatTwoDigits = (n: number) => {
    return n.toString().padStart(2, "0");
  };

  // 表示する数字
  const displayTens = isRevealed && revealedCount !== null
    ? Math.floor(revealedCount / 10)
    : slotDigitTens;
  const displayOnes = isRevealed && revealedCount !== null
    ? revealedCount % 10
    : slotDigitOnes;

  // 待機画面（ゲームなし or waiting）
  if (!game || game.status === "waiting") {
    return (
      <main className="screen-bg flex flex-col items-center justify-center text-white">
        <div className="text-center">
          <h1 className="font-display text-6xl md:text-8xl font-black mb-6 text-gold-gradient neon-glow">
            アンケートビンゴ
          </h1>
          <div className="mt-12 text-2xl text-purple-400/60 animate-pulse">
            次の質問をお待ちください...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="screen-bg flex flex-col items-center justify-center text-white relative overflow-hidden">
      {/* フラッシュ効果 */}
      {showFlash && <div className="flash-overlay" />}

      {/* 紙吹雪 */}
      {confetti.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: p.shape === "circle" ? `${p.size}px` : `${p.size * 1.5}px`,
            backgroundColor: p.shape !== "triangle" ? p.color : "transparent",
            borderRadius: p.shape === "circle" ? "50%" : "0",
            borderLeft: p.shape === "triangle" ? `${p.size / 2}px solid transparent` : "none",
            borderRight: p.shape === "triangle" ? `${p.size / 2}px solid transparent` : "none",
            borderBottom: p.shape === "triangle" ? `${p.size}px solid ${p.color}` : "none",
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}

      {/* キラキラ */}
      {sparkles.map((s) => (
        <div
          key={s.id}
          className="sparkle"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}

      {/* メインコンテンツ */}
      <div className="text-center z-10 px-8 w-full max-w-5xl">
        {/* 質問表示 */}
        <div className="mb-12 md:mb-16">
          <div className="inline-block bg-white/10 backdrop-blur-xl rounded-3xl px-10 py-6 border border-white/20 shadow-2xl">
            <p className="font-display text-3xl md:text-5xl lg:text-6xl font-black leading-relaxed text-white">
              {game.question}
            </p>
          </div>
        </div>

        {/* ラベル */}
        <div className="mb-6">
          <span className="text-xl md:text-2xl text-purple-300 font-bold tracking-widest">
            {isRevealed ? "YES の人数" : "回答受付中..."}
          </span>
        </div>

        {/* 数字表示 */}
        <div className="relative inline-block">
          <div
            className={`
              bg-gradient-to-b from-gray-900 to-black
              rounded-3xl border-4
              ${isRevealed ? "border-wedding-gold shadow-[0_0_60px_rgba(255,215,0,0.4)]" : "border-purple-500/50 shadow-[0_0_40px_rgba(168,85,247,0.3)]"}
              px-12 md:px-20 py-8 md:py-12
              transition-all duration-500
            `}
          >
            <div className="flex items-center justify-center gap-4 md:gap-8">
              {/* 十の位 */}
              <div
                className={`
                  slot-digit text-[10rem] md:text-[14rem] lg:text-[18rem] leading-none
                  ${isRevealed
                    ? "text-wedding-gold neon-glow"
                    : "text-green-400"
                  }
                  transition-colors duration-300
                `}
              >
                {displayTens}
              </div>
              {/* 一の位 */}
              <div
                className={`
                  slot-digit text-[10rem] md:text-[14rem] lg:text-[18rem] leading-none
                  ${isRevealed
                    ? "text-wedding-gold neon-glow"
                    : "text-green-400"
                  }
                  transition-colors duration-300
                `}
              >
                {displayOnes}
              </div>
            </div>
          </div>

          {/* 回答中のインジケーター */}
          {!isRevealed && (
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
              <span className="text-red-400 text-sm font-bold tracking-wider">LIVE</span>
            </div>
          )}
        </div>

        {/* 結果表示時のサブ情報 */}
        {isRevealed && revealedCount !== null && (
          <div className="mt-8 animate-fade-in">
            <p className="text-3xl md:text-4xl font-bold text-purple-300">
              YESの回答数: {revealedCount}人
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
