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
import { readAppPermissions } from "@/utils/userDataMapper";
import { TOP_TIER_MODELS_PERMISSION } from "@/features/ai-models/topTierAccess";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { ONBOARDING_METADATA_KEY } from "@/utils/onboarding";
import type { AdminUserRow } from "@/features/admin/users/types";
import type { Database } from "@/types/database.types";
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
import {
  toAdminUserPlan,
  type AccountPlanRow,
  type AccountPointsRow,
} from "@/features/admin/users/lib/accountPlan";

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

type AccountFactsRow =
  Database["users"]["Functions"]["admin_account_facts"]["Returns"][number];

interface GuestSignal {
  userAgent: string | null;
  landingHost: string | null;
  landingPath: string | null;
  referrer: string | null;
  referrerState: string | null;
  utmSource: string | null;
}

/**
 * Everything that says who an account is and how far it got, one row per
 * account, computed by the database in one pass (users.admin_account_facts):
 * AI requests from the runtime spine (all-time, 7d, active days), settled AI
 * cost, and the first browser + first touch from users.guest_executions.
 * Replaced three reads (8 guest-row slices + the usage rollup twice, ~5 s)
 * with one ~0.5 s call on 2026-09-30.
 */
function readAccountFacts(admin: AdminClient): Promise<AccountFactsRow[]> {
  return readAllRows<AccountFactsRow>(
    ({ from, to }) =>
      admin
        .schema("users")
        .rpc("admin_account_facts", undefined, { count: "exact" })
        .order("user_id")
        .range(from, to),
    { label: "users.admin_account_facts" },
  );
}

/**
 * Each account's effective plan and AI-points usage state, one pass
 * (users.admin_account_plans: billing.user_effective_plan +
 * billing._points_usage_state, ~0.65 s for ~570 accounts on 2026-10-03).
 */
function readAccountPlans(admin: AdminClient): Promise<AccountPlanRow[]> {
  return readAllRows<AccountPlanRow>(
    ({ from, to }) =>
      admin
        .schema("users")
        .rpc("admin_account_plans", undefined, { count: "exact" })
        .order("user_id")
        .range(from, to),
    { label: "users.admin_account_plans" },
  );
}

/**
 * The Enterprise organization each person's allowance comes from, and their
 * AI points this month + latest spend (users.admin_account_points, one pass;
 * only accounts with either fact have a row).
 */
function readAccountPoints(admin: AdminClient): Promise<AccountPointsRow[]> {
  return readAllRows<AccountPointsRow>(
    ({ from, to }) =>
      admin
        .schema("users")
        .rpc("admin_account_points", undefined, { count: "exact" })
        .order("user_id")
        .range(from, to),
    { label: "users.admin_account_points" },
  );
}

