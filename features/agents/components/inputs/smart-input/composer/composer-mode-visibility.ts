/**
 * THE ONE TABLE — what each composer mode shows (Amendment 1, A1).
 *
 * Every mode-aware control reads this table; none carries its own mode check.
 *
 * 🚨 NO MODE HAS LESS CAPABILITY (Arman, 2026-09-27): "it cannot have any less
 * capability, it just has them tucked away in the + icon." The + menu (and the
 * phone sheet) is the same in every mode; the modes differ only in CHROME —
 * the agent pill, the chips row, the Effort pill, repository chips.
 *
 * Hiding is chrome only: switching to a quieter mode never turns anything off
 * (a tool added in Work stays on in Chat; RAG still auto-injects for a big PDF
 * in Chat — the user just never sees the switch).
 */

import type { ComposerMode, ComposerSize } from "./composer-types";
import type { RunControlsTab } from "../RunControlsTabPanel";

export type ComposerControl =
  // Agent pill
  | "agent.presets" // Chat: ★ presets · Custom · Manage chat agents
  | "agent.panel" // Work+: agent + Change · Recent · Model
  | "agent.overrides" // Advanced: Overrides · Advanced in the agent panel
  // + menu
  | "plus.attach" // files · voice · link · workspace
  | "plus.templates"
  | "plus.memory"
  | "plus.enterSends" // what Enter does — every composer must be able to say it
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

/** The + menu — identical in every mode. */
const PLUS: readonly ComposerControl[] = [
  "plus.attach",
  "plus.templates",
  "plus.memory",
  "plus.enterSends",
  "plus.skills",
  "plus.tools",
  "plus.connectors",
  "plus.previewContext",
  "plus.documents",
  "plus.environment",
];

const CHAT: readonly ComposerControl[] = [...PLUS, "agent.presets"];

const WORK: readonly ComposerControl[] = [...PLUS, "agent.panel", "chips.row", "meta.effort"];

const ADVANCED: readonly ComposerControl[] = [...WORK, "agent.overrides", "chips.repos"];

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

/**
 * Phones: the `+` opens the run-controls bottom sheet (tabs), not the cascade —
 * with EVERY tab in every mode (no mode has less capability).
 */
const ALL_SHEET_TABS = new Set<RunControlsTab>([
  "quickset",
  "attach",
  "context",
  "document",
  "model",
  "tools",
  "skills",
  "sandbox",
  "memory",
  "settings",
  "creator",
]);
const MOBILE_SHEET_TABS: Record<ComposerMode, ReadonlySet<RunControlsTab>> = {
  chat: ALL_SHEET_TABS,
  work: ALL_SHEET_TABS,
  advanced: ALL_SHEET_TABS,
};

export function mobileSheetShowsTab(mode: ComposerMode, tab: RunControlsTab): boolean {
  return MOBILE_SHEET_TABS[mode].has(tab);
}
