import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { computeRaceDurationMs, isValidOrder, judgeBet, OPTION_COUNT, type BetOrder } from "@/lib/derby-core";

export const dynamic = 'force-dynamic';

// =====================================================================
// 3連単アンケートゲーム API
//   GET  … 現在の状態（進行・問題・参加者・現在レースの馬券）を返す。
//          レース終了時刻を過ぎていれば、ここで着順確定まで行う（誰も確定を送らなくても進む）
//   POST … 参加登録・投票（誰でも）／着順確定（時刻を過ぎていれば誰でも）／進行操作（幹事のみ）
// 状態は DB だけが正。全画面は「POSTの結果」か「GET」で同じスナップショットを受け取る。
// =====================================================================

const GAME_ID = "derby_current";
type GameStatus = 'idle' | 'racing' | 'result' | 'grand_finale';
type Supabase = ReturnType<typeof createServiceClient>;

interface DerbyRaceInput {
    id: string;
    name: string;
    question: string;
    options: string[];
}

interface GameRow {
    id: string;
    current_race_index: number;
    status: GameStatus;
    correct_order: number[];
    race_started_at: string | null;
    updated_at: string;
}

interface RaceRow { id: string; round_index: number; name: string; question: string; options: string[]; correct_order: number[] }
interface BetRow {
    id: string; game_id: string; race_index: number; participant_id: string; participant_name: string;
    bet_order: number[]; score_gained: number; created_at: string;
}

const DEFAULT_RACES: (DerbyRaceInput & { correctOrder: BetOrder })[] = [
    {
        id: "race_1",
        name: "第1R：新婦の手料理杯",
        question: "新郎が一生涯食べ続けたい「新婦の手料理No.1」は？",
        options: ["特製ハンバーグ", "特製オムライス", "特製肉じゃが", "カレーライス", "絶品唐揚げ", "特製お味噌汁", "特製デザート", "まだ作ってもらってない"],
        correctOrder: [6, 4, 0]
    },
    {
        id: "race_2",
        name: "第2R：新郎の直してほしいところ特別",
        question: "新婦が告白！「新郎のここだけは直してほしいところ」は？",
        options: ["夜中の大爆音いびき", "休日に昼過ぎまで爆睡", "脱いだ靴下丸めて放置", "ゲーム中に返事しない", "急な筋肉自慢アピール", "記念日や約束を忘れがち", "優しすぎて優柔不断", "非の打ち所なし（神）"],
        correctOrder: [0, 2, 4]
    },
    {
        id: "race_3",
        name: "第3R：二人の思い出ステークス（最終戦）",
        question: "新郎新婦が選ぶ「一番思い出に残っているデートスポット」は？",
        options: ["初デートの水族館", "雨の東京ディズニーランド", "二人で行った沖縄旅行", "近所のいつもの居酒屋", "夜景を見に行った展望台", "ドライブで行った富士山", "おうち映画鑑賞会", "プロポーズした高級ホテル"],
        correctOrder: [2, 7, 0]
    }
];

// ---------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------
class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

function isHost(request: NextRequest): boolean {
    const hostPassword = process.env.HOST_PASSWORD;
    if (!hostPassword) return false;
    return request.headers.get("x-host-password") === hostPassword;
}

/** DB エラーを画面に出せる日本語に変換（未マイグレーションも検出） */
function dbFail(label: string, err: { code?: string; message?: string } | null): never {
    console.error(`${label}:`, err);
    const msg = err?.message || '';
    if (err?.code === '42703' || err?.code === 'PGRST204' || /race_started_at/.test(msg)) {
        throw new ApiError(500, 'DBの更新が必要です。supabase/migrations/20261012_derby_v2.sql を SQL Editor で実行してください');
    }
    if (err?.code === '23514') {
        throw new ApiError(500, 'DBの制限に引っかかりました（第4R以降を使うには 20261012_derby_v2.sql の実行が必要です）');
    }
    throw new ApiError(500, `${label}に失敗しました`);
}

const nowIso = () => new Date().toISOString();

