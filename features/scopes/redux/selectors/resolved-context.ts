// features/scopes/redux/selectors/resolved-context.ts
//
// THE local-vs-global resolution algorithm, in pure-selector form.
//
// Inputs (all from Redux — no async, no thunk):
//   - appContext: active org, scope selections, project, task
//   - scopesTree: organization → scope_type → scope structure
//   - contextValues: per-scope context-item values (must be pre-fetched
//     by the caller before reading the bundle).
//
// Output (ResolvedContext):
//   - values: keyed by context_item_id (NOT by key — keys can collide
//     across scope types and the caller is the one responsible for
//     deciding what to label things)
//   - sourcePerKey: which contributing scope/project/task won each
//   - contradictions: same scope_type_id with different global vs local ids
//   - activeScopes: ordered list of contributing scopes (priority asc)
//
// Resolution rule (see features/scopes/FEATURE.md §"Resolution"):
//   For each scope_type contributing values:
//     - local wins on a per-type collision (warning is surfaced, never blocks)
//     - if no local entry for that type, global wins
//     - higher specificity (task > project > scope_type chain depth) wins
//       within a single origin.
//
// IMPORTANT: this selector does NOT touch contextValuesSlice's drafts —
// drafts are UI-only and never resolve into the agent payload.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type {
  ContextItemValue,
  ContextSource,
  ResolvedContext,
  ResolvedValue,
  ScopeContradiction,
  ScopeNode,
} from "@/features/scopes/types";
import {
  selectActiveOrganizationId,
  selectActiveProjectId,
  selectActiveScopeSelections,
  selectActiveTaskId,
} from "./active-context";

const emptyContext: ResolvedContext = {
  values: {},
  sourcePerKey: {},
  contradictions: [],
  activeScopes: [],
  organizationId: null,
  userId: "",
};

interface ResolveArgs {
  /** Scope ids the entity is tagged with locally. Empty = pure global. */
  localScopeIds?: string[];
  /** Optional project id local to the entity (note's project, etc.). */
  localProjectId?: string | null;
  /** Optional task id local to the entity. */
  localTaskId?: string | null;
  /** Required for the userId field on the bundle. */
  userId: string;
}

const selectScopeIndex = createSelector(
  (state: RootState) => state.scopesTree.organizations,
  (orgs): Map<string, ScopeNode> => {
    const map = new Map<string, ScopeNode>();
    for (const orgId of Object.keys(orgs)) {
      for (const type of orgs[orgId].scope_types) {
        for (const scope of type.scopes) {
          map.set(scope.id, scope);
        }
      }
    }
    return map;
  },
);

/**
 * Produce a ResolvedContext given local scope tags + the user id.
 *
 * Caller must ensure contextValues for every contributing scope are already
 * fetched. This selector does not trigger fetches — that's the job of
 * `ensureResolvedContext` (a thunk that walks the active scopes + local
 * scopes and dispatches ensureContextValues for each, then resolves).
 */
