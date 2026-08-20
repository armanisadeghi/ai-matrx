import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { isJsonObject } from "@/types/json";
import {
  classifyAcquisitionTraffic,
  describeAcquisitionClient,
} from "@/lib/product-analytics/user-acquisition";
import type {
  AdminUserAcquisitionRow,
  AdminUserUsageRow,
  AcquisitionIdentityState,
} from "@/features/admin/users/types";
import type { Database } from "@/types/database.types";

const PER_PAGE = 1000;
const MAX_PAGES = 50;
type GuestRow = Database["public"]["Tables"]["guest_executions"]["Row"];

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}

function acquisitionValue(
  row: GuestRow | undefined,
  key: string,
): string | null {
  if (!row || !isJsonObject(row.metadata)) return null;
  const acquisition = row.metadata.acquisition;
  if (!isJsonObject(acquisition)) return null;
  return typeof acquisition[key] === "string" ? acquisition[key] : null;
}

function ipString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function acquisitionUserId(row: GuestRow): string | null {
  if (!isJsonObject(row.metadata)) return null;
  return typeof row.metadata.acquisition_user_id === "string"
    ? row.metadata.acquisition_user_id
    : null;
}

function acquisitionGuestFingerprint(row: GuestRow): string | null {
  if (!isJsonObject(row.metadata)) return null;
  return typeof row.metadata.guest_fingerprint === "string"
    ? row.metadata.guest_fingerprint
    : null;
}

function hasAcquisition(row: GuestRow | undefined): row is GuestRow {
  return Boolean(row && acquisitionValue(row, "captured_at"));
}

