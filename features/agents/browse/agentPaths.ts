// features/agents/browse/agentPaths.ts
//
// WHERE ONE AGENT ROW LIVES.
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
// still send every record to its real home. The moment this became a page-level
// setting instead, the two would drift again — which is exactly how the
// duplicate `SystemAgentsGrid` came to exist.
//
// Every per-row destination in this feature (door, run, build, view, versions,
// copy-link, card actions) goes through `agentHref`. There is no second
// answer to "where does this agent open?".

/** Where a normal user agent lives. */
export const AGENT_BASE_PATH = "/agents";

/** Where a builtin (system) agent lives — the admin shell. */
export const SYSTEM_AGENT_BASE_PATH =
  "/administration/agents/system-agents/agents";

/** The minimum any caller needs to know to place a row. */
export interface AgentPathRow {
  id: string;
  agent_type: string | null;
}

/** True when this row is part of the platform's own corpus. */
export function isSystemAgentRow(row: AgentPathRow): boolean {
  return row.agent_type === "builtin";
}

/** The route prefix this row's detail pages live under. */
export function agentBasePath(row: AgentPathRow): string {
  return isSystemAgentRow(row) ? SYSTEM_AGENT_BASE_PATH : AGENT_BASE_PATH;
}

/**
 * One agent's route. `sub` is appended verbatim and must start with "/"
 * ("/run", "/build", `/v/${version}`); omit it for the record's own page.
 */
export function agentHref(row: AgentPathRow, sub = ""): string {
  return `${agentBasePath(row)}/${row.id}${sub}`;
}

/** Where "New agent" goes for the corpus this page is currently showing. */
export function newAgentHref(system: boolean): string {
  return system ? `${SYSTEM_AGENT_BASE_PATH}/new` : `${AGENT_BASE_PATH}/new`;
}
