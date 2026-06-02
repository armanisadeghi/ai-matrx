// features/kg-suggestions/hooks/useHeavyHitterAccept.ts
//
// Orchestrates the heavy-hitter ACCEPT → CREATE SCOPE → TAG SOURCES flow,
// the end-to-end consumption of a `KgHeavyHitterAcceptPlan`.
//
// This is the seam that Phase F left disabled ("Create scope — coming soon")
// because the Phase E backend contract hadn't landed yet. The live contract
// (aidream/api/routers/kg_suggestions.py, read 2026-06-02): accepting a
// `match_kind="heavy_hitter"` suggestion flips its status to `accepted`
// server-side and returns a plan — the entity, a suggested scope name, and the
// owner-scoped source mentions to tag. Scope creation is a frontend-owned
// write path (React → Supabase direct, per the scopes invariant), so the FE
// drives the rest here.
//
// REUSED primitives (no parallel write paths created):
//  - createScope thunk → `create_scope` RPC (features/agent-context/redux/scope)
//    — the SAME path NewScopeInline / HierarchyCascade / ScopeFormSheet use.
//  - scopesService.getEntityScopes + setEntityScopes — the canonical
//    ctx_scope_assignments chokepoint (Surface B tagging). Additive per source:
//    we read each source's current scopes and write [...current, newScopeId] so
//    we never clobber a source's existing tags.
//
// Failure semantics (the accept-succeeded-but-create-failed edge):
//  - accept() is idempotent server-side: it has ALREADY flipped the suggestion
//    to `accepted` by the time it resolves. So if scope creation throws AFTER a
//    successful accept, the suggestion is gone but no scope exists. We surface a
//    RECOVERABLE error (`stage: "create"`) so the UI can tell the user the
//    suggestion was accepted but they must create the scope manually — never a
//    confusing silent failure.
//  - tagging is best-effort PER SOURCE: a single source that fails to tag does
//    NOT fail the whole flow (the scope exists and is useful). We count
//    successes/failures and report them.

"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createScope } from "@/features/agent-context/redux/scope/scopesSlice";
import { scopesService } from "@/features/scopes/service/scopesService";
import type { ScopeAssignmentEntityType } from "@/features/scopes/types";
import { isScopesRpcErr } from "@/features/scopes/types";
import {
  isHeavyHitterPlan,
  kgSourceKindToEntityType,
  type KgAcceptResult,
  type KgHeavyHitterSource,
} from "@/features/kg-suggestions/types";

export interface PromoteHeavyHitterArgs {
  /** The heavy-hitter suggestion id to accept + promote. */
  suggestionId: string;
  /** Active org the new scope belongs to. */
  organizationId: string;
  /** The scope_type the user picked (required — `create_scope` needs it). */
  scopeTypeId: string;
  /** Final scope name (user may have edited the suggested name). */
  scopeName: string;
}

export interface PromoteHeavyHitterResult {
  ok: boolean;
  /** Set when the scope was created. */
  scopeId?: string;
  scopeName?: string;
  /** Sources successfully tagged to the new scope. */
  taggedCount: number;
  /** Sources skipped because their source_kind has no taggable entity type. */
  skippedCount: number;
  /** Sources that mapped to a taggable type but whose tag write failed. */
  tagFailedCount: number;
  /**
   * Failure stage when `ok` is false:
   *  - "accept" → the accept call itself failed; nothing changed.
   *  - "plan"   → accept succeeded but returned a non-heavy-hitter response
   *               (shouldn't happen for a heavy_hitter row) — treated as an
   *               error so we don't silently swallow it.
   *  - "create" → accept SUCCEEDED (suggestion is now accepted server-side) but
   *               scope creation failed. RECOVERABLE: the user must create the
   *               scope manually. The caller surfaces this distinctly.
   */
  failedStage?: "accept" | "plan" | "create";
  error?: string;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Tag one source to the scope, additively (preserve its existing scopes).
 * Returns true on success, false on a mapped-but-failed write. Untaggable
 * kinds are filtered out by the caller before this runs.
 */
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

export interface UseHeavyHitterAcceptArgs {
  /** The accept fn from `useKgSuggestions` — already flips status + drops row. */
  accept: (id: string) => Promise<KgAcceptResult>;
}

export function useHeavyHitterAccept({ accept }: UseHeavyHitterAcceptArgs) {
  const dispatch = useAppDispatch();

  const promote = useCallback(
    async (
      args: PromoteHeavyHitterArgs,
    ): Promise<PromoteHeavyHitterResult> => {
      const { suggestionId, organizationId, scopeTypeId, scopeName } = args;
      const base = { taggedCount: 0, skippedCount: 0, tagFailedCount: 0 };

      // 1) Accept — flips the suggestion to `accepted` and returns the plan.
      let res: KgAcceptResult;
      try {
        res = await accept(suggestionId);
      } catch (err) {
        return {
          ok: false,
          ...base,
          failedStage: "accept",
          error: errMessage(err),
        };
      }

      if (!isHeavyHitterPlan(res)) {
        // The row was a heavy_hitter but the backend returned a cell-value
        // accept. Don't swallow — this is a contract mismatch worth surfacing.
        return {
          ok: false,
          ...base,
          failedStage: "plan",
          error:
            "Accepted, but the server did not return a scope-creation plan.",
        };
      }

      const plan = res;
      const sources: KgHeavyHitterSource[] = plan.sources ?? [];

      // 2) Create the scope via the canonical create_scope RPC.
      let scopeId: string;
      let createdName: string;
      try {
        const scope = await dispatch(
          createScope({
            org_id: organizationId,
            type_id: scopeTypeId,
            name: scopeName.trim() || plan.suggested_scope_name,
            description: `Created from recurring entity "${
              plan.suggestion.entity.name ?? plan.suggested_scope_name
            }"`,
          }),
        ).unwrap();
        scopeId = scope.id;
        createdName = scope.name;
      } catch (err) {
        // Accept already succeeded — the suggestion is accepted but no scope
        // exists. Recoverable: tell the user to create it manually.
        return {
          ok: false,
          ...base,
          failedStage: "create",
          error: errMessage(err),
        };
      }

      // 3) Tag each source to the new scope (additive, best-effort per source).
      let taggedCount = 0;
      let skippedCount = 0;
      let tagFailedCount = 0;
      for (const src of sources) {
        const entityType = kgSourceKindToEntityType(src.source_kind);
        if (!entityType) {
          skippedCount += 1;
          continue;
        }
        const ok = await tagSourceToScope(
          entityType as ScopeAssignmentEntityType,
          src.source_id,
          scopeId,
        );
        if (ok) taggedCount += 1;
        else tagFailedCount += 1;
      }

      return {
        ok: true,
        scopeId,
        scopeName: createdName,
        taggedCount,
        skippedCount,
        tagFailedCount,
      };
    },
    [accept, dispatch],
  );

  return { promote };
}
