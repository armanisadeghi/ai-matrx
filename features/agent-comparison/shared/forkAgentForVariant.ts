/**
 * forkAgentForVariant
 *
 * Comparison modes that need to VARY part of the agent definition per
 * column (System Prompt mode, Tools mode, future Settings-over-agent
 * mode) work by giving each column its own synthetic copy of the agent
 * record in `state.agentDefinition.agents`. The column's manual instance
 * is then keyed to that synthetic id so when the manual-execute thunk
 * reads `state.agentDefinition.agents[sourceId]` it sees the per-column
 * edits.
 *
 * Synthetic ids carry a `cmp-` prefix so the save-agent paths are easy
 * to gate against accidental DB writes. (Server-side, the agx_agent.id
 * column is uuid only, so even if a save slipped through PostgREST would
 * reject the id format.)
 *
 * The synthetic record lives entirely in Redux memory for the page
 * session — no DB persistence. When the column is removed or the page
 * cleared, the synthetic record is left behind (next mount re-forks
 * fresh anyway); a future cleanup could prune them.
 */

import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  upsertAgent,
} from "@/features/agents/redux/agent-definition/slice";
import { SYNTHETIC_AGENT_ID_PREFIX } from "@/features/agents/redux/agent-definition/synthetic-id";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";

/**
 * Returns a fresh synthetic agent id. Caller is responsible for seeding
 * the record via `forkAgentForVariant` BEFORE using the id with
 * `createManualInstance`.
 */
export function newSyntheticAgentId(): string {
  return `${SYNTHETIC_AGENT_ID_PREFIX}${crypto.randomUUID()}`;
}

/**
 * Deep-ish clone of an agent definition. Uses `structuredClone` so
 * nested objects (messages content arrays, settings, tools) are detached
 * from the original — subsequent edits to the synthetic don't leak back
 * to the source.
 */
function cloneAgent(source: AgentDefinition, syntheticId: string): AgentDefinition {
  const cloned = structuredClone(source);
  cloned.id = syntheticId;
  // Detach from source's lineage so version-pin logic etc. doesn't fire
  // for the synthetic. The synthetic is "current" by definition for the
  // column's manual execution.
  cloned.isVersion = false;
  cloned.parentAgentId = null;
  return cloned;
}

/**
 * Read the locked agent from state, fork it under a new synthetic id,
 * and upsert the synthetic into agentDefinition.agents.
 *
 * Returns the synthetic id (caller uses it as `agentId` when creating
 * the column's manual instance), or `null` if the source agent isn't
 * loaded into the slice yet.
 */
export function forkAgentForVariant(
  dispatch: AppDispatch,
  state: RootState,
  sourceAgentId: string,
): string | null {
  const source = state.agentDefinition.agents?.[sourceAgentId];
  if (!source) return null;
  const syntheticId = newSyntheticAgentId();
  dispatch(upsertAgent(cloneAgent(source, syntheticId)));
  return syntheticId;
}

/**
 * Convenience getter for components — pulls the synthetic agent record
 * if it exists; falls back to null. Used by editors that need to know
 * the current value of whatever they're letting the user edit.
 */
export function selectAgentDefinitionById(
  state: RootState,
  agentId: string,
): AgentDefinition | undefined {
  return state.agentDefinition.agents?.[agentId];
}
