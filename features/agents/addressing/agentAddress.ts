/**
 * features/agents/addressing/agentAddress.ts
 *
 * ONE ADDRESS RULE FOR AGENTS. There is no second answer to "where does this
 * agent open?", and no call site is allowed to guess.
 *
 * THE DEFECT THIS EXISTS FOR (production, reported by Arman 2026-09-08):
 *
 *   "When linking to system agents, you cannot link to the same address as
 *    regular agents. … Multiple parts of the page link to agents but they
 *    don't all properly link to the right page depending on it being a system
 *    agent or a user one."
 *
 * Three separate `agentHref` implementations existed (agents/browse/agentPaths,
 * hindsight/subject-doors, mandates/admin/mandate-health), plus ~60 hand-built
 * `/agents/${id}` template literals, plus the entity registry's `hrefFor` that
 * every `EntityRef token="agent"` used — and that one had no idea a builtin
 * agent exists. A builtin agent linked into the user shell is a dead link.
 *
 * TWO THINGS DECIDE THE ADDRESS, and a caller usually holds neither:
 *
 *   1. THE KIND. `agent_type = 'builtin'` lives under the admin System Agents
 *      tree; everything else lives under `/agents`. A caller holding only an
 *      id must RESOLVE the kind (see `agentAddressCache.ts` — one batched,
 *      cached read), never assume it.
 *
 *   2. WHETHER THE ID IS AN AGENT AT ALL. The platform stores VERSION ids in
 *      first-class columns — `mandate.definition.default_holder_version_id`, a
 *      binding's `holder_version_id`, `is_version` in resolution results. A
 *      version id put in an agent slot produces a link to an agent that does
 *      not exist. A version resolves to its AGENT, then to that version.
 *
 * This module is the PURE half: given what is actually known, produce the
 * path. `agentAddressCache.ts` is the resolving half, `useAgentHref.ts` the
 * React door, and `app/(core)/agents/go/[id]` the always-valid address any
 * caller can build from an id alone. Nothing else may build an agent path —
 * `scripts/check-agent-links.ts` is the guard that keeps it so.
 */

/** Where a normal user agent lives. */
export const AGENT_BASE_PATH = "/agents";

/** Where a builtin (system) agent lives — the admin shell, on manage.*. */
export const SYSTEM_AGENT_BASE_PATH =
  "/administration/agents/system-agents/agents";

/**
 * A RESOLVED agent address: the agent's real id, its kind, and — when the
 * caller started from a version id — the version to land on.
 *
 * This is the shape `agx_resolve_agent_address` returns and the shape every
 * consumer (FIX-R9's binding rows included) receives.
 */
export interface AgentAddress {
  /** The AGENT's id. Never a version id. */
  agentId: string;
  /** `agent_type` verbatim; only the literal "builtin" changes the shell. */
  agentType: string | null;
  /** Human name, when the resolver knew it. */
  agentName?: string | null;
  /** True when the id the caller supplied was a VERSION id, not this agent. */
  isVersion?: boolean;
  /** The version to land on, when the caller started from a version id. */
  versionNumber?: number | null;
}

/**
 * What a link-rendering caller gets back. There is no fourth state, and in
 * particular there is no "guess" state: an address that cannot be resolved
 * produces a control that refuses in a sentence, never an href that 500s.
 */
export type AgentDoor =
  | { state: "ready"; href: string; address: AgentAddress }
  /**
   * The kind is still being resolved. `href` is the ALWAYS-VALID address
   * (`/agents/go/<id>`, see `app/(core)/agents/go/[id]/page.tsx`): the link
   * works right now, resolves server-side, and is upgraded in place the
   * moment the client knows the real one. A link is never dead while it
   * thinks — that is how a resolver failure becomes a silently broken page.
   */
  | { state: "resolving"; href: string }
  | { state: "unknown"; reason: string };

/**
 * The address anyone can build from an id alone. Always valid, always a real
 * navigation; the server figures out the shell (and the version).
 */
export function agentGoHref(id: string, sub = ""): string {
  return `${AGENT_BASE_PATH}/go/${encodeURIComponent(id)}${sub}`;
}

/** True when this row is part of the platform's own corpus. */
export function isSystemAgentType(agentType: string | null): boolean {
  return agentType === "builtin";
}

