// ==============================================================
// 3連単アンケートゲーム：サーバー（API）と画面で共通に使う純粋ロジック
//   ・得点計算（5段階）
//   ・レース展開シミュレーション（発走からの経過時間だけで決まる＝どの端末でも同じ映像・同じゴール時刻）
//   ・単勝オッズ計算
// three.js や React に依存しないので、API ルートからも import できる。
// ==============================================================

export type BetOrder = number[]; // [1着の選択肢Idx, 2着, 3着]（0=A … 7=H）

export const OPTION_COUNT = 8;

// --------------------------------------------------------------
// 得点計算（条件が重なった場合は最も高い1つだけを付与。加算はしない）
//   6点 サンレンタン：1〜3位の「選択肢」と「順位」がぴったり当たった
//   4点 サンレンプク：1〜3位の「選択肢」が当たった（順位は不問）
//   3点 ニレンタン　：1位と2位の「選択肢」と「順位」がぴったり当たった
//   2点 ブクブク　　：1〜3位のうち「選択肢」が2つだけ当たった（順位は不問）
//   1点 タン　　　　：1位の「選択肢」と「順位」だけが当たった
// --------------------------------------------------------------
export type BetRankType = 'sanrentan' | 'sanrenpuku' | 'nirentan' | 'bukubuku' | 'tan' | 'none';

export const SCORE_RULES = [
  { type: 'sanrentan', pt: 6, name: 'サンレンタン', desc: '1〜3位の「選択肢」と「順位」がぴったり当たった' },
  { type: 'sanrenpuku', pt: 4, name: 'サンレンプク', desc: '1〜3位の「選択肢」が当たった' },
  { type: 'nirentan', pt: 3, name: 'ニレンタン', desc: '1位と2位の「選択肢」と「順位」がぴったり当たった' },
  { type: 'bukubuku', pt: 2, name: 'ブクブク', desc: '1〜3位のうち「選択肢」が2つだけ当たった' },
  { type: 'tan', pt: 1, name: 'タン', desc: '1位の「選択肢」と「順位」だけが当たった' }
] as const;

export interface BetResult {
  score: number;
  type: BetRankType;
  name: string; // 役名（不的中は空）
}

export function judgeBet(bet: BetOrder | null | undefined, correct: BetOrder | null | undefined): BetResult {
  if (!bet || bet.length < 3 || !correct || correct.length < 3) return { score: 0, type: 'none', name: '' };
  const b = bet.slice(0, 3);
  const c = correct.slice(0, 3);
  const rule = (type: BetRankType): BetResult => {
    const r = SCORE_RULES.find(x => x.type === type)!;
    return { score: r.pt, type, name: r.name };
  };
  if (b[0] === c[0] && b[1] === c[1] && b[2] === c[2]) return rule('sanrentan');
  const hits = b.filter(x => c.includes(x)).length; // 正解の1〜3位に入っている数
  if (hits === 3) return rule('sanrenpuku');
  if (b[0] === c[0] && b[1] === c[1]) return rule('nirentan');
  if (hits === 2) return rule('bukubuku');
  if (b[0] === c[0]) return rule('tan');
  return { score: 0, type: 'none', name: '' };
}

export function calculateBetScore(bet: BetOrder | null | undefined, correct: BetOrder | null | undefined): number {
  return judgeBet(bet, correct).score;
}

/** 3つとも 0〜7 の重複なし整数か */
export function isValidOrder(o: unknown): o is BetOrder {
  return Array.isArray(o) && o.length === 3
    && o.every(v => Number.isInteger(v) && v >= 0 && v < OPTION_COUNT)
    && new Set(o).size === 3;
}

// --------------------------------------------------------------
// 単勝オッズ（参加者の「1着予想」の票数から算出。払戻率80%のパリミュチュエル方式）
// オッズ = 総票数 ÷ その選択肢の票数 × 0.8（最低1.1倍、小数1桁切り捨て）。票がない選択肢は null（「---」表示）
// --------------------------------------------------------------
export function computeWinOdds(slips: (BetOrder | null | undefined)[]) {
  const counts = Array.from({ length: OPTION_COUNT }, () => 0); // 1着予想の票数
  const anyCounts = Array.from({ length: OPTION_COUNT }, () => 0); // 1〜3着どこかに入れた票数
  let total = 0;
  slips.forEach(s => {
    if (!s || s.length < 3) return;
    const first = s[0];
    if (first >= 0 && first < OPTION_COUNT) { counts[first]++; total++; }
    s.slice(0, 3).forEach(v => { if (v >= 0 && v < OPTION_COUNT) anyCounts[v]++; });
  });
  const odds = counts.map(c => (c > 0 ? Math.max(1.1, Math.floor((total / c) * 0.8 * 10) / 10) : null));
  const popularity = counts.map(c => (c > 0 ? counts.filter(x => x > c).length + 1 : null)); // 人気順位
  return { counts, anyCounts, total, odds, popularity };
}

