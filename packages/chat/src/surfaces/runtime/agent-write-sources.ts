/**
 * AGENT WRITE SOURCES — a copy of a surface the agent was HANDED stays
 * writable through the plain `apply_surface_write` path.
 *
 * A host that gives an agent one copy of a surface without making it the live
 * one (a board's `board_open_item` hands it a tile's capture) registers a
 * provider here. When an agent-origin write arrives on the global path,
 * `applySurfaceWrite` asks the providers (newest registration first) whether
 * one of their handed copies should take it; a provider answers with that
 * copy's registry, held mounted until `release`.
 *
 * Why (real test, 2026-10-02): the agent opened a note on a board, then in one
 * turn sent two `apply_surface_write` edits beside a `board_add_tile`. The add
 * selected the new tile, the note left the global stack, and both writes
 * failed — "declares no write target" and "no longer open here" — for a target
 * the agent had just been handed. Resolving the write against the handed copy's
 * capture makes it independent of which tile happens to be selected, through
 * the same seam, policy and approval card.
 *
 * The provider owns the precedence rule (when its copy beats what is on
 * screen); the seam only asks.
 */
import type { SurfaceRegistry } from "./SurfaceRuntimeContext";

export interface AgentWriteSourceQuery {
  targetName: string;
  /** The surface the agent named, if it named one. */
  surfaceName?: string;
  /** The agent run's conversation, when known. */
  conversationId?: string;
  /** True when a surface live on screen declares this target too. */
  onScreenDeclares: boolean;
}

export interface AgentWriteSourceLease {
  source: SurfaceRegistry;
  /** Let the copy sleep again once the write (and its card) is done. */
  release: () => void;
}

export type AgentWriteSourceProvider = (
  query: AgentWriteSourceQuery,
) => Promise<AgentWriteSourceLease | null>;

const providers: AgentWriteSourceProvider[] = [];

/** Register a host's provider; returns its removal. */
export function registerAgentWriteSource(provider: AgentWriteSourceProvider): () => void {
  providers.push(provider);
  return () => {
    const at = providers.lastIndexOf(provider);
    if (at >= 0) providers.splice(at, 1);
  };
}

/** The first handed copy (newest provider first) that should take this write, or null. */
export async function leaseAgentWriteSource(
  query: AgentWriteSourceQuery,
): Promise<AgentWriteSourceLease | null> {
  for (const provider of [...providers].reverse()) {
    try {
      const lease = await provider(query);
      if (lease) return lease;
    } catch (error) {
      // A broken provider never blocks the write: the on-screen path still runs.
      console.error("[agent-write-sources] a provider failed; using the on-screen surfaces.", error);
    }
  }
  return null;
}
