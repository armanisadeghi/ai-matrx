/**
 * Org-admin user-management domain types.
 *
 * Mirrors the public.org_admin_* RPC contracts (see migrations/iam_org_member_governance.sql).
 * These are the typed shapes the service layer returns; components consume them only.
 */
import type { OrgRole } from "../types";

/** A member row in the org-admin roster, with org-scoped metrics + global usage context. */
export interface OrgAdminMember {
  userId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: OrgRole;
  joinedAt: string | null;
  /** Governance status overlay (iam.org_member_controls). */
  status: OrgMemberStatus;
  memberLevel: string | null;
  /** files.account_tiers.id override (advisory). */
  tierOverride: string | null;
  storageCapBytes: number | null;
  monthlyBudgetMcents: number | null;
  /** Org-scoped (this org only) file usage. */
  orgFilesCount: number;
  orgBytesUsed: number;
  /** Account-wide (all orgs) file usage, for context. */
  accountBytesUsed: number;
  accountFilesCount: number;
  /** Most recent chat activity within THIS org (null = never active here). */
  lastOrgActivityAt: string | null;
  /** Account-wide last request (any org). */
  lastRequestAt: string | null;
  cost24hMcents: number;
  requests24h: number;
  requests6h: number;
}

export type OrgMemberStatus = "active" | "suspended";

/** Aggregate org-wide snapshot for the admin dashboard header. */
export interface OrgAdminOverview {
  totalMembers: number;
  admins: number;
  suspended: number;
  active7d: number;
  active30d: number;
  neverActive: number;
  orgBytesUsed: number;
  orgFilesCount: number;
  cost24hMcents: number;
  requests24h: number;
}

/** Per-type count of a member's org-scoped resources. */
export interface OrgMemberResource {
  resourceType: string;
  displayLabel: string;
  schemaName: string;
  tableName: string;
  count: number;
}

/** A single member's full detail (roster row + resource breakdown). */
export interface OrgAdminMemberDetail extends OrgAdminMember {
  resources: OrgMemberResource[];
}

/** Result of a reassignment, per resource type actually moved. */
export interface ReassignResult {
  resourceType: string;
  reassigned: number;
}

/** The admin-settable controls for a member (the editable subset). */
export interface OrgMemberControlsInput {
  memberLevel: string | null;
  tierOverride: string | null;
  storageCapBytes: number | null;
  monthlyBudgetMcents: number | null;
  notes: string | null;
}

/** One governance audit entry. */
export interface OrgAdminAuditEntry {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  targetUserId: string | null;
  targetEmail: string | null;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}
