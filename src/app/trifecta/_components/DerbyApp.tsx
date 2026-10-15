'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';
import {
    advanceSimTo, computeWinOdds, createSimState, formatOdds, judgeBet, ranksOf, scenarioOf,
    FINISH_Z, RACE_START_Z, SCORE_RULES, type BetOrder, type BetRankType, type SimState
} from '@/lib/derby-core';

// ==============================================================
// アイコン（lucide-react 互換の見た目をインラインSVGで定義。外部パッケージ不要）
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
// 型定義
// ==============================================================
type GameStatus = 'idle' | 'racing' | 'result' | 'grand_finale';
type DerbyRoute = 'multiview' | 'play' | 'screen' | 'host';
type AdminSubTab = 'live' | 'edit';

interface DerbyRace {
    id: string;
    roundIndex: number;
    name: string;
    question: string;
    options: string[];
    correctOrder: BetOrder; // 幹事以外には空配列で届く
}

interface HorseData {
    num: number;
    letter: string;
    name: string;
    color: string;       // 枠色（勝負服・ゼッケン地）
    jockeyColor: string; // ヘルメット・胴
    textColor: string;   // ゼッケン文字色（1番Aは白地なので濃紺。実際の競馬の1枠と同じ）
}

interface HorseObject {
    mesh: THREE.Group;
    data: HorseData;
    legs: {
        legFL: THREE.Group; legFR: THREE.Group; legBL: THREE.Group; legBR: THREE.Group;
        tail: THREE.Mesh; head: THREE.Mesh;
    };
    badge: THREE.Object3D;
}

interface Participant {
    id: string;
    name: string;
    score: number;
    betSlip: BetOrder | null; // 現在レースの馬券
}

interface ConfirmDialogState {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: (() => void) | null;
}

/** /api/trifecta が返す状態（DB が唯一の正） */
interface Snapshot {
    serverNow: number;
    version: number;
    isHost: boolean;
    game: {
        status: GameStatus;
        currentRaceIndex: number;
        correctOrder: BetOrder | null; // 投票受付中は幹事以外 null
        raceStartedAt: number | null;  // 発走時刻（サーバー時刻ms）
        raceDurationMs: number | null; // 発走から着順確定まで
    };
    races: DerbyRace[];
    participants: Participant[];
}

