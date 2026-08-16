// features/ai-work/conversations/types.ts
//
// What is genuinely CONVERSATION-specific about the canonical entity list at
// /work/conversations. The query/filter/facet/count shapes live in
// lib/entity-list/types.ts and the scope vocabulary in lib/list-scope/types.ts.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";
import type { EntityFilters } from "@/lib/entity-list/types";

/** One row, exactly as cvx_list_scoped returns it. Never hand-mirrored. */
export type ConversationBrowseRow =
  Database["public"]["Functions"]["cvx_list_scoped"]["Returns"][number];

/**
 * Conversations are `visibility='personal'` in practice, so a Public tab would
 * be a permanently empty promise. Three scopes, and Industry has no corpus
 * here — the shell renders exactly what is declared (lib/entity-list rule 6).
 */
export const CONVERSATION_LIST_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
];

// ── THE HONESTY AXIS ────────────────────────────────────────────────────────
//
// `conversation_type` splits the corpus into work a PERSON did and runs a
// MACHINE did on their behalf. On Arman's account that is 5,911 vs 2,486: an
// unfiltered list is 30% internal batch derivations, sweeps and meta-builder
// calls, each carrying a "Subagent" pill that says nothing because every row
// says it.
//
// So the default list is the human-relevant subset — expressed as a REAL entry
// in the filter bag, never a hidden SQL predicate — and the machine runs keep a
// visible, counted door (`ConversationAudienceFilter`).

/** Conversation types a person recognises as their own work. */
export const HUMAN_CONVERSATION_TYPES = [
  "standard",
  "workflow",
  "research",
  "scheduled",
  "podcast",
] as const;

/** Conversation types the platform generates for itself. */
export const MACHINE_CONVERSATION_TYPES = [
  "subagent",
  "auto",
  "system",
  "hindsight_replay",
] as const;

export type ConversationAudience = "people" | "machine" | "all" | "custom";

/** The surface's honest starting point. See `EntityListConfig.defaultFilters`. */
export const DEFAULT_CONVERSATION_FILTERS: EntityFilters = {
  conversation_type: {
    kind: "select",
    values: [...HUMAN_CONVERSATION_TYPES],
  },
};

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/**
 * Which audience the CURRENT filter bag represents. Derived, never stored — two
 * controls (this one and the column header) write one filter, and a derived
 * reading is the only way they cannot disagree. A hand-built selection reads
 * back as "custom" rather than being silently rounded to a preset.
 */
export function readAudience(filters: EntityFilters): ConversationAudience {
  const value = filters.conversation_type;
  if (!value) return "all";
  if (value.kind !== "select") return "custom";
  if (sameSet(value.values, HUMAN_CONVERSATION_TYPES)) return "people";
  if (sameSet(value.values, MACHINE_CONVERSATION_TYPES)) return "machine";
  return "custom";
}

/** The filter bag for one audience. "all" removes the axis entirely. */
export function applyAudience(
  filters: EntityFilters,
  audience: Exclude<ConversationAudience, "custom">,
): EntityFilters {
  const next = { ...filters };
  if (audience === "all") {
    delete next.conversation_type;
    return next;
  }
  next.conversation_type = {
    kind: "select",
    values:
      audience === "people"
        ? [...HUMAN_CONVERSATION_TYPES]
        : [...MACHINE_CONVERSATION_TYPES],
  };
  return next;
}
