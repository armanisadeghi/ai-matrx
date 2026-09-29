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

type AdminClient = ReturnType<typeof createAdminClient>;

async function resolveGuestOrganization(
  admin: AdminClient,
  authUserId: string | null,
): Promise<{ organizationId: string; organizationNote: string | null }> {
  if (!authUserId) {
    return {
      // org-fallback-deliberate: no guest account exists yet, so the platform's own error ledger is the only owner.
      organizationId: await resolveSystemOrgId(admin),
      organizationNote:
        "No guest account exists yet for this fingerprint, so the row is filed under the system organization.",
    };
  }
  const { data, error } = await admin
    .schema("iam")
    .from("memberships")
    .select("container_id")
    .eq("user_id", authUserId)
    .eq("container_type", "organization")
    .eq("status", "active")
    .is("deleted_at", null);
  const orgIds = [...new Set((data ?? []).map((row) => row.container_id).filter(Boolean))];
  if (!error && orgIds.length === 1) {
    return { organizationId: orgIds[0] as string, organizationNote: null };
  }
  const note = error
    ? `The guest's organization could not be read (${error.message}); filed under the system organization.`
    : `Signup defect: guest ${authUserId} has ${orgIds.length} active organization memberships (every account gets exactly one at signup). Remedy: select iam.provision_signup_organization('${authUserId}'); and fix what made signup skip it. Filed under the system organization.`;
  console.error(`[client-error] ${note}`);
  // org-fallback-deliberate: a signup defect left no single guest organization; the row names it (above).
  return { organizationId: await resolveSystemOrgId(admin), organizationNote: note };
}

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

  // THE GUEST'S OWN ORGANIZATION. Every account gets exactly one organization
  // at signup, a guest included (migrations/guests_get_their_organization_at_signup.sql),
  // so the row is filed where the guest acts — its ONE active membership, read,
  // never chosen. The system organization is used only when there is no guest
  // identity at all yet (the fingerprint was recorded before the server minted
  // its auth user), or when signup left the guest with zero or several
  // memberships — a signup defect, which the row itself names so it is fixed,
  // never absorbed.
  const { organizationId, organizationNote } = await resolveGuestOrganization(
    admin,
    guest.auth_user_id,
  );
  // An unregistered slug is never stored: a client that sends one is telling us
  // its map is wrong, and a wrong feature is harder to notice than a missing one.
  const sourceFeature =
    parsed.data.source_feature && isSourceFeature(parsed.data.source_feature)
      ? parsed.data.source_feature
      : UNMAPPED_CLIENT_SOURCE_FEATURE;

  const { error } = await admin.schema("ops")// ops.system_error has ONE write door (access ladder T-35f/g): it owns the row by the
      // system organization and keeps organization_id as where the error happened.
      .rpc("record_system_error", { p_error: {
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
      ...(organizationNote ? { organization_note: organizationNote } : {}),
    },
    source_app: "matrx-frontend",
    source_feature: sourceFeature,
    user_id: guest.auth_user_id,
    organization_id: organizationId,
  } });
  if (error) {
    return NextResponse.json({ error: "Failed to persist client error" }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
