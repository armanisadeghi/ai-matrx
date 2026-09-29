/**
 * Org-admin user-management service — the single client-side chokepoint for the
 * public.org_admin_* RPC family. Every call is RLS/authorization-enforced in the DB
 * (public.is_org_admin gate inside each SECURITY DEFINER RPC); this layer only maps
 * the wire shapes to the domain types in ./types.
 *
 * Canonical path: React → supabase-js .rpc() → Postgres. No Next.js API hop, no Python.
 */
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { isJsonObject } from "@/types/json";
import type { OrgRole } from "../types";
import type {
  OrgAdminAuditEntry,
  OrgAdminMember,
  OrgAdminMemberDetail,
  OrgAdminOverview,
  OrgMemberControlsInput,
  OrgMemberResource,
  OrgMemberStatus,
} from "./types";

function asRecord(data: unknown): Record<string, unknown> {
  return isJsonObject(data) ? data : {};
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapMember(row: Record<string, unknown>): OrgAdminMember {
  return {
    userId: row.user_id as string,
    email: (row.email as string) ?? null,
    displayName: (row.display_name as string) ?? null,
    avatarUrl: (row.avatar_url as string) ?? null,
    role: (row.role as OrgRole) ?? "member",
    joinedAt: (row.joined_at as string) ?? null,
    status: ((row.status as string) ?? "active") as OrgMemberStatus,
    memberLevel: (row.member_level as string) ?? null,
    tierOverride: (row.tier_override as string) ?? null,
    storageCapBytes: row.storage_cap_bytes == null ? null : num(row.storage_cap_bytes),
    monthlyBudgetMcents: row.monthly_budget_mcents == null ? null : num(row.monthly_budget_mcents),
    orgFilesCount: num(row.org_files_count),
    orgBytesUsed: num(row.org_bytes_used),
    accountBytesUsed: num(row.account_bytes_used),
    accountFilesCount: num(row.account_files_count),
    lastOrgActivityAt: (row.last_org_activity_at as string) ?? null,
    lastRequestAt: (row.last_request_at as string) ?? null,
    cost24hMcents: num(row.cost_24h_mcents),
    requests24h: num(row.requests_24h),
    requests6h: num(row.requests_6h),
    notes: (row.notes as string) ?? null,
  };
}

function mapResource(row: Record<string, unknown>): OrgMemberResource {
  return {
    resourceType: row.resource_type as string,
    displayLabel: (row.display_label as string) ?? (row.resource_type as string),
    schemaName: (row.schema_name as string) ?? "public",
    tableName: row.table_name as string,
    count: num(row.count),
  };
}

/** Roster: every member + org-scoped metrics. */
export async function listOrgMembers(orgId: string): Promise<OrgAdminMember[]> {
  const { data, error } = await supabase.rpc("org_admin_list_members", { p_org_id: orgId });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => mapMember(r as Record<string, unknown>));
}

/** Org-wide aggregate snapshot. */
export async function getOrgOverview(orgId: string): Promise<OrgAdminOverview> {
  const { data, error } = await supabase.rpc("org_admin_overview", { p_org_id: orgId });
  if (error) throw pgErrorToError(error);
  const o = asRecord(data);
  return {
    totalMembers: num(o.total_members),
    admins: num(o.admins),
    suspended: num(o.suspended),
    active7d: num(o.active_7d),
    active30d: num(o.active_30d),
    neverActive: num(o.never_active),
    orgBytesUsed: num(o.org_bytes_used),
    orgFilesCount: num(o.org_files_count),
    cost24hMcents: num(o.cost_24h_mcents),
    requests24h: num(o.requests_24h),
  };
}

/** Single member detail (roster row + resource breakdown). */
export async function getOrgMember(orgId: string, userId: string): Promise<OrgAdminMemberDetail> {
  const { data, error } = await supabase.rpc("org_admin_get_member", {
    p_org_id: orgId,
    p_user_id: userId,
  });
  if (error) throw pgErrorToError(error);
  const row = asRecord(data);
  if (!row.user_id) {
    throw recordUnavailable({
      entity: "member",
      reason: "unknown",
      recordId: userId,
      relation: "org_admin_get_member",
    });
  }
  const resources = Array.isArray(row.resources)
    ? (row.resources as Record<string, unknown>[]).map(mapResource)
    : [];
  return { ...mapMember(row), resources };
}

