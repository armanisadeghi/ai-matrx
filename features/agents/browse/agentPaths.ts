// features/agents/browse/agentPaths.ts
//
// WHERE ONE AGENT ROW LIVES — the row-shaped door onto the one address rule.
//
// The canonical list shows user agents and — for a Matrx admin, in the System
// scope — the platform's builtin corpus. Those two open in different shells: a
// user agent under `/agents/[id]`, a builtin under the admin System Agents
// tree, whose detail routes add the admin-only chrome (write targets, back
// href, system-scoped header).
//
// That difference is a property of the ROW, not of the page. Resolving it here
// is what lets ONE list serve both routes: /agents/all and
// /administration/agents/system-agents/agents render the same component and
// still send every record to its real home.
//
// 🚨 THE RULE ITSELF NOW LIVES IN ONE PLACE: `features/agents/addressing`.
// This file used to be one of THREE competing `agentHref` implementations
// (with `features/hindsight/subject-doors.ts` and
// `features/mandates/admin/mandate-health.ts`), beside ~60 hand-built
// `/agents/${id}` literals and an entity registry that had never heard of a
// builtin agent — which is how system agents ended up linked into the user
// shell all over the app (Arman, 2026-09-08). Everything here delegates.
//
// This module's form is for a caller that ALREADY HOLDS THE ROW. A caller
// holding only an id must use `useAgentHref` instead: the id's kind — and
// whether it is even an agent id rather than a VERSION id — is a read, never
// a guess.

import {
  AGENT_BASE_PATH,
  SYSTEM_AGENT_BASE_PATH,
  agentBasePathFor,
  agentHrefFromRow,
  isSystemAgentType,
  newAgentHref,
  type AgentPathRow,
} from "@/features/agents/addressing/agentAddress";

export {
  AGENT_BASE_PATH,
  SYSTEM_AGENT_BASE_PATH,
  newAgentHref,
  type AgentPathRow,
};

/** True when this row is part of the platform's own corpus. */
export function isSystemAgentRow(row: AgentPathRow): boolean {
  return isSystemAgentType(row.agent_type);
}

/** The route prefix this row's detail pages live under. */
export function agentBasePath(row: AgentPathRow): string {
  return agentBasePathFor(row.agent_type);
}

/**
 * One agent's route. `sub` is appended verbatim and must start with "/"
 * ("/run", "/build", `/v/${version}`); omit it for the record's own page.
 */
export function agentHref(row: AgentPathRow, sub = ""): string {
  return agentHrefFromRow(row, sub);
}
