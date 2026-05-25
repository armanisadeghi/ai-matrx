/**
 * Synthetic agent ids — `cmp-` prefixed, memory-only `AgentDefinition`
 * records used by the comparison / variation features to clone a template
 * agent without ever persisting it.
 *
 * The canonical definition lives HERE, in the agents feature, because the
 * persistence layer (the save thunks in `./thunks.ts`) is what relies on
 * it: every DB-write thunk early-returns on a synthetic id so a `cmp-`
 * record can NEVER reach `supabase.from('agx_agent')`. That makes the
 * no-persist guarantee structural rather than incidental ("we just didn't
 * mount autosave").
 *
 * `features/agent-comparison/shared/forkAgentForVariant.ts` re-exports
 * these so existing comparison-mode imports keep resolving from there.
 */

/** Prefix that marks an agent id as synthetic (never persisted). */
export const SYNTHETIC_AGENT_ID_PREFIX = "cmp-";

export function isSyntheticAgentId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SYNTHETIC_AGENT_ID_PREFIX);
}
