// ゲームのステータス
export type GameStatus = "waiting" | "answering" | "revealed";

// ゲーム（1つの質問セッション）
export interface Game {
  id: string;
  question: string;
  status: GameStatus;
  created_at: string;
  updated_at: string;
}

// 回答
export interface Answer {
  id: string;
  game_id: string;
  participant_id: string;
  answer: boolean; // true = YES, false = NO
  created_at: string;
}

// 集計結果（司会者用）
export interface AnswerCount {
  total: number;
  yes_count: number;
  no_count: number;
}

// スクリーン用の安全な情報（回答中はYES人数を含まない）
export interface ScreenData {
  game: Game | null;
  yes_count?: number; // revealed時のみ
  total?: number; // revealed時のみ
}

// APIレスポンスの型
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
