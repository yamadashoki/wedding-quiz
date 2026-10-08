'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';

// ==============================================================
// アイコン（lucide-react 互換の見た目をインラインSVGで定義）
// 外部パッケージ lucide-react に依存しないため、未インストールでも動作する
// ==============================================================
type IconProps = { className?: string };
const IconBase = ({ className, children }: IconProps & { children: React.ReactNode }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
    >
        {children}
    </svg>
);
const Volume2 = (p: IconProps) => (
    <IconBase {...p}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </IconBase>
);
const VolumeX = (p: IconProps) => (
    <IconBase {...p}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
    </IconBase>
);
const Smartphone = (p: IconProps) => (
    <IconBase {...p}>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
    </IconBase>
);
const Monitor = (p: IconProps) => (
    <IconBase {...p}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
    </IconBase>
);
const Settings = (p: IconProps) => (
    <IconBase {...p}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </IconBase>
);
const Play = (p: IconProps) => (
    <IconBase {...p}>
        <polygon points="6 3 20 12 6 21 6 3" />
    </IconBase>
);
const Database = (p: IconProps) => (
    <IconBase {...p}>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14a9 3 0 0 0 18 0V5" />
        <path d="M3 12a9 3 0 0 0 18 0" />
    </IconBase>
);
const LayoutGrid = (p: IconProps) => (
    <IconBase {...p}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
    </IconBase>
);
const AlertTriangle = (p: IconProps) => (
    <IconBase {...p}>
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
    </IconBase>
);

// ==============================================================
// 型定義（strict TypeScript で next build を通すため）
// ==============================================================
type GameStatus = 'idle' | 'racing' | 'result' | 'grand_finale';
type CameraMode = 'follow' | 'side' | 'front' | 'top';
type DerbyRoute = 'multiview' | 'play' | 'screen' | 'host';
type AdminSubTab = 'live' | 'edit';
type BetOrder = number[]; // [1着Idx, 2着Idx, 3着Idx]

interface DerbyRace {
    id: string;
    roundIndex: number;
    name: string;
    question: string;
    options: string[];
    correctOrder: BetOrder;
}

interface HorseData {
    num: number;
    letter: string;
    name: string;
    odds: string;
    color: string;
    jockeyColor: string;
}

interface HorseObject {
    mesh: THREE.Group;
    data: HorseData;
    legs: {
        legFL: THREE.Group; legFR: THREE.Group; legBL: THREE.Group; legBR: THREE.Group;
        tail: THREE.Mesh; head: THREE.Mesh;
    };
    badge: THREE.Object3D;
    currentSpeed: number;
    baseLaneX: number;
    currentLaneX: number;
    targetLaneX: number;
    progressZ: number;
    finished: boolean;
}

interface Participant {
    id: string;
    name: string;
    score: number;
    betSlip: BetOrder | null;
    isMock?: boolean;
}

interface ConfirmDialogState {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: (() => void) | null;
}

interface GameStatePayload {
    status: GameStatus;
    currentRaceIndex: number;
    correctOrder: BetOrder;
    // 幹事画面（正の情報源）からのみ付与：問題データと全参加者の得点表
    races?: DerbyRace[];
    leaderboard?: Participant[];
}

interface JoinPayload {
    participantId: string;
    name: string;
}

// 画面の役割（URLごとに1つ）
export type DerbyRole = 'multiview' | 'play' | 'screen' | 'host';

export interface DerbyAppProps {
    /** 'play' 参加者スマホ / 'screen' 会場スクリーン / 'host' 幹事 / 'multiview' 開発用3画面同時 */
    role?: DerbyRole;
    /** 「ゲーム選択へ戻る」の戻り先（既存ホーム画面のURL） */
    homeHref?: string;
    /** 3連単ページのベースパス。幹事画面に参加者用・スクリーン用URLを表示するのに使う */
    basePath?: string;
}

// Supabase 接続情報は環境変数から読む（.env.local）。
// Next.js はビルド時にこの2つの文字列を埋め込む。process がない環境（claude.ai プレビュー等）では空文字。
const ENV_SUPABASE_URL = (() => {
    try { return process.env.NEXT_PUBLIC_SUPABASE_URL || ''; } catch { return ''; }
})();
const ENV_SUPABASE_KEY = (() => {
    try { return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''; } catch { return ''; }
})();

interface BetPayload {
    participantId: string;
    name: string;
    betOrder: BetOrder;
    raceIndex: number;
}

// CDN経由で読み込む supabase-js の最小型（npm 依存を増やさないため）
interface RealtimeChannelLike {
    on: (type: string, filter: { event: string }, cb: (msg: { payload: unknown }) => void) => RealtimeChannelLike;
    subscribe: (cb?: (status: string) => void) => RealtimeChannelLike;
    send: (msg: { type: string; event: string; payload: unknown }) => Promise<unknown>;
}
interface SupabaseClientLike {
    channel: (name: string) => RealtimeChannelLike;
    removeChannel: (ch: RealtimeChannelLike) => unknown;
    from: (table: string) => { insert: (rows: Record<string, unknown>[]) => Promise<unknown> };
}

// declare global は環境によってトランスパイルできないため、型付きキャストで参照する
interface WindowWithExtras {
    supabase?: { createClient: (url: string, key: string) => SupabaseClientLike };
    webkitAudioContext?: typeof AudioContext;
}
const getWin = () => window as unknown as Window & WindowWithExtras;

const RACE_START_Z = 20;
const FINISH_Z = -400;
const INITIAL_COMMENTARY = '第4コーナーを回って各馬一斉に最後の直線コースへ入る！';
// ==============================================================
// 3連単アンケートゲーム：初期レースデータ（全3R構成・選択肢A〜H）
// ==============================================================
const DEFAULT_DERBY_RACES: DerbyRace[] = [
    {
        id: "race_1",
        roundIndex: 0,
        name: "第1R：新婦の手料理杯",
        question: "新郎が一生涯食べ続けたい「新婦の手料理No.1」は？",
        options: [
            "特製ハンバーグ",
            "特製オムライス",
            "特製肉じゃが",
            "カレーライス",
            "絶品唐揚げ",
            "特製お味噌汁",
            "特製デザート",
            "まだ作ってもらってない"
        ],
        correctOrder: [6, 4, 0] // 1着: G(デザート), 2着: E(唐揚げ), 3着: A(ハンバーグ)
    },
    {
        id: "race_2",
        roundIndex: 1,
        name: "第2R：新郎の直してほしいところ特別",
        question: "新婦が告白！「新郎のここだけは直してほしいところ」は？",
        options: [
            "夜中の大爆音いびき",
            "休日に昼過ぎまで爆睡",
            "脱いだ靴下丸めて放置",
            "ゲーム中に返事しない",
            "急な筋肉自慢アピール",
            "記念日や約束を忘れがち",
            "優しすぎて優柔不断",
            "非の打ち所なし（神）"
        ],
        correctOrder: [0, 2, 4] // 1着: A, 2着: C, 3着: E
    },
    {
        id: "race_3",
        roundIndex: 2,
        name: "第3R：二人の思い出ステークス（最終戦）",
        question: "新郎新婦が選ぶ「一番思い出に残っているデートスポット」は？",
        options: [
            "初デートの水族館",
            "雨の東京ディズニーランド",
            "二人で行った沖縄旅行",
            "近所のいつもの居酒屋",
            "夜景を見に行った展望台",
            "ドライブで行った富士山",
            "おうち映画鑑賞会",
            "プロポーズした高級ホテル"
        ],
        correctOrder: [2, 7, 0] // 1着: C, 2着: H, 3着: A
    }
];

const HORSES_DATA: HorseData[] = [
    { num: 1, letter: "A", name: "サイバーヒー", odds: "14.2", color: "#e2e8f0", jockeyColor: "#cbd5e1" },
    { num: 2, letter: "B", name: "コニーティーチャン", odds: "5.8", color: "#334155", jockeyColor: "#1e293b" },
    { num: 3, letter: "C", name: "スッポンスポロクス", odds: "8.4", color: "#dc2626", jockeyColor: "#b91c1c" },
    { num: 4, letter: "D", name: "ジェッドムリサイズ", odds: "19.3", color: "#2563eb", jockeyColor: "#1d4ed8" },
    { num: 5, letter: "E", name: "マッスル唐揚げ（屈強男）", odds: "4.1", color: "#d97706", jockeyColor: "#b45309" },
    { num: 6, letter: "F", name: "アキネイヅミツデス", odds: "45.0", color: "#059669", jockeyColor: "#047857" },
    { num: 7, letter: "G", name: "シューマッスルズシ", odds: "2.3", color: "#ea580c", jockeyColor: "#c2410c" },
    { num: 8, letter: "H", name: "ヒメオマンパルスタ", odds: "7.6", color: "#be185d", jockeyColor: "#9d174d" }
];

// ==============================================================
// 3連単専用 Supabase テーブル作成 SQL（アンケートビンゴとは完全分離）
// ==============================================================
const SUPABASE_DERBY_SCHEMA_SQL = `-- 3連単アンケートゲーム専用 DDL (supabase/migrations/derby_schema.sql)
-- 既存のアンケートビンゴ用テーブルには一切干渉しません

-- 1. ゲーム進行状態テーブル
create table if not exists public.derby_games (
  id text primary key default 'derby_current',
  current_race_index int default 0,
  status text default 'idle', -- 'idle' | 'racing' | 'result' | 'grand_finale'
  correct_order int[] default array[6, 4, 0],
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. レース問題・選択肢テーブル
create table if not exists public.derby_races (
  id text primary key,
  round_index int not null,
  name text not null,
  question text not null,
  options text[] not null,
  correct_order int[] not null default array[0, 1, 2],
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. 参加者テーブル
create table if not exists public.derby_participants (
  id text primary key,
  name text not null,
  score int default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. 参加者馬券テーブル（ユニーク制約により同一レース重複投票をDB層で防止）
create table if not exists public.derby_bets (
  id uuid default gen_random_uuid() primary key,
  game_id text not null default 'derby_current',
  race_index int not null,
  participant_id text not null,
  participant_name text not null,
  bet_order int[] not null, -- [1着選択肢Idx, 2着選択肢Idx, 3着選択肢Idx]
  score_gained int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  constraint unique_participant_per_race unique (race_index, participant_id)
);

-- Realtime有効化
alter publication supabase_realtime add table public.derby_games;
alter publication supabase_realtime add table public.derby_bets;
alter publication supabase_realtime add table public.derby_participants;`;

// ==============================================================
// Web Audio API による合成音響エンジン（音声ファイル不要）
// ==============================================================
class SoundSynthesizer {
    ctx: AudioContext | null = null;
    muted = false;

    init() {
        if (typeof window === 'undefined') return;
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || getWin().webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            void this.ctx.resume();
        }
    }
    playFanfare() {
        if (this.muted) return;
        this.init();
        const ctx = this.ctx;
        if (!ctx) return;
        const notes = [
            { f: 523.25, d: 0.14, t: 0 },
            { f: 523.25, d: 0.14, t: 0.15 },
            { f: 523.25, d: 0.14, t: 0.3 },
            { f: 659.25, d: 0.35, t: 0.45 },
            { f: 783.99, d: 0.35, t: 0.8 },
            { f: 659.25, d: 0.2, t: 1.15 },
            { f: 783.99, d: 0.6, t: 1.35 },
            { f: 1046.50, d: 0.8, t: 1.95 }
        ];
        notes.forEach(n => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(n.f, ctx.currentTime + n.t);
            gain.gain.setValueAtTime(0.001, ctx.currentTime + n.t);
            gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + n.t + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + n.t + n.d);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + n.t);
            osc.stop(ctx.currentTime + n.t + n.d);
        });
    }
    playCheers() {
        if (this.muted) return;
        this.init();
        const ctx = this.ctx;
        if (!ctx) return;
        const bufferSize = ctx.sampleRate * 2.0;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 850;
        filter.Q.value = 1.0;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);
        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        whiteNoise.start();
    }
    playGallop() {
        if (this.muted) return;
        this.init();
        const ctx = this.ctx;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
    }
}

