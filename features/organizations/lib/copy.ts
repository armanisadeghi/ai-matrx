// features/organizations/lib/copy.ts
//
// The ONE place organization surfaces build their Copy / Copy-for-AI / export
// payloads (components/agent-copy doctrine — see the `agent-copy` skill).
//
// The org row projection deliberately matches `organizations_summary`, the
// value the `matrx-user/organizations` surface already emits from
// `app/(core)/organizations/page.tsx`, so a copy payload and the agent
// surface describe the same list rather than two divergent ones.
//
// Member and invitation payloads are NOT here — those panels are shared with
// projects and build their payloads in `components/membership/copy.ts`.
//
// Pure — no React. Callsites pass these as functions so they resolve against
// live data at click time.

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type { OrganizationWithRole } from "../types";

export const ORGANIZATIONS_LOCATION =
  "AI Matrx — Organizations (/organizations)";

function lines(
  rows: Array<[string, string | number | boolean | null | undefined]>,
): string {
  return rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

/** The launcher's leading stats: N workspaces · M teams. */
export interface OrganizationKpis {
  workspaces: number;
  teams: number;
  personal: number;
}

export function organizationKpis(
  organizations: OrganizationWithRole[],
): OrganizationKpis {
  const personal = organizations.filter((o) => o.isPersonal).length;
  return {
    workspaces: organizations.length,
    teams: organizations.length - personal,
    personal,
  };
}

export function organizationKpiLine(kpis: OrganizationKpis): string {
  return `${kpis.workspaces} workspace${kpis.workspaces === 1 ? "" : "s"} · ${kpis.teams} team${kpis.teams === 1 ? "" : "s"}`;
}

/** One org, as the card renders it. */
export function organizationSummary(org: OrganizationWithRole): string {
  return lines([
    ["Organization", org.name],
    ["Abbreviation", org.abbreviation],
    ["Slug", org.slug],
    ["Role", org.isPersonal ? "Personal" : org.role],
    ["Members", org.memberCount],
    ["Description", org.description],
    ["Website", org.website],
    ["Created", org.createdAt],
  ]);
}

export function organizationListHuman(
  organizations: OrganizationWithRole[],
): string {
  return [
    organizationKpiLine(organizationKpis(organizations)),
    "",
    ...organizations.map(organizationSummary),
  ].join("\n\n");
}

/** Matches the `organizations_summary` surface value, plus the card's extras. */
export function organizationRow(
  org: OrganizationWithRole,
): Record<string, unknown> {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    abbreviation: org.abbreviation,
    role: org.role,
    is_personal: org.isPersonal,
    member_count: org.memberCount ?? null,
    description: org.description ?? null,
    website: org.website ?? null,
    created_at: org.createdAt,
    updated_at: org.updatedAt,
  };
}

export function organizationCsvRows(
  organizations: OrganizationWithRole[],
): Array<Record<string, unknown>> {
  return organizations.map(organizationRow);
}

export function buildOrganizationListPayload(input: {
  organizations: OrganizationWithRole[];
  /** The live search box, echoed so the agent knows what filtered the view. */
  searchQuery?: string;
}): AgentPayloadInput {
  const { organizations, searchQuery } = input;
  const kpis = organizationKpis(organizations);
  return {
    kind: "organizations-list",
    location: ORGANIZATIONS_LOCATION,
    description:
      "Every organization the user belongs to, as the launcher renders them.",
    // ALL orgs, never the search-filtered slice.
    data: { organizations: organizations.map(organizationRow) },
    summary: organizationListHuman(organizations),
    attributes: {
      rows: organizations.length,
      teams: kpis.teams,
      personal: kpis.personal,
    },
    context: {
      search_query: searchQuery || undefined,
      note: searchQuery
        ? "A search filter is active on screen; this payload carries ALL organizations, not the filtered view."
        : undefined,
    },
  };
}

export function buildOrganizationCardPayload(input: {
  org: OrganizationWithRole;
  kpis: OrganizationKpis;
  /** Scope counts the card renders beside the member count, when known. */
  scopeTypeCount?: number;
  scopeCount?: number;
}): AgentPayloadInput {
  const { org, kpis, scopeTypeCount, scopeCount } = input;
  return {
    kind: "organization",
    location: ORGANIZATIONS_LOCATION,
    description: "One organization card from the organizations launcher.",
    data: {
      ...organizationRow(org),
      scope_type_count: scopeTypeCount ?? null,
      scope_count: scopeCount ?? null,
    },
    summary: lines([
      ["Organization", org.name],
      ["Abbreviation", org.abbreviation],
      ["Slug", org.slug],
      ["Role", org.isPersonal ? "Personal" : org.role],
      ["Members", org.memberCount],
      ["Dimensions", scopeTypeCount],
      ["Scopes", scopeCount],
      ["Description", org.description],
      ["Website", org.website],
      ["Created", org.createdAt],
    ]),
    attributes: {
      id: org.id,
      slug: org.slug,
      role: org.role,
      is_personal: org.isPersonal,
      member_count: org.memberCount,
    },
    context: {
      list_workspaces: kpis.workspaces,
      list_teams: kpis.teams,
    },
  };
}
