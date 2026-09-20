import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { isSourceFeature } from "@/types/python-generated/source-attribution";
import { UNMAPPED_CLIENT_SOURCE_FEATURE } from "@/lib/diagnostics/errorSourceFeature";

const PayloadSchema = z.object({
  fingerprint: z.string().regex(/^[a-zA-Z0-9]{16,200}$/),
  source: z.string().min(1).max(100),
  // The GUEST lane writes ops.system_error directly (RLS denies the browser, so
  // the admin client stands in for the RPC a signed-in caller would use). It
  // therefore owes the same two-level categorization the RPC now enforces:
  // app AND feature. Optional on the wire only so a browser tab running a build
  // older than this one still records its error; the value it omits becomes the
  // loud `client-unmapped` sentinel below, never null.
  source_feature: z.string().max(191).optional(),
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

  // org-fallback-deliberate: a GUEST has no organization — `guest_executions`
  //   carries none and the person has chosen none — and ops.system_error is
  //   the platform's own error ledger, so the platform is the only tenant this
  //   row can belong to. It used to resolve the guest's personal organization
  //   first, filing the platform's diagnostics in a private workspace.
  const organizationId = await resolveSystemOrgId(admin);
  // An unregistered slug is never stored: a client that sends one is telling us
  // its map is wrong, and a wrong feature is harder to notice than a missing one.
  const sourceFeature =
    parsed.data.source_feature && isSourceFeature(parsed.data.source_feature)
      ? parsed.data.source_feature
      : UNMAPPED_CLIENT_SOURCE_FEATURE;

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
    source_feature: sourceFeature,
    user_id: guest.auth_user_id,
    organization_id: organizationId,
  });
  if (error) {
    return NextResponse.json({ error: "Failed to persist client error" }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
