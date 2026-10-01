"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Game, GameStatus } from "@/lib/types";

interface GameData {
  game: Game | null;
  yes_count: number;
  no_count: number;
  total: number;
}

export default function HostPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [hostPassword, setHostPassword] = useState("");

  const [question, setQuestion] = useState("");
  const [gameData, setGameData] = useState<GameData>({
    game: null,
    yes_count: 0,
    no_count: 0,
    total: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // ログイン処理
  const handleLogin = async () => {
    setAuthError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        setHostPassword(password);
      } else {
        setAuthError(data.error || "認証に失敗しました");
      }
    } catch {
      setAuthError("通信エラーが発生しました");
    }
  };

  // ゲーム情報取得
  const fetchGameData = useCallback(async () => {
    if (!hostPassword) return;
    try {
      const res = await fetch("/api/game", {
        headers: { "x-host-password": hostPassword },
      });
      const data = await res.json();
      if (data.success) {
        setGameData(data.data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [hostPassword]);

  // ポーリング開始
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchGameData();
    pollingRef.current = setInterval(fetchGameData, 1500);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isAuthenticated, fetchGameData]);

  // 新しい質問を開始
  const startNewQuestion = async () => {
    if (!question.trim()) {
      setError("質問を入力してください");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-host-password": hostPassword,
        },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setQuestion("");
        await fetchGameData();
      } else {
        setError(data.error || "質問の作成に失敗しました");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  // ステータス変更
  const updateStatus = async (status: GameStatus) => {
    if (!gameData.game) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/game", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-host-password": hostPassword,
        },
        body: JSON.stringify({ game_id: gameData.game.id, status }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchGameData();
      } else {
        setError(data.error || "ステータスの更新に失敗しました");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  // 状態表示ラベル
  const getStatusLabel = (status: GameStatus) => {
    switch (status) {
      case "waiting":
        return { text: "待機中", color: "bg-gray-500" };
      case "answering":
        return { text: "🔴 回答受付中", color: "bg-red-500" };
      case "revealed":
        return { text: "✅ 回答締切", color: "bg-green-600" };
    }
  };

  // ログイン画面
  if (!isAuthenticated) {
    return (
      <main className="mobile-fullscreen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="w-full max-w-sm bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-2xl">
          <h1 className="text-2xl font-bold text-white text-center mb-2">🎤 司会者ログイン</h1>
          <p className="text-purple-300 text-sm text-center mb-6">
            司会者用パスワードを入力してください
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="パスワード"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 mb-4"
          />
          {authError && (
            <p className="text-red-400 text-sm mb-4 text-center">{authError}</p>
          )}
          <button
            onClick={handleLogin}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-lg hover:opacity-90 transition-opacity"
          >
            ログイン
          </button>
        </div>
      </main>
    );
  }

  const statusInfo = gameData.game
    ? getStatusLabel(gameData.game.status)
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-1">🎤 司会者コントロール</h1>
          <p className="text-purple-300 text-sm">100分の1アンケート</p>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300 text-center text-sm">
            {error}
          </div>
        )}

        {/* 現在のゲーム状態 */}
        {gameData.game && (
          <div className="mb-6 bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20">
            {/* ステータスバッジ */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-purple-300">現在の質問</span>
              {statusInfo && (
                <span
                  className={`px-3 py-1 rounded-full text-white text-sm font-bold ${statusInfo.color}`}
                >
                  {statusInfo.text}
                </span>
              )}
            </div>

            {/* 質問表示 */}
            <p className="text-xl font-bold text-white mb-6 leading-relaxed">
              {gameData.game.question}
            </p>

            {/* 回答集計 */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white/10 rounded-xl p-4 text-center">
                <div className="text-3xl font-black text-white">
                  {gameData.total}
                </div>
                <div className="text-xs text-purple-300 mt-1">回答者数</div>
              </div>
              <div className="bg-green-500/20 rounded-xl p-4 text-center border border-green-500/30">
                <div className="text-3xl font-black text-green-400">
                  {gameData.yes_count}
                </div>
                <div className="text-xs text-green-300 mt-1">YES</div>
              </div>
              <div className="bg-blue-500/20 rounded-xl p-4 text-center border border-blue-500/30">
                <div className="text-3xl font-black text-blue-400">
                  {gameData.no_count}
                </div>
                <div className="text-xs text-blue-300 mt-1">NO</div>
              </div>
            </div>

            {/* 操作ボタン */}
            <div className="space-y-3">
              {gameData.game.status === "answering" && (
                <button
                  onClick={() => updateStatus("revealed")}
                  disabled={isLoading}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white font-bold text-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-red-500/30"
                >
                  🔔 回答締切！
                </button>
              )}
              {gameData.game.status === "waiting" && (
                <button
                  onClick={() => updateStatus("answering")}
                  disabled={isLoading}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold text-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-green-500/30"
                >
                  ▶ 回答開始
                </button>
              )}
            </div>
          </div>
        )}

        {/* 新しい質問入力 */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20">
          <h2 className="text-lg font-bold text-white mb-4">📝 次の質問</h2>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例：今日、結婚式で泣いた人？"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 mb-4 resize-none"
            rows={3}
          />
          <button
            onClick={startNewQuestion}
            disabled={isLoading || !question.trim()}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-purple-500/30"
          >
            🚀 この質問で回答開始！
          </button>
          <p className="text-xs text-purple-400 mt-2 text-center">
            ※ ボタンを押すと即座に回答受付が始まります
          </p>
        </div>

        {/* フッター情報 */}
        <div className="mt-6 text-center text-purple-400/60 text-xs space-y-1">
          <p>参加者URL: <span className="text-purple-300">/play</span></p>
          <p>スクリーンURL: <span className="text-purple-300">/screen</span></p>
        </div>
      </div>
    </main>
  );
}