function acquisitionReferrerState(
  row: GuestRow | undefined,
): AdminUserAcquisitionRow["referrer_state"] {
  const value = acquisitionValue(row, "referrer_state");
  return value === "external" ||
    value === "internal" ||
    value === "local_test" ||
    value === "direct_or_withheld"
    ? value
    : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (error) {
    return errorResponse(error);
  }

  const fromParam = request.nextUrl.searchParams.get("from");
  const from =
    fromParam && !Number.isNaN(Date.parse(fromParam)) ? fromParam : null;
  const admin = createAdminClient();

  type AuthUser = Awaited<
    ReturnType<typeof admin.auth.admin.listUsers>
  >["data"]["users"][number];
  const authUsers: AuthUser[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (error) return errorResponse(error);
    authUsers.push(...data.users);
    if (data.users.length < PER_PAGE) break;
  }

  const guests: GuestRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PER_PAGE;
    const { data, error } = await admin
      .from("guest_executions")
      .select("*")
      .order("created_at", { ascending: false })
      .range(start, start + PER_PAGE - 1);
    if (error) return errorResponse(error);
    guests.push(...data);
    if (data.length < PER_PAGE) break;
  }

  const { data: profiles, error: profilesError } = await admin
    .schema("users")
    .from("profiles")
    .select("id, display_name");
  if (profilesError) return errorResponse(profilesError);
  const displayNameById = new Map(
    profiles.map((profile) => [profile.id, profile.display_name]),
  );

  const { data: usageData, error: usageError } = await admin
    .schema("chat")
    .rpc("admin_user_usage_rollup", { p_from: undefined, p_to: undefined });
  if (usageError) return errorResponse(usageError);
  const usageById = new Map<string, AdminUserUsageRow>();
  for (const usage of usageData) {
    usageById.set(usage.user_id, usage);
  }

  const guestByUserId = new Map<string, GuestRow>();
  const guestByFingerprint = new Map<string, GuestRow>();
  const acquisitionByUserId = new Map<string, GuestRow>();
  const acquisitionByGuestFingerprint = new Map<string, GuestRow>();
  for (const guest of guests) {
    guestByFingerprint.set(guest.fingerprint, guest);
    if (guest.auth_user_id) guestByUserId.set(guest.auth_user_id, guest);
    if (guest.converted_to_user_id)
      guestByUserId.set(guest.converted_to_user_id, guest);
    const observedUserId = acquisitionUserId(guest);
    if (observedUserId) acquisitionByUserId.set(observedUserId, guest);
    const observedFingerprint = acquisitionGuestFingerprint(guest);
    if (observedFingerprint)
      acquisitionByGuestFingerprint.set(observedFingerprint, guest);
  }

  const includedGuestIds = new Set<string>();
  const rows: AdminUserAcquisitionRow[] = [];
  for (const user of authUsers) {
    const guest = guestByUserId.get(user.id);
    const acquisitionGuest =
      (hasAcquisition(guest) ? guest : undefined) ??
      acquisitionByUserId.get(user.id) ??
      (guest
        ? acquisitionByGuestFingerprint.get(guest.fingerprint)
        : undefined);
    const createdAt = user.created_at;
    const convertedAt = guest?.converted_at ?? null;
    if (from && createdAt < from && (!convertedAt || convertedAt < from))
      continue;
    if (guest) includedGuestIds.add(guest.id);
    if (acquisitionGuest) includedGuestIds.add(acquisitionGuest.id);

    const usage = usageById.get(user.id);
    const isAnonymous = user.is_anonymous === true;
    const state: AcquisitionIdentityState = isAnonymous
      ? "guest"
      : guest && (guest.converted_at || guest.converted_to_user_id)
        ? "converted"
        : "account";
    const userAgent = acquisitionGuest?.user_agent ?? guest?.user_agent ?? null;
    const displayName = displayNameById.get(user.id);
    rows.push({
      row_id: user.id,
      user_id: user.id,
      email: user.email ?? null,
      display_name:
        displayName?.trim() ||
        user.email ||
        `${isAnonymous ? "Guest" : "Account"} ${user.id.slice(0, 6)}`,
      identity_state: state,
      is_anonymous: isAnonymous,
      created_at: createdAt,
      converted_at: convertedAt,
      first_ai_activity: guest?.first_execution_at ?? null,
      last_ai_activity:
        usage?.last_activity ?? guest?.last_execution_at ?? null,
      total_requests: usage?.total_requests ?? 0,
      total_cost: usage?.total_cost ?? 0,
      landing_host: acquisitionValue(acquisitionGuest, "landing_host"),
      landing_path: acquisitionValue(acquisitionGuest, "landing_path"),
      referrer: acquisitionValue(acquisitionGuest, "referrer"),
      referrer_state: acquisitionReferrerState(acquisitionGuest),
      utm_source: acquisitionValue(acquisitionGuest, "utm_source"),
      utm_medium: acquisitionValue(acquisitionGuest, "utm_medium"),
      utm_campaign: acquisitionValue(acquisitionGuest, "utm_campaign"),
      utm_content: acquisitionValue(acquisitionGuest, "utm_content"),
      utm_term: acquisitionValue(acquisitionGuest, "utm_term"),
      first_touch_captured_at: acquisitionValue(
        acquisitionGuest,
        "captured_at",
      ),
      ip_address: ipString(acquisitionGuest?.ip_address ?? guest?.ip_address),
      user_agent: userAgent,
      traffic_kind: classifyAcquisitionTraffic(
        userAgent,
        acquisitionValue(acquisitionGuest, "referrer"),
        acquisitionValue(acquisitionGuest, "landing_host"),
      ),
      client_description: describeAcquisitionClient(userAgent),
      last_sign_in_at: user.last_sign_in_at ?? null,
    });
  }

  for (const guest of guests) {
    if (includedGuestIds.has(guest.id)) continue;
    const mappedFingerprint = acquisitionGuestFingerprint(guest);
    if (
      mappedFingerprint &&
      mappedFingerprint !== guest.fingerprint &&
      guestByFingerprint.has(mappedFingerprint)
    )
      continue;
    const acquisitionGuest =
      (hasAcquisition(guest) ? guest : undefined) ??
      acquisitionByGuestFingerprint.get(guest.fingerprint);
    if (acquisitionGuest) includedGuestIds.add(acquisitionGuest.id);
    const createdAt = guest.created_at ?? guest.first_execution_at;
    if (!createdAt || (from && createdAt < from)) continue;
    const userAgent = guest.user_agent;
    rows.push({
      row_id: `visitor:${guest.id}`,
      user_id: null,
      email: null,
      display_name: `Visitor ${guest.fingerprint.slice(0, 6)}`,
      identity_state: "visitor",
      is_anonymous: true,
      created_at: createdAt,
      converted_at: guest.converted_at,
      first_ai_activity: guest.first_execution_at,
      last_ai_activity: guest.last_execution_at,
      total_requests: 0,
      total_cost: 0,
      landing_host: acquisitionValue(acquisitionGuest, "landing_host"),
      landing_path: acquisitionValue(acquisitionGuest, "landing_path"),
      referrer: acquisitionValue(acquisitionGuest, "referrer"),
      referrer_state: acquisitionReferrerState(acquisitionGuest),
      utm_source: acquisitionValue(acquisitionGuest, "utm_source"),
      utm_medium: acquisitionValue(acquisitionGuest, "utm_medium"),
      utm_campaign: acquisitionValue(acquisitionGuest, "utm_campaign"),
      utm_content: acquisitionValue(acquisitionGuest, "utm_content"),
      utm_term: acquisitionValue(acquisitionGuest, "utm_term"),
      first_touch_captured_at: acquisitionValue(
        acquisitionGuest,
        "captured_at",
      ),
      ip_address: ipString(acquisitionGuest?.ip_address ?? guest.ip_address),
      user_agent: userAgent,
      traffic_kind: classifyAcquisitionTraffic(
        userAgent,
        acquisitionValue(acquisitionGuest, "referrer"),
        acquisitionValue(acquisitionGuest, "landing_host"),
      ),
      client_description: describeAcquisitionClient(userAgent),
      last_sign_in_at: null,
    });
  }

  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json({ rows });
}
