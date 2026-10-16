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
//   2点 プクプク　　：1〜3位のうち「選択肢」が2つだけ当たった（順位は不問）
//   1点 タン　　　　：1位の「選択肢」と「順位」だけが当たった
// --------------------------------------------------------------
export type BetRankType = 'sanrentan' | 'sanrenpuku' | 'nirentan' | 'bukubuku' | 'tan' | 'none';

export const SCORE_RULES = [
  { type: 'sanrentan', pt: 6, name: 'サンレンタン', desc: '1〜3位の「選択肢」と「順位」がぴったり当たった' },
  { type: 'sanrenpuku', pt: 4, name: 'サンレンプク', desc: '1〜3位の「選択肢」が当たった' },
  { type: 'nirentan', pt: 3, name: 'ニレンタン', desc: '1位と2位の「選択肢」と「順位」がぴったり当たった' },
  { type: 'bukubuku', pt: 2, name: 'プクプク', desc: '1〜3位のうち「選択肢」が2つだけ当たった' },
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
const ALL_FINISH_COOLDOWN = 2.2; // 全馬がゴールラインを通過してからの余韻（秒）
const MAX_RACE_SEC = 120;

export interface SimHorse {
  baseLaneX: number;
  laneX: number;
  targetLaneX: number;
  z: number;
  speed: number;
  finished: boolean;
  finishRank: number | null; // ゴールした確定着順（1〜8）
}

export interface SimState {
  t: number;              // 発走からの経過秒
  horses: SimHorse[];
  leaderFinishT: number | null;
  allFinishT: number | null;
  finishCount: number;    // ゴールした頭数カウント
  done: boolean;          // 着順確定タイミングに達した
}

export const startZOf = (i: number) => RACE_START_Z - ((i % 2) * 2.0) - (i * 0.4);
export const laneXOf = (i: number) => -((OPTION_COUNT - 1) * HORSE_SPACING) / 2 + i * HORSE_SPACING;

export function createSimState(): SimState {
  return {
    t: 0,
    leaderFinishT: null,
    allFinishT: null,
    finishCount: 0,
    done: false,
    horses: Array.from({ length: OPTION_COUNT }, (_, i) => ({
      baseLaneX: laneXOf(i), laneX: laneXOf(i), targetLaneX: laneXOf(i), z: startZOf(i), speed: 1.0, finished: false, finishRank: null
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
export const scenarioOf = (raceIndex: number, _order?: readonly number[]): number => {
  const r = Math.abs(raceIndex || 0);
  return r % SCENARIO_COUNT;
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

  // 全馬のZ座標からソートして現在の順位（0位〜7位）を算出
  const currentRanks = s.horses
    .map((h, i) => ({ i, z: h.z }))
    .sort((a, b) => a.z - b.z); // zが小さいほど前（先頭）

  const leaderIdx = currentRanks[0].i;
  const leaderZ = currentRanks[0].z;
  const secondZ = currentRanks[1]?.z ?? leaderZ;
  const leadGap = secondZ - leaderZ; // 1位と2位の差（m）

  // --- 【残り100mまで】：3馬身（約7.5m）のリードをつけて激しく抜いたり抜かれたり ---
  const cycleTime = 3.2; // 周期約3.2秒ごとにチャレンジャー馬が交代
  const phase = Math.floor(simTime / cycleTime);

  // 先頭を奪いにいくチャレンジャー馬の順序（レース・シナリオに応じてバラバラ）
  const challengerOrder = [
    (raceIndex + 2) % OPTION_COUNT,
    secondIdx,
    (raceIndex * 3 + 5) % OPTION_COUNT,
    fourthIdx,
    (raceIndex * 2 + 1) % OPTION_COUNT,
    (scenario === 3 ? winnerIdx : (raceIndex + 4) % OPTION_COUNT),
    (scenario === 4 ? others[0] : (raceIndex * 5 + 3) % OPTION_COUNT),
    winnerIdx
  ];
  const challengerIdx = challengerOrder[phase % challengerOrder.length];

  s.horses.forEach((h, idx) => {
    if (h.finished) return;
    const remain = h.z - FINISH_Z;

    if (remain > 100) {
      let spd = 1.15;
      spd += Math.sin(simTime * 1.8 + idx * 1.5) * 0.04;

      if (idx === leaderIdx) {
        // 先頭馬：3馬身（7.5m）未満ならリードを広げ、3馬身開いたら息を入れて後続の追撃を待つ
        if (leadGap < 7.5) {
          spd += 0.18 * (1.0 - leadGap / 7.5);
        } else {
          spd -= 0.12;
        }
      } else if (idx === challengerIdx) {
        // 追撃馬：一気に加速して先頭を捉えにいく
        const distToLeader = h.z - leaderZ;
        spd += 0.22 + Math.min(0.20, distToLeader * 0.04);
      } else {
        // その他の馬：中団で抜きつ抜かれつ
        const wave = Math.sin(simTime * 1.2 + idx * 2.3);
        spd += wave * 0.08;
      }

      // シナリオに応じたコース取りと見せ場
      if (scenario === 0) {
        if (remain < 500 && idx === winnerIdx) h.targetLaneX = 14.0; // 外ラチ側へ
      } else if (scenario === 1) {
        if (remain < 500 && idx === winnerIdx) h.targetLaneX = -18.0; // 内ラチ沿いへ
      } else if (scenario === 2) {
        if (remain < 400) {
          if (idx === winnerIdx) h.targetLaneX = 3.5;
          if (idx === secondIdx) h.targetLaneX = -3.5;
        }
      } else if (scenario === 3) {
        // 逃げ粘り：序盤1着馬が3馬身逃げやすい
        if (remain > 650 && idx === winnerIdx) spd += 0.12;
      } else if (scenario === 4) {
        // 最後方一気：残り320mまで後方（3〜4馬身後ろ）で待機し、第4コーナー手前から外を回って捲る
        if (remain > 320 && idx === winnerIdx) {
          spd = Math.min(spd, 1.02);
        } else if (remain <= 320 && idx === winnerIdx) {
          h.targetLaneX = 6.0;
          spd += 0.32;
        }
      } else if (scenario === 5) {
        if (remain < 450) {
          if (idx === winnerIdx) h.targetLaneX = -10.0;
          if (idx === secondIdx) h.targetLaneX = 10.0;
        }
      } else if (scenario === 6) {
        if (remain < 350) {
          const lanes = [-6.5, -2.2, 2.2, 6.5];
          const slot = (winnerIdx + secondIdx) % 2 === 0 ? [1, 2, 0, 3] : [2, 1, 3, 0];
          if (idx === winnerIdx) h.targetLaneX = lanes[slot[0]];
          else if (idx === secondIdx) h.targetLaneX = lanes[slot[1]];
          else if (idx === thirdIdx) h.targetLaneX = lanes[slot[2]];
          else if (idx === fourthIdx) h.targetLaneX = lanes[slot[3]];
        }
      } else if (scenario === 7) {
        if (remain > 300 && idx === secondIdx) spd += 0.12;
        if (remain < 450 && idx === winnerIdx) h.targetLaneX = 8.0;
      }

      // 残り160m〜100m：上位3頭が先頭から射程圏内（2〜2.5馬身以内）に収まるようアシスト
      if (remain <= 160) {
        const gapToLead = h.z - leaderZ;
        if (idx === winnerIdx && gapToLead > 4.5) spd += 0.25;
        if (idx === secondIdx && gapToLead > 5.5) spd += 0.20;
        if (idx === thirdIdx && gapToLead > 6.5) spd += 0.18;
      }

      h.speed = Math.max(0.85, Math.min(1.58, spd));
    } else {
      // --- 【残り100m以降】：幹事指定の着順へドラマチックに収束 ---
      const tail = 1.08 + Math.sin(idx * 2 + simTime) * 0.04;

      if (scenario === 0) {
        // 大外一気炸裂
        if (idx === winnerIdx) { h.targetLaneX = 14.0; h.speed = 1.88; }
        else if (idx === secondIdx) { h.targetLaneX = -3.0; h.speed = 1.48; }
        else if (idx === thirdIdx) { h.targetLaneX = 3.0; h.speed = 1.36; }
        else h.speed = tail;
      } else if (scenario === 1) {
        // イン強襲炸裂
        if (idx === winnerIdx) { h.targetLaneX = -18.0; h.speed = 1.85; }
        else if (idx === secondIdx) { h.targetLaneX = 5.0; h.speed = 1.48; }
        else if (idx === thirdIdx) { h.targetLaneX = -1.0; h.speed = 1.36; }
        else h.speed = tail;
      } else if (scenario === 2) {
        // 壮絶な一騎打ち
        if (idx === winnerIdx) { h.targetLaneX = 3.5; h.speed = 1.62 + Math.sin(simTime * 6.0) * 0.05 + (remain < 30 ? 0.08 : 0); }
        else if (idx === secondIdx) { h.targetLaneX = -3.5; h.speed = 1.62 - Math.sin(simTime * 6.0) * 0.05; }
        else if (idx === thirdIdx) { h.targetLaneX = 8.0; h.speed = 1.38; }
        else h.speed = tail;
      } else if (scenario === 3) {
        // 必死の二枚腰
        if (idx === winnerIdx) { h.targetLaneX = 0; h.speed = 1.60; }
        else if (idx === secondIdx) { h.targetLaneX = -4.0; h.speed = 1.54; }
        else if (idx === thirdIdx) { h.targetLaneX = 4.0; h.speed = 1.42; }
        else h.speed = tail;
      } else if (scenario === 4) {
        // 最後方からのごぼう抜き炸裂
        if (idx === winnerIdx) { h.targetLaneX = 5.0; h.speed = 2.05; }
        else if (idx === secondIdx) { h.targetLaneX = -4.0; h.speed = 1.48; }
        else if (idx === thirdIdx) { h.targetLaneX = 2.0; h.speed = 1.36; }
        else h.speed = tail;
      } else if (scenario === 5) {
        // 内外の叩き合い
        if (idx === winnerIdx) { h.targetLaneX = -9.0; h.speed = 1.62 + Math.sin(simTime * 6.0) * 0.05 + (remain < 30 ? 0.08 : 0); }
        else if (idx === secondIdx) { h.targetLaneX = 9.0; h.speed = 1.62 - Math.sin(simTime * 6.0) * 0.05; }
        else if (idx === thirdIdx) { h.targetLaneX = 0.0; h.speed = 1.38; }
        else h.speed = tail;
      } else if (scenario === 6) {
        // 4頭横一線デッドヒート
        const lanes = [-6.5, -2.2, 2.2, 6.5];
        const slot = (winnerIdx + secondIdx) % 2 === 0 ? [1, 2, 0, 3] : [2, 1, 3, 0];
        if (idx === winnerIdx) { h.targetLaneX = lanes[slot[0]]; h.speed = 1.56 + (remain < 30 ? 0.08 : 0); }
        else if (idx === secondIdx) { h.targetLaneX = lanes[slot[1]]; h.speed = 1.54; }
        else if (idx === thirdIdx) { h.targetLaneX = lanes[slot[2]]; h.speed = 1.50; }
        else if (idx === fourthIdx) { h.targetLaneX = lanes[slot[3]]; h.speed = 1.45; }
        else h.speed = tail;
      } else {
        // 7：先頭交代
        if (idx === winnerIdx) { h.targetLaneX = 1.0; h.speed = 1.82; }
        else if (idx === secondIdx) { h.targetLaneX = -6.0; h.speed = 1.50; }
        else if (idx === thirdIdx) { h.targetLaneX = -2.0; h.speed = 1.38; }
        else h.speed = tail;
      }

      // 1着馬が前にいる馬を差し切るアシスト
      if (idx === winnerIdx) {
        const lead = Math.min(...s.horses.map(other => other.z));
        if (h.z > lead) {
          h.speed += Math.min(0.65, (h.z - lead) * 0.14);
        }
      }
    }
  });

  // --- 【残り100mから着順補正が働く】 ---
  // 指定順位：1着=winner, 2着=second, 3着=third, 4着以降=others
  const targetRanks = [winnerIdx, secondIdx, thirdIdx, ...others];
  s.horses.forEach((h, idx) => {
    if (h.finished || h.z - FINISH_Z > 100) return; // 残り100mから着順補正発動

    const myRank = targetRanks.indexOf(idx); // 0 = 1着, 1 = 2着, 2 = 3着, ...
    if (myRank === 0) return; // 1着馬は補正不要

    // 自分より上位の全馬の前には絶対に出てはならない
    for (let higherRank = 0; higherRank < myRank; higherRank++) {
      const higherIdx = targetRanks[higherRank];
      const higherHorse = s.horses[higherIdx];
      // 1着と2着はハナ差0.6m、2着と3着は1.0m、それ以外は1.4m
      const minGap = (higherRank === 0 && myRank === 1) ? 0.6 : (myRank === 2 ? 1.0 : 1.4);
      const targetZ = higherHorse.z + minGap;
      const lead = targetZ - h.z; // 正＝上位馬より前に出すぎている
      if (!higherHorse.finished && lead >= 0) {
        h.speed = Math.min(h.speed, higherHorse.speed * Math.max(0.35, 0.80 - lead * 0.15));
      }
    }
  });

  s.horses.forEach(h => {
    if (h.finished) return;
    h.laneX += (h.targetLaneX - h.laneX) * Math.min(1, dt * 3.5);
    h.z -= h.speed * 34 * dt;
    if (h.z <= FINISH_Z) {
      h.z = FINISH_Z;
      h.finished = true;
      s.finishCount++;
      h.finishRank = s.finishCount;
    }
  });

  s.t += dt;
  if (s.leaderFinishT === null && s.horses.some(h => h.finished)) s.leaderFinishT = s.t;
  if (s.allFinishT === null && s.horses.every(h => h.finished)) s.allFinishT = s.t;

  // 全馬がゴールラインを通過した後に余韻を持ってレース終了。フェイルセーフとして先頭ゴール後15秒でも終了
  if (!s.done) {
    if (s.allFinishT !== null && s.t >= s.allFinishT + ALL_FINISH_COOLDOWN) {
      s.done = true;
    } else if (s.leaderFinishT !== null && s.t >= s.leaderFinishT + 15) {
      s.done = true;
    }
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
  return s.horses
    .map((h, i) => ({ i, h }))
    .sort((a, b) => {
      // 1. 両頭ともゴール済みなら確定着順（finishRank）で順位付け
      if (a.h.finished && b.h.finished) {
        return (a.h.finishRank ?? 99) - (b.h.finishRank ?? 99);
      }
      // 2. 片方だけゴール済みなら、ゴールした馬が上位
      if (a.h.finished) return -1;
      if (b.h.finished) return 1;
      // 3. 走行中ならZ座標が小さい（ゴールに近い）馬が上位
      return a.h.z - b.h.z;
    })
    .map(x => x.i);
}