function createSaddleTexture(letter: string, bgColor: string, textColor = "#ffffff"): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.strokeRect(4, 4, 120, 120);
    ctx.fillStyle = textColor;
    ctx.font = "bold 84px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, 64, 66);
    return new THREE.CanvasTexture(cv);
}

function createLetterBadgeSprite(letter: string, bgColor: string): THREE.Object3D {
    if (typeof document === 'undefined') return new THREE.Group();
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 64;
    const ctx = cv.getContext("2d");
    if (!ctx) return new THREE.Group();
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 36px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, 32, 34);

    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.5, 1.5, 1);
    return sprite;
}

function generateTurfTexture(): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    // 濃淡2色の刈り込み縞（コース進行方向に流れて見えるので「走っている感」が出る）
    ctx.fillStyle = "#2d7a38";
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = "#3b9147";
    ctx.fillRect(0, 64, 128, 64);
    for (let i = 0; i < 600; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "#24662d" : "#46a853";
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 60); // 縞1本 = 10m
    return tex;
}

function generateStandWallTexture(): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#c27c62";
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
        ctx.fillStyle = "#8a513e";
        ctx.fillRect(0, y, 128, 2);
        for (let x = (y % 32 === 0 ? 0 : 16); x < 128; x += 32) {
            ctx.fillRect(x, y, 2, 16);
        }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 60);
    return tex;
}

function buildLowPolyHorse(horseData: HorseData): HorseObject {
    const group = new THREE.Group();
    const horseMat = new THREE.MeshLambertMaterial({ color: 0x854d24 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x3a1f10 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const jockeyMat = new THREE.MeshLambertMaterial({ color: horseData.jockeyColor });

    const saddleMat = new THREE.MeshLambertMaterial({
        map: createSaddleTexture(horseData.letter, horseData.color, horseData.num === 1 ? "#000000" : "#ffffff")
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 3.2), horseMat);
    body.position.y = 2.4;
    body.castShadow = true;
    group.add(body);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 1.2), horseMat);
    neck.position.set(0, 3.5, -1.5);
    neck.rotation.x = Math.PI / 4;
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 1.6), horseMat);
    head.position.set(0, 4.2, -2.4);
    head.rotation.x = -Math.PI / 8;
    head.castShadow = true;
    group.add(head);

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.35, 1.8), saddleMat);
    saddle.position.set(0, 3.2, -0.1);
    group.add(saddle);

    const jockeyLegs = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.2), whiteMat);
    jockeyLegs.position.set(0, 3.4, -0.1);
    group.add(jockeyLegs);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 1.2), jockeyMat);
    torso.position.set(0, 4.0, -0.6);
    torso.rotation.x = Math.PI / 3.5;
    torso.castShadow = true;
    group.add(torso);

    const backBadge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7),
        new THREE.MeshBasicMaterial({ map: createSaddleTexture(horseData.letter, "#000000", "#ffffff"), side: THREE.DoubleSide })
    );
    backBadge.position.set(0, 4.3, 0.05);
    backBadge.rotation.x = Math.PI / 3.5;
    group.add(backBadge);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 7, 6), jockeyMat);
    helmet.position.set(0, 4.8, -1.2);
    helmet.castShadow = true;
    group.add(helmet);

    const headBadge = createLetterBadgeSprite(horseData.letter, horseData.color);
    headBadge.position.set(0, 6.2, -1.2);
    group.add(headBadge);

    const legGeo = new THREE.BoxGeometry(0.35, 2.0, 0.4);
    const hoofGeo = new THREE.BoxGeometry(0.38, 0.3, 0.45);

    function createLeg(x: number, z: number): THREE.Group {
        const legPivot = new THREE.Group();
        legPivot.position.set(x, 2.0, z);
        const upperLeg = new THREE.Mesh(legGeo, horseMat);
        upperLeg.position.y = -0.8;
        upperLeg.castShadow = true;
        legPivot.add(upperLeg);
        const hoof = new THREE.Mesh(hoofGeo, darkMat);
        hoof.position.y = -1.75;
        legPivot.add(hoof);
        return legPivot;
    }

    const legFL = createLeg(-0.5, -1.1);
    const legFR = createLeg(0.5, -1.1);
    const legBL = createLeg(-0.5, 1.1);
    const legBR = createLeg(0.5, 1.1);
    group.add(legFL);
    group.add(legFR);
    group.add(legBL);
    group.add(legBR);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.3), darkMat);
    tail.position.set(0, 2.2, 1.8);
    tail.rotation.x = -Math.PI / 4;
    group.add(tail);

    return {
        mesh: group,
        data: horseData,
        legs: { legFL, legFR, legBL, legBR, tail, head },
        badge: headBadge,
        currentSpeed: 1.0,
        baseLaneX: 0,
        currentLaneX: 0,
        targetLaneX: 0,
        progressZ: 0,
        finished: false
    };
}

function createTrackFence(xPos: number, trackLength: number): THREE.Group {
    const fenceGroup = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6);
    const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const railGeo = new THREE.BoxGeometry(0.15, 0.25, trackLength);
    const railMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    const topRail = new THREE.Mesh(railGeo, railMat);
    topRail.position.set(xPos, 1.1, -trackLength / 2 + 100);
    fenceGroup.add(topRail);

    // 支柱は InstancedMesh で1ドローコールにまとめる（数百メッシュによるfps低下を防止）
    const postCount = Math.floor(trackLength / 6) + 1;
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
    const m = new THREE.Matrix4();
    for (let i = 0; i < postCount; i++) {
        m.makeTranslation(xPos, 0.7, 100 - i * 6);
        posts.setMatrixAt(i, m);
    }
    posts.instanceMatrix.needsUpdate = true;
    fenceGroup.add(posts);
    return fenceGroup;
}

// ==============================================================
// 得点計算（3d.html完全互換仕様）
// 完全的中: +6pt, 順不同3頭的中: +4pt, 1着2着連勝: +3pt
// ==============================================================
function calculateBetScore(bet: BetOrder | null | undefined, correct: BetOrder | null | undefined): number {
    if (!bet || bet.length < 3 || !correct || correct.length < 3) return 0;
    if (bet[0] === correct[0] && bet[1] === correct[1] && bet[2] === correct[2]) {
        return 6; // 完全的中
    }
    const sortedB = [...bet].sort((a, b) => a - b).join();
    const sortedC = [...correct].sort((a, b) => a - b).join();
    if (sortedB === sortedC) {
        return 4; // 3頭的中・順不同（サンレンプク）
    }
    if (bet[0] === correct[0] && bet[1] === correct[1]) {
        return 3; // 1着・2着を順番通り的中（ニレンタン）
    }
    return 0;
}

// モック参加者用のランダム3連単（重複なし）
function randomBet(): BetOrder {
    const pool = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
}

// Tailwind の任意値クラス（text-[10px] など）は、claude.ai のプレビュー等
// 「Tailwind 標準クラスのみ」の環境では生成されない。同じ見た目になるよう CSS を同梱する。
const ARBITRARY_CLASS_FALLBACK_CSS = `
.text-\\[9px\\]{font-size:9px;line-height:1.3}
.text-\\[10px\\]{font-size:10px;line-height:1.35}
.text-\\[11px\\]{font-size:11px;line-height:1.4}
.max-w-\\[100px\\]{max-width:100px}
.max-w-\\[120px\\]{max-width:120px}
.max-w-\\[140px\\]{max-width:140px}
.max-w-\\[150px\\]{max-width:150px}
.max-w-\\[170px\\]{max-width:170px}
.max-w-\\[360px\\]{max-width:360px}
.rounded-\\[30px\\]{border-radius:30px}
.rounded-\\[40px\\]{border-radius:40px}
.z-\\[60\\]{z-index:60}
`;

const CLOSED_DIALOG: ConfirmDialogState = { isOpen: false, title: '', message: '', onConfirm: null };

