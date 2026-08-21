import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { resolveOrgIdForUserServer } from "@/lib/organizations/personalOrg";

const PayloadSchema = z.object({
  fingerprint: z.string().regex(/^[a-zA-Z0-9]{16,200}$/),
  source: z.string().min(1).max(100),
  message: z.string().min(1).max(20_000),
  code: z.string().max(500).nullable(),
  route: z.string().max(2_000).nullable(),
  request_id: z.string().max(200).nullable(),
  stack: z.string().max(50_000).nullable(),
  payload: z.unknown(),
  context: z.unknown(),
});

export async function POST(request: NextRequest) {
  const parsed = PayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid client error" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: guest, error: guestError } = await admin
    .schema("users").from("guest_executions")
    .select("auth_user_id")
    .eq("fingerprint", parsed.data.fingerprint)
    .maybeSingle();
  if (guestError || !guest) {
    return NextResponse.json({ error: "Unknown guest identity" }, { status: 404 });
  }

  const organizationId = await resolveOrgIdForUserServer(
    admin,
    guest.auth_user_id,
  );
  const { error } = await admin.schema("ops").from("system_error").insert({
    kind: `client:${parsed.data.source}`,
    error_text: parsed.data.message,
    error_type: parsed.data.code,
    route: parsed.data.route,
    request_id: parsed.data.request_id,
    traceback: parsed.data.stack,
    payload: parsed.data.payload,
    context: {
      ...(typeof parsed.data.context === "object" && parsed.data.context !== null
        ? parsed.data.context
        : {}),
      fingerprint: parsed.data.fingerprint,
      identity_state: "guest",
    },
    source_app: "matrx-frontend",
    user_id: guest.auth_user_id,
    organization_id: organizationId,
  });
  if (error) {
    return NextResponse.json({ error: "Failed to persist client error" }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
