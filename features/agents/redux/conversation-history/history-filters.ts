/**
 * history-filters — the ONE composition of a conversation-history scope's
 * provenance filters onto the `chat.conversation` list query. Pure (no
 * Supabase import) so the gate order is provable in a unit test
 * (`__tests__/lane-gate.test.ts`).
 */

import type { ConversationLane } from "./lanes";
import type { ConversationHistoryScopeState } from "./types";

/** The provenance filters a scope applies to its list query. */
export interface HistoryFilterInput {
  excludeSourceFeatures: string[];
  includeSourceFeatures: string[];
  includeSourceApps: string[];
  includeEmptySource: boolean;
  includeOriginClasses: string[];
  /** Lane gate. `null` = no gate; `[]` = every lane off. */
  includeLanes: ConversationLane[] | null;
}

/** The slice of the PostgREST filter builder the history filters use. */
export interface HistoryFilterable<Q> {
  neq(column: string, value: string): Q;
  or(filters: string): Q;
  in(column: string, values: readonly string[]): Q;
}

/**
 * Applies a scope's provenance filters to the list query — the ONE place they
 * are composed, so the gate order is provable in a unit test.
 *
 * Returns `null` when every lane is off: there is nothing to fetch.
 *
 * THE LANE GATE ANDs ABOVE EVERYTHING ELSE. The source allow-list below is an
 * OR group ("this feature OR this app OR empty"), and "Select all" in the tree
 * fills it with every known source — including the plugin and sub-agent ones.
 * The lane filter is a separate top-level `lane in (...)`, so no source
 * selection can widen it (Arman, 2026-09-18).
 */
export function applyHistoryFilters<Q extends HistoryFilterable<Q>>(
  query: Q,
  f: HistoryFilterInput,
): Q | null {
  if (f.includeLanes !== null && f.includeLanes.length === 0) return null;
  let q = query;

  if (f.includeLanes !== null) {
    q = q.in("lane", f.includeLanes);
  }

  // Per-scope blacklist on `source_feature`. Each value gets its own `.neq`
  // — Supabase chains them with AND. Used by `/chat` to drop voice-agent rows
  // from the text-chat history.
  for (const sf of f.excludeSourceFeatures) {
    q = q.neq("source_feature", sf);
  }

  // Per-scope ALLOW-list on source provenance. OR-combined so a row shows if
  // its `source_feature` is selected, OR its `source_app` is selected, OR it's
  // an empty/null-source row and those are opted-in. An entirely empty
  // allow-list means "no source filter". The OR group ANDs with the lane gate
  // and the agent / exclude / soft-delete filters.
  const orParts: string[] = [];
  if (f.includeSourceFeatures.length > 0) {
    orParts.push(`source_feature.in.(${f.includeSourceFeatures.join(",")})`);
  }
  if (f.includeSourceApps.length > 0) {
    orParts.push(`source_app.in.(${f.includeSourceApps.join(",")})`);
  }
  if (f.includeEmptySource) {
    // Generic rows store '' (column default) or NULL — match both.
    orParts.push("source_feature.is.null");
    orParts.push('source_feature.eq.""');
  }
  if (orParts.length > 0) {
    q = q.or(orParts.join(","));
  }

  // Origin-class ALLOW-list (server-derived trust axis). ANDs with the above.
  if (f.includeOriginClasses.length > 0) {
    q = q.in("origin_class", f.includeOriginClasses);
  }
  return q;
}

/**
 * The filter input for a scope, with the fetch call's per-call overrides. The
 * lane gate and origin classes come ONLY from the scope — no caller can pass
 * a wider lane set in through a fetch argument.
 */
export function historyFilterInputFromScope(
  scope: ConversationHistoryScopeState,
  overrides: Partial<
    Pick<
      HistoryFilterInput,
      | "excludeSourceFeatures"
      | "includeSourceFeatures"
      | "includeSourceApps"
      | "includeEmptySource"
    >
  > = {},
): HistoryFilterInput {
  return {
    excludeSourceFeatures:
      overrides.excludeSourceFeatures ?? scope.excludeSourceFeatures,
    includeSourceFeatures:
      overrides.includeSourceFeatures ?? scope.includeSourceFeatures,
    includeSourceApps: overrides.includeSourceApps ?? scope.includeSourceApps,
    includeEmptySource:
      overrides.includeEmptySource ?? scope.includeEmptySource,
    includeOriginClasses: scope.includeOriginClasses ?? [],
    includeLanes: scope.includeLanes ?? null,
  };
}
