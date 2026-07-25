/**
 * features/agents/components/agent-listings/agent-peek-tracker.ts
 *
 * Module-scoped record of which agent is currently open in a sneak-peek
 * panel. The sneak-peek modal's open state is card-local (`AgentCard` /
 * `AgentListItem` each own their own), so the Agents Hub surface emitter
 * (`AgentsGrid`) can't reach it through props or Redux. The modal registers
 * here on open (and re-registers as prev/next navigation changes the shown
 * agent); the hub's `getScope` reads it at trigger time.
 *
 * Deliberately not Redux: this is ephemeral, single-value, read-at-trigger
 * UI state — a slice would be pure ceremony (see the surface runtime's own
 * module-registry precedent in `SurfaceRuntimeContext.tsx`).
 */

let peekedAgentId: string | null = null;

/** Set (on open / nav) or clear (on close / unmount) the peeked agent. */
export function setPeekedAgentId(id: string | null): void {
  peekedAgentId = id;
}

/** The agent currently shown in a sneak-peek panel, or null when none. */
export function getPeekedAgentId(): string | null {
  return peekedAgentId;
}
