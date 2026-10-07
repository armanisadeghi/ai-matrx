"use client";

/**
 * "Projects and organizations" on /work/connections — which organization each
 * coding project saves to, and the prompt for projects that are held because
 * nobody chose yet (the hook message points people here). The screen is the
 * shared one from @ai-matrx/coding-sessions (Matrx 2 mounts the same); this
 * file only supplies the authenticated, contract-typed calls.
 */

import { useMemo } from "react";

import type {
  ProjectMoveReport,
  ProjectOrganizationsPort,
  ProjectOrganizationsReport,
} from "@ai-matrx/coding-sessions/projects";
import { ProjectOrganizations } from "@ai-matrx/coding-sessions/projects/react";
import type { components } from "@ai-matrx/agents/generated/api-types";

import { apiGet, apiPut } from "@/lib/api/typed-client";

type WireReport = components["schemas"]["CodingSessionConnectionOrganization"];
type WireMove = components["schemas"]["CodingProjectMoveReport"];

function toReport(wire: WireReport): ProjectOrganizationsReport {
  return {
    organization_id: wire.organization_id ?? null,
    projects: wire.projects ?? [],
    held_projects: wire.held_projects ?? [],
    known_projects: (wire.known_projects ?? []).map((p) => ({
      key: p.key,
      name: p.name,
      sessions: p.sessions ?? 0,
      organizations: p.organizations ?? {},
      last_active_at: p.last_active_at ?? null,
    })),
    ...(wire.choose_where ? { choose_where: wire.choose_where } : {}),
    organizations: wire.organizations ?? null,
  };
}

function toMove(wire: WireMove): ProjectMoveReport {
  return {
    project: wire.project,
    organization_id: wire.organization_id ?? null,
    moved: wire.moved ?? {},
    report: toReport(wire.report),
  };
}

const PATH = "/coding-sessions/connection/organization" as const;

export function CodingProjectOrganizations() {
  const port = useMemo<ProjectOrganizationsPort>(
    () => ({
      read: async () => toReport((await apiGet(PATH)).data),
      chooseForAllProjects: async (organizationId) =>
        toReport((await apiPut(PATH, { organization_id: organizationId })).data),
      chooseForProject: async (project, organizationId) =>
        toMove((await apiPut(`${PATH}/project`, { project, organization_id: organizationId })).data),
    }),
    [],
  );
  return (
    <div id="projects-and-organizations">
      <ProjectOrganizations port={port} />
    </div>
  );
}