export const formatOdds = (o: number | null) => (o === null ? '---' : o.toFixed(1));

// --------------------------------------------------------------
// レース展開シミュレーション
//   ・発走時刻（サーバー時刻）からの経過秒だけで状態が決まる決定的な計算
//   ・1/60秒の固定ステップ。途中から開いたスクリーンも早送りして同じ位置から映る
//   ・ゴール時刻（＝着順確定の時刻）もこの計算で決まり、サーバーと画面で一致する
// --------------------------------------------------------------
export const RACE_START_Z = 0;
export const FINISH_Z = -1000;
export const RACE_DISTANCE = RACE_START_Z - FINISH_Z; // 1000m
export const SIM_STEP = 1 / 60;
export const HORSE_SPACING = 5.8;
const FINISH_COOLDOWN = 2.5; // 先頭がゴールしてから確定までの余韻（秒）
const MAX_RACE_SEC = 120;

export interface SimHorse {
  baseLaneX: number;
  laneX: number;
  targetLaneX: number;
  z: number;
  speed: number;
  finished: boolean;
}

export interface SimState {
  t: number;              // 発走からの経過秒
  horses: SimHorse[];
  leaderFinishT: number | null;
  done: boolean;          // 着順確定タイミングに達した
}

export const startZOf = (i: number) => RACE_START_Z - ((i % 2) * 2.0) - (i * 0.4);
export const laneXOf = (i: number) => -((OPTION_COUNT - 1) * HORSE_SPACING) / 2 + i * HORSE_SPACING;

export function createSimState(): SimState {
  return {
    t: 0,
    leaderFinishT: null,
    done: false,
    horses: Array.from({ length: OPTION_COUNT }, (_, i) => ({
      baseLaneX: laneXOf(i), laneX: laneXOf(i), targetLaneX: laneXOf(i), z: startZOf(i), speed: 1.0, finished: false
    }))
  };
}

/** レースごとの演出パターン（大外一気／イン強襲／一騎打ち／逃げ粘り） */
export const scenarioOf = (raceIndex: number) => Math.abs(raceIndex || 0) % 4;

