import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

interface DerbyRaceInput {
    id: string;
    roundIndex: number;
    name: string;
    question: string;
    options: string[];
    correctOrder: number[];
}

const DEFAULT_RACES: DerbyRaceInput[] = [
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
        correctOrder: [6, 4, 0]
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
        correctOrder: [0, 2, 4]
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
        correctOrder: [2, 7, 0]
    }
];

// 得点計算ルール：
// 3連単完全的中: +6pt
// 3連複的中: +4pt
// 2連単的中: +3pt
function calculateBetScore(bet: number[] | null, correct: number[]): number {
    if (!bet || bet.length < 3 || correct.length < 3) return 0;
    if (bet[0] === correct[0] && bet[1] === correct[1] && bet[2] === correct[2]) return 6;
    const betSet = new Set(bet.slice(0, 3));
    const correctSet = new Set(correct.slice(0, 3));
    const isFuku = betSet.size === 3 && correctSet.size === 3 && bet.slice(0, 3).every(x => correctSet.has(x));
    if (isFuku) return 4;
    if (bet[0] === correct[0] && bet[1] === correct[1]) return 3;
    return 0;
}

// GET: 最新のゲーム・レース・参加者・投票データを取得
export async function GET() {
    try {
        const supabase = createServiceClient();

        // 1. ゲーム状態取得
        let { data: game, error: gameError } = await supabase
            .from("derby_games")
            .select("*")
            .eq("id", "derby_current")
            .maybeSingle();

        if (gameError) {
            console.error("derby_games fetch error:", gameError);
        }

        if (!game) {
            const { data: newGame, error: insertGameErr } = await supabase
                .from("derby_games")
                .insert({
                    id: "derby_current",
                    current_race_index: 0,
                    status: "idle",
                    correct_order: [6, 4, 0]
                })
                .select()
                .single();
            if (insertGameErr) console.error("derby_games insert error:", insertGameErr);
            game = newGame;
        }

        // 2. レースデータ取得（未登録なら初期レースを挿入）
        let { data: racesData, error: racesError } = await supabase
            .from("derby_races")
            .select("*")
            .order("round_index", { ascending: true });

        if (racesError) console.error("derby_races fetch error:", racesError);

        if (!racesData || racesData.length === 0) {
            for (const r of DEFAULT_RACES) {
                await supabase.from("derby_races").upsert({
                    id: r.id,
                    round_index: r.roundIndex,
                    name: r.name,
                    question: r.question,
                    options: r.options,
                    correct_order: r.correctOrder
                });
            }
            const { data: seededRaces } = await supabase
                .from("derby_races")
                .select("*")
                .order("round_index", { ascending: true });
            racesData = seededRaces;
        }

        const races = (racesData && racesData.length > 0)
            ? racesData.map(r => ({
                id: r.id,
                roundIndex: r.round_index,
                name: r.name,
                question: r.question,
                options: r.options,
                correctOrder: r.correct_order
            }))
            : DEFAULT_RACES;

        // 3. 参加者データ取得
        const { data: participantsData, error: participantsErr } = await supabase
            .from("derby_participants")
            .select("id, name, score")
            .order("score", { ascending: false });

        if (participantsErr) console.error("derby_participants fetch error:", participantsErr);

        // 4. 現在のレースの投票データ取得
        const currentRaceIndex = game?.current_race_index ?? 0;
        const { data: betsData, error: betsErr } = await supabase
            .from("derby_bets")
            .select("participant_id, participant_name, bet_order, race_index, score_gained")
            .eq("game_id", "derby_current")
            .eq("race_index", currentRaceIndex);

        if (betsErr) console.error("derby_bets fetch error:", betsErr);

        // 参加者リストに現在のレースの betSlip を紐付け
        const betMap = new Map<string, number[]>();
        if (betsData) {
            betsData.forEach(b => {
                betMap.set(b.participant_id, b.bet_order);
            });
        }

        const participants = (participantsData || []).map(p => ({
            id: p.id,
            name: p.name,
            score: p.score ?? 0,
            betSlip: betMap.get(p.id) || null
        }));

        return NextResponse.json({
            success: true,
            data: {
                game: {
                    status: game?.status || 'idle',
                    currentRaceIndex: game?.current_race_index ?? 0,
                    correctOrder: game?.correct_order || [6, 4, 0]
                },
                races,
                participants
            }
        });
    } catch (err) {
        console.error("Trifecta GET error:", err);
        return NextResponse.json({ success: false, error: "サーバーエラーが発生しました" }, { status: 500 });
    }
}

