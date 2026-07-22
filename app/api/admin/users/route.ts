// Super-Admin-only user listing + onboarding-flag management.
//
// Reads the full auth.users roster via the service-key admin client (RLS
// bypass) and exposes the per-user onboarding flag stored on
// user_metadata.onboarding_completed.
//
// Defense: requireSuperAdmin() gates every method. The admin client is
// server-only (SUPABASE_SECRET_KEY) and never reaches the browser.

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { ONBOARDING_METADATA_KEY } from "@/utils/onboarding";
import type { AdminUserRow } from "@/features/admin/users/types";
import { loadAdminOrganizationDirectory } from "@/features/admin/users/server/organizationMembershipAdmin";

const PER_PAGE = 1000;
const MAX_PAGES = 50; // hard ceiling: 50k users

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 400;
  return NextResponse.json({ error: message }, { status });
}

function metaString(
  meta: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    if (typeof meta[k] === "string" && (meta[k] as string).trim())
      return meta[k] as string;
  }
  return null;
}

// GET /api/admin/users — the FULL roster: auth facts + profile (display name /
// avatar) + admin level. An admin surface must not hide data, so we surface
// every useful field, one value per column.
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const admin = createAdminClient();

  // 1. auth roster (paginated)
  type AuthUser = Awaited<
    ReturnType<typeof admin.auth.admin.listUsers>
  >["data"]["users"][number];
  const authUsers: AuthUser[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    const users = data?.users ?? [];
    authUsers.push(...users);
    if (users.length < PER_PAGE) break;
  }

  // 2. profiles (display name / avatar) — users.profiles is one row per user.
  const { data: profiles } = await admin
    .schema("users")
    .from("profiles")
    .select("id, display_name, avatar_url, is_online, last_seen_at");
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );

  // 3. Organization memberships — canonical iam.organization_member view,
  // joined here so the account roster shows the user's organizations without
  // inventing a second membership query path.
  const organizationDirectory = await loadAdminOrganizationDirectory();
  const organizationById = new Map(
    organizationDirectory.organizations.map((organization) => [
      organization.id,
      organization,
    ]),
  );
  const organizationsByUserId = new Map<
    string,
    AdminUserRow["organizations"]
  >();
  for (const membership of organizationDirectory.memberships) {
    const organization = organizationById.get(membership.organization_id);
    if (!organization) continue;
    const userOrganizations =
      organizationsByUserId.get(membership.user_id) ?? [];
    userOrganizations.push({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: membership.role,
      is_personal: organization.is_personal,
      is_system: organization.is_system,
    });
    organizationsByUserId.set(membership.user_id, userOrganizations);
  }

  // 4. admin levels — admin_list() runs SECURITY DEFINER gated on the caller's
  // super-admin session, so call it with the session client (auth.uid()), not
  // the service-role client (which has no uid).
  const session = await createClient();
  const { data: admins } = await session.rpc("admin_list");
  const levelByUser = new Map(
    (admins ?? []).map((a: { user_id: string; level: string }) => [
      a.user_id,
      a.level,
    ]),
  );

  const rows: AdminUserRow[] = authUsers.map((u) => {
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
    const profile = profileById.get(u.id);
    const providers = Array.isArray(appMeta.providers)
      ? (appMeta.providers as string[])
      : typeof appMeta.provider === "string"
        ? [appMeta.provider as string]
        : [];
    return {
      id: u.id,
      email: u.email ?? null,
      display_name:
        (profile?.display_name as string | null) ??
        metaString(meta, "full_name", "name"),
      full_name: metaString(meta, "full_name", "name"),
      avatar_url: (profile?.avatar_url as string | null) ?? null,
      phone: u.phone ?? null,
      providers,
      email_confirmed: Boolean(u.email_confirmed_at),
      phone_confirmed: Boolean(u.phone_confirmed_at),
      is_anonymous: Boolean(u.is_anonymous),
      banned: Boolean(
        (u as { banned_until?: string | null }).banned_until &&
          new Date((u as { banned_until: string }).banned_until) > new Date(),
      ),
      admin_level: levelByUser.get(u.id) ?? null,
      onboarding_completed: meta[ONBOARDING_METADATA_KEY] === true,
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      organizations: organizationsByUserId.get(u.id) ?? [],
    };
  });

  return NextResponse.json({ users: rows });
}

// PATCH /api/admin/users — flip a user's onboarding flag.
// Body: { userId: string, onboardingCompleted: boolean }
export async function PATCH(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const body = (await request.json().catch(() => null)) as {
    userId?: string;
    onboardingCompleted?: boolean;
  } | null;

  if (!body?.userId || typeof body.onboardingCompleted !== "boolean") {
    return NextResponse.json(
      { error: "userId and boolean onboardingCompleted are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Merge into existing metadata so we don't clobber other keys.
  const { data: existing, error: fetchError } =
    await admin.auth.admin.getUserById(body.userId);
  if (fetchError || !existing?.user) {
    return NextResponse.json(
      { error: fetchError?.message ?? "User not found" },
      { status: 404 },
    );
  }

  const mergedMetadata = {
    ...(existing.user.user_metadata ?? {}),
    [ONBOARDING_METADATA_KEY]: body.onboardingCompleted,
  };

  const { error: updateError } = await admin.auth.admin.updateUserById(
    body.userId,
    { user_metadata: mergedMetadata },
  );
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    userId: body.userId,
    onboarding_completed: body.onboardingCompleted,
  });
}
