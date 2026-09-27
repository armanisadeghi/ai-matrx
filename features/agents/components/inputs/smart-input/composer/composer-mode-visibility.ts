/**
 * THE ONE TABLE — what each composer mode shows (Amendment 1, A1).
 *
 * Every mode-aware control reads this table; none carries its own mode check.
 * Hiding is chrome only: switching to a quieter mode never turns anything off
 * (a tool added in Work stays on in Chat; RAG still auto-injects for a big PDF
 * in Chat — the user just never sees the switch).
 */

import type { ComposerMode, ComposerSize } from "./composer-types";

export type ComposerControl =
  // Agent pill
  | "agent.presets" // Chat: ★ presets · Custom · Manage chat agents
  | "agent.panel" // Work+: agent + Change · Recent · Model
  | "agent.overrides" // Advanced: Overrides · Advanced in the agent panel
  // + menu
  | "plus.attach" // files · voice · link · workspace
  | "plus.templates"
  | "plus.memory"
  | "plus.skills"
  | "plus.tools"
  | "plus.connectors"
  | "plus.previewContext"
  | "plus.documents" // Working doc · Scratchpad switches
  | "plus.environment"
  // Rows
  | "chips.row" // Cloud · connectors · Browser
  | "chips.repos"
  | "meta.effort";

const CHAT: readonly ComposerControl[] = [
  "agent.presets",
  "plus.attach",
  "plus.templates",
  "plus.memory",
];

const WORK: readonly ComposerControl[] = [
  "agent.panel",
  "plus.attach",
  "plus.templates",
  "plus.memory",
  "plus.skills",
  "plus.tools",
  "plus.connectors",
  "plus.previewContext",
  "plus.documents",
  "chips.row",
  "meta.effort",
];

const ADVANCED: readonly ComposerControl[] = [
  ...WORK,
  "agent.overrides",
  "plus.environment",
  "chips.repos",
];

const VISIBLE: Record<ComposerMode, ReadonlySet<ComposerControl>> = {
  chat: new Set(CHAT),
  work: new Set(WORK),
  advanced: new Set(ADVANCED),
};

export function composerShows(mode: ComposerMode, control: ComposerControl): boolean {
  return VISIBLE[mode].has(control);
}

/**
 * At compact width the meta row holds two pills only (agent · Auto); Scope and
 * Output move into the + menu (A5 compact-composer ruling).
 */
export function metaRowHoldsScopeAndOutput(size: ComposerSize): boolean {
  return size !== "compact";
}
