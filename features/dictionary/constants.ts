// features/dictionary/constants.ts
//
// Stable identifiers for the Custom Dictionary system. The skill UUIDs are
// seeded by migrations/dict_system_agents_and_skills.sql. The agent is built via
// the aidream Agent Factory (internal_agents/dictionary_assistant.md), NOT a
// hand-rolled SQL seed — its UUID is assigned at build time.

import type { DictLevel } from "@/features/dictionary/types";

/** Builtin Dictionary Assistant agent — factory-built (agx_agent id). */
export const DICTIONARY_AGENT_IDS = {
  assistant: "ab1a868e-b866-4ade-9383-fd63b0928c7c",
} as const;

/** Internal skills (skl_definitions ids). */
export const DICTIONARY_SKILL_IDS = {
  management: "d1c70000-0000-4000-a000-000000000001",
  pronunciation: "d1c70000-0000-4000-a000-000000000002",
} as const;

/** The `dictionary` tool_def id (registered by aidream migration 0102). */
export const DICTIONARY_TOOL_ID = "04920d8d-0a54-4010-8ac1-9675942b1aec";

/** Human labels for the four owner levels. */
export const DICT_LEVEL_LABELS: Record<DictLevel, string> = {
  user: "Personal",
  organization: "Organization",
  scope_type: "Scope type",
  scope: "Scope",
};

/** The surface-user-state feature key the dictionary selection persists under. */
export const DICTIONARY_FEATURE_KEY = "dictionary";