/** The route prefix an agent of this kind lives under. */
export function agentBasePathFor(agentType: string | null): string {
  return isSystemAgentType(agentType)
    ? SYSTEM_AGENT_BASE_PATH
    : AGENT_BASE_PATH;
}

/**
 * THE function. Everything that links to an agent ends up here.
 *
 * `sub` is appended verbatim and must start with "/" ("/run", "/build"); omit
 * it for the record's own page. When the address carries a `versionNumber`
 * (because the caller held a VERSION id) and no explicit `sub` is given, the
 * link lands on that version — the agent first, the version second, which is
 * the only correct reading of a version id.
 */
export function agentPathFor(address: AgentAddress, sub = ""): string {
  const base = `${agentBasePathFor(address.agentType)}/${address.agentId}`;
  if (sub) return `${base}${sub}`;
  if (address.versionNumber != null) return `${base}/v/${address.versionNumber}`;
  return base;
}

/** A resolved address as a ready door. */
export function agentDoorFor(address: AgentAddress, sub = ""): AgentDoor {
  return { state: "ready", href: agentPathFor(address, sub), address };
}

/**
 * The sentence shown when an id cannot be placed. It names the id, because on
 * an admin console the id IS the next debugging step.
 */
export function unresolvedAgentReason(id: string): string {
  return `No agent found for ${id} — it is not an agent or version you can see, or it was deleted.`;
}

function versionIdMessage(
  address: Pick<AgentAddress, "agentId" | "versionNumber">,
  suppliedId: string,
  context: string,
): string {
  return (
    `[agent-address] LOUD: ${context} was given ${suppliedId}, which is an ` +
    `agent VERSION id, not an agent id. It belongs to agent ` +
    `${address.agentId}${address.versionNumber != null ? ` (v${address.versionNumber})` : ""}. ` +
    `Resolve version ids through resolveAgentAddress() and link to the agent ` +
    `and then that version — never to the version id as if it were the agent.`
  );
}

/**
 * THE VERSION GUARD. Fails when a VERSION id reaches something that DECLARED
 * it holds an agent id.
 *
 * Silence here is how "this page is pointing to an agent that doesn't exist"
 * happens: a version id looks exactly like an agent id, the href builds fine,
 * and the 404 lands on the user. Throws in dev/test so a test can pin it;
 * screams in production, where throwing would take down a page that could
 * still render everything else.
 *
 * Call this from any surface whose column is contractually an AGENT id
 * (`default_holder_id`, a binding's `holder_id`). Do NOT call it from a
 * surface that legitimately accepts either — those resolve and land on the
 * version, which is the correct behaviour, and should use
 * `reportVersionIdRescued` instead.
 */
export function assertAgentIdNotVersion(
  address: Pick<AgentAddress, "agentId" | "isVersion" | "versionNumber">,
  suppliedId: string,
  context: string,
): void {
  if (!address.isVersion || suppliedId === address.agentId) return;
  const message = versionIdMessage(address, suppliedId, context);
  if (process.env.NODE_ENV !== "production") throw new TypeError(message);
  console.error(message);
}

/**
 * A version id arrived where either kind is accepted; the link was corrected
 * to agent + version. Correct, but never silent — the caller's data model put
 * a version id in an agent-shaped slot and someone should know.
 */
export function reportVersionIdRescued(
  address: Pick<AgentAddress, "agentId" | "isVersion" | "versionNumber">,
  suppliedId: string,
  context: string,
): void {
  if (!address.isVersion || suppliedId === address.agentId) return;
  console.error(
    `${versionIdMessage(address, suppliedId, context)} This link was corrected automatically.`,
  );
}

/** The minimum a caller needs to place a row it already holds. */
export interface AgentPathRow {
  id: string;
  agent_type: string | null;
}

/**
 * The row form, for the many call sites that already hold the record. Same
 * rule, no read — a row's `agent_type` is the answer.
 */
export function agentHrefFromRow(row: AgentPathRow, sub = ""): string {
  return agentPathFor({ agentId: row.id, agentType: row.agent_type }, sub);
}

/** Where "New agent" goes for the corpus this page is currently showing. */
export function newAgentHref(system: boolean): string {
  return system ? `${SYSTEM_AGENT_BASE_PATH}/new` : `${AGENT_BASE_PATH}/new`;
}