export default function DerbyApp({ role = 'multiview', homeHref = '/', basePath = '/trifecta' }: DerbyAppProps) {
    // 役割ごとの責務
    // ・幹事（host）と開発用（multiview）が「正の情報源」。進行・採点・問題データを配信する
    // ・3D描画はスクリーン（screen）と開発用のみ。参加者スマホでは3Dを一切動かさない
    const isAuthority = role === 'host' || role === 'multiview';
    const renders3D = role === 'screen' || role === 'multiview';
    const runsSimulation = role !== 'play';

    const [isMounted, setIsMounted] = useState(false);

    // 3連単ゲーム内画面ルート
    const [derbyRoute, setDerbyRoute] = useState<DerbyRoute>(role);
    const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('live');

    // 3連単レースデータ（全3R）
    const [races, setRaces] = useState<DerbyRace[]>(DEFAULT_DERBY_RACES);
    const [currentRaceIndex, setCurrentRaceIndex] = useState(0);
    const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
    const [correctOrder, setCorrectOrder] = useState<BetOrder>([6, 4, 0]);
    const [isMuted, setIsMuted] = useState(role === 'host' || role === 'play'); // 音は会場スクリーンから出す

    // カメラ（残り距離・実況は React State にせず ref で DOM 直接更新する）
    const [cameraMode, setCameraMode] = useState<CameraMode>('follow');

    // 参加者状態
    const [participantId, setParticipantId] = useState('guest_temp');
    const [participantName, setParticipantName] = useState(role === 'multiview' ? 'ゲスト（あなた）' : '');
    const [nameInput, setNameInput] = useState('');
    const [participantScore, setParticipantScore] = useState(0);
    const [selectedChoices, setSelectedChoices] = useState<number[]>([]);
    const [issuedBetSlip, setIssuedBetSlip] = useState<BetOrder | null>(null);

    // 誤操作防止確認モーダル / トースト（alert() の代替）
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(CLOSED_DIALOG);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // 参加者リスト（モック＋リアルタイム同期）
    const [participants, setParticipants] = useState<Participant[]>(role !== 'multiview' ? [] : [
        { id: "g1", name: "新郎友人・たけし", score: 0, betSlip: [6, 4, 0], isMock: true },
        { id: "g2", name: "新婦同僚・えりか", score: 0, betSlip: [0, 2, 4], isMock: true },
        { id: "g3", name: "大学サークル・けんた", score: 0, betSlip: [1, 3, 5], isMock: true },
        { id: "g4", name: "受付・まい", score: 0, betSlip: [4, 6, 2], isMock: true },
        { id: "g5", name: "新婦親友・さくら", score: 0, betSlip: [6, 0, 4], isMock: true }
    ]);

    // Supabase設定
    const [supabaseUrl, setSupabaseUrl] = useState(ENV_SUPABASE_URL);
    const [supabaseKey, setSupabaseKey] = useState(ENV_SUPABASE_KEY);
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const [webglError, setWebglError] = useState(false);
    const [origin, setOrigin] = useState('');
    const [isCloudConnected, setIsCloudConnected] = useState(false);

    // レース終了ガード（バグ④対策：完了処理は1レース1回だけ）
    const hasFinishedRef = useRef(false);

    // Three.js 系 Ref（コンポーネント生存中は1つの renderer / WebGL コンテキストを使い回す）
    const containerElRef = useRef<HTMLDivElement | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const horseMeshesRef = useRef<HorseObject[]>([]);
    const soundRef = useRef<SoundSynthesizer | null>(null);
    const channelRef = useRef<RealtimeChannelLike | null>(null);
    const supabaseClientRef = useRef<SupabaseClientLike | null>(null);

    // 残り距離・実況テロップの直接DOM更新用（バグ②対策）
    const remainElRef = useRef<HTMLSpanElement | null>(null);
    const commentaryElRef = useRef<HTMLSpanElement | null>(null);
    const lastRemainRef = useRef(400);
    const lastCommentaryRef = useRef(INITIAL_COMMENTARY);

    // アニメーションループ / コールバック内から最新値を読むための Ref（バグ③対策）
    const statusRef = useRef<GameStatus>(gameStatus);
    const correctOrderRef = useRef<BetOrder>(correctOrder);
    const cameraModeRef = useRef<CameraMode>(cameraMode);
    const raceIndexRef = useRef(currentRaceIndex);
    const issuedBetSlipRef = useRef<BetOrder | null>(issuedBetSlip);
    const participantIdRef = useRef(participantId);
    const participantNameRef = useRef(participantName);
    const isCloudConnectedRef = useRef(isCloudConnected);
    const racesRef = useRef<DerbyRace[]>(races);
    const participantsRef = useRef<Participant[]>(participants);

    statusRef.current = gameStatus;
    correctOrderRef.current = correctOrder;
    cameraModeRef.current = cameraMode;
    raceIndexRef.current = currentRaceIndex;
    issuedBetSlipRef.current = issuedBetSlip;
    participantIdRef.current = participantId;
    participantNameRef.current = participantName;
    isCloudConnectedRef.current = isCloudConnected;
    racesRef.current = races;
    participantsRef.current = participants;

    // --------------------------------------------------------------
    // Supabase DB から最新データを取得（参照）
    // --------------------------------------------------------------
    const loadInitialDataFromDB = useCallback(async () => {
        try {
            const res = await fetch('/api/trifecta', { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            if (json.success && json.data) {
                const { game, races: fetchedRaces, participants: fetchedParticipants } = json.data;
                if (fetchedRaces && fetchedRaces.length > 0) {
                    setRaces(fetchedRaces);
                }
                if (fetchedParticipants) {
                    setParticipants(fetchedParticipants);
                    // 自分の投票状態・スコアを復元
                    const myId = participantIdRef.current;
                    const mine = fetchedParticipants.find((p: Participant) => p.id === myId);
                    if (mine) {
                        if (mine.betSlip) {
                            setIssuedBetSlip(mine.betSlip);
                        }
                        if (typeof mine.score === 'number') {
                            setParticipantScore(mine.score);
                        }
                    }
                }
                if (game) {
                    setCurrentRaceIndex(game.currentRaceIndex);
                    raceIndexRef.current = game.currentRaceIndex;
                    setGameStatus(game.status);
                    statusRef.current = game.status;
                    if (game.correctOrder) {
                        setCorrectOrder(game.correctOrder);
                        correctOrderRef.current = game.correctOrder;
                    }
                }
            }
        } catch (e) {
            console.warn("DB load warning:", e);
        }
    }, []);

    // --------------------------------------------------------------
    // 初期化（localStorage 読み込み ＋ Supabase DB からデータ取得）
    // --------------------------------------------------------------
    useEffect(() => {
        setIsMounted(true);
        setOrigin(window.location.origin);
        soundRef.current = new SoundSynthesizer();
        soundRef.current.muted = role === 'host' || role === 'play';

        try {
            const savedPid = localStorage.getItem('derby_participant_id') || `p_${Math.random().toString(36).slice(2, 9)}`;
            localStorage.setItem('derby_participant_id', savedPid);
            setParticipantId(savedPid);

            if (role === 'play') {
                const savedName = localStorage.getItem('derby_participant_name') || '';
                if (savedName) setParticipantName(savedName);
            }
        } catch (e) {
            console.warn("Storage load warning:", e);
        }

        // DB から最新状態を参照・反映
        void loadInitialDataFromDB();

        // 定期的に DB と整合性を同期（レース実行中以外）
        const timer = window.setInterval(() => {
            if (statusRef.current !== 'racing') {
                void loadInitialDataFromDB();
            }
        }, 5000);

        return () => window.clearInterval(timer);
    }, [role, isAuthority, loadInitialDataFromDB]);

    // トースト自動消去
    useEffect(() => {
        if (!toastMessage) return;
        const t = window.setTimeout(() => setToastMessage(null), 2400);
        return () => window.clearTimeout(t);
    }, [toastMessage]);

    const currentRace = races[currentRaceIndex] || races[0];

    // --------------------------------------------------------------
    // 実況・残り距離の DOM 直接書き換え（値が変わった時だけ）
    // --------------------------------------------------------------
    const writeRemain = useCallback((value: number) => {
        if (lastRemainRef.current === value) return;
        lastRemainRef.current = value;
        if (remainElRef.current) remainElRef.current.textContent = String(value);
    }, []);

    const writeCommentary = useCallback((text: string) => {
        if (lastCommentaryRef.current === text) return;
        lastCommentaryRef.current = text;
        if (commentaryElRef.current) commentaryElRef.current.textContent = text;
    }, []);

    // スクリーン再マウント時に最新値を即反映する callback ref
    const remainCallbackRef = useCallback((el: HTMLSpanElement | null) => {
        remainElRef.current = el;
        if (el) el.textContent = String(lastRemainRef.current);
    }, []);
    const commentaryCallbackRef = useCallback((el: HTMLSpanElement | null) => {
        commentaryElRef.current = el;
        if (el) el.textContent = lastCommentaryRef.current;
    }, []);

    // --------------------------------------------------------------
    // Three.js canvas のアタッチ（バグ①対策）
    // renderer は1回だけ生成し、スクリーン枠の div がマウントされるたびに
    // その div へ canvas を付け替える。タブ切替で WebGL コンテキストを失わない。
    // --------------------------------------------------------------
    const resizeRenderer = useCallback(() => {
        const container = containerElRef.current;
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }, []);

    const attachRendererToContainer = useCallback(() => {
        const container = containerElRef.current;
        const renderer = rendererRef.current;
        if (!container || !renderer) return;
        if (renderer.domElement.parentElement !== container) {
            container.appendChild(renderer.domElement);
        }
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        resizeRenderer();
    }, [resizeRenderer]);

    const canvasContainerRef = useCallback((node: HTMLDivElement | null) => {
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
        containerElRef.current = node;
        if (!node) return;
        attachRendererToContainer();
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => resizeRenderer());
            ro.observe(node);
            resizeObserverRef.current = ro;
        }
    }, [attachRendererToContainer, resizeRenderer]);

    // --------------------------------------------------------------
    // 馬の位置リセット
    // --------------------------------------------------------------
    const resetHorsePositions = useCallback(() => {
        hasFinishedRef.current = false;
        horseMeshesRef.current.forEach((h, i) => {
            h.progressZ = RACE_START_Z - (i * 0.8);
            h.currentSpeed = 1.0;
            h.currentLaneX = h.baseLaneX;
            h.targetLaneX = h.baseLaneX;
            h.finished = false;
            h.mesh.position.set(h.baseLaneX, 0, h.progressZ);
        });
        writeRemain(400);
        writeCommentary(INITIAL_COMMENTARY);
    }, [writeRemain, writeCommentary]);

    // --------------------------------------------------------------
    // Supabase Realtime
    // --------------------------------------------------------------
    const broadcastGameState = useCallback((newStatus: GameStatus, rIdx: number, cOrder: BetOrder) => {
        if (channelRef.current && isCloudConnectedRef.current) {
            const payload: GameStatePayload = {
                status: newStatus,
                currentRaceIndex: rIdx,
                correctOrder: cOrder,
                races: racesRef.current,
                leaderboard: participantsRef.current
            };
            void channelRef.current.send({ type: 'broadcast', event: 'game-state-change', payload });
        }
    }, []);

    const sendEvent = useCallback((event: string, payload: unknown) => {
        if (channelRef.current && isCloudConnectedRef.current) {
            void channelRef.current.send({ type: 'broadcast', event, payload });
        }
    }, []);

    const broadcastParticipantBet = useCallback((bet: BetOrder) => {
        if (channelRef.current && isCloudConnectedRef.current) {
            const payload: BetPayload = {
                participantId: participantIdRef.current,
                name: participantNameRef.current,
                betOrder: bet,
                raceIndex: raceIndexRef.current
            };
            void channelRef.current.send({ type: 'broadcast', event: 'participant-bet', payload });
        }
    }, []);

    // --------------------------------------------------------------
    // レース確定処理（バグ④対策：hasFinishedRef で1回だけ。最新値は全て ref から読む）
    // --------------------------------------------------------------
    const finalizeRace = useCallback((source: 'local' | 'remote') => {
        if (hasFinishedRef.current) return;
        hasFinishedRef.current = true;

        const order = correctOrderRef.current;
        const raceIdx = raceIndexRef.current;
        const myBet = issuedBetSlipRef.current;

        setGameStatus('result');
        statusRef.current = 'result';
        soundRef.current?.playFanfare();
        soundRef.current?.playCheers();
        const gained = myBet ? calculateBetScore(myBet, order) : 0;

        // 会場スクリーンが自分の映像でゴールしたら幹事へ知らせる。
        // 幹事のタブが裏に回ってアニメーションが止まっていても、これで確定できる。
        if (!isAuthority && renders3D && source === 'local') {
            sendEvent('race-finished', { raceIndex: raceIdx });
        }

        // 採点は幹事側（正の情報源）だけが行い、得点表を全画面に配信する。
        // 各端末で別々に採点すると端末ごとに得点がずれるため。
        if (isAuthority) {
            if (source === 'local') {
                broadcastGameState('result', raceIdx, order);
                // DB 側に結果を保存し、参加者全員の的中得点を合算更新
                void fetch('/api/trifecta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'finalize_race', raceIndex: raceIdx, correctOrder: order })
                }).then(() => {
                    sendEvent('refresh-data', {});
                }).catch(err => console.error("Finalize DB error:", err));
            }
            if (gained > 0) setParticipantScore(prev => prev + gained);
            setParticipants(prev => prev.map(p => ({
                ...p,
                score: p.score + calculateBetScore(p.betSlip, order)
            })));
        }
    }, [broadcastGameState, isAuthority, renders3D, sendEvent]);

    // ループからは常に最新の finalizeRace を ref 経由で呼ぶ
    const finalizeRaceRef = useRef(finalizeRace);
    finalizeRaceRef.current = finalizeRace;
    const resetHorsePositionsRef = useRef(resetHorsePositions);
    resetHorsePositionsRef.current = resetHorsePositions;

    // 他端末から届いた状態を反映
    const applyRemoteGameState = useCallback((payload: GameStatePayload) => {
        // 幹事側は自分が正なので、他から届いた状態では上書きしない
        if (isAuthority) return;
        if (payload.races && payload.races.length > 0) setRaces(payload.races);
        if (payload.leaderboard) {
            setParticipants(payload.leaderboard);
            // リロードした参加者の馬券を復元
            const mine = payload.leaderboard.find(p => p.id === participantIdRef.current);
            if (mine?.betSlip && payload.currentRaceIndex === raceIndexRef.current && !issuedBetSlipRef.current) {
                setIssuedBetSlip(mine.betSlip);
            }
        }
        const prevStatus = statusRef.current;
        const prevRace = raceIndexRef.current;
        correctOrderRef.current = payload.correctOrder;
        setCorrectOrder(payload.correctOrder);

        if (payload.currentRaceIndex !== prevRace) {
            setCurrentRaceIndex(payload.currentRaceIndex);
            raceIndexRef.current = payload.currentRaceIndex;
            setIssuedBetSlip(null);
            setSelectedChoices([]);
            setParticipants(prev => prev.map(p => ({ ...p, betSlip: null })));
        }

        if (payload.status === 'racing' && prevStatus !== 'racing') {
            resetHorsePositionsRef.current();
            soundRef.current?.playFanfare();
            statusRef.current = 'racing';
            setGameStatus('racing');
        } else if (payload.status === 'result') {
            if (renders3D && prevStatus === 'racing') {
                // スクリーンは自分のレース映像のゴールを待つ（通信遅延で数百ms先に幹事が確定するため）。
                // 念のため3秒で強制確定。
                window.setTimeout(() => finalizeRaceRef.current('remote'), 3000);
            } else {
                finalizeRaceRef.current('remote');
            }
        } else if (payload.status === 'idle') {
            if (prevStatus !== 'idle') {
                resetHorsePositionsRef.current();
                if (payload.currentRaceIndex === prevRace) {
                    // 再投票
                    setIssuedBetSlip(null);
                    setSelectedChoices([]);
                }
            }
            statusRef.current = 'idle';
            setGameStatus('idle');
        } else {
            statusRef.current = payload.status;
            setGameStatus(payload.status);
        }
    }, [isAuthority, renders3D]);

    useEffect(() => {
        let isCancelled = false;
        const ch = supabase.channel('derby-realtime-room')
            .on('broadcast', { event: 'game-state-change' }, ({ payload }) => {
                if (!payload) return;
                applyRemoteGameState(payload as GameStatePayload);
            })
            .on('broadcast', { event: 'request-snapshot' }, () => {
                // 後から開いた画面・リロードした画面へ現在の状態を送る
                if (isAuthority) broadcastGameState(statusRef.current, raceIndexRef.current, correctOrderRef.current);
            })
            .on('broadcast', { event: 'race-finished' }, ({ payload }) => {
                const msg = payload as { raceIndex?: number } | null;
                if (!isAuthority || statusRef.current !== 'racing') return;
                if (msg?.raceIndex !== undefined && msg.raceIndex !== raceIndexRef.current) return;
                finalizeRaceRef.current('local');
            })
            .on('broadcast', { event: 'participant-join' }, ({ payload }) => {
                if (!payload) return;
                const join = payload as JoinPayload;
                setParticipants(prev => {
                    const idx = prev.findIndex(p => p.id === join.participantId);
                    if (idx >= 0) {
                        if (prev[idx].name === join.name) return prev;
                        const updated = [...prev];
                        updated[idx] = { ...updated[idx], name: join.name };
                        return updated;
                    }
                    return [...prev, { id: join.participantId, name: join.name, score: 0, betSlip: null }];
                });
            })
            .on('broadcast', { event: 'participant-bet' }, ({ payload }) => {
                if (!payload) return;
                const bet = payload as BetPayload;
                if (bet.raceIndex !== undefined && bet.raceIndex !== raceIndexRef.current) return;
                setParticipants(prev => {
                    const idx = prev.findIndex(p => p.id === bet.participantId);
                    if (idx >= 0) {
                        const updated = [...prev];
                        updated[idx] = { ...updated[idx], betSlip: bet.betOrder, name: bet.name };
                        return updated;
                    }
                    return [...prev, { id: bet.participantId, name: bet.name, score: 0, betSlip: bet.betOrder }];
                });
            })
            .on('broadcast', { event: 'refresh-data' }, () => {
                void loadInitialDataFromDB();
            })
            .subscribe((st) => {
                if (isCancelled) return;
                const ok = st === 'SUBSCRIBED';
                isCloudConnectedRef.current = ok;
                setIsCloudConnected(ok);
                if (ok && !isAuthority) {
                    void ch.send({ type: 'broadcast', event: 'request-snapshot', payload: {} });
                }
            });

        channelRef.current = ch as unknown as RealtimeChannelLike;

        return () => {
            isCancelled = true;
            void supabase.removeChannel(ch);
            if (channelRef.current === (ch as unknown as RealtimeChannelLike)) {
                channelRef.current = null;
            }
            setIsCloudConnected(false);
        };
    }, [applyRemoteGameState, isAuthority, broadcastGameState, loadInitialDataFromDB]);

    // 幹事側：参加者・問題が変わったら全画面へ最新の得点表と問題を再配信（0.3秒まとめ）
    useEffect(() => {
        if (!isAuthority || !isCloudConnected) return;
        const t = window.setTimeout(() => {
            broadcastGameState(statusRef.current, raceIndexRef.current, correctOrderRef.current);
        }, 300);
        return () => window.clearTimeout(t);
    }, [isAuthority, isCloudConnected, participants, races, broadcastGameState]);

    // 参加者：名前が決まり接続できたら幹事へ参加通知
    useEffect(() => {
        if (role !== 'play' || !isCloudConnected || !participantName || participantId === 'guest_temp') return;
        const join: JoinPayload = { participantId, name: participantName };
        sendEvent('participant-join', join);
    }, [role, isCloudConnected, participantName, participantId, sendEvent]);

    // --------------------------------------------------------------
    // Three.js シーン生成 ＋ アニメーションループ（マウント後に1回だけ）
    // バグ①：isMounted が true になってから実行（以前は [] 依存で null 空振り）
    // バグ②：ループ内で setState しない
    // バグ③：依存は isMounted のみ。最新状態は全て ref から読むので多重起動しない
    // --------------------------------------------------------------
    useEffect(() => {
        // 参加者スマホでは3Dもレース計算も動かさない（電池・発熱・音の重複を避ける）
        if (!isMounted || !runsSimulation) return;

        const trackWidth = 32;
        const trackLength = 1200;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9bd2fc);
        scene.fog = new THREE.FogExp2(0x9bd2fc, 0.0022);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(50, 600 / 650, 0.5, 1500);
        camera.position.set(0, 8, 25);
        cameraRef.current = camera;

        // 描画は screen / multiview のみ。幹事画面はレース計算だけ行い、WebGL を使わない。
        // WebGL が使えない環境（リモートデスクトップ、GPU無効など）でもアプリ全体が落ちないよう try/catch
        let renderer: THREE.WebGLRenderer | null = null;
        if (renders3D) {
            try {
                renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
                renderer.setSize(600, 650);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap は新しい three で廃止
                rendererRef.current = renderer;
            } catch (err) {
                console.warn("WebGL を初期化できませんでした:", err);
                renderer = null;
                setWebglError(true);
            }
        }

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x446644, 0.8);
        scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xfffaed, 0.95);
        dirLight.position.set(40, 70, 40);
        dirLight.castShadow = true;
        scene.add(dirLight);

        // コース芝生グラウンド
        const groundMat = new THREE.MeshLambertMaterial({ map: generateTurfTexture() });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(trackWidth, trackLength), groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, -trackLength / 2 + 100);
        ground.receiveShadow = true;
        scene.add(ground);

        // 内ラチ・外ラチ（白い柵）
        scene.add(createTrackFence(-trackWidth / 2, trackLength));
        scene.add(createTrackFence(trackWidth / 2, trackLength));

        // スタンド壁（コース真横）
        const standWallMat = new THREE.MeshLambertMaterial({ map: generateStandWallTexture() });
        const standWall = new THREE.Mesh(new THREE.BoxGeometry(10, 12, trackLength), standWallMat);
        standWall.position.set(-trackWidth / 2 - 6, 6, -trackLength / 2 + 100);
        scene.add(standWall);

        // ゴールポール（Z = -400）
        const finishPole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 16, 12), new THREE.MeshLambertMaterial({ color: 0xef4444 }));
        finishPole.position.set(-trackWidth / 2 - 1, 8, FINISH_Z);
        scene.add(finishPole);

        // 残り距離標識（300m / 200m / 100m）— 外ラチ側
        [300, 200, 100].forEach(dist => {
            const cv = document.createElement('canvas');
            cv.width = 128; cv.height = 64;
            const c2 = cv.getContext('2d');
            if (!c2) return;
            c2.fillStyle = '#ffffff'; c2.fillRect(0, 0, 128, 64);
            c2.fillStyle = '#b91c1c'; c2.font = 'bold 40px sans-serif';
            c2.textAlign = 'center'; c2.textBaseline = 'middle';
            c2.fillText(String(dist), 64, 34);
            const board = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide }));
            board.position.set(trackWidth / 2 + 1.5, 4, FINISH_Z + dist);
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
            pole.position.set(trackWidth / 2 + 1.5, 2, FINISH_Z + dist);
            scene.add(board, pole);
        });

        // 8頭配置
        const meshes: HorseObject[] = [];
        HORSES_DATA.forEach((hData, i) => {
            const hObj = buildLowPolyHorse(hData);
            const laneX = -9 + (i * 2.5);
            hObj.baseLaneX = laneX;
            hObj.currentLaneX = laneX;
            hObj.targetLaneX = laneX;
            hObj.progressZ = RACE_START_Z - (i * 0.8);
            hObj.mesh.position.set(laneX, 0, hObj.progressZ);
            scene.add(hObj.mesh);
            meshes.push(hObj);
        });
        horseMeshesRef.current = meshes;

        // すでにスクリーン枠がマウント済みなら即アタッチ
        attachRendererToContainer();

        // ---------------- アニメーションループ ----------------
        // THREE.Clock は新しい three で非推奨のため performance.now() で自前計測
        let lastTime = performance.now();
        let elapsed = 0;
        let simAccumulator = 0;
        const SIM_STEP = 1 / 60;
        const camTarget = new THREE.Vector3();
        const badgeWorldPos = new THREE.Vector3();
        let gallopTimer = 0;
        let frameId = 0;

        const renderLoop = () => {
            frameId = requestAnimationFrame(renderLoop);
            // 実時間ベースで進める（低fpsでもスロー再生にならない）。
            // タブ復帰時のワープ防止のため1フレーム最大0.25秒まで。
            const now = performance.now();
            const delta = Math.min((now - lastTime) / 1000, 0.25);
            lastTime = now;
            elapsed += delta;
            const time = elapsed;

            const currentStatus = statusRef.current;
            const currentCam = cameraModeRef.current;
            const [winnerIdx, secondIdx, thirdIdx] = correctOrderRef.current;
            const isRacing = currentStatus === 'racing';

            let leadHorse = meshes[0];

            // ---- レース物理：1/60秒の固定ステップで積分（fpsに依存しない） ----
            const stepHorses = (dt: number, simTime: number) => {
                meshes.forEach((h, idx) => {
                    if (h.finished) return;
                    const remain = h.progressZ - FINISH_Z;
                    // 残り距離に応じた飛び出し＆大外一気スパート（3d.html 準拠）
                    if (remain > 260) {
                        if (idx === 1) h.currentSpeed = 1.25;
                        else if (idx === secondIdx || idx === thirdIdx) h.currentSpeed = 1.10;
                        else if (idx === winnerIdx) h.currentSpeed = 0.95;
                        else h.currentSpeed = 1.0 + (Math.sin(idx + simTime) * 0.05);
                    } else if (remain > 160) {
                        if (idx === 1) h.currentSpeed = 0.98;
                        else if (idx === winnerIdx) {
                            h.targetLaneX = 7.5; // 大外へ持ち出す！
                            h.currentSpeed = 1.25;
                        } else if (idx === secondIdx) h.currentSpeed = 1.12;
                        else h.currentSpeed = 1.02;
                    } else {
                        // 直線：幹事指定の1着馬が大外から全頭ごぼう抜き
                        if (idx === winnerIdx) {
                            h.targetLaneX = 6.8;
                            h.currentSpeed = 1.55;
                        } else if (idx === secondIdx) {
                            h.targetLaneX = -2.0;
                            h.currentSpeed = 1.28;
                        } else if (idx === thirdIdx) {
                            h.targetLaneX = 1.0;
                            h.currentSpeed = 1.20;
                        } else if (idx === 1) h.currentSpeed = 0.85;
                        else h.currentSpeed = 0.98;
                    }

                    h.currentLaneX += (h.targetLaneX - h.currentLaneX) * Math.min(1, dt * 3.5);
                    h.progressZ -= h.currentSpeed * 34 * dt;
                    if (h.progressZ <= FINISH_Z) {
                        h.progressZ = FINISH_Z;
                        h.finished = true;
                    }
                });
            };

            if (isRacing) {
                simAccumulator += delta;
                let steps = 0;
                while (simAccumulator >= SIM_STEP && steps < 30) {
                    stepHorses(SIM_STEP, time);
                    simAccumulator -= SIM_STEP;
                    steps++;
                }
            } else {
                simAccumulator = 0;
            }

            meshes.forEach((h, idx) => {
                // メッシュへ反映
                h.mesh.position.x = h.currentLaneX;
                h.mesh.position.z = h.progressZ;
                h.mesh.position.y = isRacing && !h.finished ? Math.abs(Math.sin(time * 18 * h.currentSpeed)) * 0.28 : 0;

                const legSpeed = isRacing && !h.finished ? 17 * h.currentSpeed : 6;
                const swing = Math.sin(time * legSpeed + idx);
                h.legs.legFL.rotation.x = swing * 0.75;
                h.legs.legBR.rotation.x = swing * 0.75;
                h.legs.legFR.rotation.x = -swing * 0.75;
                h.legs.legBL.rotation.x = -swing * 0.75;
                h.legs.head.rotation.x = -Math.PI / 8 + Math.cos(time * legSpeed * 2) * 0.1;
                h.legs.tail.rotation.z = Math.sin(time * legSpeed) * 0.25;

                // ゼッケン(A〜H)の丸バッジは常に最前面に描画されるため、
                // カメラの真横を通過する馬のバッジが画面を覆わないよう近距離では隠す
                h.badge.getWorldPosition(badgeWorldPos);
                h.badge.visible = camera.position.distanceTo(badgeWorldPos) > 12;

                if (h.progressZ < leadHorse.progressZ) {
                    leadHorse = h;
                }
            });

            if (isRacing) {
                gallopTimer += delta;
                if (renders3D && gallopTimer > 0.18 && soundRef.current) {
                    soundRef.current.playGallop();
                    gallopTimer = 0;
                }

                // 残り距離・実況は値が変わった時だけ DOM を直接書き換える（setState しない）
                const remain = Math.min(400, Math.max(0, Math.floor(leadHorse.progressZ - FINISH_Z)));
                writeRemain(remain);

                const winner = HORSES_DATA[winnerIdx] ?? HORSES_DATA[0];
                const second = HORSES_DATA[secondIdx] ?? HORSES_DATA[1];
                if (remain > 270) {
                    writeCommentary(`序盤リードを奪ったのは [${leadHorse.data.letter}]！快調に飛ばしていく！`);
                } else if (remain > 160) {
                    writeCommentary(`残り200m標識！後続集団が一気に差を詰めてきた！馬群が密集する！！`);
                } else if (remain > 60) {
                    writeCommentary(`大外から凄まじい手応え！[${winner.letter}] が一気にごぼう抜き！飛び出してきたーっ！！`);
                } else if (remain > 10) {
                    writeCommentary(`[${winner.letter}] が完全に抜け出した！内から [${second.letter}] が食い下がるが届くか！？`);
                } else {
                    writeCommentary(`[${winner.letter}] 堂々の先頭ゴールイン！！大外一気の見事な差し切り勝ち！！`);
                }

                // 全頭ゴール → 1回だけ確定処理（statusRef も即時更新して次フレームで再発火しない）
                if (!hasFinishedRef.current && meshes.every(m => m.finished)) {
                    statusRef.current = 'result';
                    finalizeRaceRef.current('local');
                }
            }

            // カメラ制御（Vector3 を毎フレーム new しない）
            const targetPos = leadHorse.mesh.position;
            // lerp係数をフレームレート非依存に（60fps時の0.08相当）。低fpsでもカメラが置いていかれない
            const camLerp = 1 - Math.pow(1 - 0.08, delta * 60);
            if (currentCam === 'follow') {
                camera.position.lerp(camTarget.set(targetPos.x + 10, targetPos.y + 7.5, targetPos.z + 24), camLerp);
                camera.lookAt(targetPos.x, targetPos.y + 2, targetPos.z - 10);
            } else if (currentCam === 'side') {
                camera.position.lerp(camTarget.set(targetPos.x + 24, targetPos.y + 4.5, targetPos.z - 2), camLerp);
                camera.lookAt(targetPos.x, targetPos.y + 2, targetPos.z);
            } else if (currentCam === 'front') {
                camera.position.lerp(camTarget.set(targetPos.x, targetPos.y + 3.5, targetPos.z - 24), camLerp);
                camera.lookAt(targetPos.x, targetPos.y + 2, targetPos.z);
            } else {
                // 俯瞰：右斜め前の角度で上から見下ろし、全頭を1画面で追えるようにする
                camera.position.lerp(camTarget.set(targetPos.x + 22, 25, targetPos.z - 28), camLerp);
                camera.lookAt(targetPos.x - 2, 2, targetPos.z + 4);
            }

            // スクリーン枠が表示されている時だけ描画（非表示中もレース進行は継続）
            if (containerElRef.current) {
                renderer?.render(scene, camera);
            }
        };

        frameId = requestAnimationFrame(renderLoop);

        return () => {
            cancelAnimationFrame(frameId);
            scene.traverse(obj => {
                const mesh = obj as THREE.Mesh;
                if (mesh.geometry) mesh.geometry.dispose();
                const mat = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
                const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
                mats.forEach(m => {
                    const map = (m as THREE.MeshBasicMaterial).map;
                    if (map) map.dispose();
                    m.dispose();
                });
            });
            if (renderer) {
                renderer.dispose();
                renderer.forceContextLoss();
                renderer.domElement.remove();
            }
            rendererRef.current = null;
            sceneRef.current = null;
            cameraRef.current = null;
            horseMeshesRef.current = [];
        };
    }, [isMounted, runsSimulation, renders3D, attachRendererToContainer, writeRemain, writeCommentary]);

    // アンマウント時に ResizeObserver を解放
    useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

    // --------------------------------------------------------------
    // 進行操作
    // --------------------------------------------------------------
    const startDerbyRace = useCallback(() => {
        if (statusRef.current !== 'idle') return;
        resetHorsePositions();
        statusRef.current = 'racing';
        setGameStatus('racing');
        soundRef.current?.playFanfare();
        broadcastGameState('racing', currentRaceIndex, correctOrder);
        // DB にレース発走状態を記録
        void fetch('/api/trifecta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'update_game', status: 'racing', currentRaceIndex, correctOrder })
        }).catch(err => console.error("Start race DB error:", err));

        // 保険：幹事タブが裏に回り、スクリーンからのゴール通知も届かない場合でも20秒で確定（通常は約13秒でゴール）
        const raceAtStart = currentRaceIndex;
        window.setTimeout(() => {
            if (statusRef.current === 'racing' && raceIndexRef.current === raceAtStart) {
                finalizeRaceRef.current('local');
            }
        }, 20000);
    }, [currentRaceIndex, correctOrder, resetHorsePositions, broadcastGameState]);

    const goToRace = useCallback((idx: number, broadcast: boolean) => {
        const race = races[idx];
        if (!race) return;
        const newOrder = race.correctOrder || [0, 1, 2];
        setCurrentRaceIndex(idx);
        setGameStatus('idle');
        statusRef.current = 'idle';
        setIssuedBetSlip(null);
        setSelectedChoices([]);
        setCorrectOrder(newOrder);
        // 前レースの馬券は破棄
        setParticipants(prev => prev.map(p => ({ ...p, betSlip: null })));
        resetHorsePositions();
        if (broadcast) {
            broadcastGameState('idle', idx, newOrder);
            void fetch('/api/trifecta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'update_game', status: 'idle', currentRaceIndex: idx, correctOrder: newOrder })
            }).then(() => {
                sendEvent('refresh-data', {});
            }).catch(err => console.error("Go to race DB error:", err));
        }
    }, [races, resetHorsePositions, broadcastGameState, sendEvent]);

    const advanceToNextRace = useCallback(() => {
        const isLast = currentRaceIndex >= races.length - 1;
        if (isLast) {
            setGameStatus('grand_finale');
            statusRef.current = 'grand_finale';
            soundRef.current?.playFanfare();
            soundRef.current?.playCheers();
            broadcastGameState('grand_finale', currentRaceIndex, correctOrder);
            void fetch('/api/trifecta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'update_game', status: 'grand_finale' })
            }).catch(err => console.error("Grand finale DB error:", err));
        } else {
            goToRace(currentRaceIndex + 1, true);
            soundRef.current?.playFanfare();
        }
    }, [currentRaceIndex, races.length, correctOrder, goToRace, broadcastGameState]);

    const rebetCurrentRace = useCallback(() => {
        setGameStatus('idle');
        statusRef.current = 'idle';
        setIssuedBetSlip(null);
        setSelectedChoices([]);
        resetHorsePositions();
        broadcastGameState('idle', currentRaceIndex, correctOrder);
        void fetch('/api/trifecta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'rebet', raceIndex: currentRaceIndex })
        }).then(() => {
            void loadInitialDataFromDB();
            sendEvent('refresh-data', {});
        }).catch(err => console.error("Rebet DB error:", err));
    }, [currentRaceIndex, correctOrder, resetHorsePositions, broadcastGameState, loadInitialDataFromDB, sendEvent]);

    const resetEntireTournament = useCallback(() => {
        const firstRace = races[0];
        const newOrder = firstRace?.correctOrder || [6, 4, 0];
        setCurrentRaceIndex(0);
        setGameStatus('idle');
        statusRef.current = 'idle';
        setParticipantScore(0);
        setIssuedBetSlip(null);
        setSelectedChoices([]);
        setParticipants(prev => prev.map(p => ({ ...p, score: 0, betSlip: null })));
        resetHorsePositions();
        setCorrectOrder(newOrder);
        broadcastGameState('idle', 0, newOrder);
        void fetch('/api/trifecta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'reset_tournament' })
        }).then(() => {
            void loadInitialDataFromDB();
            sendEvent('refresh-data', {});
        }).catch(err => console.error("Reset DB error:", err));
    }, [races, resetHorsePositions, broadcastGameState, loadInitialDataFromDB, sendEvent]);

    // 幹事：正解着順の変更（重複禁止）＋ races 側にも保持
    const updateCorrectOrder = useCallback((rank: number, val: number) => {
        if (correctOrder.some((c, rIdx) => rIdx !== rank && c === val)) return;
        const next = [...correctOrder];
        next[rank] = val;
        setCorrectOrder(next);
        setRaces(rs => rs.map((r, i) => (i === currentRaceIndex ? { ...r, correctOrder: next } : r)));
    }, [correctOrder, currentRaceIndex]);

    // 問題編集（イミュータブル更新：以前は DEFAULT_DERBY_RACES 自体を書き換えていた）
    const updateRaceField = useCallback((field: 'name' | 'question', value: string) => {
        setRaces(prev => prev.map((r, i) => (i === currentRaceIndex ? { ...r, [field]: value } : r)));
    }, [currentRaceIndex]);

    const updateRaceOption = useCallback((optIdx: number, value: string) => {
        setRaces(prev => prev.map((r, i) => {
            if (i !== currentRaceIndex) return r;
            const options = [...r.options];
            options[optIdx] = value;
            return { ...r, options };
        }));
    }, [currentRaceIndex]);

    const toggleSound = () => {
        const next = !isMuted;
        if (soundRef.current) soundRef.current.muted = next;
        setIsMuted(next);
    };

    const handleChoiceSelect = (idx: number) => {
        if (issuedBetSlip || gameStatus !== 'idle') return;
        setSelectedChoices(prev => {
            if (prev.includes(idx)) return prev.filter(i => i !== idx);
            if (prev.length < 3) return [...prev, idx];
            return prev;
        });
    };

    const submitParticipantBet = () => {
        if (selectedChoices.length !== 3 || issuedBetSlip || gameStatus !== 'idle') return;
        const bet = [...selectedChoices];
        setIssuedBetSlip(bet);
        soundRef.current?.playCheers();
        broadcastParticipantBet(bet);
        // DB に投票を記録
        void fetch('/api/trifecta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'bet',
                participantId,
                name: participantName,
                betOrder: bet,
                raceIndex: currentRaceIndex
            })
        }).then(() => {
            sendEvent('refresh-data', {});
        }).catch(err => console.error("Bet DB error:", err));
    };

    // 全参加者ランキング一覧（降順ソート）
    const allRankedParticipants = useMemo<Participant[]>(() => {
        // multiview では「自分（ゲスト）」も参加者として並べる。分割URLでは幹事が集めた参加者だけ
        const list = role === 'multiview'
            ? [{ id: participantId, name: participantName, score: participantScore, betSlip: issuedBetSlip }, ...participants.filter(p => p.id !== participantId)]
            : [...participants];
        return list.sort((a, b) => b.score - a.score);
    }, [role, participantId, participantName, participantScore, issuedBetSlip, participants]);

    // 単勝オッズ（投票内容から算出。1位に1票も入っていない馬は 999.9倍）
    const horseOddsList = useMemo<string[]>(() => {
        const voteCounts = Array(8).fill(0);
        let totalVotes = 0;
        allRankedParticipants.forEach(p => {
            if (p.betSlip && p.betSlip.length > 0) {
                const firstChoice = p.betSlip[0];
                if (typeof firstChoice === 'number' && firstChoice >= 0 && firstChoice < 8) {
                    voteCounts[firstChoice]++;
                    totalVotes++;
                }
            }
        });

        return HORSES_DATA.map((_, i) => {
            const count = voteCounts[i];
            if (count === 0 || totalVotes === 0) {
                return "999.9";
            }
            const oddsVal = Math.max(1.0, totalVotes / count);
            return oddsVal.toFixed(1);
        });
    }, [allRankedParticipants]);

    // 参加者スマホに表示する自分の累計得点（分割URLでは幹事から配信された得点表の値）
    const myScore = role === 'multiview'
        ? participantScore
        : (participants.find(p => p.id === participantId)?.score ?? 0);

    // 幹事画面に表示する各画面のURL
    const roleUrl = (r: 'play' | 'screen' | 'host') => `${origin}${basePath}/${r}`;
    const copyText = (text: string) => {
        try {
            void navigator.clipboard.writeText(text);
            setToastMessage('URLをコピーしました');
        } catch {
            setToastMessage('コピーできませんでした');
        }
    };

    const submitName = () => {
        const name = nameInput.trim().slice(0, 30);
        if (!name) return;
        setParticipantName(name);
        try { localStorage.setItem('derby_participant_name', name); } catch { /* noop */ }
        // DB に参加者登録
        void fetch('/api/trifecta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'join', participantId, name })
        }).then(() => {
            sendEvent('participant-join', { participantId, name });
            sendEvent('refresh-data', {});
        }).catch(err => console.error("Join DB error:", err));
    };

    // 進行中のゲームがあるときはホームへ戻る前に確認（得点は端末メモリにしかないため）
    const goHome = () => {
        const inProgress = currentRaceIndex > 0 || gameStatus !== 'idle' || allRankedParticipants.some(p => p.score > 0);
        if (!inProgress) {
            window.location.href = homeHref;
            return;
        }
        setConfirmDialog({
            isOpen: true,
            title: 'ゲーム選択へ戻りますか？',
            message: '進行中のレースと得点はリセットされます。参加者の画面も同期が止まります。',
            onConfirm: () => { window.location.href = homeHref; }
        });
    };

    if (!isMounted) {
        return (
            <div className="min-h-screen bg-slate-950 text-amber-300 flex items-center justify-center font-mono text-xs">
                LOADING 3連単アンケートゲーム ENGINE...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
            <style>{ARBITRARY_CLASS_FALLBACK_CSS}</style>

            {/* グローバル最上部ヘッダー（会場スクリーンでは表示しない） */}
            {role !== 'screen' && (
                <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50 shadow-md">
                    <div className="flex items-center gap-3">
                        {/* 参加者に見せると誤タップで離脱するため、幹事・開発用のみ */}
                        {(role === 'host' || role === 'multiview') && (
                            <a
                                href={homeHref}
                                onClick={(e) => { e.preventDefault(); goHome(); }}
                                className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-600 transition-all"
                            >
                                <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
                                <span className="hidden sm:inline">ゲーム選択へ戻る</span>
                            </a>
                        )}

                        <div className="flex items-center gap-2">
                            <span className="text-base">🏇</span>
                            <div>
                                <div className="font-bold text-xs tracking-wider text-slate-100 flex items-center gap-1.5 font-mono">
                                    <span className="font-black text-amber-400">3連単アンケートゲーム</span>
                                    <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] px-2 py-0.5 rounded font-mono">
                                        第{currentRaceIndex + 1}R / 全3R
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-400 hidden md:block">披露宴・二次会 リアルタイム連動システム</div>
                            </div>
                        </div>
                    </div>

                    {/* 画面切り替えタブ（開発用 multiview のみ。本番はURLで画面が固定される） */}
                    {role === 'multiview' && (
                        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
                            <button
                                onClick={() => setDerbyRoute('multiview')}
                                className={`px-2.5 py-1 rounded-lg transition-all ${derbyRoute === 'multiview' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                            >
                                3画面同時
                            </button>
                            <button
                                onClick={() => setDerbyRoute('screen')}
                                className={`px-2.5 py-1 rounded-lg transition-all ${derbyRoute === 'screen' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                            >
                                会場スクリーン
                            </button>
                            <button
                                onClick={() => setDerbyRoute('play')}
                                className={`px-2.5 py-1 rounded-lg transition-all ${derbyRoute === 'play' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                            >
                                参加者スマホ
                            </button>
                            <button
                                onClick={() => setDerbyRoute('host')}
                                className={`px-2.5 py-1 rounded-lg transition-all ${derbyRoute === 'host' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                            >
                                幹事管理
                            </button>
                        </div>
                    )}

                    {/* サウンド制御（会場スクリーンは画面内に操作あり） */}
                    <div className="flex items-center gap-2">
                        {role !== 'play' && (
                            <button
                                onClick={toggleSound}
                                className="p-1 px-2.5 rounded-lg border border-slate-700 text-xs bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5"
                            >
                                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
                                <span className="text-[11px] font-mono">{isMuted ? 'MUTE' : 'SOUND'}</span>
                            </button>
                        )}
                    </div>
                </header>
            )}

            {(
                <main className={
                    role === 'screen'
                        ? 'flex-1 w-full'
                        : role === 'play'
                            ? 'flex-1 w-full p-2 sm:p-4 max-w-md mx-auto flex flex-col items-center'
                            : role === 'host'
                                ? 'flex-1 w-full p-2 sm:p-4 max-w-xl mx-auto flex flex-col'
                                : 'flex-1 p-3 md:p-5 max-w-7xl mx-auto w-full'
                }>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start w-full">

                        {/* -------------------------------------------------------- */}
                        {/* [パネル A] 参加者スマホ画面 (/derby/play)                */}
                        {/* -------------------------------------------------------- */}
                        {(derbyRoute === 'multiview' || derbyRoute === 'play') && (
                            <div className={`${derbyRoute === 'play' ? 'lg:col-span-12 max-w-md mx-auto w-full' : 'lg:col-span-4'} flex flex-col items-center w-full`}>
                                {role === 'multiview' && (
                                    <div className="w-full flex items-center justify-between px-2 py-1 mb-1 text-slate-400 text-xs font-bold">
                                        <span className="flex items-center gap-1.5 text-slate-200">
                                            <Smartphone className="w-3.5 h-3.5 text-rose-400" /> ① 参加者スマホ画面
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono">{basePath}/play</span>
                                    </div>
                                )}

                                {/* 本物のスマホ（role=play）では端末枠を描かず全画面で使う */}
                                <div
                                    className={role === 'play' ? 'w-full flex flex-col' : 'w-full max-w-[360px] bg-slate-950 rounded-[40px] p-2.5 shadow-2xl border-4 border-slate-800 relative overflow-hidden flex flex-col'}
                                    style={role === 'play' ? undefined : { height: 670 }}
                                >
                                    <div className={role === 'play' ? 'w-full bg-slate-950 p-3 space-y-3' : 'w-full h-full rounded-[30px] overflow-y-auto bg-slate-950 border border-slate-900 p-3 space-y-3'}>
                                        {role === 'play' && !participantName ? (
                                            <div className="bg-slate-900 border border-amber-500/40 p-4 rounded-xl space-y-3 mt-6">
                                                <div className="text-2xl text-center">🏇</div>
                                                <div className="text-sm font-black text-white text-center">3連単アンケートゲームに参加</div>
                                                <p className="text-xs text-slate-400 text-center">ランキングに表示する名前を入力してください</p>
                                                <input
                                                    type="text"
                                                    value={nameInput}
                                                    maxLength={30}
                                                    onChange={(e) => setNameInput(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') submitName(); }}
                                                    placeholder="例：新郎友人・たけし"
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white"
                                                />
                                                <button
                                                    onClick={submitName}
                                                    disabled={!nameInput.trim()}
                                                    className={`w-full py-2.5 rounded-xl font-black text-sm ${nameInput.trim() ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-600'}`}
                                                >
                                                    参加する
                                                </button>
                                            </div>
                                        ) : (<>

                                            {/* スマホヘッダー */}
                                            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between">
                                                <div>
                                                    <div className="text-xs font-bold text-white truncate max-w-[160px]">{participantName}</div>
                                                </div>
                                                <div className="bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-xs px-2.5 py-0.5 rounded-full font-mono">
                                                    {myScore} pt
                                                </div>
                                            </div>

                                            {/* お題カード */}
                                            <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl shadow">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-bold text-amber-400 font-mono">{currentRace.name}</span>
                                                </div>
                                                <div className="text-xs sm:text-sm font-bold text-white leading-snug">{currentRace.question}</div>
                                            </div>

                                            {/* レース中のスマホ案内 */}
                                            {gameStatus === 'racing' && (
                                                <div className="bg-slate-900 border border-amber-500/40 p-5 rounded-xl text-center space-y-2 shadow">
                                                    <div className="text-2xl animate-bounce">🏇</div>
                                                    <div className="text-sm font-black text-white">第{currentRaceIndex + 1}R レース発走中！</div>
                                                    <p className="text-[11px] text-amber-300">
                                                        会場のメインスクリーンにご注目ください！！
                                                    </p>
                                                </div>
                                            )}

                                            {/* 結果表示時のスマホ案内 */}
                                            {gameStatus === 'result' && (
                                                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center space-y-2 shadow">
                                                    <span className="text-[10px] text-slate-400 font-bold block">第{currentRaceIndex + 1}R 判定結果</span>
                                                    {issuedBetSlip ? (
                                                        (() => {
                                                            const pts = calculateBetScore(issuedBetSlip, correctOrder);
                                                            let tag = "不的中";
                                                            let color = "bg-slate-800 text-slate-400";
                                                            if (pts === 6) { tag = "🎉 サンレンタン完全的中 (+6pt)"; color = "bg-amber-500 text-slate-950 font-black"; }
                                                            else if (pts === 4) { tag = "✨ サンレンプク的中 (+4pt)"; color = "bg-emerald-500 text-slate-950 font-black"; }
                                                            else if (pts === 3) { tag = "🎯 ニレンタン的中 (+3pt)"; color = "bg-blue-500 text-white font-black"; }
                                                            return (
                                                                <div className={`p-2 rounded-lg text-xs ${color}`}>
                                                                    {tag}
                                                                </div>
                                                            );
                                                        })()
                                                    ) : (
                                                        <div className="text-xs text-slate-400">未投票でした</div>
                                                    )}
                                                    <p className="text-[10px] text-slate-400">幹事が次のレースへ進めるまでお待ちください</p>
                                                </div>
                                            )}

                                            {/* 投票フォーム */}
                                            {gameStatus === 'idle' && (
                                                issuedBetSlip ? (
                                                    <div className="bg-slate-900 border border-emerald-500/40 p-4 rounded-xl text-center space-y-2.5 shadow">
                                                        <div className="w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-sm font-bold">
                                                            ✓
                                                        </div>
                                                        <div className="text-xs font-bold text-white">第{currentRaceIndex + 1}R 投票完了！</div>
                                                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1 text-left text-xs font-mono">
                                                            {issuedBetSlip.map((hIdx, i) => (
                                                                <div key={i} className="flex items-center gap-2 p-1.5 bg-slate-900 rounded border border-slate-800">
                                                                    <span className="w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center bg-amber-500 text-slate-950">{i + 1}</span>
                                                                    <span className="text-[11px] font-bold text-white truncate flex-1">{currentRace.options[hIdx]}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <p className="text-[10px] text-slate-400">発走までそのままお待ちください</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                                                            <span>1位・2位・3位の順に選択</span>
                                                            <span className="text-amber-400 font-mono font-bold">{selectedChoices.length} / 3 選択</span>
                                                        </div>
                                                        {HORSES_DATA.map((h, idx) => {
                                                            const selIdx = selectedChoices.indexOf(idx);
                                                            const isSel = selIdx !== -1;
                                                            return (
                                                                <button
                                                                    key={idx}
                                                                    onClick={() => handleChoiceSelect(idx)}
                                                                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${isSel ? 'border-amber-400 bg-amber-500/10 shadow' : 'border-slate-800 bg-slate-900 text-slate-200 hover:border-slate-700'
                                                                        }`}
                                                                >
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                                                                        <span className="w-5 h-5 rounded text-xs font-black flex items-center justify-center font-mono shadow text-white shrink-0" style={{ backgroundColor: h.color }}>
                                                                            {h.letter}
                                                                        </span>
                                                                        <span className="text-xs font-bold text-white truncate flex-1">{currentRace.options[idx] || h.name}</span>
                                                                    </div>
                                                                    {isSel && (
                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-slate-950 shrink-0">
                                                                            第{selIdx + 1}位
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                        <button
                                                            onClick={submitParticipantBet}
                                                            disabled={selectedChoices.length !== 3}
                                                            className={`w-full py-2.5 rounded-xl font-black text-xs shadow transition-all ${selectedChoices.length === 3 ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                                                }`}
                                                        >
                                                            {selectedChoices.length === 3 ? 'この3連単で投票する！' : `あと ${3 - selectedChoices.length} 頭選択`}
                                                        </button>
                                                    </div>
                                                )
                                            )}

                                        </>)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* -------------------------------------------------------- */}
                        {/* [パネル B] 会場メインスクリーン (/derby/screen)          */}
                        {/* -------------------------------------------------------- */}
                        {(derbyRoute === 'multiview' || derbyRoute === 'screen') && (
                            <div className={`${derbyRoute === 'screen' ? 'lg:col-span-12' : 'lg:col-span-5'} flex flex-col w-full`}>
                                {role === 'multiview' && (
                                    <div className="flex items-center justify-between px-2 py-1 mb-1 text-slate-400 text-xs font-bold">
                                        <span className="flex items-center gap-1.5 text-slate-200">
                                            <Monitor className="w-3.5 h-3.5 text-amber-400" /> ② 会場プロジェクター（3D中継）
                                        </span>
                                        <span className="text-[10px] text-amber-400 font-mono">{basePath}/screen</span>
                                    </div>
                                )}

                                {/* 会場スクリーン（role=screen）はプロジェクター全面に表示 */}
                                <div
                                    className={role === 'screen' ? 'w-full bg-slate-950 overflow-hidden flex flex-col relative' : 'w-full bg-slate-950 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col relative'}
                                    style={{ height: role === 'screen' ? '100vh' : 670 }}
                                >
                                    <div ref={canvasContainerRef} className="absolute inset-0 w-full h-full" />

                                    {webglError && (
                                        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
                                            <div className="text-xs text-slate-300 space-y-1">
                                                <div className="text-amber-300 font-bold text-sm">3D表示を開始できませんでした</div>
                                                <p>このブラウザでは WebGL が使えません。Chrome の「ハードウェアアクセラレーション」をオンにするか、別のPCで開いてください。</p>
                                                <p>進行と得点の集計は通常どおり動きます。</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* ブラウザは操作なしに音を出せないため、会場スクリーンは最初に1回クリックしてもらう */}
                                    {role === 'screen' && !audioUnlocked && (
                                        <button
                                            onClick={() => { soundRef.current?.init(); setAudioUnlocked(true); }}
                                            className="absolute inset-0 z-[60] bg-slate-950/90 flex flex-col items-center justify-center gap-3 text-center"
                                        >
                                            <span className="text-4xl">🏇</span>
                                            <span className="text-lg font-black text-amber-300">クリックして中継を開始</span>
                                            <span className="text-xs text-slate-400">ファンファーレ・実況音を有効にします</span>
                                        </button>
                                    )}

                                    {/* オッズ板 ＆ カメラ切り替え */}
                                    <div className="absolute top-0 inset-x-0 p-3 z-20 flex items-start justify-between pointer-events-none">
                                        <div className="bg-slate-950/85 backdrop-blur border border-slate-800 rounded-xl p-2.5 shadow-lg text-xs w-48 font-mono pointer-events-auto">
                                            <div className="text-[10px] font-bold text-slate-400 border-b border-slate-800 pb-1 mb-1.5 flex justify-between">
                                                <span>{currentRace.name}</span>
                                                <span>単勝</span>
                                            </div>
                                            <div className="space-y-1">
                                                {HORSES_DATA.map((h, i) => (
                                                    <div key={h.letter} className="flex items-center justify-between text-[11px] font-bold px-1 py-0.5 rounded bg-black/40">
                                                        <div className="flex items-center gap-1 truncate">
                                                            <span className="w-4 h-4 rounded text-[9px] font-black flex items-center justify-center text-white" style={{ backgroundColor: h.color }}>
                                                                {h.letter}
                                                            </span>
                                                            <span className="text-white truncate max-w-[100px]">{currentRace.options[i] || h.name}</span>
                                                        </div>
                                                        <span className="text-amber-300 font-mono">{horseOddsList[i]}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2 pointer-events-auto">
                                            <div className="flex gap-1 bg-slate-950/85 backdrop-blur p-1 rounded-lg border border-slate-800 shadow">
                                                {(['follow', 'side', 'front', 'top'] as CameraMode[]).map(m => (
                                                    <button
                                                        key={m}
                                                        onClick={() => setCameraMode(m)}
                                                        className={`px-2 py-0.5 text-[10px] font-bold rounded ${cameraMode === m ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                                                    >
                                                        {m === 'follow' ? '追走' : m === 'side' ? 'サイド' : m === 'front' ? '正面' : '俯瞰'}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="bg-slate-950/90 border border-slate-800 px-3 py-1 rounded-lg flex items-center gap-2 shadow font-mono">
                                                <span className="text-[10px] text-slate-300 font-bold">残り</span>
                                                <span ref={remainCallbackRef} className="text-base text-amber-300 font-black tabular-nums" />
                                                <span className="text-xs text-slate-400">m</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 下部実況字幕 */}
                                    <div className="absolute bottom-3 inset-x-3 z-20 pointer-events-none flex justify-center">
                                        <div className="w-full max-w-xl bg-slate-950/90 backdrop-blur border border-slate-800 px-4 py-2 rounded-xl shadow-xl flex items-center gap-2.5 text-xs">
                                            <span className="bg-slate-800 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded shrink-0">実況</span>
                                            <span ref={commentaryCallbackRef} className="text-white tracking-wide truncate" />
                                        </div>
                                    </div>

                                    {/* 着順確定モーダル */}
                                    {gameStatus === 'result' && (
                                        <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur flex flex-col items-center justify-center p-5 text-center">
                                            <div className="w-full max-w-sm bg-slate-900 border border-amber-500/40 rounded-2xl p-5 shadow-2xl space-y-3">
                                                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full font-bold">
                                                    第{currentRaceIndex + 1}R 着順確定
                                                </span>
                                                <h2 className="text-base font-black text-white">サンレンタン確定結果</h2>
                                                <div className="space-y-1.5 text-left text-xs">
                                                    {correctOrder.map((hIdx, rank) => {
                                                        const h = HORSES_DATA[hIdx];
                                                        return (
                                                            <div key={rank} className="flex items-center justify-between p-2 bg-slate-950 rounded-xl border border-slate-800">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-amber-400 font-mono text-[11px]">{rank === 0 ? '🥇1着' : rank === 1 ? '🥈2着' : '🥉3着'}</span>
                                                                    <span className="w-4 h-4 rounded text-[9px] font-black flex items-center justify-center text-white" style={{ backgroundColor: h.color }}>{h.letter}</span>
                                                                    <span className="font-bold text-white truncate max-w-[140px]">{currentRace.options[hIdx]}</span>
                                                                </div>
                                                                <span className="text-amber-300 font-mono">{horseOddsList[hIdx]}倍</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {isAuthority ? (
                                                    <button
                                                        onClick={advanceToNextRace}
                                                        className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow transition-all"
                                                    >
                                                        {currentRaceIndex >= 2 ? '🏆 全3R終了！総合優勝発表へ ➔' : `次のレース（第${currentRaceIndex + 2}R）へ進む ➔`}
                                                    </button>
                                                ) : (
                                                    <p className="text-[11px] text-slate-400">幹事が次のレースへ進めるまでお待ちください</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* 総合優勝・グランドフィナーレ */}
                                    {gameStatus === 'grand_finale' && (
                                        <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-lg flex flex-col items-center justify-center p-5 text-center">
                                            <div className="w-full max-w-md bg-slate-900 border-2 border-amber-400 rounded-3xl p-6 shadow-2xl space-y-4">
                                                <div className="text-4xl animate-bounce">🏆</div>
                                                <h2 className="text-xl font-black text-white">3連単アンケートゲーム 総合表彰</h2>
                                                <p className="text-xs text-slate-400">全3レース終了！栄光の3連単マスターは！？</p>
                                                <div className="space-y-2 text-left">
                                                    {allRankedParticipants.slice(0, 3).map((u, i) => (
                                                        <div key={u.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-800 bg-slate-950">
                                                            <div className="flex items-center gap-2.5">
                                                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs font-mono ${i === 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                                                                    {i + 1}
                                                                </span>
                                                                <div>
                                                                    <span className="text-[10px] text-amber-300 font-bold block">{i === 0 ? '👑 CHAMPION' : `${i + 1}位`}</span>
                                                                    <span className="text-xs font-bold text-white">{u.name}</span>
                                                                </div>
                                                            </div>
                                                            <span className="font-mono text-base font-black text-amber-300">{u.score} pt</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                {isAuthority && (
                                                    <button onClick={() => setGameStatus('idle')} className="w-full py-2 bg-slate-800 text-slate-300 rounded-xl text-xs hover:bg-slate-700">
                                                        閉じる（結果表示維持）
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </div>
                        )}

                        {/* -------------------------------------------------------- */}
                        {/* [パネル C] 幹事・管理画面 (/derby/host)                  */}
                        {/* -------------------------------------------------------- */}
                        {(derbyRoute === 'multiview' || derbyRoute === 'host') && (
                            <div className={`${derbyRoute === 'host' ? 'lg:col-span-12 max-w-xl mx-auto' : 'lg:col-span-3'} flex flex-col w-full`}>
                                {role === 'multiview' && (
                                    <div className="flex items-center justify-between px-2 py-1 mb-1 text-slate-400 text-xs font-bold">
                                        <span className="flex items-center gap-1.5 text-slate-200">
                                            <Settings className="w-3.5 h-3.5 text-blue-400" /> ③ 幹事管理コンソール
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono">{basePath}/host</span>
                                    </div>
                                )}

                                <div className="w-full bg-slate-900 rounded-2xl shadow-xl border border-slate-800 p-4 space-y-3" style={role === 'host' ? undefined : { height: 670 }}>

                                    {/* 管理サブタブ（2タブ構成） */}
                                    <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-center text-xs font-bold">
                                        <button onClick={() => setAdminSubTab('live')} className={`py-1.5 rounded-lg transition-all ${adminSubTab === 'live' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                                            当日進行
                                        </button>
                                        <button onClick={() => setAdminSubTab('edit')} className={`py-1.5 rounded-lg transition-all ${adminSubTab === 'edit' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                                            問題登録
                                        </button>
                                    </div>

                                    {adminSubTab === 'live' && (
                                        <div className="space-y-3">
                                            {/* 各画面のURL（参加者へはQRコード化して配布） */}
                                            {role === 'host' && (
                                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                                                    <span className="text-[10px] text-amber-300 font-bold block">各画面のURL</span>
                                                    {([['play', '参加者スマホ（QRで配布）'], ['screen', '会場スクリーン（プロジェクターPC）']] as const).map(([r, label]) => (
                                                        <div key={r} className="flex items-center gap-2 text-[11px]">
                                                            <span className="text-slate-400 shrink-0 w-28">{label}</span>
                                                            <span className="font-mono text-slate-200 truncate flex-1">{roleUrl(r)}</span>
                                                            <button onClick={() => copyText(roleUrl(r))} className="shrink-0 px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white">コピー</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* 着順確定後の進行（分割URLではスクリーンにボタンがないため幹事側に置く） */}
                                            {gameStatus === 'result' && (
                                                <button
                                                    onClick={advanceToNextRace}
                                                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow"
                                                >
                                                    {currentRaceIndex >= races.length - 1 ? '🏆 全3R終了！総合優勝発表へ' : `次のレース（第${currentRaceIndex + 2}R）へ進む`}
                                                </button>
                                            )}
                                            {gameStatus === 'grand_finale' && (
                                                <div className="bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-bold p-2.5 rounded-xl text-center">
                                                    🏆 会場スクリーンに総合表彰を表示中
                                                </div>
                                            )}
                                            {/* 現在のレース情報 */}
                                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[11px] text-amber-400 font-mono font-bold">進行中レース:</span>
                                                    <span className="text-[11px] bg-slate-800 px-2.5 py-1 rounded text-slate-200 font-mono font-bold">
                                                        投票済: {allRankedParticipants.filter(p => p.betSlip).length} / {allRankedParticipants.length}名
                                                    </span>
                                                </div>
                                                <select
                                                    value={currentRaceIndex}
                                                    onChange={(e) => goToRace(parseInt(e.target.value, 10), true)}
                                                    disabled={gameStatus === 'racing'}
                                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                                                >
                                                    {races.map((r, i) => (
                                                        <option key={r.id} value={i}>{r.name}</option>
                                                    ))}
                                                </select>
                                                <div className="text-[11px] text-slate-300 font-bold">{currentRace.question}</div>
                                            </div>

                                            {/* 正解着順指定（重複禁止バリデーション） */}
                                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-2">
                                                <span className="text-[10px] text-amber-300 font-bold block">このレースの正解着順（1〜3着）:</span>
                                                {[0, 1, 2].map(rank => (
                                                    <div key={rank} className="flex items-center gap-2 text-xs">
                                                        <span className="w-10 bg-slate-800 text-amber-400 font-mono py-1 rounded text-center text-[10px] font-bold">
                                                            {rank + 1}着
                                                        </span>
                                                        <select
                                                            value={correctOrder[rank]}
                                                            onChange={(e) => updateCorrectOrder(rank, parseInt(e.target.value, 10))}
                                                            disabled={gameStatus === 'racing'}
                                                            className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white"
                                                        >
                                                            {HORSES_DATA.map((h, i) => (
                                                                <option key={i} value={i} disabled={correctOrder.some((c, rIdx) => rIdx !== rank && c === i)}>
                                                                    [{h.letter}] {currentRace.options[i]}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* 発走ボタン */}
                                            <button
                                                onClick={startDerbyRace}
                                                disabled={gameStatus !== 'idle'}
                                                className="w-full bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white font-black py-3 rounded-xl text-xs shadow flex items-center justify-center gap-1.5 transition-all"
                                            >
                                                <Play className="w-4 h-4 fill-white" />
                                                <span>{gameStatus === 'racing' ? '🏇 激走中継中...' : gameStatus === 'idle' ? `第${currentRaceIndex + 1}R 3D競馬発走スタート！` : '発走済み（次のレースへ進んでください）'}</span>
                                            </button>

                                            {/* 再投票 ＆ リセットボタン群 */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={rebetCurrentRace}
                                                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs border border-slate-700"
                                                >
                                                    このRを再投票
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setConfirmDialog({
                                                            isOpen: true,
                                                            title: '全スコアリセットの確認',
                                                            message: '全レースの得点と投票履歴を初期状態に戻します。本当によろしいですか？',
                                                            onConfirm: () => {
                                                                resetEntireTournament();
                                                                setConfirmDialog(CLOSED_DIALOG);
                                                            }
                                                        });
                                                    }}
                                                    className="bg-slate-900 hover:bg-rose-950/40 text-rose-400 font-bold py-2 rounded-xl text-xs border border-slate-800"
                                                >
                                                    全スコアリセット
                                                </button>
                                            </div>

                                            {/* 累計ランキング */}
                                            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
                                                <span className="text-[10px] text-slate-400 font-bold block">累計得点リーダーボード:</span>
                                                {allRankedParticipants.slice(0, 5).map((u, i) => (
                                                    <div key={u.id} className="flex items-center justify-between text-xs p-1 bg-slate-900 rounded">
                                                        <span className="truncate max-w-[120px] font-bold text-white">{i + 1}. {u.name}</span>
                                                        <span className="text-amber-400 font-mono font-bold">{u.score} pt</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {adminSubTab === 'edit' && (
                                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
                                            <span className="text-xs font-bold text-white block mb-1">第1R〜第3R 設問・選択肢の編集</span>
                                            <select
                                                value={currentRaceIndex}
                                                onChange={(e) => goToRace(parseInt(e.target.value, 10), true)}
                                                disabled={gameStatus === 'racing'}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-amber-300 font-bold mb-2"
                                            >
                                                {races.map((r, i) => (
                                                    <option key={r.id} value={i}>{r.name}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                value={currentRace.name}
                                                onChange={(e) => updateRaceField('name', e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                                                placeholder="レース名"
                                            />
                                            <textarea
                                                rows={2}
                                                value={currentRace.question}
                                                onChange={(e) => updateRaceField('question', e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                                                placeholder="質問文"
                                            />
                                            <div className="space-y-1.5">
                                                {HORSES_DATA.map((h, i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <span className="w-5 h-5 rounded text-[10px] font-black flex items-center justify-center text-white shrink-0" style={{ backgroundColor: h.color }}>{h.letter}</span>
                                                        <input
                                                            type="text"
                                                            value={currentRace.options[i] || ''}
                                                            onChange={(e) => updateRaceOption(i, e.target.value)}
                                                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs sm:text-sm text-white"
                                                            placeholder={`選択肢 ${h.letter}`}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        localStorage.setItem('derby_saved_races', JSON.stringify(races));
                                                        await fetch('/api/trifecta', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ type: 'save_races', races })
                                                        });
                                                        sendEvent('refresh-data', {});
                                                        setToastMessage('全レースの問題設定をDBに保存しました');
                                                    } catch (e) {
                                                        console.warn(e);
                                                        setToastMessage('保存に失敗しました');
                                                    }
                                                }}
                                                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs"
                                            >
                                                編集内容を保存
                                            </button>
                                        </div>
                                    )}

                                </div>
                            </div>
                        )}

                    </div>
                </main>
            )}

            {/* 誤操作防止確認ダイアログ */}
            {confirmDialog.isOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
                        <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                            <AlertTriangle className="w-4 h-4" />
                            <span>{confirmDialog.title}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            {confirmDialog.message}
                        </p>
                        <div className="flex gap-2 justify-end pt-2">
                            <button
                                onClick={() => setConfirmDialog(CLOSED_DIALOG)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={() => confirmDialog.onConfirm?.()}
                                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                            >
                                実行する
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* トースト通知（alert() の代替） */}
            {toastMessage && (
                <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 border border-amber-500/40 text-amber-200 text-xs font-bold px-4 py-2 rounded-xl shadow-2xl">
                    {toastMessage}
                </div>
            )}

        </div>
    );
}