// POST: 参加登録・投票・管理進行等のDB更新
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { type } = body;
        const supabase = createServiceClient();

        // ----------------------------------------------------
        // 1. 参加登録 (type: 'join')
        // ----------------------------------------------------
        if (type === 'join') {
            const { participantId, name } = body;
            if (!participantId || !name || typeof name !== 'string') {
                return NextResponse.json({ success: false, error: "パラメータが不正です" }, { status: 400 });
            }
            const cleanName = name.trim().slice(0, 30);
            if (!cleanName) {
                return NextResponse.json({ success: false, error: "名前を入力してください" }, { status: 400 });
            }

            // 既存参加者なら名前のみ更新、新規ならスコア0で登録
            const { data: existing } = await supabase
                .from("derby_participants")
                .select("id, score")
                .eq("id", participantId)
                .maybeSingle();

            if (existing) {
                await supabase
                    .from("derby_participants")
                    .update({ name: cleanName, updated_at: new Date().toISOString() })
                    .eq("id", participantId);
            } else {
                await supabase
                    .from("derby_participants")
                    .insert({ id: participantId, name: cleanName, score: 0 });
            }

            return NextResponse.json({ success: true, participant: { id: participantId, name: cleanName, score: existing?.score ?? 0 } });
        }

        // ----------------------------------------------------
        // 2. 投票登録 (type: 'bet')
        // ----------------------------------------------------
        if (type === 'bet') {
            const { participantId, name, betOrder, raceIndex } = body;
            if (!participantId || !Array.isArray(betOrder) || betOrder.length !== 3) {
                return NextResponse.json({ success: false, error: "投票内容が不正です" }, { status: 400 });
            }

            // 参加者レコードが存在することを確認（なければ自動作成）
            const { data: part } = await supabase
                .from("derby_participants")
                .select("id")
                .eq("id", participantId)
                .maybeSingle();

            if (!part) {
                await supabase.from("derby_participants").insert({
                    id: participantId,
                    name: (name || 'ゲスト').slice(0, 30),
                    score: 0
                });
            }

            // 投票を UPSERT
            const { error: betErr } = await supabase
                .from("derby_bets")
                .upsert(
                    {
                        game_id: "derby_current",
                        race_index: raceIndex,
                        participant_id: participantId,
                        participant_name: (name || 'ゲスト').slice(0, 30),
                        bet_order: betOrder,
                        score_gained: 0
                    },
                    { onConflict: 'game_id,race_index,participant_id' }
                );

            if (betErr) {
                console.error("derby_bets upsert error:", betErr);
                return NextResponse.json({ success: false, error: "投票の保存に失敗しました" }, { status: 500 });
            }

            return NextResponse.json({ success: true });
        }

        // ----------------------------------------------------
        // 3. ゲーム状態更新 (type: 'update_game')
        // ----------------------------------------------------
        if (type === 'update_game') {
            const { status, currentRaceIndex, correctOrder } = body;
            const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (status !== undefined) updateData.status = status;
            if (currentRaceIndex !== undefined) updateData.current_race_index = currentRaceIndex;
            if (correctOrder !== undefined) updateData.correct_order = correctOrder;

            const { error: updErr } = await supabase
                .from("derby_games")
                .update(updateData)
                .eq("id", "derby_current");

            if (updErr) {
                console.error("derby_games update error:", updErr);
                return NextResponse.json({ success: false, error: "状態更新に失敗しました" }, { status: 500 });
            }

            return NextResponse.json({ success: true });
        }

        // ----------------------------------------------------
        // 4. 問題保存 (type: 'save_races')
        // ----------------------------------------------------
        if (type === 'save_races') {
            const { races } = body as { races: DerbyRaceInput[] };
            if (Array.isArray(races)) {
                for (const r of races) {
                    await supabase.from("derby_races").upsert({
                        id: r.id,
                        round_index: r.roundIndex,
                        name: r.name,
                        question: r.question,
                        options: r.options,
                        correct_order: r.correctOrder,
                        updated_at: new Date().toISOString()
                    });
                }
            }
            return NextResponse.json({ success: true });
        }

        // ----------------------------------------------------
        // 5. 着順確定 ＆ 得点集計 (type: 'finalize_race')
        // ----------------------------------------------------
        if (type === 'finalize_race') {
            const { raceIndex, correctOrder } = body;
            if (typeof raceIndex !== 'number' || !Array.isArray(correctOrder)) {
                return NextResponse.json({ success: false, error: "パラメータが不正です" }, { status: 400 });
            }

            // 該当レースの全投票を取得
            const { data: bets } = await supabase
                .from("derby_bets")
                .select("id, participant_id, bet_order")
                .eq("game_id", "derby_current")
                .eq("race_index", raceIndex);

            // 各投票の獲得得点を計算して更新
            if (bets && bets.length > 0) {
                for (const b of bets) {
                    const gained = calculateBetScore(b.bet_order, correctOrder);
                    await supabase
                        .from("derby_bets")
                        .update({ score_gained: gained })
                        .eq("id", b.id);
                }
            }

            // 全参加者の累計スコアを集計して更新
            const { data: allBets } = await supabase
                .from("derby_bets")
                .select("participant_id, score_gained")
                .eq("game_id", "derby_current");

            const scoreMap = new Map<string, number>();
            if (allBets) {
                allBets.forEach(b => {
                    scoreMap.set(b.participant_id, (scoreMap.get(b.participant_id) || 0) + (b.score_gained || 0));
                });
            }

            const { data: allParticipants } = await supabase
                .from("derby_participants")
                .select("id");

            if (allParticipants) {
                for (const p of allParticipants) {
                    const totalScore = scoreMap.get(p.id) || 0;
                    await supabase
                        .from("derby_participants")
                        .update({ score: totalScore, updated_at: new Date().toISOString() })
                        .eq("id", p.id);
                }
            }

            // ゲーム状態を result に更新
            await supabase
                .from("derby_games")
                .update({
                    status: "result",
                    correct_order: correctOrder,
                    updated_at: new Date().toISOString()
                })
                .eq("id", "derby_current");

            return NextResponse.json({ success: true });
        }

        // ----------------------------------------------------
        // 6. 現在レースの再投票 (type: 'rebet')
        // ----------------------------------------------------
        if (type === 'rebet') {
            const { raceIndex } = body;
            await supabase
                .from("derby_bets")
                .delete()
                .eq("game_id", "derby_current")
                .eq("race_index", raceIndex);

            await supabase
                .from("derby_games")
                .update({ status: "idle", updated_at: new Date().toISOString() })
                .eq("id", "derby_current");

            return NextResponse.json({ success: true });
        }

        // ----------------------------------------------------
        // 7. 全スコアリセット (type: 'reset_tournament')
        // ----------------------------------------------------
        if (type === 'reset_tournament') {
            await supabase
                .from("derby_bets")
                .delete()
                .eq("game_id", "derby_current");

            await supabase
                .from("derby_participants")
                .update({ score: 0, updated_at: new Date().toISOString() })
                .neq("id", "");

            await supabase
                .from("derby_games")
                .update({
                    status: "idle",
                    current_race_index: 0,
                    correct_order: [6, 4, 0],
                    updated_at: new Date().toISOString()
                })
                .eq("id", "derby_current");

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, error: "未対応の操作です" }, { status: 400 });
    } catch (err) {
        console.error("Trifecta POST error:", err);
        return NextResponse.json({ success: false, error: "サーバーエラーが発生しました" }, { status: 500 });
    }
}
