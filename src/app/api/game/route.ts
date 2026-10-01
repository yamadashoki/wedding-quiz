import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// 司会者パスワード認証
function authenticateHost(request: NextRequest): boolean {
  const authHeader = request.headers.get("x-host-password");
  const hostPassword = process.env.HOST_PASSWORD;
  if (!hostPassword) return false;
  return authHeader === hostPassword;
}

// POST /api/game - 新しいゲーム（質問）を作成
export async function POST(request: NextRequest) {
  if (!authenticateHost(request)) {
    return NextResponse.json({ success: false, error: "認証エラー" }, { status: 401 });
  }

  try {
    const { question } = await request.json();
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "質問を入力してください" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // 既存の進行中ゲームをすべて revealed にする
    await supabase
      .from("games")
      .update({ status: "revealed", updated_at: new Date().toISOString() })
      .in("status", ["waiting", "answering"]);

    // 新しいゲームを作成（status: answering で即開始）
    const { data, error } = await supabase
      .from("games")
      .insert({
        question: question.trim(),
        status: "answering",
      })
      .select()
      .single();

    if (error) {
      console.error("Game creation error:", error);
      return NextResponse.json(
        { success: false, error: "ゲームの作成に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

// GET /api/game - 最新のゲーム情報を取得
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const isHost = authenticateHost(request);

    // 最新のゲームを取得
    const { data: game, error } = await supabase
      .from("games")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Game fetch error:", error);
      return NextResponse.json(
        { success: false, error: "データの取得に失敗しました" },
        { status: 500 }
      );
    }

    if (!game) {
      return NextResponse.json({ success: true, data: { game: null, yes_count: 0, no_count: 0, total: 0 } });
    }

    // 回答集計
    const { count: yesCount } = await supabase
      .from("answers")
      .select("*", { count: "exact", head: true })
      .eq("game_id", game.id)
      .eq("answer", true);

    const { count: noCount } = await supabase
      .from("answers")
      .select("*", { count: "exact", head: true })
      .eq("game_id", game.id)
      .eq("answer", false);

    const yes_count = yesCount || 0;
    const no_count = noCount || 0;
    const total = yes_count + no_count;

    // 司会者の場合：すべての情報を返す
    if (isHost) {
      return NextResponse.json({
        success: true,
        data: { game, yes_count, no_count, total },
      });
    }

    // スクリーン・参加者の場合
    const url = new URL(request.url);
    const role = url.searchParams.get("role");

    if (role === "screen") {
      // スクリーン画面：revealed時のみYES人数を返す
      if (game.status === "revealed") {
        return NextResponse.json({
          success: true,
          data: { game, yes_count, total },
        });
      } else {
        return NextResponse.json({
          success: true,
          data: { game },
        });
      }
    }

    // 参加者画面：YES/NO人数は一切返さない
    return NextResponse.json({
      success: true,
      data: { game },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}

// PATCH /api/game - ゲームのステータスを更新
export async function PATCH(request: NextRequest) {
  if (!authenticateHost(request)) {
    return NextResponse.json({ success: false, error: "認証エラー" }, { status: 401 });
  }

  try {
    const { game_id, status } = await request.json();

    if (!game_id || !status) {
      return NextResponse.json(
        { success: false, error: "パラメータが不足しています" },
        { status: 400 }
      );
    }

    if (!["waiting", "answering", "revealed"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "無効なステータスです" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("games")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", game_id)
      .select()
      .single();

    if (error) {
      console.error("Game update error:", error);
      return NextResponse.json(
        { success: false, error: "ステータスの更新に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
