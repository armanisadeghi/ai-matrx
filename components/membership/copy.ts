/**
 * copy — the ONE place the shared membership panels build their Copy /
 * Copy-for-AI / export payloads (components/agent-copy doctrine).
 *
 * These live beside the panels rather than in a feature because
 * `MembersPanel` / `InvitationsPanel` are shared by BOTH the organization and
 * the project Manage surfaces — wiring copy here means one implementation
 * serves every "team" surface, present and future, exactly as the panels
 * themselves do.
 *
 * The container (which org / which project) is not something the panels know,
 * so every builder takes a `MembershipCopyContainer` and stamps it into the
 * envelope: a member list is meaningless without saying whose members these
 * are.
 *
 * Pure — no React. Callsites pass these as functions so they resolve against
 * live data at click time.
 */

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type { PanelMember } from "./MembersPanel";
import type { PanelInvitation } from "./InvitationsPanel";

/** Identifies the org/project whose roster is being copied. */
export interface MembershipCopyContainer {
  /** "organization" | "project" | … — the panel's `containerNoun`. */
  noun: string;
  id?: string;
  name?: string;
}

function containerLabel(container: MembershipCopyContainer): string {
  return container.name
    ? `${container.name} (${container.noun})`
    : container.noun;
}

function containerLocation(container: MembershipCopyContainer): string {
  return `AI Matrx — ${containerLabel(container)} — Members & invitations`;
}

function containerContext(container: MembershipCopyContainer) {
  return {
    container_type: container.noun,
    container_id: container.id,
    container_name: container.name,
  };
}

function lines(
  rows: Array<[string, string | number | null | undefined]>,
): string {
  return rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

// ── Members ────────────────────────────────────────────────────────────────

/** The name the member row renders — display name, else email, else id. */
export function memberName(member: PanelMember): string {
  return (
    member.user?.displayName ??
    member.user?.display_name ??
    member.user?.email ??
    member.userId
  );
}

/** A member, as the row renders it (identity · role · joined). */
export function memberSummary(member: PanelMember): string {
  return lines([
    ["Member", memberName(member)],
    ["Email", member.user?.email],
    ["Role", member.role],
    ["Joined", new Date(member.joinedAt).toLocaleDateString()],
    ["User id", member.userId],
  ]);
}

export function memberRow(member: PanelMember): Record<string, unknown> {
  return {
    membership_id: member.id,
    user_id: member.userId,
    name: member.user?.displayName ?? member.user?.display_name ?? "",
    email: member.user?.email ?? "",
    role: member.role,
    joined_at: member.joinedAt,
  };
}

export function memberCsvRows(
  members: PanelMember[],
): Array<Record<string, unknown>> {
  return members.map(memberRow);
}

/** The role breakdown the panel's count line implies. */
export function memberRoleCounts(
  members: PanelMember[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const member of members) {
    counts[member.role] = (counts[member.role] ?? 0) + 1;
  }
  return counts;
}

export function memberListHuman(
  members: PanelMember[],
  container: MembershipCopyContainer,
  memberNoun = "member",
): string {
  const counts = memberRoleCounts(members);
  const head = `${containerLabel(container)} — ${members.length} ${memberNoun}${
    members.length === 1 ? "" : "s"
  }${
    Object.keys(counts).length
      ? ` (${Object.entries(counts)
          .map(([role, n]) => `${n} ${role}`)
          .join(" · ")})`
      : ""
  }`;
  return [head, "", ...members.map(memberSummary)].join("\n\n");
}

export function buildMemberListPayload(input: {
  members: PanelMember[];
  container: MembershipCopyContainer;
  memberNoun?: string;
  /** The panel's live search box — echoed so the agent knows what filtered. */
  searchQuery?: string;
}): AgentPayloadInput {
  const { members, container, memberNoun = "member", searchQuery } = input;
  const counts = memberRoleCounts(members);
  return {
    kind: "membership-roster",
    location: containerLocation(container),
    description: `Every ${memberNoun} of this ${container.noun}, as the members panel renders them.`,
    // ALL members, never the search-filtered slice — a roster copy that
    // silently drops rows behind a search box is a lie.
    data: { members: members.map(memberRow), role_counts: counts },
    summary: memberListHuman(members, container, memberNoun),
    attributes: {
      rows: members.length,
      ...Object.fromEntries(
        Object.entries(counts).map(([role, n]) => [`role_${role}`, n]),
      ),
    },
    context: {
      ...containerContext(container),
      search_query: searchQuery || undefined,
      note: searchQuery
        ? "A search filter is active on screen; this payload carries ALL members, not the filtered view."
        : undefined,
    },
  };
}

export function buildMemberRowPayload(input: {
  member: PanelMember;
  container: MembershipCopyContainer;
  totalMembers: number;
}): AgentPayloadInput {
  const { member, container, totalMembers } = input;
  return {
    kind: "membership-member",
    location: containerLocation(container),
    description: `One ${container.noun} member row.`,
    data: memberRow(member),
    summary: memberSummary(member),
    attributes: {
      user_id: member.userId,
      role: member.role,
      email: member.user?.email,
    },
    context: { ...containerContext(container), roster_total: totalMembers },
  };
}

// ── Invitations ────────────────────────────────────────────────────────────

export function invitationSummary(invitation: PanelInvitation): string {
  return lines([
    ["Invited", invitation.email],
    ["Role", invitation.role],
    ["Sent", new Date(invitation.invitedAt).toLocaleDateString()],
    ["Expires", new Date(invitation.expiresAt).toLocaleDateString()],
    ["Expired", isExpired(invitation) ? "yes" : "no"],
  ]);
}

function isExpired(invitation: PanelInvitation): boolean {
  const expiry = new Date(invitation.expiresAt).getTime();
  return Number.isFinite(expiry) && expiry < Date.now();
}

/**
 * Invitation rows deliberately OMIT `token` — it is a bearer credential that
 * grants membership to whoever holds it. The panel renders a copy-link action
 * for the human who needs it; a payload bound for an agent's context window,
 * a downloaded CSV, or a pasted chat message must not carry one.
 */
export function invitationRow(
  invitation: PanelInvitation,
): Record<string, unknown> {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    invited_at: invitation.invitedAt,
    expires_at: invitation.expiresAt,
    expired: isExpired(invitation),
  };
}

