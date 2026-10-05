import { NextRequest, NextResponse } from "next/server";
import { AccountClosureError, restoreAccount } from "@/features/account-lifecycle/accountClosure";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { userId?: string; requestId?: string; token?: string };
    if (!body.userId || !body.requestId || !body.token) return NextResponse.json({ error: "Recovery link is incomplete." }, { status: 400 });
    const restored = await restoreAccount({ userId: body.userId, requestId: body.requestId, token: body.token });
    return NextResponse.json({ actionLink: restored.actionLink });
  } catch (error) {
    const status = error instanceof AccountClosureError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account recovery failed." }, { status });
  }
}