function acquisitionText(
  acquisition: AccountFactsRow["acquisition"],
  key: string,
): string | null {
  if (!isJsonObject(acquisition)) return null;
  const value = acquisition[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function signalOf(facts: AccountFactsRow | undefined): GuestSignal | null {
  if (!facts || (!facts.user_agent && !facts.acquisition)) return null;
  return {
    userAgent: facts.user_agent,
    landingHost: acquisitionText(facts.acquisition, "landing_host"),
    landingPath: acquisitionText(facts.acquisition, "landing_path"),
    referrer: acquisitionText(facts.acquisition, "referrer"),
    referrerState: acquisitionText(facts.acquisition, "referrer_state"),
    utmSource: acquisitionText(facts.acquisition, "utm_source"),
  };
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
  // 2b. The facts that say who an account is and how far it got.
  let profiles: ProfileRow[];
  let facts: AccountFactsRow[];
  let parties: { id: string; claimed_by: string | null }[];
  let erasedRows: { user_id: string }[];
  try {
    [profiles, facts, parties, erasedRows] = await Promise.all([
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
      readAccountFacts(admin),
      readAllRows<{ id: string; claimed_by: string | null }>(
        ({ from, to }) => admin.schema("crm").from("party")
          .select("id, claimed_by", { count: "exact" })
          .eq("organization_id", "5dc930e9-bd65-44a1-8369-af773f6e1a5b")
          .not("claimed_by", "is", null).is("deleted_at", null).is("canonical_id", null)
          .order("id").range(from, to),
        { label: "crm.party (signed-up user identity)" },
      ),
      readAllRows<{ user_id: string }>(
        ({ from, to }) => admin.schema("iam").from("account_closure")
          .select("user_id", { count: "exact" })
          .not("erased_at", "is", null).order("user_id").range(from, to),
        { label: "iam.account_closure (erased accounts)" },
      ),
    ]);
  } catch (error) {
    return NextResponse.json(
      { error: extractErrorMessage(error, "Failed to read account signals") },
      { status: 500 },
    );
  }
  // The plan column is read separately so its failure is reported, not fatal:
  // the roster still loads and `plans_error` says why the column is empty.
  let plansError: string | null = null;
  const planById = new Map<string, AccountPlanRow>();
  const pointsById = new Map<string, AccountPointsRow>();
  try {
    const [planRows, pointRows] = await Promise.all([
      readAccountPlans(admin),
      readAccountPoints(admin),
    ]);
    for (const row of planRows) planById.set(row.user_id, row);
    for (const row of pointRows) pointsById.set(row.user_id, row);
  } catch (error) {
    plansError = extractErrorMessage(error, "Failed to read account plans");
  }
  const erasedIds = new Set(erasedRows.map((r) => r.user_id));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const factsById = new Map(facts.map((f) => [f.user_id, f]));
  const partiesByUser = new Map<string, string[]>();
  for (const party of parties) if (party.claimed_by) {
    partiesByUser.set(party.claimed_by, [...(partiesByUser.get(party.claimed_by) ?? []), party.id]);
  }

  // 3. Organization memberships — canonical iam.organization_member view,
  // joined here so the account roster shows the user's organizations without
  // inventing a second membership query path.
  const organizationDirectory = await loadAdminOrganizationDirectory("all");
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
    const fact = factsById.get(u.id);
    const planRow = planById.get(u.id);
    const signal = signalOf(fact);
    const aiRequests = Number(fact?.ai_requests ?? 0);
    const aiRequests7d = Number(fact?.ai_requests_7d ?? 0);
    const testFixture = isJsonObject(appMeta.test_fixture)
      ? appMeta.test_fixture
      : null;
    const segment = classifyPerson({
      email: u.email ?? null,
      testFixtureSuite:
        typeof testFixture?.suite === "string" ? testFixture.suite : null,
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
      erased: erasedIds.has(u.id),
      admin_level: adminLevel,
      mcp_full_access: hasMcpFullAccessPermission(appMeta),
      top_tier_models: readAppPermissions(appMeta).includes(TOP_TIER_MODELS_PERMISSION),
      onboarding_completed: meta[ONBOARDING_METADATA_KEY] === true,
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      organizations: organizationsByUserId.get(u.id) ?? [],
      party_id: partiesByUser.get(u.id)?.length === 1 ? partiesByUser.get(u.id)?.[0] ?? null : null,
      party_integrity: u.is_anonymous ? "anonymous" : partiesByUser.get(u.id)?.length === 1 ? "resolved" : partiesByUser.get(u.id)?.length ? "ambiguous" : "missing",
      kind: segment.kind,
      kind_reason: segment.kindReason,
      stage: segment.stage,
      ai_requests: aiRequests,
      ai_requests_7d: aiRequests7d,
      ai_active_days: Number(fact?.ai_active_days ?? 0),
      ai_cost: Number(fact?.ai_cost ?? 0),
      first_ai_activity: fact?.first_ai_at ?? null,
      last_ai_activity: fact?.last_ai_at ?? null,
      client: signal?.userAgent
        ? describeAcquisitionClient(signal.userAgent)
        : null,
      source: signal ? describeSource(signal) : null,
      landing: signal?.landingPath
        ? `${signal.landingHost ?? ""}${signal.landingPath}`
        : null,
      plan: planRow ? toAdminUserPlan(planRow, pointsById.get(u.id)) : null,
    };
  });

  return NextResponse.json({ users: rows, plans_error: plansError });
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