/** Count a member's org-scoped resources by type. */
export async function listMemberResources(
  orgId: string,
  userId: string,
): Promise<OrgMemberResource[]> {
  const { data, error } = await supabase.rpc("org_admin_list_member_resources", {
    p_org_id: orgId,
    p_user_id: userId,
  });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => mapResource(r as Record<string, unknown>));
}

/** Save the editable controls for a member. Pass the full desired set (null clears a field). */
export async function setMemberControls(
  orgId: string,
  userId: string,
  controls: OrgMemberControlsInput,
): Promise<void> {
  const { error } = await supabase.rpc("org_admin_set_member_controls", {
    p_org_id: orgId,
    p_user_id: userId,
    p_member_level: controls.memberLevel ?? undefined,
    p_tier_override: controls.tierOverride ?? undefined,
    p_storage_cap_bytes: controls.storageCapBytes ?? undefined,
    p_monthly_budget_mcents: controls.monthlyBudgetMcents ?? undefined,
    p_notes: controls.notes ?? undefined,
  });
  if (error) throw pgErrorToError(error);
}

/** Suspend or reactivate a member. */
export async function setMemberStatus(
  orgId: string,
  userId: string,
  status: OrgMemberStatus,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc("org_admin_set_member_status", {
    p_org_id: orgId,
    p_user_id: userId,
    p_status: status,
    p_reason: reason ?? undefined,
  });
  if (error) throw pgErrorToError(error);
}

/**
 * Remove a member from the organization.
 *
 * 🚨 DD-140 (2026-09-12): this used to take a `reassignTo` argument that made the server rewrite
 * the owner column of every shareable registered table — private conversations, DMs, HR records —
 * with no check that the recipient was not the caller. Both that argument and the standalone
 * `org_admin_reassign_member_resources` RPC are closed; the server refuses a non-null
 * `p_reassign_to` with a sentence naming the audited door that replaces it. A departing member's
 * resources keep their owner.
 */
export async function removeMember(
  orgId: string,
  userId: string,
): Promise<{ removed: boolean }> {
  const { data, error } = await supabase.rpc("org_admin_remove_member", {
    p_org_id: orgId,
    p_user_id: userId,
  });
  if (error) throw pgErrorToError(error);
  const out = asRecord(data);
  return { removed: Boolean(out.removed) };
}

/** One registered reason a take-over may be done for (`platform.categories`, dimension access_purpose). */
export interface TakeOverPurpose {
  slug: string;
  label: string;
}

/** The registered take-over reasons, straight from the one list the database checks against. */
export async function listTakeOverPurposes(): Promise<TakeOverPurpose[]> {
  const { data, error } = await supabase
    .schema("platform")
    .from("categories")
    .select("slug, name")
    .eq("dimension", "access_purpose")
    .is("deleted_at", null)
    .order("slug");
  if (error) throw pgErrorToError(error);
  return (data ?? []).flatMap((r) =>
    r.slug ? [{ slug: r.slug, label: r.name ?? r.slug }] : [],
  );
}

export type TakeOverResult =
  | { takenOver: true; email: string | null; message: string }
  | { takenOver: false; reason: string; message: string };

/**
 * Take over a member's account (ACCESS LADDER T-16) — the ONLY way an organization owner or admin
 * reaches a member's private data. Google Workspace / Microsoft 365 model: the person is signed out
 * everywhere, every other way in is closed, the admin sets a new password, the written reason is
 * sent to the person and recorded on their own access log and this organization's log. Only for an
 * account this organization alone holds. Every refusal is recorded too and comes back as
 * `takenOver: false` with the database's own sentence.
 */
