// features/dictionary/constants.ts
//
// Stable identifiers + labels for the Custom Dictionary feature.

import type { DictLevel } from "@/features/dictionary/types";

/**
 * Builtin Dictionary Assistant agent (agx_agent id) — built via the aidream
 * Agent Factory (internal_agents/dictionary_assistant.md), real UUID assigned
 * at build time. The "Ask assistant" buttons launch this agent as a
 * floating-chat widget. The discoverable global shortcut + the two skills it
 * uses live in the DB (seeded by migrations/dict_*.sql) and are referenced
 * there by their own ids — not from frontend code.
 */
export const DICTIONARY_AGENT_IDS = {
  assistant: "ab1a868e-b866-4ade-9383-fd63b0928c7c",
} as const;

/** Human labels for the four owner levels (+ the per-task "custom" source). */
export const DICT_LEVEL_LABELS: Record<DictLevel | "custom", string> = {
  user: "Personal",
  organization: "Organization",
  scope_type: "Scope type",
  scope: "Scope",
  custom: "This task",
};
