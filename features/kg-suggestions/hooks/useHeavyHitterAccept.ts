// features/kg-suggestions/hooks/useHeavyHitterAccept.ts
//
// Orchestrates the heavy-hitter ACCEPT → CREATE SCOPE → TAG SOURCE flow.
//
// As of 2026-06-07 there is no backend accept endpoint and no server-returned
// "plan" (the aidream /kg-suggestions API was deleted). Accepting a
// `match_kind="heavy_hitter"` row is now ENTIRELY frontend-owned:
//   1. create the scope via the canonical `create_scope` RPC (the same path
//      NewScopeInline / HierarchyCascade / ScopeFormSheet use), then
//   2. tag the suggestion's own source document to it (additively), then
//      mark the suggestion accepted (scope_association_suggestions) and drop
//      the row from every cached list.
//
// NOTE: the old backend plan returned EVERY document mentioning the recurring
// entity (read from rag.kg_chunk_entities). That `rag` schema is not exposed to
// PostgREST, so v1 tags only the originating source. The new scope is created
// and useful immediately; the user can tag further documents from the normal
// scope-tagging surfaces. This limitation is the documented v1 boundary in the
// handoff doc (§5 open question).
//
// REUSED primitives (no parallel write paths):
//  - createScope thunk → `create_scope` RPC.
//  - scopesService.getEntityScopes + setEntityScopes — the canonical
//    ctx_scope_assignments chokepoint (additive per source).
//  - kgSuggestionsService.markKgSuggestionAccepted — the row lifecycle write.

"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createScope } from "@/features/agent-context/redux/scope/scopesSlice";
import { removeFromLists } from "@/lib/redux/slices/kgSuggestionsSlice";
import { scopesService } from "@/features/scopes/service/scopesService";
import { markKgSuggestionAccepted } from "@/features/kg-suggestions/service/kgSuggestionsService";
import type { ScopeAssignmentEntityType } from "@/features/scopes/types";
import { isScopesRpcErr } from "@/features/scopes/types";
import {
  kgSourceKindToEntityType,
  type KgSuggestionRow,
} from "@/features/kg-suggestions/types";

export interface PromoteHeavyHitterArgs {
  /** The heavy-hitter row to promote. */
  row: KgSuggestionRow;
  /** Active org the new scope belongs to. */
  organizationId: string;
  /** The scope_type the user picked (required — `create_scope` needs it). */
  scopeTypeId: string;
  /** Final scope name (user may have edited the suggested name). */
  scopeName: string;
}

export interface PromoteHeavyHitterResult {
  ok: boolean;
  scopeId?: string;
  scopeName?: string;
  /** 1 when the originating source was tagged, else 0. */
  taggedCount: number;
  /** 1 when the source kind has no taggable entity type, else 0. */
  skippedCount: number;
  /** 1 when the tag write failed (scope still created), else 0. */
  tagFailedCount: number;
  /**
   * Failure stage when `ok` is false:
   *  - "create" → scope creation failed; nothing was written. Try again.
   */
  failedStage?: "create";
  error?: string;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Tag one source to the scope additively (preserve its existing scopes). */
async function tagSourceToScope(
  entityType: ScopeAssignmentEntityType,
  sourceId: string,
  scopeId: string,
): Promise<boolean> {
  const current = await scopesService.getEntityScopes(entityType, sourceId);
  if (isScopesRpcErr(current)) return false;
  const next = Array.from(new Set([...current.data.scope_ids, scopeId]));
  const written = await scopesService.setEntityScopes(
    entityType,
    sourceId,
    next,
  );
  return !isScopesRpcErr(written);
}

export function useHeavyHitterAccept() {
  const dispatch = useAppDispatch();

  const promote = useCallback(
    async (args: PromoteHeavyHitterArgs): Promise<PromoteHeavyHitterResult> => {
      const { row, organizationId, scopeTypeId, scopeName } = args;
      const base = { taggedCount: 0, skippedCount: 0, tagFailedCount: 0 };

      const finalName =
        scopeName.trim() || row.suggested_value || row.entity.name || "";

      // 1) Create the scope via the canonical create_scope RPC.
      let scopeId: string;
      let createdName: string;
      try {
        const scope = await dispatch(
          createScope({
            org_id: organizationId,
            type_id: scopeTypeId,
            name: finalName,
            description: `Created from recurring entity "${
              row.entity.name ?? finalName
            }"`,
          }),
        ).unwrap();
        scopeId = scope.id;
        createdName = scope.name;
      } catch (err) {
        return {
          ok: false,
          ...base,
          failedStage: "create",
          error: errMessage(err),
        };
      }

      // 2) Tag the originating source to the new scope (best-effort).
      let taggedCount = 0;
      let skippedCount = 0;
      let tagFailedCount = 0;
      const entityType = kgSourceKindToEntityType(row.source_kind);
      if (!entityType) {
        skippedCount = 1;
      } else {
        const tagged = await tagSourceToScope(
          entityType as ScopeAssignmentEntityType,
          row.source_id,
          scopeId,
        );
        if (tagged) taggedCount = 1;
        else tagFailedCount = 1;
      }

      // 3) Mark accepted + drop the row everywhere (best-effort on the mark —
      //    the scope already exists, so never fail the flow on this write).
      try {
        await markKgSuggestionAccepted(row);
      } catch {
        // Suggestion may resurface on a later load; non-destructive.
      }
      dispatch(removeFromLists({ id: row.id }));

      return {
        ok: true,
        scopeId,
        scopeName: createdName,
        taggedCount,
        skippedCount,
        tagFailedCount,
      };
    },
    [dispatch],
  );

  return { promote };
}
