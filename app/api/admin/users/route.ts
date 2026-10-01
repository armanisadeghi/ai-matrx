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
import { isJsonObject } from "@/types/json";
import {
  hasMcpFullAccessPermission,
  withMcpFullAccessPermission,
} from "@/features/admin/users/lib/mcp-access";
import { extractErrorMessage } from "@/utils/errors";
import { readAllRows } from "@ai-matrx/data/db";
import { classifyPerson } from "@/features/admin/users/lib/personSegments";
import { describeAcquisitionClient } from "@/lib/product-analytics/user-acquisition";

const PER_PAGE = 1000;
const MAX_PAGES = 50; // hard ceiling: 50k users

function errorResponse(error: unknown) {
  const message = extractErrorMessage(error, "Unknown error");
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

type AdminClient = ReturnType<typeof createAdminClient>;

interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface GuestSignalRow {
  id: string;
  auth_user_id: string | null;
  converted_to_user_id: string | null;
  user_agent: string | null;
  created_at: string | null;
  acquisition: Record<string, unknown> | null;
  acquisition_user_id: string | null;
}

interface UsageRollupRow {
  user_id: string;
  total_requests: number;
  total_cost: number;
  last_activity: string | null;
}

interface GuestSignal {
  userAgent: string | null;
  landingHost: string | null;
  landingPath: string | null;
  referrer: string | null;
  referrerState: string | null;
  utmSource: string | null;
}

/**
 * Every guest row that names an account. Script clients write a first-touch
 * row per request (one test account held thousands on 2026-09-30), so this is
 * ~8k rows; read one page at a time it took 5 s. The id space is cut into
 * eight disjoint slices, each read to completion in parallel — same rows,
 * same completeness proof, an eighth of the wall time.
 */
const UUID_SLICE_BOUNDS = ["0", "2", "4", "6", "8", "a", "c", "e"].map(
  (digit) => `${digit}0000000-0000-0000-0000-000000000000`,
);

async function readGuestSignalRows(
  admin: AdminClient,
): Promise<GuestSignalRow[]> {
  const slices = await Promise.all(
    UUID_SLICE_BOUNDS.map((lower, index) => {
      const upper = UUID_SLICE_BOUNDS[index + 1];
      return readAllRows<GuestSignalRow>(
        ({ from, to }) => {
          let query = admin
            .schema("users")
            .from("guest_executions")
            .select(
              "id, auth_user_id, converted_to_user_id, user_agent, created_at, acquisition:metadata->acquisition, acquisition_user_id:metadata->>acquisition_user_id",
              { count: "exact" },
            )
            .or(
              "auth_user_id.not.is.null,converted_to_user_id.not.is.null,metadata->>acquisition_user_id.not.is.null",
            )
            .gte("id", lower);
          if (upper) query = query.lt("id", upper);
          return query
            .order("id")
            .range(from, to)
            .overrideTypes<GuestSignalRow[], { merge: false }>();
        },
        { label: `users.guest_executions (admin roster signals, slice ${index})` },
      );
    }),
  );
  return slices.flat();
}

function readUsageRollup(
  admin: AdminClient,
  from: string | null,
): Promise<UsageRollupRow[]> {
  return readAllRows<UsageRollupRow>(
    ({ from: start, to }) =>
      admin
        .schema("chat")
        .rpc(
          "admin_user_usage_rollup",
          { p_from: from ?? undefined, p_to: undefined },
          { count: "exact" },
        )
        .select("user_id, total_requests, total_cost, last_activity")
        .order("user_id")
        .range(start, to),
    { label: `chat.admin_user_usage_rollup (${from ? "7d" : "all-time"})` },
  );
}

function acquisitionText(
  row: GuestSignalRow,
  key: string,
): string | null {
  const value = row.acquisition?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * One signal per account: the EARLIEST row that captured a first touch wins
 * (it is where the person arrived from); otherwise the earliest linked guest
 * row still supplies the browser. Later rows never overwrite the first touch.
 */
function indexGuestSignals(rows: GuestSignalRow[]): Map<string, GuestSignal> {
  const sorted = [...rows].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
  const byUser = new Map<string, { signal: GuestSignal; hasTouch: boolean }>();
  for (const row of sorted) {
    const hasTouch = Boolean(acquisitionText(row, "captured_at"));
    const signal: GuestSignal = {
      userAgent: row.user_agent,
      landingHost: acquisitionText(row, "landing_host"),
      landingPath: acquisitionText(row, "landing_path"),
      referrer: acquisitionText(row, "referrer"),
      referrerState: acquisitionText(row, "referrer_state"),
      utmSource: acquisitionText(row, "utm_source"),
    };
    const ids = new Set(
      [row.auth_user_id, row.converted_to_user_id, row.acquisition_user_id]
        .filter((id): id is string => Boolean(id)),
    );
    for (const id of ids) {
      const current = byUser.get(id);
      if (!current || (hasTouch && !current.hasTouch)) {
        byUser.set(id, {
          signal: {
            ...signal,
            userAgent: signal.userAgent ?? current?.signal.userAgent ?? null,
          },
          hasTouch,
        });
      } else if (!current.signal.userAgent && signal.userAgent) {
        current.signal.userAgent = signal.userAgent;
      }
    }
  }
  return new Map([...byUser].map(([id, entry]) => [id, entry.signal]));
}

/** Where the account first came from, as one short label. */
function describeSource(signal: GuestSignal): string | null {
  if (signal.utmSource) return signal.utmSource;
  if (signal.referrerState === "external" && signal.referrer) {
    try {
      return new URL(signal.referrer).hostname.replace(/^www\./, "");
    } catch {
      return signal.referrer;
    }
  }
  if (signal.referrerState === "direct_or_withheld") return "Direct";
  if (signal.referrerState === "internal") return "Internal link";
  if (signal.referrerState === "local_test") return "Local preview";
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
  // Paged to completion: a bare select stops at 1000 rows, and every account
  // past that printed as its UUID even when it had a name.
  // 2b. The facts that say who an account is and how far it got: the first
  // browser we saw for it (users.guest_executions) and its AI usage, all-time
  // and for the last 7 days (chat.admin_user_usage_rollup).
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let profiles: ProfileRow[];
  let guestRows: GuestSignalRow[];
  let usageAll: UsageRollupRow[];
  let usageWeek: UsageRollupRow[];
  try {
    [profiles, guestRows, usageAll, usageWeek] = await Promise.all([
      readAllRows<ProfileRow>(
        ({ from, to }) =>
          admin
            .schema("users")
            .from("profiles")
            .select("id, display_name, avatar_url", { count: "exact" })
            .order("id")
            .range(from, to),
        { label: "users.profiles (admin roster)" },
      ),
      readGuestSignalRows(admin),
      readUsageRollup(admin, null),
      readUsageRollup(admin, weekAgo),
    ]);
  } catch (error) {
    return NextResponse.json(
      { error: extractErrorMessage(error, "Failed to read account signals") },
      { status: 500 },
    );
  }
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const usageAllById = new Map(usageAll.map((u) => [u.user_id, u]));
  const usageWeekById = new Map(usageWeek.map((u) => [u.user_id, u]));
  const signalsByUserId = indexGuestSignals(guestRows);

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
      abbreviation: organization.abbreviation,
      slug: organization.slug,
      role: membership.role,
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
    // Supabase types both metadata bags as `UserMetadata` (an index signature
    // over `any`) — narrow at ingress with the runtime guard instead of
    // asserting a shape we have not checked.
    const meta = isJsonObject(u.user_metadata) ? u.user_metadata : {};
    const appMeta = isJsonObject(u.app_metadata) ? u.app_metadata : {};
    const profile = profileById.get(u.id);
    const providers = Array.isArray(appMeta.providers)
      ? appMeta.providers.filter((p): p is string => typeof p === "string")
      : typeof appMeta.provider === "string"
        ? [appMeta.provider]
        : [];
    const adminLevel = levelByUser.get(u.id) ?? null;
    const signal = signalsByUserId.get(u.id);
    const usage = usageAllById.get(u.id);
    const aiRequests = Number(usage?.total_requests ?? 0);
    const aiRequests7d = Number(usageWeekById.get(u.id)?.total_requests ?? 0);
    const segment = classifyPerson({
      email: u.email ?? null,
      isAnonymous: Boolean(u.is_anonymous),
      adminLevel,
      emailConfirmed: Boolean(u.email_confirmed_at),
      lastSignInAt: u.last_sign_in_at ?? null,
      userAgent: signal?.userAgent ?? null,
      landingHost: signal?.landingHost ?? null,
      referrer: signal?.referrer ?? null,
      referrerState: signal?.referrerState ?? null,
      aiRequests,
      aiRequests7d,
    });
    return {
      id: u.id,
      email: u.email ?? null,
      display_name:
        profile?.display_name ?? metaString(meta, "full_name", "name"),
      full_name: metaString(meta, "full_name", "name"),
      avatar_url: profile?.avatar_url ?? null,
      phone: u.phone ?? null,
      providers,
      email_confirmed: Boolean(u.email_confirmed_at),
      phone_confirmed: Boolean(u.phone_confirmed_at),
      is_anonymous: Boolean(u.is_anonymous),
      banned: Boolean(
        (u as { banned_until?: string | null }).banned_until &&
          new Date((u as { banned_until: string }).banned_until) > new Date(),
      ),
      admin_level: adminLevel,
      mcp_full_access: hasMcpFullAccessPermission(appMeta),
      onboarding_completed: meta[ONBOARDING_METADATA_KEY] === true,
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      organizations: organizationsByUserId.get(u.id) ?? [],
      kind: segment.kind,
      kind_reason: segment.kindReason,
      stage: segment.stage,
      ai_requests: aiRequests,
      ai_requests_7d: aiRequests7d,
      ai_cost: Number(usage?.total_cost ?? 0),
      last_ai_activity: usage?.last_activity ?? null,
      client: signal?.userAgent
        ? describeAcquisitionClient(signal.userAgent)
        : null,
      source: signal ? describeSource(signal) : null,
      landing: signal?.landingPath
        ? `${signal.landingHost ?? ""}${signal.landingPath}`
        : null,
    };
  });

  return NextResponse.json({ users: rows });
}