export function invitationCsvRows(
  invitations: PanelInvitation[],
): Array<Record<string, unknown>> {
  return invitations.map(invitationRow);
}

export function invitationListHuman(
  invitations: PanelInvitation[],
  container: MembershipCopyContainer,
): string {
  const expired = invitations.filter(isExpired).length;
  const head = `${containerLabel(container)} — ${invitations.length} pending invitation${
    invitations.length === 1 ? "" : "s"
  }${expired ? ` (${expired} expired)` : ""}`;
  return [head, "", ...invitations.map(invitationSummary)].join("\n\n");
}

export function buildInvitationListPayload(input: {
  invitations: PanelInvitation[];
  container: MembershipCopyContainer;
}): AgentPayloadInput {
  const { invitations, container } = input;
  const expired = invitations.filter(isExpired).length;
  return {
    kind: "membership-invitations",
    location: containerLocation(container),
    description: `Pending invitations for this ${container.noun}, as rendered. Accept tokens are deliberately omitted.`,
    data: { invitations: invitations.map(invitationRow) },
    summary: invitationListHuman(invitations, container),
    attributes: {
      rows: invitations.length,
      expired,
      pending: invitations.length - expired,
      tokens_omitted: true,
    },
    context: containerContext(container),
  };
}

export function buildInvitationRowPayload(input: {
  invitation: PanelInvitation;
  container: MembershipCopyContainer;
  totalInvitations: number;
}): AgentPayloadInput {
  const { invitation, container, totalInvitations } = input;
  return {
    kind: "membership-invitation",
    location: containerLocation(container),
    description: `One pending ${container.noun} invitation. The accept token is deliberately omitted.`,
    data: invitationRow(invitation),
    summary: invitationSummary(invitation),
    attributes: {
      email: invitation.email,
      role: invitation.role,
      expired: isExpired(invitation),
      tokens_omitted: true,
    },
    context: {
      ...containerContext(container),
      invitations_total: totalInvitations,
    },
  };
}
