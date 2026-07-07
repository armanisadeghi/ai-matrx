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

/**
 * Explicit per-surface dictionary key. Ambient audio (read-aloud playback + STT)
 * follows the ONE global active context by default (see
 * features/dictionary/activeContextBridge.ts) — a key is only passed to scope a
 * surface to its OWN stored selection.
 *
 *  - `SCRIBE_DICTIONARY_SURFACE` — the transcript Scribe's own selector surface,
 *    so the Scribe's voice-out + "Read aloud" honor the picks made in its
 *    dictionary indicator.
 */
export const SCRIBE_DICTIONARY_SURFACE = "matrx-user/transcript-scribe";

/** Human labels for the four owner levels (+ the per-task "custom" source). */
export const DICT_LEVEL_LABELS: Record<DictLevel | "custom", string> = {
  user: "Personal",
  organization: "Organization",
  scope_type: "Scope type",
  scope: "Scope",
  custom: "This task",
};
