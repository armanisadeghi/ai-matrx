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

// ── THE THREE BUCKETS ───────────────────────────────────────────────────────
//
// Arman's ruling (2026-09-07): the top of the list splits the way a person
// thinks about their conversations, not the way the database types them.
//
//   internal — runs the platform started for itself while the app works:
//              subagents, workflow steps, scheduled jobs, podcast builds,
//              research sweeps, page-automatic runs, hindsight replays.
//   chat     — conversations a PERSON started directly, from any AI Matrx
//              surface: chat, agent run, build, the extension, the desktop.
//   external — sessions mirrored from an outside coding app: Claude Code,
//              Codex, Cursor, VS Code.
//
// Everything else (which app, which run type, which provider) is a SECOND cut
// inside a bucket, never a peer of it.
//
// The bucket is DERIVED SERVER-SIDE (`public.cvx_audience`, one expression
// shared by the list RPC and the facets RPC) from facts the row already has:
// a coding-session binding or a coding source_app is external no matter what
// else the row says; a machine origin_class is internal; a human origin is
// chat; pre-provenance rows fall back to conversation_type. The client only
// ever names the bucket — it never re-derives it, so a chip's count is exactly
// what clicking it shows.
//
// The filter key is `audience`, a REAL entry in the filter bag (never a hidden
// SQL predicate), so the Filters panel, the URL and the chips all agree.

export const CONVERSATION_AUDIENCES = ["chat", "external", "internal"] as const;
export type ConversationAudienceId = (typeof CONVERSATION_AUDIENCES)[number];

/** The chip vocabulary: one of the three buckets, all of them, or a hand-built set. */
export type ConversationAudience = ConversationAudienceId | "all" | "custom";

/**
 * Conversation types the platform generates for itself. Still the definition
 * behind `isMachineConversationType` (provenance panel copy) and the internal
 * bucket's run-type chips; the BUCKET itself is derived on the server.
 */
export const INTERNAL_CONVERSATION_TYPES = [
  "subagent",
  "auto",
  "system",
  "hindsight_replay",
  "workflow",
  "scheduled",
  "research",
  "podcast",
] as const;

/** Apps whose sessions are mirrored from outside AI Matrx. Mirrors `cvx_audience`. */
export const EXTERNAL_SOURCE_APPS = [
  "claude-code",
  "codex",
  "cursor",
  "vscode",
] as const;

/**
 * The surface's honest starting point: the conversations a person had
 * themselves. The other two buckets keep a visible, counted door. See
 * `EntityListConfig.defaultFilters`.
 */
export const DEFAULT_CONVERSATION_FILTERS: EntityFilters = {
  audience: { kind: "select", values: ["chat"] },
};

/**
 * Which audience the CURRENT filter bag represents. Derived, never stored — the
 * chips, the Filters panel and the URL write one filter, and a derived reading
 * is the only way they cannot disagree. A hand-built selection reads back as
 * "custom" rather than being silently rounded to a preset.
 */
export function readAudience(filters: EntityFilters): ConversationAudience {
  const value = filters.audience;
  if (!value) return "all";
  if (value.kind !== "select") return "custom";
  if (value.values.length === 1) {
    const only = value.values[0];
    if ((CONVERSATION_AUDIENCES as readonly string[]).includes(only)) {
      return only as ConversationAudienceId;
    }
  }
  return "custom";
}

/**
 * The filter bag for one audience. "all" removes the axis entirely. Switching
 * buckets also drops the second-cut filters (app, run type) that only make
 * sense inside the bucket being left — otherwise "External" could arrive
 * pre-narrowed to "Workflow run" and show nothing, which reads as a broken
 * page rather than a filter.
 */
export function applyAudience(
  filters: EntityFilters,
  audience: ConversationAudienceId | "all",
): EntityFilters {
  const next = { ...filters };
  delete next.source_app;
  delete next.conversation_type;
  if (audience === "all") {
    delete next.audience;
    return next;
  }
  next.audience = { kind: "select", values: [audience] };
  return next;
}
