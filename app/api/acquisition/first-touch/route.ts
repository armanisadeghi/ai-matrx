import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { FirstTouchPayloadSchema } from "@/lib/product-analytics/user-acquisition";
import { recordAcquisitionFirstTouch } from "@/lib/product-analytics/server/acquisition-persistence";

function requestIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

export async function POST(request: NextRequest) {
  const parsed = FirstTouchPayloadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid first-touch payload" },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  const session = await createClient();
  const { data: sessionData } = await session.auth.getUser();
  const permanentUser =
    sessionData.user && sessionData.user.is_anonymous !== true
      ? sessionData.user
      : null;

  try {
    await recordAcquisitionFirstTouch({
      payload,
      ipAddress: requestIp(request),
      userAgent: request.headers.get("user-agent"),
      userId: permanentUser?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Persistence failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ captured: true });
}
