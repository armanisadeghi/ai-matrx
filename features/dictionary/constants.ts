// features/dictionary/constants.ts
//
// Stable identifiers + labels for the Custom Dictionary feature.

import type { DictLevel } from "@/features/dictionary/types";

/**
 * The Mandate behind every "Ask assistant" button — resolved at launch
 * (`launchMandate` / `useMandate`), never a frozen agent id. The system default
 * is the factory-built Dictionary Assistant (aidream
 * `internal_agents/dictionary_assistant.md`); users rebind at `/agents/mandates`.
 * The discoverable global shortcut + the two skills it uses live in the DB.
 */
export const DICTIONARY_ASSISTANT_MANDATE_KEY = "dictionary.workspace_guide";

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