async function getGame(sb: Supabase): Promise<GameRow> {
    const { data, error } = await sb.from("derby_games").select("*").eq("id", GAME_ID).maybeSingle();
    if (error) dbFail("進行状態の取得", error);
    if (data) return data as GameRow;
    const { data: created, error: insErr } = await sb.from("derby_games")
        .insert({ id: GAME_ID, current_race_index: 0, status: "idle", correct_order: DEFAULT_RACES[0].correctOrder })
        .select("*").single();
    if (insErr) dbFail("進行状態の作成", insErr);
    return created as GameRow;
}

async function getRaces(sb: Supabase): Promise<RaceRow[]> {
    const { data, error } = await sb.from("derby_races").select("*").order("round_index", { ascending: true });
    if (error) dbFail("問題の取得", error);
    if (data && data.length > 0) return data as RaceRow[];
    // 未登録なら初期問題を登録
    const rows = DEFAULT_RACES.map((r, i) => ({ id: r.id, round_index: i, name: r.name, question: r.question, options: r.options, correct_order: r.correctOrder }));
    const { error: insErr } = await sb.from("derby_races").upsert(rows);
    if (insErr) dbFail("初期問題の登録", insErr);
    return rows;
}

async function updateGame(sb: Supabase, fields: Partial<Omit<GameRow, 'id' | 'updated_at'>>) {
    const { error } = await sb.from("derby_games").update({ ...fields, updated_at: nowIso() }).eq("id", GAME_ID);
    if (error) dbFail("進行状態の保存", error);
}

/** 全参加者の累計得点を、全馬券の獲得点の合計から作り直す（何度実行しても同じ結果） */
async function recomputeTotals(sb: Supabase) {
    const [bets, ps] = await Promise.all([
        sb.from("derby_bets").select("participant_id, score_gained").eq("game_id", GAME_ID),
        sb.from("derby_participants").select("id, name")
    ]);
    if (bets.error) dbFail("得点の集計", bets.error);
    if (ps.error) dbFail("参加者の取得", ps.error);
    const sum = new Map<string, number>();
    (bets.data ?? []).forEach(b => sum.set(b.participant_id, (sum.get(b.participant_id) ?? 0) + (b.score_gained ?? 0)));
    const rows = (ps.data ?? []).map(p => ({ id: p.id, name: p.name, score: sum.get(p.id) ?? 0, updated_at: nowIso() }));
    if (rows.length === 0) return;
    const { error } = await sb.from("derby_participants").upsert(rows);
    if (error) dbFail("得点の保存", error);
}

/**
 * 着順確定（冪等）：status が racing の時だけ result に切り替え、勝った1回だけ採点する。
 * 同時に複数の画面から呼ばれても二重採点しない。
 */
/** 発走後は、発走時刻より後に保存された馬券を数えない（全画面・採点で同じ投票者になる） */
function isCountedBet(createdAt: string | null | undefined, raceStartedAt: string | null | undefined): boolean {
    if (!raceStartedAt || !createdAt) return true;
    return new Date(createdAt).getTime() <= new Date(raceStartedAt).getTime();
}

/** 現在レースの全馬券を、指定した正解着順で採点し直す（累計の再計算は呼び出し側で行う） */
async function scoreCurrentRace(sb: Supabase, game: GameRow, order: BetOrder): Promise<void> {
    const { data: bets, error: betErr } = await sb.from("derby_bets").select("*")
        .eq("game_id", GAME_ID).eq("race_index", game.current_race_index);
    if (betErr) dbFail("馬券の取得", betErr);
    const scored = ((bets ?? []) as BetRow[]).filter(b => isCountedBet(b.created_at, game.race_started_at)).map(b => ({ ...b, score_gained: judgeBet(b.bet_order, order).score }));
    if (scored.length > 0) {
        const { error: upErr } = await sb.from("derby_bets").upsert(scored);
        if (upErr) dbFail("採点の保存", upErr);
    }
}

async function finalizeIfDue(sb: Supabase, game: GameRow, toleranceMs: number): Promise<boolean> {
    if (game.status !== 'racing' || !game.race_started_at) return false;
    const due = new Date(game.race_started_at).getTime() + computeRaceDurationMs(game.correct_order, game.current_race_index);
    if (Date.now() < due - toleranceMs) return false;

    const { data: won, error } = await sb.from("derby_games")
        .update({ status: 'result', updated_at: nowIso() })
        .eq("id", GAME_ID).eq("status", "racing").eq("current_race_index", game.current_race_index)
        .select("id");
    if (error) dbFail("着順確定", error);
    if (!won || won.length === 0) return false; // 他の画面が先に確定済み

    await scoreCurrentRace(sb, game, game.correct_order);
    await recomputeTotals(sb);
    return true;
}

