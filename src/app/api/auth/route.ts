import { NextRequest, NextResponse } from "next/server";

// POST /api/auth - 司会者パスワード認証
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const hostPassword = process.env.HOST_PASSWORD;

    if (!hostPassword) {
      return NextResponse.json(
        { success: false, error: "サーバー設定エラー: HOST_PASSWORDが設定されていません" },
        { status: 500 }
      );
    }

    if (password === hostPassword) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: "パスワードが違います" },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error("Auth error:", err);
    return NextResponse.json(
      { success: false, error: "認証エラーが発生しました" },
      { status: 500 }
    );
  }
}
