import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// POST /api/answer - 回答を送信
export async function POST(request: NextRequest) {
  try {
    const { game_id, participant_id, answer } = await request.json();

    // バリデーション
    if (!game_id || !participant_id || typeof answer !== "boolean") {
      return NextResponse.json(
        { success: false, error: "パラメータが不足しています" },
        { status: 400 }
      );
    }

    // UUID形式の簡易バリデーション
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(participant_id)) {
      return NextResponse.json(
        { success: false, error: "無効な参加者IDです" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // ゲームの状態を確認
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, status")
      .eq("id", game_id)
      .single();

    if (gameError || !game) {
      return NextResponse.json(
        { success: false, error: "ゲームが見つかりません" },
        { status: 404 }
      );
    }

    if (game.status !== "answering") {
      return NextResponse.json(
        { success: false, error: "現在回答を受け付けていません" },
        { status: 400 }
      );
    }

    // 重複回答チェック & 挿入（UNIQUEコンストレイントに頼る）
    const { error: insertError } = await supabase
      .from("answers")
      .insert({
        game_id,
        participant_id,
        answer,
      });

    if (insertError) {
      // UNIQUE制約違反の場合
      if (insertError.code === "23505") {
        return NextResponse.json(
          { success: false, error: "この質問にはすでに回答済みです" },
          { status: 409 }
        );
      }
      console.error("Answer insert error:", insertError);
      return NextResponse.json(
        { success: false, error: "回答の送信に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

// GET /api/answer?game_id=xxx&participant_id=yyy - 自分が回答済みかチェック
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const game_id = url.searchParams.get("game_id");
    const participant_id = url.searchParams.get("participant_id");

    if (!game_id || !participant_id) {
      return NextResponse.json(
        { success: false, error: "パラメータが不足しています" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("answers")
      .select("id")
      .eq("game_id", game_id)
      .eq("participant_id", participant_id)
      .maybeSingle();

    if (error) {
      console.error("Answer check error:", error);
      return NextResponse.json(
        { success: false, error: "確認に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { answered: !!data },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
