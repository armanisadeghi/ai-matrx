"use client";

/**
 * useBoundVariableScope
 *
 * Runtime resolver for agent variables BOUND to a scope context item. For each bound
 * variable it: ensures the active scope's context values are loaded, resolves the value
 * (client-side, mirroring the server's authoritative fill), exposes everything the
 * BoundVariableChips UI needs (value, source scope, inherited component, missing-scope
 * flag), and folds resolved values into the instance `scopeValues` tier so required-
 * validation and previews see them.
 *
 * Note: the SERVER fills bound variables authoritatively from request.scope_ids — this
 * hook is the client-side mirror for display + the write-back surface, never the source
 * of truth for the run.
 */

import { useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceVariableDefinitions } from "../redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { mergeScopeVariableValues } from "../redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  selectActiveOrganizationId,
  selectActiveScopeIds,
  selectActiveScopeSelections,
} from "@/features/scopes/redux/selectors/active-context";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import { makeSelectResolvedContext } from "@/features/scopes/redux/selectors/resolved-context";
import { makeSelectScopeTypeLabelMapForOrg } from "@/features/scopes/redux/selectors/tree";
import {
  listScopeTypeItems,
  selectAllContextItems,
} from "@/features/scope-system/redux/contextItemsSlice";
import type {
  ContextItemBinding,
  VariableCustomComponent,
} from "@/features/agents/types/agent-definition.types";
import type { ResolvedValue } from "@/features/scopes/types";

export interface BoundVarInfo {
  name: string;
  binding: ContextItemBinding;
  scopeTypeLabel: string;
  /** A scope of the binding's type is currently active. */
  scopeActive: boolean;
  /** The resolved value from the active scope, or null when none. */
  resolved: ResolvedValue | null;
  /** The scope_id that supplied the value (write-back target), or null. */
  sourceScopeId: string | null;
  /** The input component inherited from the bound context item. */
  customComponent: VariableCustomComponent | undefined;
  /** The item's storage value_type — drives write-back column routing. */
  valueType: string | undefined;
  /** The active scope of the binding's type (write-back target when nothing resolved yet). */
  activeScopeIdOfType: string | null;
  /** Bound but no value AND no active scope of its type — the "pick a scope" case. */
  missing: boolean;
}

const EMPTY: BoundVarInfo[] = [];
// Stable args reference so the memoized resolved-context selector doesn't recompute every
// render. userId is only an output field on the bundle (not used in resolution).
const RESOLVE_ARGS = { userId: "" } as const;

export function useBoundVariableScope(conversationId: string): BoundVarInfo[] {
  const dispatch = useAppDispatch();
  const definitions = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const orgId = useAppSelector(selectActiveOrganizationId);
  const activeScopeIds = useAppSelector(selectActiveScopeIds);
  const activeSelections = useAppSelector(selectActiveScopeSelections);
  const selectScopeTypeLabelMap = useMemo(
    makeSelectScopeTypeLabelMapForOrg,
    [],
  );
  const labelMap = useAppSelector((s) => selectScopeTypeLabelMap(s, orgId));
  const allItems = useAppSelector(selectAllContextItems);
  const loadedTypes = useAppSelector((s) => s.contextItems.loadedTypes);

  const resolvedSelector = useMemo(makeSelectResolvedContext, []);
  const resolved = useAppSelector((s) => resolvedSelector(s, RESOLVE_ARGS));

  const boundDefs = useMemo(
    () =>
      definitions.filter(
        (d) => !!(d.binding?.itemKey || d.binding?.contextItemId),
      ),
    [definitions],
  );

  // Load context values for active scopes so `resolved` has data.
  useEffect(() => {
    for (const sid of activeScopeIds) dispatch(ensureContextValues(sid));
  }, [activeScopeIds, dispatch]);

  // Load item catalogs for bound scope types (inherited component + id→item lookup).
  // Guarded by loadedTypes so a scope switch doesn't refetch already-loaded catalogs.
  useEffect(() => {
    const typeIds = new Set(
      boundDefs.map((d) => d.binding?.scopeTypeId).filter(Boolean) as string[],
    );
    for (const t of typeIds) {
      if (!loadedTypes.includes(t)) dispatch(listScopeTypeItems(t));
    }
  }, [boundDefs, loadedTypes, dispatch]);

  const infos = useMemo<BoundVarInfo[]>(() => {
    if (boundDefs.length === 0) return EMPTY;
    return boundDefs.map((d) => {
      const binding = d.binding as ContextItemBinding;
      const item = binding.contextItemId
        ? allItems.find((i) => i.id === binding.contextItemId)
        : undefined;
      const resolvedValue = binding.contextItemId
        ? (resolved.values[binding.contextItemId] ?? null)
        : null;
      const source = binding.contextItemId
        ? resolved.sourcePerKey[binding.contextItemId]
        : undefined;
      const activeScopeIdOfType = activeSelections[binding.scopeTypeId] ?? null;
      const scopeActive = !!activeScopeIdOfType;
      return {
        name: d.name,
        binding,
        scopeTypeLabel: labelMap[binding.scopeTypeId] ?? "scope",
        scopeActive,
        resolved: resolvedValue,
        sourceScopeId: source?.kind === "scope" ? source.id : null,
        customComponent: item?.custom_component ?? undefined,
        valueType: item?.value_type,
        activeScopeIdOfType,
        missing: !resolvedValue && !scopeActive,
      };
    });
  }, [boundDefs, allItems, resolved, activeSelections, labelMap]);

  // Fold resolved values into the scopeValues tier (merge — never wipe other values) so
  // required-validation + previews reflect them. Bound vars are still omitted from the
  // request payload (server resolves them), so this never double-sends.
  const lastSyncRef = useRef<string>("");
  useEffect(() => {
    const patch: Record<string, unknown> = {};
    for (const info of infos) {
      if (info.resolved) patch[info.name] = info.resolved.value;
    }
    const key = JSON.stringify(patch);
    if (key !== lastSyncRef.current && Object.keys(patch).length > 0) {
      lastSyncRef.current = key;
      dispatch(mergeScopeVariableValues({ conversationId, values: patch }));
    }
  }, [infos, conversationId, dispatch]);

  return infos;
}
