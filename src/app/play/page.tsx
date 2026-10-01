"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Game } from "@/lib/types";

// UUID v4 生成（外部ライブラリ不要）
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 参加者IDの取得/生成
function getParticipantId(): string {
  if (typeof window === "undefined") return "";
  const key = "wedding_quiz_participant_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function PlayPage() {
  const [participantId, setParticipantId] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [myAnswer, setMyAnswer] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastGameIdRef = useRef<string | null>(null);

  // 参加者ID初期化
  useEffect(() => {
    setParticipantId(getParticipantId());
  }, []);

  // ゲーム情報取得
  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch("/api/game?role=player");
      const data = await res.json();
      if (data.success && data.data?.game) {
        const newGame = data.data.game as Game;
        setGame(newGame);

        // 新しい質問になったらリセット
        if (lastGameIdRef.current !== newGame.id) {
          lastGameIdRef.current = newGame.id;
          setHasAnswered(false);
          setMyAnswer(null);
          setSubmitError("");
          setShowSuccess(false);

          // 回答済みチェック
          if (participantId) {
            const checkRes = await fetch(
              `/api/answer?game_id=${newGame.id}&participant_id=${participantId}`
            );
            const checkData = await checkRes.json();
            if (checkData.success && checkData.data?.answered) {
              setHasAnswered(true);
            }
          }
        }
      } else {
        setGame(null);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [participantId]);

  // ポーリング
  useEffect(() => {
    if (!participantId) return;

    fetchGame();
    pollingRef.current = setInterval(fetchGame, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [participantId, fetchGame]);

  // 回答送信
  const submitAnswer = async (answer: boolean) => {
    if (!game || !participantId || isSubmitting || hasAnswered) return;

    setIsSubmitting(true);
    setSubmitError("");

    // リトライロジック
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game_id: game.id,
            participant_id: participantId,
            answer,
          }),
        });
        const data = await res.json();

        if (data.success) {
          setHasAnswered(true);
          setMyAnswer(answer);
          setShowSuccess(true);
          setIsSubmitting(false);
          return;
        }

        // 既に回答済み
        if (res.status === 409) {
          setHasAnswered(true);
          setIsSubmitting(false);
          return;
        }

        // その他のエラー
        if (attempt === maxRetries) {
          setSubmitError(data.error || "回答の送信に失敗しました");
        }
      } catch {
        if (attempt === maxRetries) {
          setSubmitError("通信エラーが発生しました。もう一度お試しください。");
        }
      }

      // リトライ前に待機
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    setIsSubmitting(false);
  };

  // 再送ボタン
  const retrySubmit = () => {
    setSubmitError("");
  };

  // 待機画面（ゲームがない or 待機中）
  if (!game || game.status === "waiting") {
    return (
      <main className="mobile-fullscreen flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-pink-800 to-rose-700 animated-gradient text-white p-6">
        <div className="text-center">
          <div className="text-6xl mb-6 animate-pulse-slow">🎊</div>
          <h1 className="font-display text-3xl font-black mb-4">
            1人を目指せ！
          </h1>
          <p className="text-xl text-pink-200 mb-2">次の質問を待っています...</p>
          <div className="mt-8 flex items-center gap-2 justify-center text-pink-300/60">
            <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "0ms" }}></div>
            <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "150ms" }}></div>
            <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "300ms" }}></div>
          </div>
        </div>
      </main>
    );
  }

  // 回答締切後
  if (game.status === "revealed") {
    return (
      <main className="mobile-fullscreen flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-pink-800 to-rose-700 animated-gradient text-white p-6">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">📊</div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 mb-6">
            <p className="text-lg font-bold leading-relaxed">{game.question}</p>
          </div>
          <p className="text-xl font-bold text-wedding-gold">回答締切！</p>
          <p className="text-pink-200 mt-2">スクリーンをご覧ください 📺</p>
          {myAnswer !== null && (
            <div className="mt-4 px-6 py-3 rounded-xl bg-white/10 inline-block">
              <span className="text-sm text-pink-300">あなたの回答: </span>
              <span className="font-bold text-lg">
                {myAnswer ? "✅ YES" : "❌ NO"}
              </span>
            </div>
          )}
        </div>
      </main>
    );
  }

  // 回答済み
  if (hasAnswered) {
    return (
      <main className="mobile-fullscreen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-800 via-green-700 to-teal-700 text-white p-6">
        <div className="text-center">
          {showSuccess && (
            <div className="text-7xl mb-6 animate-bounce-in">✅</div>
          )}
          <h2 className="text-3xl font-black mb-4">回答済み！</h2>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 mb-4 max-w-sm">
            <p className="text-lg font-bold leading-relaxed">{game.question}</p>
          </div>
          {myAnswer !== null && (
            <div className="px-8 py-4 rounded-2xl bg-white/20 inline-block">
              <span className="text-2xl font-black">
                {myAnswer ? "YES 👍" : "NO 👎"}
              </span>
            </div>
          )}
          <p className="text-green-200/60 mt-6 text-sm">
            結果発表をお待ちください...
          </p>
        </div>
      </main>
    );
  }

  // 回答画面
  return (
    <main className="mobile-fullscreen flex flex-col bg-gradient-to-br from-purple-900 via-pink-800 to-rose-700 text-white">
      {/* 質問表示 */}
      <div className="flex-shrink-0 p-6 pt-8">
        <div className="text-center">
          <p className="text-sm text-pink-300 mb-2 font-medium">❓ 質問</p>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20">
            <p className="text-xl md:text-2xl font-black leading-relaxed">
              {game.question}
            </p>
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {submitError && (
        <div className="px-6">
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-center">
            <p className="text-red-300 text-sm mb-2">{submitError}</p>
            <button
              onClick={retrySubmit}
              className="text-white bg-red-500/50 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-500/70 transition-colors"
            >
              再試行
            </button>
          </div>
        </div>
      )}

      {/* YES/NOボタン */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 pb-12">
        <button
          onClick={() => submitAnswer(true)}
          disabled={isSubmitting}
          className="btn-press w-full max-w-sm h-28 rounded-3xl bg-gradient-to-br from-green-400 to-emerald-600 text-white text-4xl font-black shadow-xl shadow-green-500/40 hover:shadow-2xl hover:shadow-green-500/50 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-3"
        >
          {isSubmitting ? (
            <span className="text-2xl">送信中...</span>
          ) : (
            <>
              <span>👍</span>
              <span>YES</span>
            </>
          )}
        </button>

        <button
          onClick={() => submitAnswer(false)}
          disabled={isSubmitting}
          className="btn-press w-full max-w-sm h-28 rounded-3xl bg-gradient-to-br from-blue-400 to-indigo-600 text-white text-4xl font-black shadow-xl shadow-blue-500/40 hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-3"
        >
          {isSubmitting ? (
            <span className="text-2xl">送信中...</span>
          ) : (
            <>
              <span>👎</span>
              <span>NO</span>
            </>
          )}
        </button>
      </div>
    </main>
  );
}