/** 画面に返すスナップショット。幹事以外には、投票受付中の正解着順を渡さない */
async function buildSnapshot(sb: Supabase, host: boolean) {
    let game = await getGame(sb);
    // ゴール時刻を2秒以上過ぎても確定していなければ、ここで確定（幹事・スクリーンが閉じていても進む）
    if (await finalizeIfDue(sb, game, -2000)) game = await getGame(sb);

    const races = await getRaces(sb);
    const raceIdx = Math.min(game.current_race_index, Math.max(0, races.length - 1));
    const [ps, bets] = await Promise.all([
        sb.from("derby_participants").select("id, name, score").order("score", { ascending: false }),
        sb.from("derby_bets").select("participant_id, bet_order, created_at").eq("game_id", GAME_ID).eq("race_index", raceIdx)
    ]);
    if (ps.error) dbFail("参加者の取得", ps.error);
    if (bets.error) dbFail("馬券の取得", bets.error);
    const frozenAt = game.status !== 'idle' ? game.race_started_at : null;
    const betMap = new Map((bets.data ?? [])
        .filter(b => isCountedBet(b.created_at, frozenAt))
        .map(b => [b.participant_id, b.bet_order as number[]]));

    const revealOrder = host || game.status !== 'idle';
    const startedAt = game.race_started_at ? new Date(game.race_started_at).getTime() : null;
    return {
        serverNow: Date.now(),
        version: new Date(game.updated_at).getTime(),
        isHost: host,
        game: {
            status: game.status,
            currentRaceIndex: raceIdx,
            correctOrder: revealOrder ? game.correct_order : null,
            raceStartedAt: startedAt,
            raceDurationMs: game.status === 'racing' || game.status === 'result'
                ? computeRaceDurationMs(game.correct_order, raceIdx) : null
        },
        races: races.map((r, i) => ({
            id: r.id, roundIndex: i, name: r.name, question: r.question, options: r.options,
            correctOrder: host ? r.correct_order : []
        })),
        participants: (ps.data ?? []).map(p => ({ id: p.id, name: p.name, score: p.score ?? 0, betSlip: betMap.get(p.id) ?? null }))
    };
}

function ok(data: unknown, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: true, data, ...extra }, { headers: { 'Cache-Control': 'no-store' } });
}

