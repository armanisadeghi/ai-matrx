/**
 * Types for the Agent Copy Groomer — the page-level "Copy for AI" window that
 * lets the user groom the payload before copying: pick a variation preset,
 * dial each section's detail level, cut sections that are safe to cut, and
 * watch the live size estimate.
 *
 * Kept separate from the window component so pages can declare their sections
 * without pulling the WindowPanel stack into their chunk (the window itself is
 * loaded via `AgentCopyGroomerLauncher`'s dynamic import).
 */

import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";

/** Detail levels, largest → smallest. */
export type GroomerLevel = "full" | "compact" | "brief";

/** A section's current selection — a level, or cut entirely. */
export type GroomerSelection = GroomerLevel | "off";

export const GROOMER_LEVELS: GroomerLevel[] = ["full", "compact", "brief"];

export interface AgentCopyGroomerSection {
  /** Stable slug — becomes the section's key inside the payload data object. */
  id: string;
  title: string;
  /** One-liner shown under the title. */
  description?: string;
  /**
   * True when cutting this section entirely is known-safe (raw provider
   * receipts, big detail tables…). The Minimal preset turns cuttable
   * sections off; non-cuttable sections never drop below "brief".
   */
  cuttable?: boolean;
  /**
   * Optional per-level labels for the control, e.g.
   * { full: "All 100 rows", compact: "Top 25", brief: "Counts only" }.
   */
  levelLabels?: Partial<Record<GroomerLevel, string>>;
  /**
   * Build this section's data at a detail level. Called live for sizing and
   * at copy time — keep it pure and cheap. Return null/undefined to
   * contribute nothing at that level.
   */
  build: (level: GroomerLevel) => unknown;
  /** Initial selection. Default "full". */
  defaultSelection?: GroomerSelection;
}

export interface AgentCopyGroomerConfig {
  /** Toast/tooltip label, e.g. "Backlink intelligence page". */
  label: string;
  /** Root xml tag for the assembled payload, e.g. "marketing-backlinks-page". */
  kind: string;
  /** Where the user is, in words (buildAgentPayload location). */
  location: string;
  /** One line: what the whole payload is. */
  description: string;
  attributes?: AgentPayloadInput["attributes"];
  context?: AgentPayloadInput["context"];
  /** Optional human-readable summary included in every variation. */
  summary?: string;
  sections: AgentCopyGroomerSection[];
}

export type GroomerPreset = "everything" | "balanced" | "minimal";

/** Resolve a preset into per-section selections. */
export function applyGroomerPreset(
  preset: GroomerPreset,
  sections: AgentCopyGroomerSection[],
): Record<string, GroomerSelection> {
  const out: Record<string, GroomerSelection> = {};
  for (const section of sections) {
    if (preset === "everything") out[section.id] = "full";
    else if (preset === "balanced") out[section.id] = "compact";
    else out[section.id] = section.cuttable ? "off" : "brief";
  }
  return out;
}

/** Initial selections: each section's default, falling back to "full". */
export function defaultGroomerSelections(
  sections: AgentCopyGroomerSection[],
): Record<string, GroomerSelection> {
  const out: Record<string, GroomerSelection> = {};
  for (const section of sections) {
    out[section.id] = section.defaultSelection ?? "full";
  }
  return out;
}
