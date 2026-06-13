// features/dictionary/constants.ts
//
// Stable identifiers for the Custom Dictionary system. The agent + skill UUIDs
// are seeded by migrations/dict_system_agents_and_skills.sql — keep them in sync.

import type { DictLevel } from "@/features/dictionary/types";

/** Builtin dictionary agents (agx_agent ids). */
export const DICTIONARY_AGENT_IDS = {
  assistant: "a91c7000-0000-4000-a000-000000000001",
  terminologyCurator: "a91c7000-0000-4000-a000-000000000002",
  pronunciationCoach: "a91c7000-0000-4000-a000-000000000003",
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
