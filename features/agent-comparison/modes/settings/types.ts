/**
 * Settings-mode types.
 *
 * In this mode the agent + version + variables + user message are LOCKED
 * across every column. The varied dimension is the LLM settings overrides
 * (model, temperature, reasoning effort, max output tokens, etc.). Each
 * column runs the same locked request under its own overrides so the user
 * can compare quality / speed / cost / behavior across configurations.
 */

import type { LLMParams } from "@/features/agents/types/agent-api-types";

export interface SettingsColumn {
  /** Stable local id — survives instance recreation. */
  columnId: string;
  /** Server-honored conversation id (client-minted). Each column gets
   *  its own so executor isolation works and feedback persists per run. */
  conversationId: string;
  /**
   * User-facing short label shown in the header. Defaults to a derived
   * "Variant N" but the user can rename it (e.g. "GPT-4 hot",
   * "Claude Sonnet reasoning high").
   */
  label: string;
  /** Per-column collapsed flag — same UX as the open-mode column. */
  collapsed: boolean;
}

/**
 * The locked-axis values for the entire page. Stamped onto every column's
 * instance at submit time so every variant runs the same inputs through
 * different settings.
 */
export interface SettingsLockedSetup {
  /** Agent picked at the page level. Null = not configured yet. */
  agentId: string | null;
  /** "current" (live pointer) or a specific version number. */
  agentVersion: "current" | number | null;
  /** agx_version.id for non-"current" pins; null otherwise. */
  agentVersionId: string | null;
  /** Variable values the user filled in (locked across columns). */
  variables: Record<string, unknown>;
  /** User message broadcast to every column on submit. */
  userMessage: string;
}

export interface SettingsBattleState {
  locked: SettingsLockedSetup;
  columns: SettingsColumn[];
  /** Persisted set id (null = unsaved scratchpad). */
  activeSetId: string | null;
  activeSetName: string | null;
  isSubmittingAll: boolean;
}

/**
 * The subset of LLMParams the per-column editor exposes today. Anything
 * not in this list passes through unchanged (the executor reads the full
 * `instanceModelOverrides.overrides` map regardless).
 */
export type EditableOverrideKey =
  | "model"
  | "temperature"
  | "max_output_tokens"
  | "reasoning_effort"
  | "thinking_level"
  | "top_p";

export type EditableOverrides = Pick<LLMParams, EditableOverrideKey>;
