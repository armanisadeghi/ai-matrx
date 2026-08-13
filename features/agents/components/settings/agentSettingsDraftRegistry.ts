/**
 * features/agents/components/settings/agentSettingsDraftRegistry.ts
 *
 * A one-slot publish point for the `AgentSettingsForm` draft, so the surface
 * that OWNS the Agent Settings window can emit what is actually in the form's
 * inputs right now.
 *
 * WHY THIS EXISTS. `matrx-user/agent-settings` mounts its `SurfaceRuntimeProvider`
 * on `AgentSettingsWindow`, but the fields an agent writes live two levels down
 * in `AgentSettingsForm`, in COMPONENT STATE (`draft` / `tagsInput`) rather than
 * in Redux. Without this the window could only emit the SAVED record, so the
 * read twins of `settings_catalog_profile` would report the stored description
 * while a different one sat unsaved in the box — the agent's own applied write
 * would read back as missing. The write half has a seam for exactly this
 * (`useSurfaceWriteHandlers`, which registers a deep child's handlers by surface
 * name); the read half has none, so the form publishes here and the window's
 * `getScope` reads it at Run time.
 *
 * ONE SLOT is correct rather than a map: `AgentSettingsWindow` renders the form
 * with `key={activeTabId}`, so exactly one instance is mounted at a time, and
 * publication is gated on the same prop that gates handler registration — the
 * advanced editor's Overview tab renders this same form and deliberately
 * publishes nothing. Reads are matched on `agentId` anyway, so a stale slot from
 * a torn-down instance can never be served for a different agent.
 *
 * Deliberately NOT React state and NOT Redux: it is read once, imperatively, at
 * `getScope()` time, and re-rendering the window on every keystroke of the form
 * is exactly what the surface runtime is designed to avoid.
 */

export interface AgentSettingsDraftSnapshot {
  /** The agent whose form produced this snapshot. */
  agentId: string;
  /** Live contents of the Name box (staged, not necessarily saved). */
  name: string;
  /** Live contents of the Description box. */
  description: string;
  /** Live contents of the Category picker. */
  category: string;
  /** Live tag set, already split and trimmed the way Save will split it. */
  tags: string[];
  /** True when the form has changes the user has not saved yet. */
  isDirty: boolean;
}

let published: AgentSettingsDraftSnapshot | null = null;

/** Called by the form on every draft change while it is the surface's host. */
export function publishAgentSettingsDraft(
  snapshot: AgentSettingsDraftSnapshot,
): void {
  published = snapshot;
}

/**
 * Called on unmount. Guarded on `agentId` so a teardown that lands AFTER the
 * next tab's form has already published cannot blank the live snapshot.
 */
export function clearAgentSettingsDraft(agentId: string): void {
  if (published?.agentId === agentId) published = null;
}

/** The live draft for `agentId`, or null when that form is not mounted. */
export function readAgentSettingsDraft(
  agentId: string | null,
): AgentSettingsDraftSnapshot | null {
  if (!agentId) return null;
  return published && published.agentId === agentId ? published : null;
}
