/**
 * Org-admin user-management service — the single client-side chokepoint for the
 * public.org_admin_* RPC family. Every call is RLS/authorization-enforced in the DB
 * (public.is_org_admin gate inside each SECURITY DEFINER RPC); this layer only maps
 * the wire shapes to the domain types in ./types.
 *
 * Canonical path: React → supabase-js .rpc() → Postgres. No Next.js API hop, no Python.
 */
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { OrgRole } from "../types";
import type {
  OrgAdminAuditEntry,
  OrgAdminMember,
  OrgAdminMemberDetail,
  OrgAdminOverview,
  OrgMemberControlsInput,
  OrgMemberResource,
  OrgMemberStatus,
  ReassignResult,
} from "./types";

type Json = Record<string, unknown>;

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
  const o = (data ?? {}) as unknown as Json;
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
  const row = (data ?? {}) as unknown as Record<string, unknown>;
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
    p_member_level: controls.memberLevel,
    p_tier_override: controls.tierOverride,
    p_storage_cap_bytes: controls.storageCapBytes,
    p_monthly_budget_mcents: controls.monthlyBudgetMcents,
    p_notes: controls.notes,
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

/** Reassign a member's org-scoped resources to another member. */
export async function reassignMemberResources(
  orgId: string,
  fromUserId: string,
  toUserId: string,
  resourceTypes?: string[],
): Promise<ReassignResult[]> {
  const { data, error } = await supabase.rpc("org_admin_reassign_member_resources", {
    p_org_id: orgId,
    p_from_user: fromUserId,
    p_to_user: toUserId,
    p_resource_types: resourceTypes ?? undefined,
  });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return { resourceType: row.resource_type as string, reassigned: num(row.reassigned) };
  });
}

/** Remove a member, optionally reassigning their org-scoped resources first. */
export async function removeMember(
  orgId: string,
  userId: string,
  reassignTo?: string,
): Promise<{ removed: boolean; reassigned: ReassignResult[] }> {
  const { data, error } = await supabase.rpc("org_admin_remove_member", {
    p_org_id: orgId,
    p_user_id: userId,
    p_reassign_to: reassignTo ?? undefined,
  });
  if (error) throw pgErrorToError(error);
  const out = (data ?? {}) as unknown as Json;
  const reassigned = Array.isArray(out.reassigned)
    ? (out.reassigned as Record<string, unknown>[]).map((row) => ({
        resourceType: row.resource_type as string,
        reassigned: num(row.reassigned),
      }))
    : [];
  return { removed: Boolean(out.removed), reassigned };
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
      detail: (row.detail as Record<string, unknown>) ?? {},
      createdAt: row.created_at as string,
    };
  });
}
