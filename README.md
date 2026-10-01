# 🎊 100分の1アンケート - 結婚式二次会ゲーム

「笑っていいとも！」風の100分の1アンケートゲームアプリです。  
結婚式二次会で50〜60人の参加者がスマートフォンからYES/NOで回答し、リアルタイムで集計・演出します。

## 🎮 画面構成

| 画面 | URL | 用途 |
|------|-----|------|
| トップ | `/` | 各画面へのナビゲーション |
| 参加者画面 | `/play` | ゲスト用。スマホでYES/NOを回答 |
| 司会者画面 | `/host` | 司会者用。質問入力・回答開始/締切操作 |
| スクリーン画面 | `/screen` | プロジェクター用。数字のスロット演出・結果表示 |

## 📱 QRコード

参加者が簡単にアクセスできるよう、以下のURLをQRコードにして会場で表示してください：

```
https://あなたのドメイン/play
```

QRコード生成には以下のようなサービスが使えます：
- [QRのススメ](https://qr.quel.jp/)
- [QR Code Generator](https://www.qr-code-generator.com/)
- スマートフォンアプリ（QRコード作成アプリ）

## 🛠 セットアップ手順

### 1. リポジトリのクローン

```bash
git clone <このリポジトリのURL>
cd wedding-100-quiz
```

### 2. パッケージのインストール

```bash
npm install
```

### 3. Supabase プロジェクトの作成

1. [Supabase](https://supabase.com/) にアクセスしてアカウント作成
2. 「New Project」をクリック
3. プロジェクト名（例：`wedding-quiz`）を入力
4. データベースパスワードを設定
5. リージョンは「Northeast Asia (Tokyo)」を選択
6. 「Create new project」をクリック

### 4. データベースのセットアップ

1. Supabase ダッシュボードで「SQL Editor」を開く
2. `supabase/schema.sql` の内容をコピー＆ペースト
3. 「Run」をクリックしてSQLを実行

### 5. 環境変数の設定

`.env.local.example` をコピーして `.env.local` を作成します：

```bash
cp .env.local.example .env.local
```

Supabase ダッシュボードの「Settings」→「API」から以下の値をコピー：

```env
# Supabase の「Project URL」
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co

# Supabase の「anon public」キー
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...

# Supabase の「service_role」キー（⚠️ 絶対に公開しないこと）
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# 司会者用のパスワード（自由に設定）
HOST_PASSWORD=your-secret-password
```

> ⚠️ `.env.local` は `.gitignore` に含まれているため、Gitにコミットされません。

### 6. ローカル起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 にアクセスします。

### 7. Vercel へのデプロイ

1. [Vercel](https://vercel.com/) にアクセスしてアカウント作成
2. 「Import Project」からGitリポジトリをインポート
3. 「Environment Variables」に以下を設定：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `HOST_PASSWORD`
4. 「Deploy」をクリック

デプロイ完了後、割り当てられたURLでアクセスできます。

## 🎬 使い方

### 結婚式当日の流れ

1. **事前準備**
   - `/play` のURLをQRコードにして印刷・表示
   - プロジェクターのPCで `/screen` を全画面表示
   - 司会者のスマホ/PCで `/host` にログイン

2. **ゲーム開始**
   - 司会者が「参加者の皆さん、スマホでQRコードを読み取ってください」とアナウンス
   - 参加者がスマホで `/play` を開く

3. **各質問の流れ**
   - 司会者が `/host` で質問を入力して「この質問で回答開始！」をクリック
   - 参加者のスマホに質問が表示される
   - 参加者が YES / NO をタップ
   - スクリーンでは数字がスロットのように回転
   - 司会者が盛り上がりを見計らって「回答締切！」をクリック
   - スクリーンの数字が止まり、本当のYES人数が表示される
   - **YESが1人だった場合**、「100分の1達成！！」の華やかな演出が表示される！

4. **次の質問**
   - 司会者が新しい質問を入力して「回答開始」を押す
   - 繰り返し

## 📁 ファイル構成

```
wedding-100-quiz/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # ルートレイアウト
│   │   ├── page.tsx            # トップページ
│   │   ├── globals.css         # グローバルCSS・アニメーション
│   │   ├── host/
│   │   │   └── page.tsx        # 司会者画面
│   │   ├── play/
│   │   │   └── page.tsx        # 参加者画面
│   │   ├── screen/
│   │   │   └── page.tsx        # スクリーン画面
│   │   └── api/
│   │       ├── game/
│   │       │   └── route.ts    # ゲームAPI（作成・取得・ステータス更新）
│   │       ├── answer/
│   │       │   └── route.ts    # 回答API（送信・チェック）
│   │       └── auth/
│   │           └── route.ts    # 認証API（司会者パスワード検証）
│   └── lib/
│       ├── supabase.ts         # Supabaseクライアント
│       └── types.ts            # TypeScript型定義
├── supabase/
│   └── schema.sql              # データベーススキーマ・RLSポリシー
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.mjs
├── .env.local.example          # 環境変数テンプレート
├── .gitignore
└── README.md
```

## 🔒 セキュリティ

- **参加者画面から回答データを直接取得できない**：SupabaseのRLSポリシーにより、answersテーブルはservice_roleのみアクセス可能
- **回答中にYES人数がバレない**：APIは回答中はYES/NO人数を返さない。スクリーンの数字はランダム
- **司会者認証**：環境変数 `HOST_PASSWORD` でパスワード管理
- **秘密情報の保護**：`SUPABASE_SERVICE_ROLE_KEY` はサーバーサイドのみで使用

## ✅ テスト項目

- [ ] 参加者画面（`/play`）が開く
- [ ] 質問がリアルタイムで表示される
- [ ] YESを押せる
- [ ] NOを押せる
- [ ] 同じ人が二重回答できない
- [ ] 司会者画面で回答数が更新される
- [ ] スクリーンでは回答中に本当の人数が見えない
- [ ] スクリーンの数字が回答中ずっと変化する
- [ ] 回答締切で数字が止まる
- [ ] 本当のYES人数が表示される
- [ ] YESが1人なら「01」と表示される
- [ ] その後「100分の1達成！！」が表示される
- [ ] 次の質問を開始できる
- [ ] スマートフォンでも正常に表示される
- [ ] PCのChromeでも正常に表示される

## 🔧 技術スタック

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (PostgreSQL + RLS)
- **Vercel** (デプロイ)

## 📝 通信方式

- ポーリング方式（1.5〜2秒間隔）を採用
- WebSocketを使わないため、4G/5G回線でも安定動作
- 回答送信は3回までリトライ
- 失敗時はユーザーに「再試行」ボタンを表示

## ⚠️ 注意事項

- 同時接続50〜60人を想定した設計です
- Supabase の無料プランでも十分対応可能です
- 会場のWi-Fiに依存しない設計（参加者は個人の4G/5G回線でアクセス）
- 外部画像・動画は不使用（CSS/HTMLのみで演出）