function fail(err: unknown) {
    if (err instanceof ApiError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error("Trifecta API error:", err);
    return NextResponse.json({ success: false, error: "サーバーエラーが発生しました" }, { status: 500 });
}

// ---------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------
export async function GET(request: NextRequest) {
    try {
        const sb = createServiceClient();
        return ok(await buildSnapshot(sb, isHost(request)));
    } catch (err) {
        return fail(err);
    }
}

// ---------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const type: string = body?.type;
        const sb = createServiceClient();
        const host = isHost(request);

        // ---------------- 誰でも実行できる操作 ----------------
        if (type === 'join') {
            const participantId = String(body.participantId || '').slice(0, 64);
            const name = String(body.name || '').trim().slice(0, 30);
            if (!participantId || !name) throw new ApiError(400, "名前を入力してください");
            const { data: existing, error } = await sb.from("derby_participants").select("id").eq("id", participantId).maybeSingle();
            if (error) dbFail("参加登録", error);
            const res = existing
                ? await sb.from("derby_participants").update({ name, updated_at: nowIso() }).eq("id", participantId)
                : await sb.from("derby_participants").insert({ id: participantId, name, score: 0 });
            if (res.error && res.error.code !== '23505') dbFail("参加登録", res.error);
            return ok(await buildSnapshot(sb, host));
        }

        if (type === 'bet') {
            const participantId = String(body.participantId || '').slice(0, 64);
            const name = String(body.name || '').trim().slice(0, 30) || 'ゲスト';
            const { betOrder, raceIndex } = body;
            if (!participantId || !isValidOrder(betOrder)) throw new ApiError(400, "投票内容が不正です");

            // 受付中の現在レースにだけ投票できる（発走後・レース切替後は拒否）
            const game = await getGame(sb);
            if (game.status !== 'idle' || game.current_race_index !== raceIndex) {
                throw new ApiError(409, "このレースの投票受付は終了しています");
            }
            const { data: part, error: pErr } = await sb.from("derby_participants").select("id").eq("id", participantId).maybeSingle();
            if (pErr) dbFail("参加者の確認", pErr);
            if (!part) {
                const { error } = await sb.from("derby_participants").insert({ id: participantId, name, score: 0 });
                if (error && error.code !== '23505') dbFail("参加登録", error);
            }
            // 1レース1回（上書き不可）。2回目は「投票済み」として現在の内容を返す
            const { error: betErr } = await sb.from("derby_bets").insert({
                game_id: GAME_ID, race_index: raceIndex, participant_id: participantId,
                participant_name: name, bet_order: betOrder, score_gained: 0
            });
            if (betErr && betErr.code !== '23505') dbFail("投票の保存", betErr);
            if (!betErr) {
                // 「受付中の確認」と「保存」の間に発走された場合は、この投票を取り消す（画面ごとに的中者数がずれるのを防ぐ）
                const after = await getGame(sb);
                if (after.status !== 'idle' || after.race_started_at || after.current_race_index !== raceIndex) {
                    await sb.from("derby_bets").delete()
                        .eq("game_id", GAME_ID).eq("race_index", raceIndex).eq("participant_id", participantId);
                    throw new ApiError(409, "このレースの投票受付は終了しています");
                }
            }
            return ok(await buildSnapshot(sb, host), { duplicate: betErr?.code === '23505' });
        }

        if (type === 'finalize_race') {
            // ゴール時刻（±2秒の時計ずれを許容）を過ぎていれば誰でも確定を依頼できる。早すぎる依頼は無視
            const game = await getGame(sb);
            await finalizeIfDue(sb, game, 2000);
            return ok(await buildSnapshot(sb, host));
        }

        if (type === 'verify_host' || type === 'verify') {
            const pw = body.password || request.headers.get("x-host-password");
            const expected = process.env.HOST_PASSWORD;
            if (!expected || pw !== expected) {
                throw new ApiError(401, "パスワードが正しくありません");
            }
            return ok(await buildSnapshot(sb, true));
        }

        // ---------------- ここから幹事のみ ----------------
        if (!host) throw new ApiError(401, "幹事ログインが必要です");

        const game = await getGame(sb);
        const races = await getRaces(sb);
        const notRacing = () => {
            if (game.status === 'racing') throw new ApiError(409, "レース中は操作できません");
        };

        if (type === 'start_race') {
            if (game.status !== 'idle') throw new ApiError(409, "投票受付中のレースだけ発走できます（結果表示中は「次のレースへ」か「再投票」）");
            if (!isValidOrder(game.correct_order)) throw new ApiError(400, "正解着順を設定してください");
            await updateGame(sb, { status: 'racing', race_started_at: nowIso() });
            return ok(await buildSnapshot(sb, true));
        }

        if (type === 'set_correct_order') {
            // 受付中・結果確定後のどちらでも変更できる。結果確定後は、このレースの得点を新しい着順で付け直す
            if (game.status === 'racing') throw new ApiError(409, "レース中は変更できません。着順が確定してから変更してください");
            if (game.status === 'grand_finale') throw new ApiError(409, "表彰画面を閉じてから変更してください");
            const { correctOrder } = body;
            if (!isValidOrder(correctOrder)) throw new ApiError(400, "正解着順は重複なしで3つ選んでください");
            await updateGame(sb, { correct_order: correctOrder });
            const race = races[game.current_race_index];
            if (race) {
                const { error } = await sb.from("derby_races").update({ correct_order: correctOrder, updated_at: nowIso() }).eq("id", race.id);
                if (error) dbFail("正解着順の保存", error);
            }
            if (game.status === 'result') {
                await scoreCurrentRace(sb, game, correctOrder);
                await recomputeTotals(sb);
            }
            return ok(await buildSnapshot(sb, true));
        }

        if (type === 'go_to_race' || type === 'set_race_index') {
            notRacing();
            const idx = Number(body.raceIndex ?? body.index);
            const race = races[idx];
            if (!Number.isInteger(idx) || !race) throw new ApiError(400, "レースが見つかりません");
            await updateGame(sb, {
                status: 'idle', current_race_index: idx, race_started_at: null,
                correct_order: isValidOrder(race.correct_order) ? race.correct_order : [0, 1, 2]
            });
            return ok(await buildSnapshot(sb, true));
        }

        if (type === 'rebet' || type === 'reset_race') {
            notRacing();
            // このレースの馬券を消し、加算済みの得点も作り直して戻す
            const { error } = await sb.from("derby_bets").delete().eq("game_id", GAME_ID).eq("race_index", game.current_race_index);
            if (error) dbFail("馬券の取り消し", error);
            await recomputeTotals(sb);
            await updateGame(sb, { status: 'idle', race_started_at: null });
            return ok(await buildSnapshot(sb, true));
        }

        if (type === 'reset_tournament' || type === 'reset_all') {
            notRacing();
            const del = await sb.from("derby_bets").delete().eq("game_id", GAME_ID);
            if (del.error) dbFail("馬券の削除", del.error);
            const sc = await sb.from("derby_participants").update({ score: 0, updated_at: nowIso() }).neq("id", "");
            if (sc.error) dbFail("得点のリセット", sc.error);
            await updateGame(sb, {
                status: 'idle', current_race_index: 0, race_started_at: null,
                correct_order: isValidOrder(races[0]?.correct_order) ? races[0].correct_order : [0, 1, 2]
            });
            return ok(await buildSnapshot(sb, true));
        }

        if (type === 'grand_finale' || (type === 'set_status' && body.status === 'grand_finale')) {
            notRacing();
            await updateGame(sb, { status: 'grand_finale' });
            return ok(await buildSnapshot(sb, true));
        }

        if (type === 'close_finale' || (type === 'set_status' && body.status === 'result')) {
            if (game.status !== 'grand_finale') return ok(await buildSnapshot(sb, true));
            // 走り終えたレースなら結果表示へ、まだ走っていなければ投票受付へ戻す
            await updateGame(sb, { status: game.race_started_at ? 'result' : 'idle' });
            return ok(await buildSnapshot(sb, true));
        }

        if (type === 'save_races') {
            notRacing();
            const input = body.races as DerbyRaceInput[];
            if (!Array.isArray(input) || input.length === 0) throw new ApiError(400, "レースが1つもありません");
            const existing = new Map(races.map(r => [r.id, r]));
            const liveId = races[game.current_race_index]?.id;
            const rows = input.map((r, i) => {
                const id = String(r.id || `race_${Date.now().toString(36)}_${i}`).slice(0, 64);
                const options = Array.from({ length: OPTION_COUNT }, (_, k) => String(r.options?.[k] ?? '').trim().slice(0, 60) || `選択肢${'ABCDEFGH'[k]}`);
                const prev = existing.get(id);
                return {
                    id,
                    round_index: i,
                    name: String(r.name || '').trim().slice(0, 60) || `第${i + 1}R`,
                    question: String(r.question || '').trim().slice(0, 200) || '（設問未入力）',
                    options,
                    // 正解着順は「当日進行」で設定する。ここでは既存の値を保持（新規は A→B→C）
                    correct_order: prev && isValidOrder(prev.correct_order) ? prev.correct_order : [0, 1, 2],
                    updated_at: nowIso()
                };
            });
            const { error: upErr } = await sb.from("derby_races").upsert(rows);
            if (upErr) dbFail("問題の保存", upErr);
            const keepIds = new Set(rows.map(r => r.id));
            const removed = races.filter(r => !keepIds.has(r.id)).map(r => r.id);
            if (removed.length > 0) {
                const { error } = await sb.from("derby_races").delete().in("id", removed);
                if (error) dbFail("レースの削除", error);
            }
            // 進行中レースの番号を並べ替え後の位置に合わせる
            const newLive = rows.findIndex(r => r.id === liveId);
            if (newLive >= 0 && newLive !== game.current_race_index) {
                await updateGame(sb, { current_race_index: newLive });
            } else if (newLive < 0) {
                const idx = Math.min(game.current_race_index, rows.length - 1);
                await updateGame(sb, { current_race_index: idx, status: 'idle', race_started_at: null, correct_order: rows[idx].correct_order });
            }
            return ok(await buildSnapshot(sb, true));
        }

        throw new ApiError(400, "未対応の操作です");
    } catch (err) {
        return fail(err);
    }
}
