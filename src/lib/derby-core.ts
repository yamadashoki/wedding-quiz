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

/**
 * レースごとの演出パターン（8種類）
 * 0 大外一気 / 1 イン強襲 / 2 一騎打ち / 3 逃げ粘り
 * 4 最後方からの一気差し / 5 内外の叩き合い / 6 4頭横一線の写真判定 / 7 直線入口で先頭交代
 * レース番号と正解着順から決まる（サーバー・全画面で同じ結果になる）。順番に並ぶのではなく、毎回違う顔ぶれになる
 */
export const SCENARIO_COUNT = 8;
export const scenarioOf = (raceIndex: number, order?: readonly number[]): number => {
  const r = Math.abs(raceIndex || 0);
  const o = order && order.length >= 3 ? order : [0, 1, 2];
  let h = Math.imul(r + 1, 2654435761) ^ Math.imul(o[0] + 1, 40503) ^ Math.imul(o[1] + 11, 9973) ^ Math.imul(o[2] + 31, 1299709);
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
  return (h >>> 0) % SCENARIO_COUNT;
};

/** 実況テロップ（パターン別：直線入口／残り200m） */
export const SCENARIO_COMMENTARY: { mid: string; late: string }[] = [
  { mid: "第4コーナー！後方から大外へ持ち出した！", late: "残り200m！大外一気！豪快な末脚が炸裂したー！！" },
  { mid: "第4コーナー！インコース内ラチ沿いに潜り込む！", late: "残り200m！内から一閃！最短コースを電光石火で突き抜ける！" },
  { mid: "2頭が抜け出した！壮絶な一騎打ちの様相！", late: "残り200m！叩き合い！並んだ！ハナ差の壮絶なデッドヒート！！" },
  { mid: "直線コースへ！先頭集団が意地と意地のぶつかり合い！", late: "残り200m！必死の二枚腰！逃げ切れるか！迫る追撃！！" },
  { mid: "最後方に控えていた馬が、ここから動いた！", late: "残り200m！最後方から猛追！前の馬群をまとめて飲み込む勢い！！" },
  { mid: "内と外、2頭が馬体を離して並んで来た！", late: "残り200m！内か外か！ぴったり並んで一歩も譲らない！！" },
  { mid: "4頭が横一線！どの馬が抜け出すのか！", late: "残り200m！4頭が横一線！これは写真判定になるかー！？" },
  { mid: "先頭は競り合いのまま直線へ！外から並びかけた！", late: "残り200m！先頭が入れ替わった！内の馬が差し返せるか！？" }
];

