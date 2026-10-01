-- ========================================
-- 100分の1アンケート - Supabase テーブル定義
-- ========================================

-- 既存テーブルがある場合は削除（初回セットアップ時のみ）
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS games;

-- ========================================
-- games テーブル
-- ========================================
CREATE TABLE games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'answering', 'revealed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス：最新のゲームを高速に取得
CREATE INDEX idx_games_created_at ON games (created_at DESC);
CREATE INDEX idx_games_status ON games (status);

-- ========================================
-- answers テーブル
-- ========================================
CREATE TABLE answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL,
  answer BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 重複回答防止：同じゲームに同じ参加者は1回のみ
CREATE UNIQUE INDEX idx_answers_unique ON answers (game_id, participant_id);

-- 集計用インデックス
CREATE INDEX idx_answers_game_id ON answers (game_id);
CREATE INDEX idx_answers_game_answer ON answers (game_id, answer);

-- ========================================
-- Row Level Security (RLS) の設定
-- ========================================

-- RLSを有効化
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- games テーブル：全員が読み取り可能（APIルート経由でフィルタリング）
CREATE POLICY "games_select_all" ON games
  FOR SELECT
  USING (true);

-- games テーブル：サービスロールのみ挿入・更新可能
CREATE POLICY "games_insert_service" ON games
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "games_update_service" ON games
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- answers テーブル：サービスロールのみ読み取り可能（参加者から直接取得不可）
CREATE POLICY "answers_select_service" ON answers
  FOR SELECT
  USING (auth.role() = 'service_role');

-- answers テーブル：サービスロールのみ挿入可能
CREATE POLICY "answers_insert_service" ON answers
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ========================================
-- Realtime の有効化（オプション）
-- ========================================
-- 以下のコマンドで Realtime を有効にできます。
-- ただし、このアプリではポーリング方式を使用しているため、
-- Realtime の有効化は必須ではありません。

-- ALTER PUBLICATION supabase_realtime ADD TABLE games;
-- ALTER PUBLICATION supabase_realtime ADD TABLE answers;
