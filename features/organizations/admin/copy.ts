// features/organizations/admin/copy.ts
//
// Copy / Copy-for-AI / export payloads for the org-admin governance surfaces
// (components/agent-copy doctrine). Kept beside the admin feature because the
// roster and audit shapes are admin-only — the member-facing panels build
// theirs in `components/membership/copy.ts`.
//
// Pure — no React. Callsites pass these as functions so they resolve against
// live data at click time.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type { OrgAdminAuditEntry, OrgAdminMember } from "./types";
import { formatBytes, formatMcents, formatRelativeTime } from "./utils";

function lines(
  rows: Array<[string, string | number | boolean | null | undefined]>,
): string {
  return rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

function adminLocation(orgSlug: string, area: string): string {
  return `AI Matrx — Org admin — ${area} (/organizations/${orgSlug}/admin)`;
}

// ── Member roster ──────────────────────────────────────────────────────────

/** One member row, in the units the table renders (bytes and mcents formatted). */
export function rosterMemberSummary(member: OrgAdminMember): string {
  return lines([
    ["Member", member.displayName || member.email || "Unknown user"],
    ["Email", member.email],
    ["Role", member.role],
    ["Status", member.status],
    ["Last active in org", formatRelativeTime(member.lastOrgActivityAt)],
    [
      "Files (org)",
      `${member.orgFilesCount} (${formatBytes(member.orgBytesUsed)})`,
    ],
    ["Spend 24h", formatMcents(member.cost24hMcents)],
    ["Requests 24h", member.requests24h],
    ["Tier", member.memberLevel ?? "Standard"],
  ]);
}

export function rosterMemberRow(
  member: OrgAdminMember,
): Record<string, unknown> {
  return {
    user_id: member.userId,
    email: member.email,
    display_name: member.displayName,
    role: member.role,
    status: member.status,
    member_level: member.memberLevel,
    tier_override: member.tierOverride,
    joined_at: member.joinedAt,
    last_org_activity_at: member.lastOrgActivityAt,
    last_request_at: member.lastRequestAt,
    org_files_count: member.orgFilesCount,
    org_bytes_used: member.orgBytesUsed,
    account_files_count: member.accountFilesCount,
    account_bytes_used: member.accountBytesUsed,
    cost_24h_mcents: member.cost24hMcents,
    requests_24h: member.requests24h,
    storage_cap_bytes: member.storageCapBytes,
    monthly_budget_mcents: member.monthlyBudgetMcents,
  };
}

export function rosterCsvRows(
  members: OrgAdminMember[],
): Array<Record<string, unknown>> {
  return members.map(rosterMemberRow);
}

/** The roster's own leading numbers. */
export function rosterKpis(members: OrgAdminMember[]) {
  return {
    total: members.length,
    suspended: members.filter((m) => m.status === "suspended").length,
    owners: members.filter((m) => m.role === "owner").length,
    admins: members.filter((m) => m.role === "admin").length,
    org_bytes_used: members.reduce((sum, m) => sum + m.orgBytesUsed, 0),
    cost_24h_mcents: members.reduce((sum, m) => sum + m.cost24hMcents, 0),
  };
}

export function rosterListHuman(members: OrgAdminMember[]): string {
  const kpis = rosterKpis(members);
  const head = `Org member roster — ${kpis.total} member${kpis.total === 1 ? "" : "s"} · ${kpis.suspended} suspended · ${formatBytes(kpis.org_bytes_used)} in org files · ${formatMcents(kpis.cost_24h_mcents)} spend 24h`;
  return [head, "", ...members.map(rosterMemberSummary)].join("\n\n");
}

export function buildRosterListPayload(input: {
  members: OrgAdminMember[];
  orgSlug: string;
  /** The table's live search + sort, echoed so the agent knows the view. */
  searchQuery?: string;
  sort?: string;
}): AgentPayloadInput {
  const { members, orgSlug, searchQuery, sort } = input;
  const kpis = rosterKpis(members);
  return {
    kind: "org-admin-roster",
    location: adminLocation(orgSlug, "Member roster"),
    description:
      "Every member of this organization with their org-scoped governance metrics, as the roster renders them.",
    // ALL members, never the search-filtered/sorted slice.
    data: { members: members.map(rosterMemberRow), totals: kpis },
    summary: rosterListHuman(members),
    attributes: {
      rows: kpis.total,
      suspended: kpis.suspended,
      owners: kpis.owners,
      admins: kpis.admins,
    },
    context: {
      org_slug: orgSlug,
      search_query: searchQuery || undefined,
      sort,
      note: searchQuery
        ? "A search filter is active on screen; this payload carries ALL members, not the filtered view."
        : undefined,
    },
  };
}

export function buildRosterMemberPayload(input: {
  member: OrgAdminMember;
  orgSlug: string;
  totalMembers: number;
}): AgentPayloadInput {
  const { member, orgSlug, totalMembers } = input;
  return {
    kind: "org-admin-member",
    location: adminLocation(orgSlug, "Member roster"),
    description: "One member row from the org-admin roster.",
    data: rosterMemberRow(member),
    summary: rosterMemberSummary(member),
    attributes: {
      user_id: member.userId,
      email: member.email,
      role: member.role,
      status: member.status,
    },
    context: { org_slug: orgSlug, roster_total: totalMembers },
  };
}

// ── Governance audit ───────────────────────────────────────────────────────

export function auditEntrySummary(
  entry: OrgAdminAuditEntry,
  actionLabel: string,
): string {
  return lines([
    ["Action", actionLabel],
    ["Target", entry.targetEmail],
    ["Actor", entry.actorEmail ?? "system"],
    ["When", entry.createdAt],
    [
      "Detail",
      Object.keys(entry.detail ?? {}).length
        ? JSON.stringify(entry.detail)
        : null,
    ],
  ]);
}

export function auditRow(entry: OrgAdminAuditEntry): Record<string, unknown> {
  return {
    id: entry.id,
    action: entry.action,
    actor_user_id: entry.actorUserId,
    actor_email: entry.actorEmail,
    target_user_id: entry.targetUserId,
    target_email: entry.targetEmail,
    created_at: entry.createdAt,
    detail: entry.detail,
  };
}

export function auditCsvRows(
  entries: OrgAdminAuditEntry[],
): Array<Record<string, unknown>> {
  return entries.map((entry) => ({
    ...auditRow(entry),
    detail: JSON.stringify(entry.detail ?? {}),
  }));
}

export function auditListHuman(
  entries: OrgAdminAuditEntry[],
  labelFor: (action: string) => string,
): string {
  const head = `Governance audit log — ${entries.length} action${entries.length === 1 ? "" : "s"}`;
  return [
    head,
    "",
    ...entries.map((entry) => auditEntrySummary(entry, labelFor(entry.action))),
  ].join("\n\n");
}

export function buildAuditListPayload(input: {
  entries: OrgAdminAuditEntry[];
  orgId: string;
  labelFor: (action: string) => string;
}): AgentPayloadInput {
  const { entries, orgId, labelFor } = input;
  const byAction: Record<string, number> = {};
  for (const entry of entries) {
    byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
  }
  return {
    kind: "org-admin-audit",
    location: `AI Matrx — Org admin — Governance audit log`,
    description:
      "Every recorded org-admin governance action — who changed what, and when.",
    data: { entries: entries.map(auditRow), counts_by_action: byAction },
    summary: auditListHuman(entries, labelFor),
    attributes: { rows: entries.length },
    context: { organization_id: orgId },
  };
}

export function buildAuditRowPayload(input: {
  entry: OrgAdminAuditEntry;
  orgId: string;
  labelFor: (action: string) => string;
  totalEntries: number;
}): AgentPayloadInput {
  const { entry, orgId, labelFor, totalEntries } = input;
  return {
    kind: "org-admin-audit-entry",
    location: `AI Matrx — Org admin — Governance audit log`,
    description: "One entry from the org governance audit log.",
    data: auditRow(entry),
    summary: auditEntrySummary(entry, labelFor(entry.action)),
    attributes: {
      id: entry.id,
      action: entry.action,
      target: entry.targetEmail,
      actor: entry.actorEmail ?? "system",
    },
    context: { organization_id: orgId, audit_total: totalEntries },
  };
}