/** 1ステップ進める（order = 幹事が指定した正解着順） */
export function stepSim(s: SimState, order: BetOrder, raceIndex: number) {
  const dt = SIM_STEP;
  const simTime = s.t;
  const scenario = scenarioOf(raceIndex, order);
  const [winnerIdx, secondIdx, thirdIdx] = order;
  // 入着しない馬のうち1頭を「食らいつく4番手」にする（写真判定パターン用。着順の組み合わせで決まる）
  const others = Array.from({ length: OPTION_COUNT }, (_, i) => i).filter(i => !order.includes(i));
  const fourthIdx = others[(winnerIdx + secondIdx * 2 + thirdIdx * 3) % others.length];

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
      else if (scenario === 4 && idx === winnerIdx) h.speed = Math.max(0.9, 0.97 + jitter * 0.4); // 後方で脚をためる
      else if (scenario === 7 && idx === secondIdx) h.speed = 1.17 + jitter * 0.5; // 先頭に立つ2着馬
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
      } else if (scenario === 3) {
        if (idx === winnerIdx) h.speed = 1.16 + Math.sin(simTime * 2.0) * 0.05;
        else if (idx === secondIdx || idx === thirdIdx) h.speed = 1.18 + jitter;
        else h.speed = base;
      } else if (scenario === 4) {
        // 最後方待機：1着馬だけ外を回らず後ろに控える
        if (idx === winnerIdx) { h.targetLaneX = 2.0; h.speed = 1.00 + Math.sin(simTime * 2.2) * 0.02; }
        else if (idx === secondIdx || idx === thirdIdx) h.speed = 1.14 + jitter * 0.6;
        else h.speed = base;
      } else if (scenario === 5) {
        // 内と外に分かれて前を窺う
        if (idx === winnerIdx) { h.targetLaneX = -10.0; h.speed = 1.17 + Math.sin(simTime * 2.6) * 0.03; }
        else if (idx === secondIdx) { h.targetLaneX = 10.0; h.speed = 1.17 - Math.sin(simTime * 2.6) * 0.03; }
        else h.speed = base;
      } else if (scenario === 6) {
        // 上位3頭＋食らいつく1頭が並走
        if (idx === winnerIdx || idx === secondIdx || idx === thirdIdx || idx === fourthIdx) h.speed = 1.17 + Math.sin(simTime * 2.4 + idx) * 0.03;
        else h.speed = base;
      } else {
        // 7：2着馬が先頭、1着馬は外から追走
        if (idx === secondIdx) { h.targetLaneX = -6.0; h.speed = 1.17; }
        else if (idx === winnerIdx) { h.targetLaneX = 8.0; h.speed = 1.13; }
        else if (idx === thirdIdx) h.speed = 1.14 + jitter * 0.5;
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
      } else if (scenario === 3) {
        if (idx === winnerIdx) { h.targetLaneX = 0; h.speed = 1.38; }
        else if (idx === secondIdx) { h.targetLaneX = -4.5; h.speed = 1.36; }
        else if (idx === thirdIdx) { h.targetLaneX = 4.5; h.speed = 1.33; }
        else h.speed = 0.93 + Math.sin(idx + simTime) * 0.04;
      } else if (scenario === 4) {
        if (idx === winnerIdx) { h.targetLaneX = 6.0; h.speed = 1.82; }
        else if (idx === secondIdx) { h.targetLaneX = -5.0; h.speed = 1.30; }
        else if (idx === thirdIdx) { h.targetLaneX = 2.0; h.speed = 1.22; }
        else h.speed = tail;
      } else if (scenario === 5) {
        if (idx === winnerIdx) { h.targetLaneX = -9.0; h.speed = 1.46 + Math.sin(simTime * 5.0) * 0.05 + (remain < 30 ? 0.10 : 0); }
        else if (idx === secondIdx) { h.targetLaneX = 9.0; h.speed = 1.46 - Math.sin(simTime * 5.0) * 0.05; }
        else if (idx === thirdIdx) { h.targetLaneX = 0.0; h.speed = 1.24; }
        else h.speed = tail;
      } else if (scenario === 6) {
        // 4頭が横一線（食らいつく4番手は、ゴール前で着順補正により半馬身遅れる）
        const lanes = [-6.5, -2.2, 2.2, 6.5];
        const slot = (winnerIdx + secondIdx) % 2 === 0 ? [1, 2, 0, 3] : [2, 1, 3, 0]; // 組み合わせで並び方が変わる
        if (idx === winnerIdx) { h.targetLaneX = lanes[slot[0]]; h.speed = 1.42 + (remain < 40 ? 0.10 : 0); }
        else if (idx === secondIdx) { h.targetLaneX = lanes[slot[1]]; h.speed = 1.42; }
        else if (idx === thirdIdx) { h.targetLaneX = lanes[slot[2]]; h.speed = 1.40; }
        else if (idx === fourthIdx) { h.targetLaneX = lanes[slot[3]]; h.speed = 1.41; }
        else h.speed = tail;
      } else {
        // 7：直線入口で、外から来た1着馬が先頭を奪う
        if (idx === winnerIdx) { h.targetLaneX = 1.0; h.speed = 1.62; }
        else if (idx === secondIdx) { h.targetLaneX = -7.0; h.speed = 1.38; }
        else if (idx === thirdIdx) { h.targetLaneX = -2.5; h.speed = 1.26; }
        else h.speed = tail;
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
  const key = `${order.join(',')}|${scenarioOf(raceIndex, order)}|${raceIndex}`;
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
