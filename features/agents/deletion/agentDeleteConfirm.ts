/**
 * features/agents/deletion/agentDeleteConfirm.ts — THE ONE confirm copy for
 * deleting an agent.
 *
 * Why this file exists: `deleteAgent` is a SOFT delete. It stamps
 * `agent.definition.deleted_at` and nothing else — no row is destroyed, no
 * version is purged, and an admin can put the row back. Until 2026-09-11 two
 * hand-written sentences promised the opposite ("This permanently removes the
 * agent and its versions. This cannot be undone." in
 * `features/agents/browse/useAgentRowActions.tsx`, and "This action cannot be
 * undone." in `features/agents/components/agent-listings/AgentsGrid.tsx`).
 * A screen is absent or honest, never lying (law 4), so both now read from
 * here and any third delete surface must too.
 *
 * The shape of the copy is the one `features/mandates/admin/MandatesConsole.tsx`
 * already uses for removing a mandate: name what STOPS, name what SURVIVES,
 * say plainly that it is a soft removal an admin can undo. "Are you sure?"
 * tells a person nothing they did not already know.
 *
 * Guard: `features/agents/deletion/__tests__/agent-delete-confirm.test.ts`
 * fails if any file that dispatches `deleteAgent` carries permanence wording.
 *
 * NOT covered here: `purgeAgentVersions` (→ `agx_purge_versions`) really does
 * destroy old VERSION rows, but it deletes versions, never an agent, and as of
 * 2026-09-11 it has zero UI callers. If it ever gets one, it needs its own
 * honest copy — it must not borrow this one.
 */

/** The confirm-dialog options shape this builder fills in for `confirm()`. */
export interface AgentDeleteConfirmCopy {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "destructive";
}

/**
 * Build the confirm a person reads before an agent is soft-deleted.
 *
 * @param agentName The agent's display name. A blank or missing name falls
 *   back to "this agent" rather than rendering an empty pair of quotes.
 */
export function buildAgentDeleteConfirm(
  agentName?: string | null,
): AgentDeleteConfirmCopy {
  const trimmed = (agentName ?? "").trim();
  const quoted = trimmed ? `"${trimmed}"` : "this agent";

  return {
    title: trimmed ? `Delete ${quoted}?` : "Delete this agent?",
    description:
      `${trimmed ? quoted : "This agent"} stops running: it leaves your agent lists and every picker, ` +
      `and anything wired to it — shortcuts, bindings, and apps that launch it — stops finding it. ` +
      `Conversations that already used it keep their history and still point at it; they just cannot run it again. ` +
      `This is a soft delete: the record and its version history are kept, so an admin can restore it if this was a mistake.`,
    confirmLabel: "Delete it",
    cancelLabel: "Keep it",
    variant: "destructive",
  };
}
