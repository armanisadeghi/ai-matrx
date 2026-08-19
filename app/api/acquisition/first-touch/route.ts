import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { isJsonObject } from "@/types/json";
import { FirstTouchPayloadSchema } from "@/lib/product-analytics/user-acquisition";

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

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("guest_executions")
    .select("id, metadata")
    .eq("fingerprint", payload.fingerprint)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  const session = await createClient();
  const { data: sessionData } = await session.auth.getUser();
  const permanentUser =
    sessionData.user && sessionData.user.is_anonymous !== true
      ? sessionData.user
      : null;

  if (!existing) {
    const { error } = await admin.from("guest_executions").insert({
      fingerprint: payload.fingerprint,
      ip_address: requestIp(request),
      user_agent: request.headers.get("user-agent"),
      total_executions: 0,
      daily_executions: 0,
      first_execution_at: null,
      last_execution_at: null,
      metadata: {
        acquisition: payload,
        acquisition_user_id: permanentUser?.id ?? null,
      },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ captured: true, created: true });
  }

  const metadata = isJsonObject(existing.metadata) ? existing.metadata : {};
  const needsAcquisition = !isJsonObject(metadata.acquisition);
  const needsUserAssociation =
    permanentUser && typeof metadata.acquisition_user_id !== "string";
  if (needsAcquisition || needsUserAssociation) {
    const { error } = await admin
      .from("guest_executions")
      .update({
        metadata: {
          ...metadata,
          ...(needsAcquisition ? { acquisition: payload } : {}),
          ...(needsUserAssociation
            ? { acquisition_user_id: permanentUser.id }
            : {}),
        },
      })
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ captured: true, created: false });
}