export function makeSelectResolvedContext() {
  return createSelector(
    selectScopeIndex,
    selectActiveOrganizationId,
    selectActiveScopeSelections,
    selectActiveProjectId,
    selectActiveTaskId,
    (state: RootState) => state.contextValues.byScope,
    (_: RootState, args: ResolveArgs) => args,
    (
      scopeIndex,
      activeOrgId,
      activeScopeSelections,
      activeProjectId,
      activeTaskId,
      contextValuesByScope,
      args,
    ): ResolvedContext => {
      const localScopeIds = args.localScopeIds ?? [];
      const userId = args.userId;

      // ─── Build active-scope list (priority asc = closer first) ──────
      //
      // Order (asc priority, lowest number wins on ties):
      //   1000 — local task
      //   1100 — local project
      //   1200 — local scopes (in insertion order)
      //   2000 — global task
      //   2100 — global project
      //   2200 — global scopes (in insertion order)

      const sources: ContextSource[] = [];

      if (args.localTaskId) {
        sources.push({
          kind: "task",
          id: args.localTaskId,
          origin: "local",
          priority: 1000,
        });
      }
      if (args.localProjectId) {
        sources.push({
          kind: "project",
          id: args.localProjectId,
          origin: "local",
          priority: 1100,
        });
      }
      let localPri = 1200;
      const localScopeTypeIds = new Set<string>();
      for (const sid of localScopeIds) {
        const scope = scopeIndex.get(sid);
        if (!scope) continue;
        localScopeTypeIds.add(scope.scope_type_id);
        sources.push({
          kind: "scope",
          id: sid,
          origin: "local",
          priority: localPri++,
        });
      }

      if (activeTaskId) {
        sources.push({
          kind: "task",
          id: activeTaskId,
          origin: "global",
          priority: 2000,
        });
      }
      if (activeProjectId) {
        sources.push({
          kind: "project",
          id: activeProjectId,
          origin: "global",
          priority: 2100,
        });
      }
      let globalPri = 2200;
      const contradictions: ScopeContradiction[] = [];
      for (const [scopeTypeId, scopeId] of Object.entries(
        activeScopeSelections,
      )) {
        if (!scopeId) continue;
        // ─── Contradiction check ─────────────────────────────────
        // A contradiction is: SAME scope_type_id selected globally AND
        // present locally, but with a DIFFERENT scope_id. Same id is
        // not a contradiction, it's redundancy.
        if (localScopeTypeIds.has(scopeTypeId)) {
          const localId = localScopeIds.find((sid) => {
            const s = scopeIndex.get(sid);
            return s?.scope_type_id === scopeTypeId;
          });
          if (localId && localId !== scopeId) {
            contradictions.push({
              scope_type_id: scopeTypeId,
              global_scope_id: scopeId,
              local_scope_id: localId,
            });
          }
        }
        sources.push({
          kind: "scope",
          id: scopeId,
          origin: "global",
          priority: globalPri++,
        });
      }

      // ─── Walk sources, fill values by context_item_id ───────────────
      //
      // Lower priority wins (insertion order asc). The first source to
      // contribute a value for a context_item_id "owns" it.

      const values: Record<string, ResolvedValue> = {};
      const sourcePerKey: Record<string, ContextSource> = {};

      const sorted = sources.slice().sort((a, b) => a.priority - b.priority);

      for (const source of sorted) {
        if (source.kind !== "scope") continue;
        const entry = contextValuesByScope[source.id];
        if (!entry || entry.status !== "ready") continue;
        for (const itemId of Object.keys(entry.values)) {
          if (values[itemId]) continue; // higher-priority source already won
          const v = entry.values[itemId];
          const resolved = toResolvedValue(itemId, v);
          if (resolved) {
            values[itemId] = resolved;
            sourcePerKey[itemId] = source;
          }
        }
      }

      return {
        values,
        sourcePerKey,
        contradictions,
        activeScopes: sorted,
        organizationId: activeOrgId,
        userId,
      };
    },
  );
}

function toResolvedValue(
  contextItemId: string,
  v: ContextItemValue,
): ResolvedValue | null {
  // The shape we hand back is intentionally untyped on the actual value —
  // callers expecting a specific value type look at `value_type` and the
  // matching property. Drafts are never folded in here.
  let value: string | number | boolean | ReturnType<typeof JSON.parse> | null =
    null;
  let value_type: ResolvedValue["value_type"] = "text";

  if (v.value_text !== null) {
    value = v.value_text;
    value_type = "text";
  } else if (v.value_number !== null) {
    value = v.value_number;
    value_type = "number";
  } else if (v.value_boolean !== null) {
    value = v.value_boolean;
    value_type = "boolean";
  } else if (v.value_json !== null) {
    value = v.value_json as ReturnType<typeof JSON.parse>;
    value_type = "json";
  } else if (v.value_document_url !== null) {
    value = v.value_document_url;
    value_type = "document";
  } else if (v.value_reference_id !== null) {
    value = v.value_reference_id;
    value_type = "reference";
  } else {
    return null;
  }

  return {
    context_item_id: contextItemId,
    // key + display_name are NOT on ContextItemValue — they live on the
    // ContextItemRow. Callers needing labels should join against the item
    // catalog (loaded separately via listContextItems). Until the catalog
    // arrives, we leave these blank so the consumer doesn't get fed a lie.
    key: "",
    display_name: "",
    value_type,
    value,
    document_url: v.value_document_url,
    reference_id: v.value_reference_id,
    reference_type: v.value_reference_type,
    version: v.version,
  };
}

export { emptyContext };