interface ApiResult {
    ok: boolean;
    status: number;
    error?: string;
    data?: Snapshot;
    duplicate?: boolean;
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

const HOST_PW_KEY = 'derby_host_password';

const HORSES_DATA: HorseData[] = [
    { num: 1, letter: "A", name: "サイバーヒー", color: "#e2e8f0", jockeyColor: "#cbd5e1", textColor: "#0f172a" },
    { num: 2, letter: "B", name: "コニーティーチャン", color: "#334155", jockeyColor: "#1e293b", textColor: "#ffffff" },
    { num: 3, letter: "C", name: "スッポンスポロクス", color: "#dc2626", jockeyColor: "#b91c1c", textColor: "#ffffff" },
    { num: 4, letter: "D", name: "ジェッドムリサイズ", color: "#2563eb", jockeyColor: "#1d4ed8", textColor: "#ffffff" },
    { num: 5, letter: "E", name: "マッスル唐揚げ（屈強男）", color: "#d97706", jockeyColor: "#b45309", textColor: "#ffffff" },
    { num: 6, letter: "F", name: "アキネイヅミツデス", color: "#059669", jockeyColor: "#047857", textColor: "#ffffff" },
    { num: 7, letter: "G", name: "シューマッスルズシ", color: "#ea580c", jockeyColor: "#c2410c", textColor: "#ffffff" },
    { num: 8, letter: "H", name: "ヒメオマンパルスタ", color: "#be185d", jockeyColor: "#9d174d", textColor: "#ffffff" }
];

/** 枠番チップ（A〜H）の共通スタイル。A だけ濃紺文字＋縁取り */
const chipStyle = (h: HorseData): React.CSSProperties => ({
    backgroundColor: h.color,
    color: h.textColor,
    boxShadow: h.letter === 'A' ? 'inset 0 0 0 1.5px #64748b' : undefined
});

// 役ごとの色（スマホの判定結果・スクリーンの的中者速報で共通）
const RANK_STYLE: Record<BetRankType, { solid: string; soft: string; emoji: string }> = {
    sanrentan: { solid: 'bg-amber-500 text-slate-950', soft: 'bg-amber-500/20 border-amber-500/40 text-amber-200', emoji: '👑' },
    sanrenpuku: { solid: 'bg-emerald-500 text-slate-950', soft: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200', emoji: '✨' },
    nirentan: { solid: 'bg-blue-500 text-white', soft: 'bg-blue-500/20 border-blue-500/40 text-blue-200', emoji: '🎯' },
    bukubuku: { solid: 'bg-purple-500 text-white', soft: 'bg-purple-500/20 border-purple-500/40 text-purple-200', emoji: '🍀' },
    tan: { solid: 'bg-teal-500 text-white', soft: 'bg-teal-500/20 border-teal-500/40 text-teal-200', emoji: '⚡️' },
    none: { solid: 'bg-slate-800 text-slate-300', soft: 'bg-slate-800 border-slate-700 text-slate-300', emoji: '' }
};

const CLOSED_DIALOG: ConfirmDialogState = { isOpen: false, title: '', message: '', onConfirm: null };

// ==============================================================
// 3D 素材（すべてコード生成。外部モデル・画像なし）
// ==============================================================
function createSaddleTexture(letter: string, bgColor: string, textColor: string): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = textColor === '#ffffff' ? "#ffffff" : "#0f172a";
    ctx.lineWidth = 10;
    ctx.strokeRect(4, 4, 120, 120);
    ctx.fillStyle = textColor;
    ctx.font = "bold 88px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, 64, 66);
    return new THREE.CanvasTexture(cv);
}

/** 頭上の枠番バッジ。濃紺の外縁＋白リングで、芝・空・白い馬体の上でも輪郭が出る */
function createLetterBadgeSprite(letter: string, bgColor: string, textColor: string): THREE.Object3D {
    if (typeof document === 'undefined') return new THREE.Group();
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext("2d");
    if (!ctx) return new THREE.Group();
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(64, 64, 55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(64, 64, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = "900 70px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, 64, 68);

    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.2, 3.2, 1);
    return sprite;
}

function generateTurfTexture(): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
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
    tex.repeat.set(2, 60);
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
    group.scale.set(1.5, 1.5, 1.5);

    const horseMat = new THREE.MeshLambertMaterial({ color: 0x854d24 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x3a1f10 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const jockeyMat = new THREE.MeshLambertMaterial({ color: horseData.jockeyColor });

    const saddleMat = new THREE.MeshLambertMaterial({
        map: createSaddleTexture(horseData.letter, horseData.color, horseData.textColor)
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
        new THREE.MeshBasicMaterial({ map: createSaddleTexture(horseData.letter, "#ffffff", "#000000"), side: THREE.DoubleSide })
    );
    backBadge.position.set(0, 4.3, 0.05);
    backBadge.rotation.x = Math.PI / 3.5;
    group.add(backBadge);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 7, 6), jockeyMat);
    helmet.position.set(0, 4.8, -1.2);
    helmet.castShadow = true;
    group.add(helmet);

    const headBadge = createLetterBadgeSprite(horseData.letter, horseData.color, horseData.textColor);
    headBadge.position.set(0, 6.4, -1.2);
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
        badge: headBadge
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
// 本体
// ==============================================================
export default function DerbyApp({ role = 'multiview', homeHref = '/', basePath = '/trifecta' }: DerbyAppProps) {
    const isHostRole = role === 'host' || role === 'multiview';
    const renders3D = role === 'screen' || role === 'multiview';
    const pollMs = role === 'play' ? 4000 : 2500;

    const [isMounted, setIsMounted] = useState(false);
    const [derbyRoute, setDerbyRoute] = useState<DerbyRoute>(role);
    const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('live');

    // ---- DB から届く状態 ----
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [races, setRaces] = useState<DerbyRace[]>([]);
    const [currentRaceIndex, setCurrentRaceIndex] = useState(0);
    const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
    const [correctOrder, setCorrectOrder] = useState<BetOrder | null>(null);
    const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
    const [raceDurationMs, setRaceDurationMs] = useState<number | null>(null);
    const [participants, setParticipants] = useState<Participant[]>([]);

    // ---- 参加者（この端末） ----
    const [participantId, setParticipantId] = useState('');
    const [participantName, setParticipantName] = useState('');
    const [nameInput, setNameInput] = useState('');
    const [selectedChoices, setSelectedChoices] = useState<number[]>([]);
    const [betSending, setBetSending] = useState(false);
    const [betError, setBetError] = useState<string | null>(null);

    // ---- 幹事 ----
    const [hostPassword, setHostPassword] = useState('');
    const [hostAuthed, setHostAuthed] = useState(false);
    const [loginInput, setLoginInput] = useState('');
    const [loginError, setLoginError] = useState<string | null>(null);
    const [hostBusy, setHostBusy] = useState(false);
    const [draftRaces, setDraftRaces] = useState<DerbyRace[] | null>(null);
    const [editRaceIndex, setEditRaceIndex] = useState(0);

    // ---- 表示 ----
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(CLOSED_DIALOG);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [realtimeRanks, setRealtimeRanks] = useState<number[]>([0, 1, 2, 3, 4, 5, 6, 7]);
    const [webglError, setWebglError] = useState(false);
    const [origin, setOrigin] = useState('');
    const [isCloudConnected, setIsCloudConnected] = useState(false);
    const [localFinishedKey, setLocalFinishedKey] = useState<string | null>(null);
    const [nowTick, setNowTick] = useState(0);

    // ---- Three.js ----
    const containerElRef = useRef<HTMLDivElement | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const remainElRef = useRef<HTMLSpanElement | null>(null);
    const lastRemainRef = useRef(1000);

    // ---- 最新値を非同期処理・描画ループから読むための Ref ----
    const raceKey = `${currentRaceIndex}:${raceStartedAt ?? '-'}`;
    const statusRef = useRef<GameStatus>('idle');
    const orderRef = useRef<BetOrder | null>(null);
    const startedAtRef = useRef<number | null>(null);
    const durationRef = useRef<number | null>(null);
    const raceIndexRef = useRef(0);
    const raceKeyRef = useRef(raceKey);
    const hostPasswordRef = useRef('');
    const versionRef = useRef(0);
    const clockOffsetRef = useRef(0);
    const bestRttRef = useRef(Infinity);
    const localFinishedRef = useRef<string | null>(null);
    const onLocalFinishRef = useRef<(key: string) => void>(() => { });

    statusRef.current = gameStatus;
    orderRef.current = correctOrder;
    startedAtRef.current = raceStartedAt;
    durationRef.current = raceDurationMs;
    raceIndexRef.current = currentRaceIndex;
    raceKeyRef.current = raceKey;
    hostPasswordRef.current = hostAuthed ? hostPassword : '';

    const serverNow = useCallback(() => Date.now() + clockOffsetRef.current, []);

    // --------------------------------------------------------------
    // スナップショットの反映
    // --------------------------------------------------------------
    const applySnapshot = useCallback((snap: Snapshot) => {
        if (snap.version < versionRef.current) return;
        versionRef.current = snap.version;
        const g = snap.game;
        if (g.currentRaceIndex !== raceIndexRef.current) {
            setSelectedChoices([]);
            setBetError(null);
        }
        raceIndexRef.current = g.currentRaceIndex;
        statusRef.current = g.status;
        setRaces(snap.races);
        setCurrentRaceIndex(g.currentRaceIndex);
        setGameStatus(g.status);
        setCorrectOrder(g.correctOrder);
        setRaceStartedAt(g.raceStartedAt);
        setRaceDurationMs(g.raceDurationMs);
        setParticipants(snap.participants);
        setLoaded(true);
        setLoadError(null);
    }, []);

    const authHeaders = useCallback((): Record<string, string> => (
        hostPasswordRef.current ? { 'x-host-password': hostPasswordRef.current } : {}
    ), []);

    const updateClock = (serverNowMs: number, t0: number, t1: number) => {
        const rtt = t1 - t0;
        bestRttRef.current = Math.min(bestRttRef.current * 1.05, Number.MAX_VALUE);
        if (rtt <= bestRttRef.current) {
            bestRttRef.current = rtt;
            clockOffsetRef.current = serverNowMs - (t0 + t1) / 2;
        }
    };

    // ---- 取得 ----
    const fetchingRef = useRef(false);
    const refetchRef = useRef(false);
    const fetchSnapshot = useCallback(async () => {
        if (fetchingRef.current) { refetchRef.current = true; return; }
        fetchingRef.current = true;
        try {
            do {
                refetchRef.current = false;
                const t0 = Date.now();
                const res = await fetch('/api/trifecta', { cache: 'no-store', headers: authHeaders() });
                const t1 = Date.now();
                const json = await res.json().catch(() => null);
                if (!res.ok || !json?.success) {
                    setLoadError(json?.error || `サーバーに接続できません（${res.status}）`);
                } else {
                    updateClock(json.data.serverNow, t0, t1);
                    applySnapshot(json.data as Snapshot);
                }
            } while (refetchRef.current);
        } catch {
            setLoadError('サーバーに接続できません。通信状況を確認してください（自動で再接続します）');
        } finally {
            fetchingRef.current = false;
        }
    }, [applySnapshot, authHeaders]);

    const fetchTimerRef = useRef<number | null>(null);
    const scheduleFetch = useCallback((delay = 120) => {
        if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = window.setTimeout(() => { void fetchSnapshot(); }, delay);
    }, [fetchSnapshot]);

    // ---- リアルタイム配信 ----
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const nudgeOthers = useCallback(() => {
        const ch = channelRef.current;
        if (ch) void ch.send({ type: 'broadcast', event: 'refresh', payload: { at: Date.now() } });
    }, []);

    // ---- 送信 ----
    const postAction = useCallback(async (type: string, payload: Record<string, unknown> = {}): Promise<ApiResult> => {
        try {
            const t0 = Date.now();
            const res = await fetch('/api/trifecta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ type, ...payload })
            });
            const t1 = Date.now();
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) {
                if (res.status === 401 && isHostRole && hostPasswordRef.current) {
                    setHostAuthed(false);
                    setLoginError('幹事パスワードが無効になりました。もう一度ログインしてください');
                    try { sessionStorage.removeItem(HOST_PW_KEY); } catch { /* noop */ }
                }
                return { ok: false, status: res.status, error: json?.error || `通信エラー（${res.status}）` };
            }
            updateClock(json.data.serverNow, t0, t1);
            applySnapshot(json.data as Snapshot);
            nudgeOthers();
            return { ok: true, status: res.status, data: json.data, duplicate: !!json.duplicate };
        } catch {
            return { ok: false, status: 0, error: '通信できませんでした。電波の良い場所でもう一度お試しください' };
        }
    }, [applySnapshot, authHeaders, nudgeOthers, isHostRole]);

    const runHost = useCallback(async (type: string, payload: Record<string, unknown> = {}, okMessage?: string) => {
        setHostBusy(true);
        const r = await postAction(type, payload);
        setHostBusy(false);
        if (!r.ok) setToastMessage(r.error ?? '操作に失敗しました');
        else if (okMessage) setToastMessage(okMessage);
        return r;
    }, [postAction]);

    // --------------------------------------------------------------
    // 起動
    // --------------------------------------------------------------
    useEffect(() => {
        setIsMounted(true);
        setOrigin(window.location.origin);
        try {
            const savedPid = localStorage.getItem('derby_participant_id') || `p_${Math.random().toString(36).slice(2, 11)}`;
            localStorage.setItem('derby_participant_id', savedPid);
            setParticipantId(savedPid);
            const savedName = localStorage.getItem('derby_participant_name') || '';
            if (role === 'play' && savedName) setParticipantName(savedName);
            if (role === 'multiview') setParticipantName(savedName || 'ゲスト（あなた）');
            if (isHostRole) {
                const pw = sessionStorage.getItem(HOST_PW_KEY) || '';
                if (pw) { setHostPassword(pw); setHostAuthed(true); hostPasswordRef.current = pw; }
            }
        } catch (e) {
            console.warn("Storage load warning:", e);
        }
        void fetchSnapshot();
    }, [role, isHostRole, fetchSnapshot]);

    useEffect(() => {
        const t = window.setInterval(() => { void fetchSnapshot(); }, pollMs);
        const onVisible = () => { if (document.visibilityState === 'visible') void fetchSnapshot(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
            window.clearInterval(t);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [fetchSnapshot, pollMs]);

    useEffect(() => {
        let cancelled = false;
        const ch = supabase.channel('derby-realtime-room')
            .on('broadcast', { event: 'refresh' }, () => scheduleFetch())
            .subscribe((st) => {
                if (cancelled) return;
                const ok = st === 'SUBSCRIBED';
                setIsCloudConnected(ok);
                if (ok) scheduleFetch(0);
            });
        channelRef.current = ch;
        return () => {
            cancelled = true;
            void supabase.removeChannel(ch);
            if (channelRef.current === ch) channelRef.current = null;
        };
    }, [scheduleFetch]);

    useEffect(() => {
        if (isHostRole && hostAuthed) {
            versionRef.current = 0;
            void fetchSnapshot();
        }
    }, [isHostRole, hostAuthed, fetchSnapshot]);

    const joinedRef = useRef('');
    useEffect(() => {
        if (role === 'screen' || role === 'host') return;
        if (!loaded || !participantId || !participantName) return;
        const key = `${participantId}:${participantName}`;
        if (joinedRef.current === key) return;
        joinedRef.current = key;
        void postAction('join', { participantId, name: participantName }).then(r => {
            if (!r.ok) { joinedRef.current = ''; setBetError(r.error ?? '参加登録に失敗しました'); }
        });
    }, [role, loaded, participantId, participantName, postAction]);

    useEffect(() => {
        if (!toastMessage) return;
        const t = window.setTimeout(() => setToastMessage(null), 2800);
        return () => window.clearTimeout(t);
    }, [toastMessage]);

    // --------------------------------------------------------------
    // レース進行
    // --------------------------------------------------------------
    onLocalFinishRef.current = (key: string) => {
        if (localFinishedRef.current === key) return;
        localFinishedRef.current = key;
        setLocalFinishedKey(key);
        void postAction('finalize_race');
    };

    useEffect(() => {
        if (!isHostRole || gameStatus !== 'racing' || raceStartedAt === null || raceDurationMs === null) return;
        const wait = Math.max(0, raceStartedAt + raceDurationMs + 300 - serverNow());
        const t = window.setTimeout(() => { void postAction('finalize_race'); }, wait);
        const t2 = window.setTimeout(() => { void fetchSnapshot(); }, wait + 2500);
        return () => { window.clearTimeout(t); window.clearTimeout(t2); };
    }, [isHostRole, gameStatus, raceStartedAt, raceDurationMs, serverNow, postAction, fetchSnapshot]);

    useEffect(() => {
        if (gameStatus !== 'racing') return;
        const t = window.setInterval(() => setNowTick(x => x + 1), 500);
        return () => window.clearInterval(t);
    }, [gameStatus]);

    const displayStatus: GameStatus = (gameStatus === 'racing' && renders3D && localFinishedKey === raceKey) ? 'result' : gameStatus;

    // --------------------------------------------------------------
    // 残り距離の DOM 直接書き換え
    // --------------------------------------------------------------
    const writeRemain = useCallback((value: number) => {
        if (lastRemainRef.current === value) return;
        lastRemainRef.current = value;
        if (remainElRef.current) remainElRef.current.textContent = String(value);
    }, []);
    const remainCallbackRef = useCallback((el: HTMLSpanElement | null) => {
        remainElRef.current = el;
        if (el) el.textContent = String(lastRemainRef.current);
    }, []);

    // --------------------------------------------------------------
    // Three.js canvas アタッチ
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
        if (renderer.domElement.parentElement !== container) container.appendChild(renderer.domElement);
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
    // Three.js シーン生成 ＋ 描画ループ
    // --------------------------------------------------------------
    useEffect(() => {
        if (!isMounted || !renders3D) return;

        const trackWidth = 64;
        const trackLength = 1600;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9bd2fc);
        scene.fog = new THREE.FogExp2(0x9bd2fc, 0.0016);

        // 固定カメラ（もっと右斜め前からの俯瞰・引きと高さを確保）
        const camera = new THREE.PerspectiveCamera(50, 600 / 650, 0.5, 2000);
        camera.position.set(26, 38, -48);
        camera.lookAt(-4, 0, 8);
        cameraRef.current = camera;

        let renderer: THREE.WebGLRenderer | null = null;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
            renderer.setSize(600, 650);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFShadowMap;
            rendererRef.current = renderer;
        } catch (err) {
            console.warn("WebGL を初期化できませんでした:", err);
            renderer = null;
            setWebglError(true);
        }

        scene.add(new THREE.HemisphereLight(0xffffff, 0x446644, 0.8));
        const dirLight = new THREE.DirectionalLight(0xfffaed, 0.95);
        dirLight.position.set(40, 70, 40);
        dirLight.castShadow = true;
        scene.add(dirLight);

        // コース芝生（幅広化：スタンド壁を外側に下げても隙間ができないよう拡張）
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(trackWidth + 30, trackLength), new THREE.MeshLambertMaterial({ map: generateTurfTexture() }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(-10, 0, -trackLength / 2 + 100);
        ground.receiveShadow = true;
        scene.add(ground);

        // 内ラチ・外ラチ
        scene.add(createTrackFence(-trackWidth / 2, trackLength));
        scene.add(createTrackFence(trackWidth / 2, trackLength));

        // スタンド壁（外側へ十分離して看板が壁にめり込まないよう配置）
        const standWall = new THREE.Mesh(new THREE.BoxGeometry(10, 12, trackLength), new THREE.MeshLambertMaterial({ map: generateStandWallTexture() }));
        standWall.position.set(-trackWidth / 2 - 14, 6, -trackLength / 2 + 100);
        scene.add(standWall);

        // ゴールポール
        const finishPole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 16, 12), new THREE.MeshLambertMaterial({ color: 0xef4444 }));
        finishPole.position.set(-trackWidth / 2 - 1, 8, FINISH_Z);
        scene.add(finishPole);

        // 残り距離標識（内ラチの外側・スタンド壁から離れた安全な位置に配置、文字切れゼロのクッキリ視認）
        const wallCourseX = -trackWidth / 2 - 2.8;
        [1000, 800, 600, 400, 200, 100].forEach(dist => {
            const cv = document.createElement('canvas');
            cv.width = 512; cv.height = 256;
            const c2 = cv.getContext('2d');
            if (!c2) return;
            // 白地パネル ＋ 太い赤枠線
            c2.fillStyle = '#ffffff';
            c2.fillRect(0, 0, 512, 256);
            c2.lineWidth = 16;
            c2.strokeStyle = '#dc2626';
            c2.strokeRect(8, 8, 496, 240);

            // 残り距離 数字（文字切れ防止：余白を確保して枠内に必ず収まるよう動的フィット）
            const distStr = String(dist);
            let numFontSize = dist >= 1000 ? 104 : 120;
            c2.font = `900 ${numFontSize}px "Impact", "Arial Black", sans-serif`;
            while (c2.measureText(distStr).width > 380 && numFontSize > 50) {
                numFontSize -= 4;
                c2.font = `900 ${numFontSize}px "Impact", "Arial Black", sans-serif`;
            }
            c2.fillStyle = '#dc2626';
            c2.textAlign = 'center';
            c2.textBaseline = 'middle';
            c2.fillText(distStr, 256, 96);

            // "残り" ＋ "m" サブテキスト（中央配置）
            let subFontSize = 40;
            c2.font = `bold ${subFontSize}px sans-serif`;
            const subText = `残り ${dist}m`;
            while (c2.measureText(subText).width > 390 && subFontSize > 22) {
                subFontSize -= 2;
                c2.font = `bold ${subFontSize}px sans-serif`;
            }
            c2.fillStyle = '#0f172a';
            c2.fillText(subText, 256, 188);

            // 右斜め前カメラ (26, 38, -48) からしっかり正対して見える角度（Math.PI * 0.27）
            const board = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 5.25), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide }));
            board.position.set(wallCourseX, 8.2, FINISH_Z + dist);
            board.rotation.y = Math.PI * 0.27;

            const arm = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0x334155 }));
            arm.position.set(wallCourseX, 8.2, FINISH_Z + dist);
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8.5, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
            post.position.set(wallCourseX, 4.25, FINISH_Z + dist);
            scene.add(board, arm, post);
        });

        // GOAL 看板（特大）
        const goalCv = document.createElement('canvas');
        goalCv.width = 512; goalCv.height = 256;
        const gc = goalCv.getContext('2d');
        if (gc) {
            gc.fillStyle = '#b91c1c';
            gc.fillRect(0, 0, 512, 256);
            gc.lineWidth = 16;
            gc.strokeStyle = '#facc15';
            gc.strokeRect(8, 8, 496, 240);
            gc.fillStyle = '#facc15';
            gc.font = '900 120px "Impact", sans-serif';
            gc.textAlign = 'center';
            gc.textBaseline = 'middle';
            gc.fillText('GOAL', 256, 112);
            gc.fillStyle = '#ffffff';
            gc.font = 'bold 44px sans-serif';
            gc.fillText('FINISH LINE', 256, 208);
            const goalBoard = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(goalCv), side: THREE.DoubleSide }));
            goalBoard.position.set(wallCourseX, 10, FINISH_Z);
            goalBoard.rotation.y = Math.PI * 0.27;
            scene.add(goalBoard);
        }

        // 馬8頭
        const meshes: HorseObject[] = HORSES_DATA.map(hData => {
            const hObj = buildLowPolyHorse(hData);
            scene.add(hObj.mesh);
            return hObj;
        });

        attachRendererToContainer();

        // ---------------- 描画ループ ----------------
        let sim: SimState = createSimState();
        let simKey = '';
        let lastTime = performance.now();
        let elapsed = 0;
        const badgeWorldPos = new THREE.Vector3();
        let rankTimer = 0;
        let frameId = 0;
        let snapCamera = true;
        let maxSimT = 0;
        let focusZ = RACE_START_Z;
        let focusInitialized = false;

        // 固定カメラ（引き・高さを上げ、注視点を内ラチ側に寄せることで、上部UIや順位表と馬が一切被らない）
        const CAM_X = 35;
        const CAM_Y = 46;
        const CAM_OFFSET_Z = -54;
        const LOOK_X = -12;
        const LOOK_OFFSET_Z = 12;
        const placeCamera = (z: number) => {
            camera.position.set(CAM_X, CAM_Y, z + CAM_OFFSET_Z);
            camera.lookAt(LOOK_X, 0, z + LOOK_OFFSET_Z);
        };
        placeCamera(RACE_START_Z);

        const renderLoop = () => {
            frameId = requestAnimationFrame(renderLoop);
            const now = performance.now();
            const delta = Math.min((now - lastTime) / 1000, 0.25);
            lastTime = now;
            elapsed += delta;

            const status = statusRef.current;
            const order = orderRef.current;
            const startedAt = startedAtRef.current;
            const durationSec = (durationRef.current ?? 0) / 1000;
            const raceIdx = raceIndexRef.current;
            const key = raceKeyRef.current;
            const inRace = (status === 'racing' || status === 'result') && startedAt !== null && order !== null && durationSec > 0;

            if (inRace) {
                if (simKey !== key) {
                    sim = createSimState();
                    simKey = key;
                    snapCamera = true;
                    maxSimT = 0;
                    focusInitialized = false;
                }
                let targetT = status === 'racing'
                    ? Math.max(0, Math.min(durationSec, (Date.now() + clockOffsetRef.current - startedAt) / 1000))
                    : durationSec;
                if (status === 'racing') {
                    targetT = Math.max(targetT, maxSimT);
                    maxSimT = targetT;
                }
                sim = advanceSimTo(sim, targetT, order, raceIdx);
            } else if (simKey !== 'idle') {
                sim = createSimState();
                simKey = 'idle';
                snapCamera = true;
                maxSimT = 0;
                focusInitialized = false;
                writeRemain(1000);
                setRealtimeRanks([0, 1, 2, 3, 4, 5, 6, 7]);
            }
            const running = status === 'racing' && inRace && !sim.done;

            if (status === 'racing' && inRace && sim.done && localFinishedRef.current !== key) {
                onLocalFinishRef.current(key);
            }

            // メッシュへ反映
            let lead = 0;
            sim.horses.forEach((h, i) => { if (h.z < sim.horses[lead].z) lead = i; });
            meshes.forEach((m, i) => {
                const h = sim.horses[i];
                // ゴールした馬はゴールラインで止まり、未ゴールの馬はゴールまで走り続ける
                const moving = running && !h.finished;
                m.mesh.position.set(h.laneX, moving ? Math.abs(Math.sin(elapsed * 18 * h.speed)) * 0.28 : 0, h.z);
                const legSpeed = moving ? 17 * h.speed : 0;
                const swing = moving ? Math.sin(elapsed * legSpeed + i) : 0;
                m.legs.legFL.rotation.x = swing * 0.75;
                m.legs.legBR.rotation.x = swing * 0.75;
                m.legs.legFR.rotation.x = -swing * 0.75;
                m.legs.legBL.rotation.x = -swing * 0.75;
                m.legs.head.rotation.x = -Math.PI / 8 + (moving ? Math.cos(elapsed * legSpeed * 2) * 0.1 : 0);
                m.legs.tail.rotation.z = moving ? Math.sin(elapsed * legSpeed) * 0.25 : 0;
                m.badge.getWorldPosition(badgeWorldPos);
                m.badge.visible = camera.position.distanceTo(badgeWorldPos) > 14;
            });

            if (running) {
                rankTimer += delta;
                if (rankTimer >= 0.2) {
                    rankTimer = 0;
                    const sorted = ranksOf(sim);
                    setRealtimeRanks(prev => (prev.every((v, i) => v === sorted[i]) ? prev : sorted));
                }
                const leader = sim.horses[lead];
                const remain = Math.min(1000, Math.max(0, Math.floor(leader.z - FINISH_Z)));
                writeRemain(remain);
            }

            // 固定カメラ平行移動
            if (meshes.length > 0) {
                let minZ = Infinity;
                let maxZ = -Infinity;
                meshes.forEach(m => {
                    const z = m.mesh.position.z;
                    if (z < minZ) minZ = z;
                    if (z > maxZ) maxZ = z;
                });
                const packSpan = Math.min(maxZ - minZ, 40);
                const focusTarget = minZ + packSpan * 0.45;
                if (!focusInitialized || snapCamera) {
                    focusZ = focusTarget;
                    focusInitialized = true;
                } else {
                    focusZ += (focusTarget - focusZ) * (1 - Math.exp(-delta * 5));
                }
                placeCamera(focusZ);
            }
            snapCamera = false;

            if (containerElRef.current) renderer?.render(scene, camera);
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
            renderer?.dispose();
            rendererRef.current = null;
            cameraRef.current = null;
        };
    }, [isMounted, renders3D, attachRendererToContainer, writeRemain]);

    // --------------------------------------------------------------
    // 派生値
    // --------------------------------------------------------------
    const currentRace: DerbyRace = races[currentRaceIndex] || {
        id: 'r_dummy', roundIndex: currentRaceIndex, name: `第${currentRaceIndex + 1}レース`,
        question: '問題を読み込み中…', options: HORSES_DATA.map(h => h.name), correctOrder: []
    };

    const odds = useMemo(() => computeWinOdds(participants.map(p => p.betSlip)), [participants]);

    const myBet = useMemo(() => {
        const me = participants.find(p => p.id === participantId);
        return me?.betSlip ?? null;
    }, [participants, participantId]);

    const myResult = useMemo(() => {
        if (!correctOrder || !myBet) return null;
        return judgeBet(myBet, correctOrder);
    }, [correctOrder, myBet]);

    const ranked = useMemo(() => {
        const sorted = [...participants].sort((a, b) => b.score - a.score);
        let currentRank = 1;
        return sorted.map((p, i) => {
            if (i > 0 && p.score < sorted[i - 1].score) {
                currentRank = i + 1;
            }
            return {
                ...p,
                rank: currentRank,
            };
        });
    }, [participants]);

    const rankTiers = useMemo(() => {
        const tiers: { rank: number; score: number; members: (Participant & { rank: number })[] }[] = [];
        ranked.forEach(p => {
            const last = tiers[tiers.length - 1];
            if (last && last.score === p.score) {
                last.members.push(p);
            } else {
                tiers.push({
                    rank: p.rank,
                    score: p.score,
                    members: [p],
                });
            }
        });
        return tiers;
    }, [ranked]);

    // --------------------------------------------------------------
    // ユーザー操作
    // --------------------------------------------------------------
    const confirm = (opts: Omit<ConfirmDialogState, 'isOpen'>) => setConfirmDialog({ isOpen: true, ...opts });
    const closeConfirm = () => setConfirmDialog(CLOSED_DIALOG);

    const hostLogin = async () => {
        setLoginError(null);
        setHostBusy(true);
        const r = await postAction('verify_host', { password: loginInput });
        setHostBusy(false);
        if (!r.ok) {
            setLoginError('パスワードが正しくありません');
            return;
        }
        setHostPassword(loginInput);
        setHostAuthed(true);
        try { sessionStorage.setItem(HOST_PW_KEY, loginInput); } catch { /* noop */ }
    };

    const startRace = () => {
        if (!correctOrder || correctOrder.length < 3) {
            setToastMessage('正解着順（1〜3着）が設定されていません。「問題登録」タブで設定してください');
            return;
        }
        confirm({
            title: `第${currentRaceIndex + 1}レースを発走しますか？`,
            message: '投票の受付を終了し、レースを開始します。',
            confirmLabel: '発走！',
            onConfirm: () => {
                closeConfirm();
                void runHost('start_race', {}, '発走しました！');
            }
        });
    };

    const nextRace = () => {
        const nextIdx = currentRaceIndex + 1;
        if (nextIdx >= races.length) {
            openGrandFinale();
            return;
        }
        confirm({
            title: `第${nextIdx + 1}レースへ進みますか？`,
            message: `現在の第${currentRaceIndex + 1}レースを終了し、第${nextIdx + 1}レースの投票受付を開始します。`,
            confirmLabel: '進む',
            onConfirm: () => {
                closeConfirm();
                void runHost('set_race_index', { index: nextIdx }, `第${nextIdx + 1}レースに切り替えました`);
            }
        });
    };

    const prevRace = () => {
        if (currentRaceIndex <= 0) return;
        confirm({
            title: `第${currentRaceIndex}レースに戻りますか？`,
            message: '前のレースの投票受付画面に戻します。',
            confirmLabel: '戻る',
            onConfirm: () => {
                closeConfirm();
                void runHost('set_race_index', { index: currentRaceIndex - 1 });
            }
        });
    };

    const resetCurrentRace = () => {
        confirm({
            title: `第${currentRaceIndex + 1}レースをやり直しますか？`,
            message: '投票受付中の状態に戻します（参加者の投票は保持されます）。間違えて発走してしまった場合に使ってください。',
            confirmLabel: '受付中に戻す',
            onConfirm: () => {
                closeConfirm();
                void runHost('reset_race', {}, '受付中に戻しました');
            }
        });
    };

    const resetAllGame = () => {
        confirm({
            title: '全参加者の得点をリセットしますか？',
            message: 'すべての参加者のスコアと投票が0クリアされ、第1レースの受付中に戻ります。本番前にテストしたデータを消す時に使ってください。問題の内容は消えません。',
            confirmLabel: 'すべてリセット',
            danger: true,
            onConfirm: () => {
                closeConfirm();
                void runHost('reset_all', {}, 'ゲームをリセットしました');
            }
        });
    };

    const openGrandFinale = () => void runHost('set_status', { status: 'grand_finale' });
    const closeGrandFinale = () => void runHost('set_status', { status: 'result' });

    const draftDirty = draftRaces !== null;
    const activeEditRace = (draftRaces ?? races)[editRaceIndex] || currentRace;
    const updateDraftRace = (patch: Partial<DerbyRace>) => {
        const base = draftRaces ?? races;
        const list = base.map((r, i) => (i === editRaceIndex ? { ...r, ...patch } : r));
        setDraftRaces(list);
    };
    const addDraftRace = () => {
        const base = draftRaces ?? races;
        const newRace: DerbyRace = {
            id: `r_${Date.now()}`,
            roundIndex: base.length,
            name: `第${base.length + 1}レース`,
            question: '新しい問題',
            options: HORSES_DATA.map((h, i) => `選択肢 ${h.letter}`),
            correctOrder: [0, 1, 2]
        };
        const list = [...base, newRace];
        setDraftRaces(list);
        setEditRaceIndex(list.length - 1);
    };
    const deleteDraftRace = () => {
        const list = draftRaces ?? races;
        if (list.length <= 1) {
            setToastMessage('問題は最低1つ必要です');
            return;
        }
        confirm({
            title: `第${editRaceIndex + 1}Rを削除しますか？`,
            message: 'この設問と選択肢を下書きから削除します。「編集内容を保存」を押すまで本番には反映されません。',
            confirmLabel: '削除する',
            danger: true,
            onConfirm: () => {
                closeConfirm();
                const updated = (draftRaces ?? races).filter((_, i) => i !== editRaceIndex);
                setDraftRaces(updated);
                setEditRaceIndex(i => Math.max(0, Math.min(i, updated.length - 1)));
            }
        });
    };
    const saveRaces = async () => {
        const list = draftRaces ?? races;
        const r = await runHost('save_races', {
            races: list.map(x => ({ id: x.id, name: x.name, question: x.question, options: x.options }))
        }, '問題を保存しました');
        if (r.ok) setDraftRaces(null);
    };
    const discardDraft = () => setDraftRaces(null);

    // 参加者
    const submitName = () => {
        const name = nameInput.trim().slice(0, 30);
        if (!name) return;
        try { localStorage.setItem('derby_participant_name', name); } catch { /* noop */ }
        setParticipantName(name);
    };
    const handleChoiceSelect = (idx: number) => {
        if (myBet || gameStatus !== 'idle' || betSending) return;
        setBetError(null);
        setSelectedChoices(prev => {
            if (prev.includes(idx)) return prev.filter(i => i !== idx);
            if (prev.length < 3) return [...prev, idx];
            return prev;
        });
    };
    const submitParticipantBet = async () => {
        if (selectedChoices.length !== 3 || myBet || gameStatus !== 'idle' || betSending) return;
        setBetSending(true);
        setBetError(null);
        const r = await postAction('bet', {
            participantId, name: participantName, betOrder: [...selectedChoices], raceIndex: currentRaceIndex
        });
        setBetSending(false);
        if (!r.ok) {
            setBetError(r.status === 409 ? '投票の受付が終了しています（発走済み、またはレースが切り替わりました）' : (r.error ?? '投票できませんでした'));
            return;
        }
        setSelectedChoices([]);
        if (r.duplicate) setToastMessage('このレースはすでに投票済みです');
    };

    const roleUrl = (r: 'play' | 'screen' | 'host') => `${origin}${basePath}/${r}`;
    const copyText = (text: string) => {
        navigator.clipboard?.writeText(text)
            .then(() => setToastMessage('URLをコピーしました'))
            .catch(() => setToastMessage('コピーできませんでした'));
    };

    // このレースの的中者
    const hitList = (correctOrder ? participants : [])
        .map(p => ({ p, r: judgeBet(p.betSlip, correctOrder) }))
        .filter(x => x.r.score > 0)
        .sort((a, b) => b.r.score - a.r.score);

    if (!isMounted) {
        return (
            <div className="min-h-screen bg-slate-950 text-amber-300 flex items-center justify-center font-mono text-xs">
                LOADING ウェディングサンレンタン！...
            </div>
        );
    }

    const hostPanelLocked = isHostRole && !hostAuthed;
    const overlayW = 'w-52 sm:w-60 lg:w-64';

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">

            {/* グローバル最上部ヘッダー（会場スクリーンでは表示しない） */}
            {role !== 'screen' && (
                <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50 shadow-md">
                    <div className="flex items-center gap-3">
                        {isHostRole && (
                            <a
                                href={homeHref}
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
                                    <span className="font-black text-amber-400">ウェディングサンレンタン！</span>
                                    {loaded && (
                                        <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] px-2 py-0.5 rounded font-mono">
                                            第{currentRaceIndex + 1}R / 全{races.length}R
                                        </span>
                                    )}
                                </div>
                                <div className="text-[10px] text-slate-400 hidden md:block">披露宴・二次会 リアルタイム連動システム</div>
                            </div>
                        </div>
                    </div>

                    {/* 画面切り替えタブ（開発用 multiview のみ） */}
                    {role === 'multiview' && (
                        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
                            {([['multiview', '3画面同時'], ['screen', '会場スクリーン'], ['play', '参加者スマホ'], ['host', '幹事管理']] as const).map(([r, label]) => (
                                <button
                                    key={r}
                                    onClick={() => setDerbyRoute(r)}
                                    className={`px-2.5 py-1 rounded-lg transition-all ${derbyRoute === r ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        {isHostRole && (
                            <span
                                title={isCloudConnected ? 'リアルタイム配信に接続中' : 'リアルタイム配信に再接続中（数秒ごとの自動同期で進行は続きます）'}
                                className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] border ${isCloudConnected ? 'border-emerald-700 text-emerald-300' : 'border-amber-700 text-amber-300'}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${isCloudConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                                {isCloudConnected ? '同期中' : '自動同期中'}
                            </span>
                        )}
                    </div>
                </header>
            )}

            {/* 接続エラー（全画面共通） */}
            {loadError && (
                <div role="alert" className={`${role === 'screen' ? 'fixed top-0 inset-x-0 z-[70]' : ''} bg-rose-950/90 border-b border-rose-800 text-rose-100 text-xs font-bold px-4 py-2 text-center`}>
                    {loadError}
                </div>
            )}

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
                    {/* [パネル A] 参加者スマホ画面                              */}
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

                            <div
                                className={role === 'play' ? 'w-full flex flex-col' : 'w-full max-w-[360px] bg-slate-950 rounded-[40px] p-2.5 shadow-2xl border-4 border-slate-800 relative overflow-hidden flex flex-col'}
                                style={role === 'play' ? undefined : { height: 670 }}
                            >
                                <div className={role === 'play' ? 'w-full bg-slate-950 p-3 space-y-3' : 'w-full h-full rounded-[30px] overflow-y-auto bg-slate-950 border border-slate-900 p-3 space-y-3'}>
                                    {!loaded ? (
                                        <div className="text-center text-xs text-slate-400 py-10">接続中…</div>
                                    ) : !participantName ? (
                                        <div className="bg-slate-900 border border-amber-500/40 p-4 rounded-xl space-y-3 mt-6">
                                            <div className="text-2xl text-center">🏇</div>
                                            <div className="text-sm font-black text-white text-center">ウェディングサンレンタン！に参加</div>
                                            <p className="text-xs text-slate-400 text-center">ランキングに表示する名前を入力してください</p>
                                            <input
                                                type="text"
                                                value={nameInput}
                                                maxLength={30}
                                                onChange={(e) => setNameInput(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') submitName(); }}
                                                placeholder="例：たいち、かざねなど"
                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                                            />
                                            <button
                                                onClick={submitName}
                                                disabled={!nameInput.trim()}
                                                className="w-full py-2.5 rounded-xl font-black text-xs bg-amber-500 text-slate-950 disabled:bg-slate-800 disabled:text-slate-600"
                                            >
                                                参加する
                                            </button>
                                        </div>
                                    ) : (<>
                                        <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 px-3 py-2 rounded-xl">
                                            <div className="flex items-center gap-2 truncate">
                                                <span className="text-xs">👤</span>
                                                <span className="font-bold text-xs text-white truncate max-w-[120px]">{participantName}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 font-mono">
                                                <span className="text-[10px] text-slate-400">現在</span>
                                                <span className="text-sm font-black text-amber-400">
                                                    {participants.find(p => p.id === participantId)?.score ?? 0} pt
                                                </span>
                                            </div>
                                        </div>

                                        {gameStatus === 'grand_finale' && (
                                            <div className="bg-gradient-to-r from-amber-500/20 via-blue-950/40 to-amber-500/20 border-2 border-amber-400/80 rounded-2xl p-4 text-center space-y-2 shadow-xl animate-pulse">
                                                <div className="text-2xl">🏆</div>
                                                <div className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-300">
                                                    総合成績発表中！
                                                </div>
                                                <p className="text-xs text-slate-300">
                                                    会場スクリーンで結果発表を行っています！
                                                </p>
                                                <div className="pt-2 border-t border-slate-800 flex justify-around items-center">
                                                    <div>
                                                        <div className="text-[10px] text-slate-400">あなたの最終スコア</div>
                                                        <div className="text-lg font-black font-mono text-amber-300">
                                                            {participants.find(p => p.id === participantId)?.score ?? 0} pt
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-1.5">
                                            <div className="flex items-center justify-between text-[11px] font-mono">
                                                <span className="text-amber-400 font-bold">第{currentRaceIndex + 1}レース / 全{races.length}R</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${gameStatus === 'idle' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : gameStatus === 'racing' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                                                    {gameStatus === 'idle' ? '投票受付中' : gameStatus === 'racing' ? '出走中！' : '着順確定'}
                                                </span>
                                            </div>
                                            <h3 className="text-sm font-black text-white">{currentRace.name}</h3>
                                            <p className="text-xs text-slate-300 leading-relaxed font-bold">{currentRace.question}</p>
                                        </div>

                                        {myBet ? (
                                            <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-3 space-y-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-amber-300 font-bold">あなたの3連単予想</span>
                                                    <span className="text-[10px] text-emerald-400 font-mono">投票完了</span>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {myBet.slice(0, 3).map((hIdx, i) => {
                                                        const h = HORSES_DATA[hIdx];
                                                        return (
                                                            <div key={i} className="bg-slate-950 rounded-xl p-2 text-center border border-slate-800">
                                                                <div className="text-[10px] text-slate-400 font-bold">{i + 1}着</div>
                                                                <div className="w-6 h-6 rounded mx-auto my-1 flex items-center justify-center font-black text-xs font-mono shadow" style={chipStyle(h)}>
                                                                    {h.letter}
                                                                </div>
                                                                <div className="text-[11px] font-bold text-white truncate">{currentRace.options[hIdx] || h.name}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {displayStatus === 'result' && myResult && (
                                                    <div className="mt-2 pt-2 border-t border-slate-800 space-y-1.5 text-center">
                                                        <div className="text-xs text-slate-400">判定</div>
                                                        <div className={`py-1.5 px-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 ${RANK_STYLE[myResult.type].solid}`}>
                                                            <span>{RANK_STYLE[myResult.type].emoji}</span>
                                                            <span>{myResult.name || '不的中'}</span>
                                                            {myResult.score > 0 && <span className="font-mono">+{myResult.score}pt</span>}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            gameStatus !== 'idle' ? (
                                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center text-xs text-slate-400 space-y-1">
                                                    <div className="text-amber-400 font-bold">投票受付は終了しました</div>
                                                    <p>スクリーンでレースをお楽しみください！</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                                                        <span>1位・2位・3位の順にタップ</span>
                                                        <span className="text-amber-400 font-mono font-bold">{selectedChoices.length} / 3 選択</span>
                                                    </div>
                                                    {HORSES_DATA.map((h, idx) => {
                                                        const selIdx = selectedChoices.indexOf(idx);
                                                        const isSel = selIdx !== -1;
                                                        return (
                                                            <button
                                                                key={idx}
                                                                onClick={() => handleChoiceSelect(idx)}
                                                                disabled={betSending}
                                                                className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${isSel ? 'border-amber-400 bg-amber-500/10 shadow' : 'border-slate-800 bg-slate-900 text-slate-200 hover:border-slate-700'}`}
                                                            >
                                                                <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                                                                    <span className="w-5 h-5 rounded text-xs font-black flex items-center justify-center font-mono shadow shrink-0" style={chipStyle(h)}>
                                                                        {h.letter}
                                                                    </span>
                                                                    <span className="text-xs font-bold text-white truncate flex-1">{currentRace.options[idx] || h.name}</span>
                                                                </div>
                                                                {isSel ? (
                                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-slate-950 shrink-0">第{selIdx + 1}位</span>
                                                                ) : (
                                                                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{odds.counts[idx]}票</span>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                    <button
                                                        onClick={() => void submitParticipantBet()}
                                                        disabled={selectedChoices.length !== 3 || betSending}
                                                        className={`w-full py-2.5 rounded-xl font-black text-xs shadow transition-all ${selectedChoices.length === 3 && !betSending ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                                                    >
                                                        {betSending ? '送信中…' : selectedChoices.length === 3 ? (betError ? 'もう一度投票する' : 'この3連単で投票する！') : `あと ${3 - selectedChoices.length} 頭選択`}
                                                    </button>
                                                    {betError && (
                                                        <p role="alert" className="text-[11px] text-rose-200 bg-rose-950/60 border border-rose-900 rounded-lg p-2">{betError}</p>
                                                    )}

                                                    <details className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-[11px]">
                                                        <summary className="font-bold text-amber-300 cursor-pointer">得点ルールを見る</summary>
                                                        <div className="mt-2 space-y-1">
                                                            {SCORE_RULES.map(r => (
                                                                <div key={r.pt} className="flex items-start gap-2">
                                                                    <span className="w-8 shrink-0 font-black text-amber-300 font-mono">{r.pt}点</span>
                                                                    <div>
                                                                        <div className="font-bold text-white">{r.name}</div>
                                                                        <div className="text-[10px] text-slate-400">{r.desc}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            <p className="text-[10px] text-slate-500 pt-1">複数当てはまる場合は、いちばん高い点数だけが入ります。</p>
                                                        </div>
                                                    </details>
                                                </div>
                                            )
                                        )}
                                    </>)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* -------------------------------------------------------- */}
                    {/* [パネル B] 会場メインスクリーン                          */}
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

                                {/* 上部オーバーレイ：左＝レース名（特大）、右＝残り距離・投票数／順位ボード */}
                                <div className="absolute top-0 inset-x-0 p-3 sm:p-5 z-20 flex items-start justify-between pointer-events-none">
                                    {/* 左上：レースの名前（全体が見えるよう文字サイズ調節・枠内自動収容） */}
                                    <div className="flex flex-col gap-2 pointer-events-auto">
                                        <div className="bg-slate-950/90 backdrop-blur-md border-2 border-amber-500/60 rounded-2xl px-4 py-2.5 sm:px-5 sm:py-3 shadow-2xl font-mono flex items-center gap-3 max-w-xs sm:max-w-sm lg:max-w-md">
                                            <span className="text-2xl sm:text-3xl shrink-0">🏇</span>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] sm:text-xs text-amber-400 font-black tracking-widest uppercase">
                                                    RACE {currentRaceIndex + 1} / 全{races.length}R
                                                </div>
                                                {(() => {
                                                    const nameLen = (currentRace.name || '').length;
                                                    const nameSizeClass =
                                                        nameLen > 22 ? 'text-xs sm:text-sm' :
                                                        nameLen > 15 ? 'text-sm sm:text-base' :
                                                        nameLen > 10 ? 'text-base sm:text-lg' :
                                                        'text-lg sm:text-xl lg:text-2xl';
                                                    return (
                                                        <div className={`font-black text-white drop-shadow leading-snug mt-0.5 break-words ${nameSizeClass}`}>
                                                            {currentRace.name}
                                                        </div>
                                                    );
                                                })()}
                                                {currentRace.question && (
                                                    <div className="text-[11px] sm:text-xs text-amber-200/90 font-bold mt-0.5 break-words line-clamp-2">
                                                        {currentRace.question}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 右上：残り距離 ＆ 投票数/順位ボード */}
                                    <div className="flex flex-col items-end gap-2.5 pointer-events-auto">
                                        {/* 残り距離メーター */}
                                        <div className={`bg-slate-950/90 backdrop-blur border border-slate-700/80 rounded-xl px-4 py-2 flex items-center justify-between shadow-xl font-mono ${overlayW}`}>
                                            <span className="text-xs sm:text-sm text-slate-300 font-bold">残り距離</span>
                                            <div className="flex items-baseline gap-1">
                                                <span ref={remainCallbackRef} className="text-2xl sm:text-3xl text-amber-300 font-black tabular-nums">1000</span>
                                                <span className="text-xs sm:text-sm text-slate-400 font-bold">m</span>
                                            </div>
                                        </div>

                                        {/* 投票数 ＆ リアルタイム順位ボード（単勝オッズは非表示にし投票数を表示） */}
                                        <div className={`bg-slate-950/90 backdrop-blur border border-slate-700/80 rounded-2xl p-3 shadow-2xl ${overlayW} font-mono`}>
                                            <div className="text-xs sm:text-sm font-black text-amber-300 border-b border-slate-800 pb-2 mb-2 flex justify-between items-center gap-2">
                                                <span>{gameStatus === 'racing' ? 'リアルタイム順位' : '投票数'}</span>
                                                <span className="text-[11px] text-slate-400 font-bold">{odds.total}票</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {(gameStatus === 'racing' ? realtimeRanks : [0, 1, 2, 3, 4, 5, 6, 7]).map((hIdx, rankIdx) => {
                                                    const h = HORSES_DATA[hIdx];
                                                    const isRacing = gameStatus === 'racing';
                                                    const optText = currentRace.options[hIdx] || h.name;
                                                    const optLen = optText.length;
                                                    const textSize = optLen > 14 ? 'text-[10px] leading-tight' : optLen > 9 ? 'text-[11px] leading-tight' : 'text-xs leading-tight';
                                                    return (
                                                        <div key={h.letter} className="flex items-center justify-between px-2 py-1 sm:py-1.5 rounded-xl bg-black/60 border border-slate-800/80 shadow-sm gap-1.5">
                                                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                {isRacing && (
                                                                    <span className={`w-4 h-4 sm:w-5 sm:h-5 rounded text-[10px] sm:text-[11px] font-black flex items-center justify-center shrink-0 ${rankIdx === 0 ? 'bg-amber-400 text-slate-950' : rankIdx === 1 ? 'bg-slate-200 text-slate-950' : rankIdx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                                                                        {rankIdx + 1}
                                                                    </span>
                                                                )}
                                                                <span className="w-4 h-4 sm:w-5 sm:h-5 rounded text-[10px] sm:text-[11px] font-black flex items-center justify-center shrink-0 shadow-sm" style={chipStyle(h)}>
                                                                    {h.letter}
                                                                </span>
                                                                <span className={`text-white font-bold break-words line-clamp-2 ${textSize}`}>{optText}</span>
                                                            </div>
                                                            <span className="flex items-baseline shrink-0 ml-1">
                                                                <span className="font-mono text-[11px] sm:text-xs font-black text-amber-300">
                                                                    {odds.counts[hIdx] ?? 0}票
                                                                </span>
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 着順確定画面（画面いっぱいフルスクリーン） */}
                                {displayStatus === 'result' && correctOrder && (
                                    <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 lg:p-8 text-center overflow-y-auto">
                                        <div className="shrink-0 space-y-1 sm:space-y-2">
                                            <div className="inline-flex items-center gap-2 px-3 sm:px-5 py-1 sm:py-1.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 font-black text-xs sm:text-sm tracking-wider shadow-lg">
                                                <span className="text-sm sm:text-base">🏁</span>
                                                <span>第{currentRaceIndex + 1}レース 確定</span>
                                                <span className="text-slate-500">|</span>
                                                <span>OFFICIAL RESULT</span>
                                            </div>
                                            <h1 className="text-xl sm:text-2xl lg:text-4xl font-black text-white tracking-wide drop-shadow">{currentRace.name}</h1>
                                            <p className="text-xs sm:text-sm lg:text-base text-amber-200/90 font-bold max-w-3xl mx-auto px-2">{currentRace.question}</p>
                                        </div>

                                        {/* 中央：1着・2着・3着のカード */}
                                        <div className="my-auto py-2 sm:py-4 w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
                                            {correctOrder.slice(0, 3).map((hIdx, rank) => {
                                                const h = HORSES_DATA[hIdx];
                                                const st = rank === 0
                                                    ? { bg: 'bg-gradient-to-b from-amber-500/25 via-slate-900/95 to-slate-950', border: 'border-2 border-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.3)]', badge: 'bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950', label: '🥇 1着 (WINNER)', accent: 'text-amber-300', scale: 'md:scale-105 z-10' }
                                                    : rank === 1
                                                        ? { bg: 'bg-gradient-to-b from-slate-300/15 via-slate-900/95 to-slate-950', border: 'border-2 border-slate-300/70', badge: 'bg-slate-200 text-slate-900', label: '🥈 2着', accent: 'text-slate-200', scale: '' }
                                                        : { bg: 'bg-gradient-to-b from-amber-700/20 via-slate-900/95 to-slate-950', border: 'border-2 border-amber-600/70', badge: 'bg-amber-700 text-amber-100', label: '🥉 3着', accent: 'text-amber-400', scale: '' };
                                                return (
                                                    <div key={rank} className={`${st.bg} ${st.border} ${st.scale} rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex flex-col justify-between items-center text-center relative overflow-hidden`}>
                                                        <div className={`px-3 sm:px-4 py-1 rounded-full text-xs sm:text-sm font-black mb-2 shadow ${st.badge}`}>{st.label}</div>
                                                        <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl lg:text-4xl shadow-xl my-2 border-2 border-white/20" style={chipStyle(h)}>
                                                            {h.letter}
                                                        </div>
                                                        <div className="my-1 sm:my-2 w-full">
                                                            <div className="text-base sm:text-lg lg:text-xl font-black text-white leading-snug break-words px-1">{currentRace.options[hIdx]}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* 下部：的中者速報 */}
                                        <div className="shrink-0 w-full max-w-5xl mx-auto bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 text-left shadow-lg">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs sm:text-sm font-black text-amber-300">
                                                    🎉 このレースの的中者（{hitList.length}名）
                                                </span>
                                                <span className="text-[11px] text-slate-400">役ごとの加算ポイントを付与しました</span>
                                            </div>
                                            {hitList.length === 0 ? (
                                                <div className="text-xs text-slate-500 py-1">的中者はいませんでした。次のレースで巻き返そう！</div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                                                    {hitList.map(({ p, r }) => (
                                                        <span key={p.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${RANK_STYLE[r.type].soft}`}>
                                                            <span>{RANK_STYLE[r.type].emoji}</span>
                                                            <span className="text-white">{p.name}</span>
                                                            <span className="font-mono">+{r.score}pt（{r.name}）</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* 総合表彰（元の表彰台スタイル・同率順位対応） */}
                                {displayStatus === 'grand_finale' && (
                                    <div className="absolute inset-0 z-50 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 lg:p-10 text-center overflow-y-auto">
                                        <div className="shrink-0 space-y-2">
                                            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-300 tracking-wider drop-shadow">
                                                結果発表
                                            </h1>
                                        </div>

                                        <div className="my-auto py-3 sm:py-6 w-full max-w-5xl mx-auto flex flex-col items-center">
                                            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 items-end">
                                                {([1, 0, 2] as const).map(slotIdx => {
                                                    const tier = rankTiers[slotIdx];
                                                    const rankNum = slotIdx === 0 ? 1 : slotIdx === 1 ? 2 : 3;
                                                    const is1st = rankNum === 1;
                                                    const is2nd = rankNum === 2;
                                                    const styles = is1st
                                                        ? { box: 'order-1 md:order-2 bg-gradient-to-b from-amber-500/25 via-slate-900 to-slate-950 border-amber-400 shadow-[0_0_45px_rgba(245,158,11,0.35)] md:min-h-[360px] md:-translate-y-4', badge: 'w-16 h-16 bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 text-2xl', pt: 'text-3xl sm:text-5xl text-amber-300' }
                                                        : is2nd
                                                            ? { box: 'order-2 md:order-1 bg-gradient-to-b from-slate-800/90 to-slate-950 border-slate-300/80 md:min-h-[300px]', badge: 'w-12 h-12 bg-slate-300 text-slate-900 text-xl', pt: 'text-2xl sm:text-3xl text-slate-200' }
                                                            : { box: 'order-3 bg-gradient-to-b from-amber-950/40 to-slate-950 border-amber-700/80 md:min-h-[280px]', badge: 'w-12 h-12 bg-amber-700 text-amber-100 text-xl', pt: 'text-2xl sm:text-3xl text-amber-400' };

                                                    const members = tier?.members ?? [];
                                                    return (
                                                        <div key={slotIdx} className={`${styles.box} border-2 rounded-2xl sm:rounded-3xl p-5 sm:p-6 flex flex-col items-center shadow-xl relative justify-between transform`}>
                                                            {is1st && <div className="absolute -top-7 inset-x-0 flex justify-center"><span className="text-4xl animate-bounce drop-shadow">👑</span></div>}
                                                            <div className={`${styles.badge} rounded-full flex items-center justify-center font-black shadow`}>
                                                                {rankNum}位
                                                            </div>
                                                            <div className="my-3 text-center w-full flex-1 flex flex-col items-center justify-center min-h-[90px]">
                                                                {members.length === 0 ? (
                                                                    <div className="text-2xl font-black text-slate-600">―</div>
                                                                ) : members.length === 1 ? (
                                                                    <div className={`${is1st ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-xl sm:text-2xl lg:text-3xl'} font-black text-white truncate px-2 max-w-full`}>
                                                                        {members[0].name}
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-full flex flex-wrap items-center justify-center gap-1.5 max-h-36 overflow-y-auto px-1 py-1">
                                                                        {members.map(m => (
                                                                            <span
                                                                                key={m.id}
                                                                                className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black shadow-sm border ${
                                                                                    is1st
                                                                                        ? 'bg-amber-400/20 border-amber-300 text-amber-200'
                                                                                        : is2nd
                                                                                        ? 'bg-slate-800 border-slate-400 text-slate-100'
                                                                                        : 'bg-amber-950/60 border-amber-600 text-amber-200'
                                                                                }`}
                                                                            >
                                                                                {m.name}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="bg-slate-900/90 border border-slate-700 px-6 py-2.5 rounded-2xl text-center w-full shadow-inner mt-2">
                                                                <span className={`${styles.pt} font-black font-mono`}>{tier ? tier.score : 0} pt</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {rankTiers.length > 3 && (
                                                <div className="w-full mt-6 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-left shadow-lg">
                                                    <div className="text-xs font-bold text-slate-400 mb-2 px-1">4位以下のランキング</div>
                                                    <div className="flex flex-wrap gap-2.5 max-h-36 overflow-y-auto">
                                                        {rankTiers.slice(3).flatMap(t => t.members).map((u) => (
                                                            <span key={u.id} className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-bold">
                                                                <span className="font-mono text-slate-400">{u.rank}位</span>
                                                                <span className="text-white">{u.name}</span>
                                                                <span className="font-mono text-amber-400">{u.score} pt</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="shrink-0 w-full max-w-md mx-auto">
                                            {role === 'multiview' && hostAuthed && (
                                                <button onClick={closeGrandFinale} disabled={hostBusy} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-sm border border-slate-700 shadow">
                                                    表彰を閉じる
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* -------------------------------------------------------- */}
                    {/* [パネル C] 幹事・管理画面                                */}
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

                            <div
                                className={`w-full bg-slate-900 rounded-2xl shadow-xl border border-slate-800 p-4 space-y-3 ${role === 'host' ? '' : 'overflow-y-auto'}`}
                                style={role === 'host' ? undefined : { height: 670 }}
                            >
                                {hostPanelLocked ? (
                                    <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/40 space-y-2.5">
                                        <div className="text-sm font-black text-white">幹事ログイン</div>
                                        <p className="text-[11px] text-slate-400">進行操作には幹事パスワード（アンケートビンゴの司会者と同じ）が必要です。</p>
                                        <input
                                            type="password"
                                            value={loginInput}
                                            onChange={(e) => setLoginInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') void hostLogin(); }}
                                            placeholder="パスワード"
                                            autoComplete="current-password"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white"
                                        />
                                        {loginError && <p role="alert" className="text-[11px] text-rose-300">{loginError}</p>}
                                        <button
                                            onClick={() => void hostLogin()}
                                            disabled={!loginInput || hostBusy}
                                            className="w-full py-2.5 rounded-xl font-black text-xs bg-amber-500 text-slate-950 disabled:bg-slate-800 disabled:text-slate-600"
                                        >
                                            ログイン
                                        </button>
                                    </div>
                                ) : (<>
                                    <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-center text-xs font-bold">
                                        <button onClick={() => setAdminSubTab('live')} className={`py-1.5 rounded-lg transition-all ${adminSubTab === 'live' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                                            当日進行
                                        </button>
                                        <button onClick={() => setAdminSubTab('edit')} className={`py-1.5 rounded-lg transition-all ${adminSubTab === 'edit' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                                            問題登録{draftDirty ? '（未保存）' : ''}
                                        </button>
                                    </div>

                                    {adminSubTab === 'live' && (
                                        <div className="space-y-3">
                                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-bold text-slate-300">現在のステータス</span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${gameStatus === 'idle' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : gameStatus === 'racing' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'}`}>
                                                        {gameStatus === 'idle' ? '投票受付中' : gameStatus === 'racing' ? '出走中' : gameStatus === 'result' ? '結果確定' : '総合表彰'}
                                                    </span>
                                                </div>

                                                {gameStatus === 'racing' && raceStartedAt !== null && raceDurationMs !== null && (
                                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-center">
                                                        <div className="text-[10px] text-amber-300">着順確定まで</div>
                                                        <div className="text-xl font-black text-amber-400 font-mono">
                                                            {Math.max(0, Math.ceil((raceStartedAt + raceDurationMs - serverNow()) / 1000))} 秒
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                                                    <span>投票数</span>
                                                    <span className="text-white font-mono font-bold">{participants.filter(p => p.betSlip).length} / {participants.length} 人</span>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                {gameStatus === 'idle' && (
                                                    <button
                                                        onClick={startRace}
                                                        disabled={hostBusy}
                                                        className="w-full py-3 rounded-xl font-black text-sm bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                                                    >
                                                        <Play className="w-4 h-4 fill-current" />
                                                        <span>第{currentRaceIndex + 1}レース 発走！</span>
                                                    </button>
                                                )}

                                                {gameStatus === 'result' && (
                                                    <button
                                                        onClick={nextRace}
                                                        disabled={hostBusy}
                                                        className="w-full py-3 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg flex items-center justify-center gap-2"
                                                    >
                                                        <span>{currentRaceIndex + 1 < races.length ? `第${currentRaceIndex + 2}レースの受付を開始` : '総合結果の表彰へ！'}</span>
                                                    </button>
                                                )}

                                                {gameStatus === 'grand_finale' && (
                                                    <button
                                                        onClick={closeGrandFinale}
                                                        disabled={hostBusy}
                                                        className="w-full py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                                                    >
                                                        表彰を閉じる
                                                    </button>
                                                )}
                                            </div>

                                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-bold text-slate-300">正解着順（幹事のみ表示）</span>
                                                    {gameStatus !== 'racing' && <span className="text-[10px] text-amber-400">変更可</span>}
                                                </div>
                                                <div className="grid grid-cols-3 gap-1.5 font-mono">
                                                    {[0, 1, 2].map(rank => {
                                                        const cur = correctOrder ? correctOrder[rank] : null;
                                                        return (
                                                            <div key={rank} className="bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-center">
                                                                <div className="text-[10px] text-slate-400">{rank + 1}着</div>
                                                                <select
                                                                    disabled={gameStatus === 'racing' || hostBusy}
                                                                    value={cur ?? ''}
                                                                    onChange={(e) => {
                                                                        const val = Number(e.target.value);
                                                                        const next: BetOrder = correctOrder ? [...correctOrder] : [0, 1, 2];
                                                                        next[rank] = val;
                                                                        void runHost('set_correct_order', { correctOrder: next });
                                                                    }}
                                                                    className="w-full bg-slate-950 border border-slate-700 rounded text-xs font-bold text-amber-300 p-1 mt-1"
                                                                >
                                                                    {HORSES_DATA.map((h, i) => (
                                                                        <option key={i} value={i}>
                                                                            {h.letter}: {currentRace.options[i]?.slice(0, 8) || h.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                                                <div className="text-xs font-bold text-slate-300">レース切り替え</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={prevRace}
                                                        disabled={currentRaceIndex <= 0 || hostBusy}
                                                        className="py-2 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 disabled:opacity-40"
                                                    >
                                                        ← 前のレース
                                                    </button>
                                                    <button
                                                        onClick={nextRace}
                                                        disabled={hostBusy}
                                                        className="py-2 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 disabled:opacity-40"
                                                    >
                                                        次のレース →
                                                    </button>
                                                </div>
                                                {gameStatus !== 'idle' && (
                                                    <button
                                                        onClick={resetCurrentRace}
                                                        disabled={hostBusy}
                                                        className="w-full py-1.5 rounded-lg text-[11px] font-bold text-amber-300 hover:text-amber-200 border border-amber-500/30"
                                                    >
                                                        第{currentRaceIndex + 1}レースを受付中に戻す
                                                    </button>
                                                )}
                                            </div>

                                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                                                <div className="text-xs font-bold text-slate-300">各画面のURL</div>
                                                <div className="space-y-1.5 text-xs">
                                                    <div className="flex items-center justify-between bg-slate-900 p-2 rounded-lg">
                                                        <span className="text-slate-400">参加者スマホ</span>
                                                        <button onClick={() => copyText(roleUrl('play'))} className="text-amber-400 font-bold hover:underline">
                                                            URLコピー
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center justify-between bg-slate-900 p-2 rounded-lg">
                                                        <span className="text-slate-400">会場スクリーン</span>
                                                        <button onClick={() => copyText(roleUrl('screen'))} className="text-amber-400 font-bold hover:underline">
                                                            URLコピー
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-2">
                                                <button
                                                    onClick={resetAllGame}
                                                    disabled={hostBusy}
                                                    className="w-full py-2 rounded-xl text-[11px] font-bold text-rose-300 hover:text-rose-200 border border-rose-800/60 bg-rose-950/30"
                                                >
                                                    テストデータを全リセット
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {adminSubTab === 'edit' && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                                                {(draftRaces ?? races).map((_, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => setEditRaceIndex(i)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-black shrink-0 ${editRaceIndex === i ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
                                                    >
                                                        第{i + 1}R
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={addDraftRace}
                                                    className="px-2.5 py-1.5 rounded-lg text-xs font-black bg-slate-800 border border-slate-700 text-amber-400 hover:text-white shrink-0"
                                                >
                                                    + 追加
                                                </button>
                                            </div>

                                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-slate-300">第{editRaceIndex + 1}レースの設定</span>
                                                    {(draftRaces ?? races).length > 1 && (
                                                        <button onClick={deleteDraftRace} className="text-[11px] text-rose-400 hover:underline">
                                                            このレースを削除
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-slate-400">レース名</label>
                                                    <input
                                                        type="text"
                                                        value={activeEditRace.name}
                                                        onChange={(e) => updateDraftRace({ name: e.target.value })}
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-slate-400">問題文（お題）</label>
                                                    <textarea
                                                        rows={2}
                                                        value={activeEditRace.question}
                                                        onChange={(e) => updateDraftRace({ question: e.target.value })}
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                                                    />
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] text-slate-400">選択肢（出走馬 A〜H）</label>
                                                    {HORSES_DATA.map((h, i) => (
                                                        <div key={i} className="flex items-center gap-2">
                                                            <span className="w-5 h-5 rounded text-xs font-black flex items-center justify-center font-mono shrink-0 shadow" style={chipStyle(h)}>
                                                                {h.letter}
                                                            </span>
                                                            <input
                                                                type="text"
                                                                value={activeEditRace.options[i] ?? ''}
                                                                onChange={(e) => {
                                                                    const next = [...activeEditRace.options];
                                                                    next[i] = e.target.value;
                                                                    updateDraftRace({ options: next });
                                                                }}
                                                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {draftDirty && (
                                                <div className="grid grid-cols-2 gap-2 pt-1 sticky bottom-0 bg-slate-900/90 backdrop-blur p-2 rounded-xl border border-amber-500/30">
                                                    <button
                                                        onClick={discardDraft}
                                                        className="py-2 rounded-lg text-xs font-bold bg-slate-800 text-slate-300"
                                                    >
                                                        変更を破棄
                                                    </button>
                                                    <button
                                                        onClick={() => void saveRaces()}
                                                        disabled={hostBusy}
                                                        className="py-2 rounded-lg text-xs font-black bg-amber-500 text-slate-950 shadow"
                                                    >
                                                        編集内容を保存
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>)}
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {toastMessage && (
                <div role="status" className="fixed bottom-4 right-4 z-[90] bg-slate-900/95 border border-amber-400/60 text-amber-200 text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xl animate-fade-in flex items-center gap-2">
                    <span>✨</span>
                    <span>{toastMessage}</span>
                </div>
            )}

            {confirmDialog.isOpen && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
                        <div className="flex items-center gap-2">
                            {confirmDialog.danger ? <AlertTriangle className="w-5 h-5 text-rose-400" /> : <span className="text-xl">🏇</span>}
                            <h4 className="text-sm font-black text-white">{confirmDialog.title}</h4>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{confirmDialog.message}</p>
                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <button
                                onClick={closeConfirm}
                                className="py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={() => { confirmDialog.onConfirm?.(); }}
                                className={`py-2.5 rounded-xl text-xs font-black ${confirmDialog.danger ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-slate-950'}`}
                            >
                                {confirmDialog.confirmLabel || 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