// PATCH /api/admin/users — update server-managed account controls.
// Body: { userId: string, onboardingCompleted?: boolean, mcpFullAccess?: boolean }
export async function PATCH(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const body = (await request.json().catch(() => null)) as {
    userId?: string;
    onboardingCompleted?: boolean;
    mcpFullAccess?: boolean;
  } | null;

  const onboardingSupplied = typeof body?.onboardingCompleted === "boolean";
  const mcpAccessSupplied = typeof body?.mcpFullAccess === "boolean";
  if (!body?.userId || (!onboardingSupplied && !mcpAccessSupplied)) {
    return NextResponse.json(
      {
        error:
          "userId and at least one boolean account control are required",
      },
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

  const update: {
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  } = {};
  if (onboardingSupplied) {
    update.user_metadata = {
      ...(existing.user.user_metadata ?? {}),
      [ONBOARDING_METADATA_KEY]: body.onboardingCompleted,
    };
  }
  if (mcpAccessSupplied) {
    const appMetadata = isJsonObject(existing.user.app_metadata)
      ? existing.user.app_metadata
      : {};
    update.app_metadata = withMcpFullAccessPermission(
      appMetadata,
      body.mcpFullAccess === true,
    );
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(
    body.userId,
    update,
  );
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    userId: body.userId,
    ...(onboardingSupplied
      ? { onboarding_completed: body.onboardingCompleted }
      : {}),
    ...(mcpAccessSupplied ? { mcp_full_access: body.mcpFullAccess } : {}),
  });
}