/** 1ステップ進める（order = 幹事が指定した正解着順） */
export function stepSim(s: SimState, order: BetOrder, raceIndex: number) {
  const dt = SIM_STEP;
  const simTime = s.t;
  const scenario = scenarioOf(raceIndex);
  const [winnerIdx, secondIdx, thirdIdx] = order;

  s.horses.forEach((h, idx) => {
    if (h.finished) return;
    const remain = h.z - FINISH_Z;

    // 各馬固有のペースの波（道中の抜きつ抜かれつ）
    const wave1 = Math.sin(simTime * 2.3 + idx * 1.85 + scenario * 0.7);
    const wave2 = Math.cos(simTime * 1.45 + idx * 2.9);
    const jitter = (wave1 * 0.16) + (wave2 * 0.08);

    if (remain > 650) {
      // 序盤：全馬が激しく競り合い
      const base = 1.05 + jitter;
      if (scenario === 3 && idx === winnerIdx) h.speed = 1.18 + jitter; // 逃げパターン
      else h.speed = Math.max(0.88, Math.min(1.25, base));
    } else if (remain > 280) {
      // 中盤：馬群が凝縮
      const base = 1.08 + jitter;
      if (scenario === 0) {
        if (idx === winnerIdx) { h.targetLaneX = 14.0; h.speed = 1.20; }
        else if (idx === secondIdx) h.speed = 1.15 + jitter;
        else h.speed = base;
      } else if (scenario === 1) {
        if (idx === winnerIdx) { h.targetLaneX = -18.0; h.speed = 1.18; }
        else if (idx === secondIdx) h.speed = 1.16 + jitter;
        else h.speed = base;
      } else if (scenario === 2) {
        if (idx === winnerIdx) { h.targetLaneX = 3.5; h.speed = 1.22 + Math.sin(simTime * 3.0) * 0.06; }
        else if (idx === secondIdx) { h.targetLaneX = -3.5; h.speed = 1.22 - Math.sin(simTime * 3.0) * 0.06; }
        else h.speed = base;
      } else {
        if (idx === winnerIdx) h.speed = 1.16 + Math.sin(simTime * 2.0) * 0.05;
        else if (idx === secondIdx || idx === thirdIdx) h.speed = 1.18 + jitter;
        else h.speed = base;
      }
    } else {
      // 最終直線：幹事指定の着順へドラマチックに収束
      const tail = 0.94 + Math.sin(idx + simTime) * 0.04;
      if (scenario === 0) {
        if (idx === winnerIdx) { h.targetLaneX = 14.0; h.speed = 1.62; }
        else if (idx === secondIdx) { h.targetLaneX = -4.0; h.speed = 1.30; }
        else if (idx === thirdIdx) { h.targetLaneX = 4.0; h.speed = 1.20; }
        else h.speed = tail;
      } else if (scenario === 1) {
        if (idx === winnerIdx) { h.targetLaneX = -18.0; h.speed = 1.60; }
        else if (idx === secondIdx) { h.targetLaneX = 6.0; h.speed = 1.32; }
        else if (idx === thirdIdx) { h.targetLaneX = -2.0; h.speed = 1.22; }
        else h.speed = tail;
      } else if (scenario === 2) {
        if (idx === winnerIdx) { h.targetLaneX = 3.5; h.speed = 1.46 + Math.sin(simTime * 4.5) * 0.06 + (remain < 35 ? 0.12 : 0); }
        else if (idx === secondIdx) { h.targetLaneX = -3.5; h.speed = 1.46 - Math.sin(simTime * 4.5) * 0.06; }
        else if (idx === thirdIdx) { h.targetLaneX = 9.0; h.speed = 1.25; }
        else h.speed = 0.92 + Math.sin(idx + simTime) * 0.04;
      } else {
        if (idx === winnerIdx) { h.targetLaneX = 0; h.speed = 1.38; }
        else if (idx === secondIdx) { h.targetLaneX = -4.5; h.speed = 1.36; }
        else if (idx === thirdIdx) { h.targetLaneX = 4.5; h.speed = 1.33; }
        else h.speed = 0.93 + Math.sin(idx + simTime) * 0.04;
      }
    }

  });

  // ゴール前220mは「指定着順どおりに入線する」ことを保証する。
  // 下位の馬が上位の馬に並びかけたら、わずかに失速させて「ハナ差」で決着させる
  // （一騎打ちパターンで2着馬が先着してしまう不具合の対策）
  const rankOfIdx = (i: number) => (i === winnerIdx ? 0 : i === secondIdx ? 1 : i === thirdIdx ? 2 : 3);
  const byRank = [winnerIdx, secondIdx, thirdIdx];
  s.horses.forEach((h, idx) => {
    if (h.finished) return;
    const r = rankOfIdx(idx);
    if (r === 0 || h.z - FINISH_Z > 220) return;
    const ref = s.horses[byRank[Math.min(r, 3) - 1]];
    const gap = r === 1 ? 0.6 : 1.2; // 1着と2着は鼻差、それ以下は少し離す
    const lead = ref.z + gap - h.z;  // 正の値＝前に出すぎている距離
    if (!ref.finished && lead >= 0) h.speed = Math.min(h.speed, ref.speed * (0.96 - Math.min(0.3, lead * 0.03)));
  });

  s.horses.forEach(h => {
    if (h.finished) return;
    h.laneX += (h.targetLaneX - h.laneX) * Math.min(1, dt * 3.5);
    h.z -= h.speed * 34 * dt; // 34 m/s
    if (h.z <= FINISH_Z) { h.z = FINISH_Z; h.finished = true; }
  });

  s.t += dt;
  if (s.leaderFinishT === null && s.horses.some(h => h.finished)) s.leaderFinishT = s.t;
  if (!s.done && s.leaderFinishT !== null && (s.t >= s.leaderFinishT + FINISH_COOLDOWN || s.horses.every(h => h.finished))) {
    s.done = true;
  }
  if (s.t >= MAX_RACE_SEC) s.done = true;
}

/** 指定時刻（発走からの秒）まで進める。戻る場合は作り直す */
export function advanceSimTo(s: SimState, targetT: number, order: BetOrder, raceIndex: number): SimState {
  let st = s;
  if (targetT + 1e-9 < st.t) st = createSimState();
  let guard = 0;
  while (st.t + SIM_STEP <= targetT + 1e-9 && guard < MAX_RACE_SEC * 60 + 10) {
    stepSim(st, order, raceIndex);
    guard++;
  }
  return st;
}

const durationCache = new Map<string, number>();
/** 発走から着順確定までのミリ秒（サーバーと画面で同じ値になる） */
export function computeRaceDurationMs(order: BetOrder, raceIndex: number): number {
  const key = `${order.join(',')}|${scenarioOf(raceIndex)}|${raceIndex}`;
  const cached = durationCache.get(key);
  if (cached !== undefined) return cached;
  const s = createSimState();
  let guard = 0;
  while (!s.done && guard < MAX_RACE_SEC * 60 + 10) { stepSim(s, order, raceIndex); guard++; }
  const ms = Math.round(s.t * 1000);
  durationCache.set(key, ms);
  return ms;
}

/** 位置から現在の順位（先頭から並べた馬Idx） */
export function ranksOf(s: SimState): number[] {
  return s.horses.map((h, i) => ({ i, z: h.z })).sort((a, b) => a.z - b.z).map(x => x.i);
}