export async function takeOverAccount(args: {
  orgId: string;
  userId: string;
  purpose: string;
  reason: string;
  newPassword: string;
}): Promise<TakeOverResult> {
  const { data, error } = await supabase.rpc("org_admin_take_over_account", {
    p_org_id: args.orgId,
    p_user_id: args.userId,
    p_purpose: args.purpose,
    p_reason: args.reason,
    p_new_password: args.newPassword,
  });
  if (error) throw pgErrorToError(error);
  const out = asRecord(data);
  const message = typeof out.message === "string" ? out.message : "";
  if (out.taken_over === true) {
    return {
      takenOver: true,
      email: typeof out.email === "string" ? out.email : null,
      message,
    };
  }
  return {
    takenOver: false,
    reason: typeof out.reason === "string" ? out.reason : "refused",
    message: message || "The take-over was refused.",
  };
}

/** One kind of record an org-scoped take-over would move, with how many. */
export interface TakeOverRecordCount {
  token: string;
  label: string;
  dataClass: string;
  count: number;
}

/**
 * Which take-over applies to this member (ACCESS LADDER T-16d), read from the database:
 * `account` — they belong to this organization alone, so the whole account can be taken over;
 * `records` — they also belong to other organizations, so only their records HERE can be moved.
 * Never names their other organizations.
 */
export interface TakeOverOptions {
  mode: "account" | "records";
  records: TakeOverRecordCount[];
  total: number;
}

export async function getTakeOverOptions(orgId: string, userId: string): Promise<TakeOverOptions> {
  const { data, error } = await supabase.rpc("org_admin_take_over_options", {
    p_org_id: orgId,
    p_user_id: userId,
  });
  if (error) throw pgErrorToError(error);
  const out = asRecord(data);
  const rows = Array.isArray(out.records) ? out.records : [];
  return {
    mode: out.mode === "account" ? "account" : "records",
    records: rows.flatMap((r) => {
      const o = asRecord(r);
      return typeof o.token === "string"
        ? [
            {
              token: o.token,
              label: typeof o.label === "string" ? o.label : o.token,
              dataClass: typeof o.data_class === "string" ? o.data_class : "organization",
              count: num(o.count),
            },
          ]
        : [];
    }),
    total: num(out.total),
  };
}

export type TakeOverRecordsResult =
  | { takenOver: true; recordsMoved: number; notMoved: number; message: string }
  | { takenOver: false; reason: string; message: string };

/**
 * Take over a member's records in THIS organization (ACCESS LADDER T-16d) — for a member who also
 * belongs to other organizations. Ownership of every record they hold here (Private included,
 * Confidential never) moves to `toUserId` (null = the caller). Their sign-in, sessions and other
 * organizations are untouched. The person is told; it is recorded on their access log and this
 * organization's log. Every refusal comes back as `takenOver: false` with the database's sentence.
 */
export async function takeOverMemberRecords(args: {
  orgId: string;
  userId: string;
  purpose: string;
  reason: string;
  toUserId: string | null;
}): Promise<TakeOverRecordsResult> {
  const { data, error } = await supabase.rpc("org_admin_take_over_member_records", {
    p_org_id: args.orgId,
    p_user_id: args.userId,
    p_purpose: args.purpose,
    p_reason: args.reason,
    ...(args.toUserId ? { p_to_user_id: args.toUserId } : {}),
  });
  if (error) throw pgErrorToError(error);
  const out = asRecord(data);
  const message = typeof out.message === "string" ? out.message : "";
  if (out.taken_over === true) {
    return {
      takenOver: true,
      recordsMoved: num(out.records_moved),
      notMoved: Array.isArray(out.not_moved) ? out.not_moved.length : 0,
      message,
    };
  }
  return {
    takenOver: false,
    reason: typeof out.reason === "string" ? out.reason : "refused",
    message: message || "The take-over was refused.",
  };
}

/** Governance audit log for the org. */
export async function listOrgAdminAudit(
  orgId: string,
  limit = 100,
): Promise<OrgAdminAuditEntry[]> {
  const { data, error } = await supabase.rpc("org_admin_list_audit", {
    p_org_id: orgId,
    p_limit: limit,
  });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      actorUserId: (row.actor_user_id as string) ?? null,
      actorEmail: (row.actor_email as string) ?? null,
      targetUserId: (row.target_user_id as string) ?? null,
      targetEmail: (row.target_email as string) ?? null,
      action: row.action as string,
      detail: asRecord(row.detail),
      createdAt: row.created_at as string,
    };
  });
}
