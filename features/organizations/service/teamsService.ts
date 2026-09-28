// features/organizations/service/teamsService.ts
//
// THE SOLE CHOKEPOINT for teams — `iam.team` and its `iam.memberships`
// (container_type 'team'). A team is a named group of people inside one
// organization; a person may be on several. It is LIST-FILTER INPUT for the
// access ladder's "my team or department" knob and never an access boundary.
// Canonical doc: common-docs /systems/platform/teams/FEATURE.md.
//
// The client has no write grant on either table: every call goes through the
// public SECURITY DEFINER `team_*` doors, which decide access themselves and
// refuse in a plain sentence. Every error thrown here carries that sentence
// (pgErrorToError keeps the server's message), so the screen shows the
// database's own words.

"use client";

import { pgErrorToError } from "@ai-matrx/data";
import { supabase } from "@/utils/supabase/client";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";

export type TeamRole = "admin" | "member";

export interface Team {
  id: string;
  name: string;
  description: string | null;
  hrDepartmentId: string | null;
  hrDepartmentName: string | null;
  memberCount: number;
  /** The viewer's role on this team, or null when they are not on it. */
  myRole: TeamRole | null;
  /** The viewer may rename it and manage its members (org owner/admin or team admin). */
  canManage: boolean;
  /** Set only on archived teams (listed for organization owners and admins). */
  archivedAt: string | null;
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  role: TeamRole;
  /** Added by hand (an iam.memberships row). */
  isListed: boolean;
  /** On the team because of the linked HR department. */
  isFromHr: boolean;
  listedSince: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface HrDepartmentOption {
  id: string;
  name: string;
  parentDepartmentId: string | null;
}

function toRole(value: string | null | undefined): TeamRole | null {
  return value === "admin" || value === "member" ? value : null;
}

export async function listTeams(
  organizationId: string,
  includeArchived = false,
): Promise<Team[]> {
  const { data, error } = await runWithSessionRetry(() =>
    supabase.rpc("team_list", {
      p_organization_id: organizationId,
      p_include_archived: includeArchived,
    }),
  );
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    hrDepartmentId: row.hr_department_id ?? null,
    hrDepartmentName: row.hr_department_name ?? null,
    memberCount: row.member_count ?? 0,
    myRole: toRole(row.my_role),
    canManage: Boolean(row.can_manage),
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
  }));
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await runWithSessionRetry(() =>
    supabase.rpc("team_members", { p_team_id: teamId }),
  );
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    role: toRole(row.role) ?? "member",
    isListed: Boolean(row.is_listed),
    isFromHr: Boolean(row.is_from_hr),
    listedSince: row.listed_since ?? null,
    email: row.email ?? null,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
  }));
}

export async function listHrDepartmentOptions(
  organizationId: string,
): Promise<HrDepartmentOption[]> {
  const { data, error } = await runWithSessionRetry(() =>
    supabase.rpc("team_hr_department_options", {
      p_organization_id: organizationId,
    }),
  );
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    parentDepartmentId: row.parent_department_id ?? null,
  }));
}

export async function createTeam(input: {
  organizationId: string;
  name: string;
  description?: string | null;
  hrDepartmentId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("team_create", {
    p_organization_id: input.organizationId,
    p_name: input.name,
    p_description: input.description ?? undefined,
    p_hr_department_id: input.hrDepartmentId ?? undefined,
  });
  if (error) throw pgErrorToError(error);
  return data;
}

/** An empty description clears it. */
export async function updateTeam(
  teamId: string,
  name: string,
  description: string,
): Promise<void> {
  const { error } = await supabase.rpc("team_update", {
    p_team_id: teamId,
    p_name: name,
    p_description: description,
  });
  if (error) throw pgErrorToError(error);
}

export async function archiveTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc("team_archive", { p_team_id: teamId });
  if (error) throw pgErrorToError(error);
}

export async function restoreTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc("team_restore", { p_team_id: teamId });
  if (error) throw pgErrorToError(error);
}

/** Null unlinks the department. */
export async function setTeamHrDepartment(
  teamId: string,
  hrDepartmentId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("team_set_hr_department", {
    p_team_id: teamId,
    // The generated Args type says string; the door takes NULL to unlink.
    p_hr_department_id: hrDepartmentId as string,
  });
  if (error) throw pgErrorToError(error);
}

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: TeamRole = "member",
): Promise<void> {
  const { error } = await supabase.rpc("team_member_add", {
    p_team_id: teamId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw pgErrorToError(error);
}

export async function setTeamMemberRole(
  teamId: string,
  userId: string,
  role: TeamRole,
): Promise<void> {
  const { error } = await supabase.rpc("team_member_set_role", {
    p_team_id: teamId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw pgErrorToError(error);
}

export async function removeTeamMember(
  teamId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc("team_member_remove", {
    p_team_id: teamId,
    p_user_id: userId,
  });
  if (error) throw pgErrorToError(error);
}

/** One of the signed-in person's own teams (the "My team" list scope's input). */
export interface MyTeam {
  organizationId: string;
  organizationName: string;
  teamId: string;
  teamName: string;
  memberCount: number;
}

/**
 * The signed-in person's live teams — in one organization, or (null) in every
 * organization they belong to. Read by the "My team" list scope to say whose
 * items it is showing, and to say so plainly when the person is on no team.
 */
export async function listMyTeams(
  organizationId: string | null,
): Promise<MyTeam[]> {
  const { data, error } = await runWithSessionRetry(() =>
    supabase.rpc("my_teams", { p_organization_id: organizationId ?? undefined }),
  );
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    teamId: row.team_id,
    teamName: row.team_name,
    memberCount: row.member_count ?? 0,
  }));
}

/**
 * A team's organization id — THE DOOR for a team the UI only holds an id for.
 * `iam.team` grants SELECT to nobody the client can be, so this is the one
 * client-callable read (`public.team_organization_id`, a
 * `platform.client_callable_door`; migrations/team_organization_id_door.sql).
 *
 * Null means "no door": the team was deleted, never existed, or belongs to an
 * organization this caller cannot see — never a thrown error, because a
 * caller resolving an address for a list of links must not have one bad id
 * crash the whole render. See `features/organizations/addressing/teamAddress.ts`,
 * which caches this per id.
 */
export async function getTeamOrganizationId(
  teamId: string,
): Promise<string | null> {
  const { data, error } = await runWithSessionRetry(() =>
    supabase.rpc("team_organization_id", { p_team_id: teamId }),
  );
  if (error) return null;
  return data ?? null;
}
