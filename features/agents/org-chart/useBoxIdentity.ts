// features/agents/org-chart/useBoxIdentity.ts
//
// Who a box on the org chart IS: its name, a short subtitle and (for a person)
// an avatar. Composes the platform's one lookup per type — never a second copy:
//   agent    → the agents slice
//   user     → resolveVisiblePerson (the ONE "who is this account" lookup)
//   team     → teamsService.listTeams across the organizations the viewer is in
//   position → the org chart's positions in Redux

"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { selectOrgPositions } from "@/features/agents/redux/orchestras/selectors";
import { resolveVisiblePerson, type VisiblePerson } from "@/features/organizations/people/visiblePeople";
import { listTeams, type Team } from "@/features/organizations/service/teamsService";
import { organizationsIAmIn } from "@/features/organizations/organizationsIAmIn";
import type { OrgBoxType } from "./constants";

// ── teams directory: every team in every organization the viewer is in ──────
let teamsDirectory: Promise<Map<string, Team>> | null = null;

/** All teams the viewer can see, keyed by id. Cached for the session; `refresh` re-reads. */
export function loadTeamsDirectory(refresh = false): Promise<Map<string, Team>> {
  if (!teamsDirectory || refresh) {
    teamsDirectory = (async () => {
      const orgs = (await organizationsIAmIn()) ?? new Set<string>();
      const lists = await Promise.all([...orgs].map((o) => listTeams(o).catch(() => [] as Team[])));
      return new Map(lists.flat().map((t) => [t.id, t]));
    })();
  }
  return teamsDirectory;
}

export interface BoxIdentity {
  name: string | null;
  avatarUrl: string | null;
  /** Second line: role, filled-by, member count. */
  detail: string | null;
  /** The record could not be found or isn't visible to the viewer. */
  missing: boolean;
}

export function useBoxIdentity(type: OrgBoxType, id: string): BoxIdentity {
  const agent = useAppSelector((s) => (type === "agent" ? selectAgentById(s, id) : undefined));
  const positions = useAppSelector(selectOrgPositions);
  const position = type === "position" ? positions.find((p) => p.id === id) : undefined;
  const fillerId = position?.filledByUserId ?? null;

  const [person, setPerson] = useState<VisiblePerson | null | undefined>(undefined);
  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  const [filler, setFiller] = useState<VisiblePerson | null>(null);

  useEffect(() => {
    let live = true;
    if (type === "user") void resolveVisiblePerson(id).then((p) => live && setPerson(p));
    if (type === "team") void loadTeamsDirectory().then((m) => live && setTeam(m.get(id) ?? null));
    return () => {
      live = false;
    };
  }, [type, id]);

  useEffect(() => {
    let live = true;
    if (fillerId) void resolveVisiblePerson(fillerId).then((p) => live && setFiller(p));
    else setFiller(null);
    return () => {
      live = false;
    };
  }, [fillerId]);

  switch (type) {
    case "agent":
      return { name: agent?.name ?? null, avatarUrl: null, detail: agent?.description ?? null, missing: false };
    case "user":
      return {
        name: person?.name ?? null,
        avatarUrl: person?.avatarUrl ?? null,
        detail: person ? (person.organizationName ?? person.email ?? null) : null,
        missing: person === null,
      };
    case "team":
      return {
        name: team?.name ?? null,
        avatarUrl: null,
        detail: team ? `${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}` : null,
        missing: team === null,
      };
    case "position":
      return {
        name: position?.name ?? null,
        avatarUrl: filler?.avatarUrl ?? null,
        detail: position ? (filler ? `Filled by ${filler.name}` : "Open position") : null,
        missing: !position && positions.length > 0,
      };
  }
}
