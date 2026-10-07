// features/agents/org-chart/useBoxIdentity.ts
//
// Who a box on the org chart IS: its name, a short detail and (for a person)
// an avatar. Composes the platform's one lookup per type — never a second copy:
//   agent      → the agents slice
//   membership → the organization member list (getOrganizationMembers) across the
//                organizations the viewer is in — a Person on the chart is their
//                place in ONE organization
//   team       → teamsService.listTeams across the same organizations
//   position   → the org chart's positions in Redux (+ the person filling it)

"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById, } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  selectOrgPositions,
  selectOrgPositionsStatus,
  selectSeatJobs,
} from "@/features/agents/redux/orchestras/selectors";
import { listTeams, type Team } from "@/features/organizations/service/teamsService";
import { getOrganizationMembers, getUserOrganizations } from "@/features/organizations/service";
import type { OrgBoxType } from "./constants";
import { useAgentCatalogStatus, useAgentsById } from "@ai-matrx/chat/agents/identity/agent-catalog-lists";

// ── the people and teams the viewer can place, loaded once per session ───────

export interface OrgMember {
  /** The membership id — the Person box's entity id. */
  membershipId: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export type OrgTeam = Team & { organizationId: string };

interface Directory {
  members: Map<string, OrgMember>;
  teams: Map<string, OrgTeam>;
  /** What could not be read (organizations, or "your organizations") — said, never hidden. */
  failed: string[];
}

let directory: Promise<Directory> | null = null;
/** Mounted cards, told when a newer directory is read (a Retry), so none stays stale. */
const listeners = new Set<(d: Directory) => void>();

/**
 * Every member and team in every organization the viewer is in. `refresh` re-reads.
 * A read that failed anywhere is not kept, so the next caller tries again.
 */
export function loadOrgDirectory(refresh = false): Promise<Directory> {
  if (!directory || refresh) {
    const loading = (async (): Promise<Directory> => {
      const failed: string[] = [];
      const orgs = await getUserOrganizations().catch(() => {
        failed.push("your organizations");
        return [];
      });
      const perOrg = await Promise.all(
        orgs.map(async (o) => {
          const [members, teams] = await Promise.all([
            getOrganizationMembers(o.id).catch(() => {
              failed.push(`${o.name} people`);
              return [];
            }),
            listTeams(o.id).catch(() => {
              failed.push(`${o.name} teams`);
              return [] as Team[];
            }),
          ]);
          return {
            members: members.map(
              (m): OrgMember => ({
                membershipId: m.id,
                userId: m.userId,
                organizationId: o.id,
                organizationName: o.name,
                name: m.user?.displayName || m.user?.email || "Member",
                email: m.user?.email ?? null,
                avatarUrl: m.user?.avatarUrl ?? null,
              }),
            ),
            teams: teams.map((t): OrgTeam => ({ ...t, organizationId: o.id })),
          };
        }),
      );
      return {
        members: new Map(perOrg.flatMap((o) => o.members).map((m) => [m.membershipId, m])),
        teams: new Map(perOrg.flatMap((o) => o.teams).map((t) => [t.id, t])),
        failed,
      };
    })();
    directory = loading;
    void loading.then((d) => {
      if (d.failed.length && directory === loading) directory = null;
      listeners.forEach((l) => l(d));
    });
  }
  return directory;
}

/** Hear every newer directory read (a Retry, an archive). Returns the stop function. */
export function onOrgDirectoryRefreshed(listener: (d: Directory) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The member holding this user id, preferring the given organization. */
export function memberForUser(dir: Directory, userId: string, organizationId?: string): OrgMember | null {
  let best: OrgMember | null = null;
  for (const m of dir.members.values()) {
    if (m.userId !== userId) continue;
    if (m.organizationId === organizationId) return m;
    best ??= m;
  }
  return best;
}

export interface BoxIdentity {
  name: string | null;
  avatarUrl: string | null;
  /** Second line: organization, member count, who fills it. */
  detail: string | null;
  /** The record could not be found or isn't visible to the viewer. */
  missing: boolean;
  /** For a person: the account, so Quick look can open it. */
  userId: string | null;
  /**
   * For a position: where it stands on the ladder (VISION.md) — noted, its job
   * defined, an agent doing the job, or a job that no longer runs. Null otherwise.
   */
  seat: SeatStage | null;
  /**
   * For a person: of the positions they fill in this organization, how many have
   * an agent doing the job (VISION.md rule 6). Null when they fill none.
   */
  coverage: { covered: number; seats: number } | null;
}

export type SeatStage = "noted" | "defined" | "staffed" | "retired";

export function useBoxIdentity(type: OrgBoxType, id: string): BoxIdentity {
  const agent = useAppSelector((s) => (type === "agent" ? selectAgentById(s, id) : undefined));
  const agentsStatus = useAgentCatalogStatus();
  const positions = useAppSelector(selectOrgPositions);
  const positionsStatus = useAppSelector(selectOrgPositionsStatus);
  const seatJobs = useAppSelector(selectSeatJobs);
  const allAgents = useAgentsById();
  const position = type === "position" ? positions.find((p) => p.id === id) : undefined;
  const [dir, setDir] = useState<Directory | null>(null);

  useEffect(() => {
    if (type === "agent") return;
    let live = true;
    void loadOrgDirectory().then((d) => live && setDir(d));
    const hear = (d: Directory) => live && setDir(d);
    listeners.add(hear);
    return () => {
      live = false;
      listeners.delete(hear);
    };
  }, [type]);

  switch (type) {
    case "agent":
      return { name: agent?.name ?? null, avatarUrl: null, detail: agent?.description ?? null, missing: !agent && agentsStatus === "succeeded", userId: null, seat: null, coverage: null };
    case "membership": {
      const m = dir?.members.get(id);
      return {
        name: m?.name ?? null,
        avatarUrl: m?.avatarUrl ?? null,
        detail: m?.organizationName ?? null,
        missing: Boolean(dir && !dir.failed.length) && !m,
        userId: m?.userId ?? null,
        seat: null,
        coverage: (() => {
          if (!m) return null;
          const held = positions.filter((p) => p.filledByUserId === m.userId && p.organizationId === m.organizationId);
          if (!held.length) return null;
          const covered = held.filter((p) => p.mandateId && seatJobs[p.mandateId]?.holderAgentId && !seatJobs[p.mandateId]?.retired).length;
          return { covered, seats: held.length };
        })(),
      };
    }
    case "team": {
      const t = dir?.teams.get(id);
      return {
        name: t?.name ?? null,
        avatarUrl: null,
        detail: t ? `${t.memberCount} ${t.memberCount === 1 ? "member" : "members"}` : null,
        missing: Boolean(dir && !dir.failed.length) && !t,
        userId: null,
        seat: null,
        coverage: null,
      };
    }
    case "position": {
      const filler = position?.filledByUserId && dir ? memberForUser(dir, position.filledByUserId, position.organizationId) : null;
      const job = position?.mandateId ? seatJobs[position.mandateId] : undefined;
      const seat: SeatStage | null = !position
        ? null
        : !position.mandateId
          ? "noted"
          : !job
            ? "defined" // linked; the job's state is still loading
            : job.retired
              ? "retired"
              : job.holderAgentId
                ? "staffed"
                : "defined";
      const holderName = job?.holderAgentId ? (allAgents[job.holderAgentId]?.name ?? "an agent") : null;
      return {
        name: position?.name ?? null,
        avatarUrl: filler?.avatarUrl ?? null,
        detail: position
          ? filler
            ? `Filled by ${filler.name}`
            : position.filledByUserId
              ? "Filled"
              : seat === "staffed"
                ? `Agent: ${holderName}`
                : seat === "defined"
                  ? "Job defined"
                  : seat === "retired"
                    ? "Its job is off"
                    : "Open position"
          : null,
        missing: !position && positionsStatus === "ready",
        userId: null,
        seat,
        coverage: null,
      };
    }
  }
}
