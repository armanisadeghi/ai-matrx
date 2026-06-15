/**
 * Bound-variable selectors — the runtime side of context-item binding.
 *
 * A bound variable is just a normal variable with two extras: it INHERITS its input
 * component from the bound context item, and it gets PRE-FILLED from the active scope when
 * a value happens to be available. There is never any requirement for context — when none
 * is set, a bound variable renders as an ordinary input (respecting its data type / picklist
 * via the inherited component) and the user just fills it in.
 *
 * - selectEffectiveVariableDefinitions: definitions with each bound var's component swapped
 *   for the inherited one (live, by reference — the item is the source of truth).
 * - selectVisibleInputDefinitions: the effective definitions MINUS the bound vars that
 *   resolved to a scope value (those render as informative pills via BoundVariableChips).
 *   Everything else — plain vars AND unresolved bound vars — renders as a normal input.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { selectAllContextItems } from "@/features/scope-system/redux/contextItemsSlice";
import type { ContextItem } from "@/features/scope-system/redux/contextItemsSlice";

const EMPTY_DEFS: VariableDefinition[] = [];

function isEmptyVal(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    v === "" ||
    (Array.isArray(v) && v.length === 0)
  );
}

function isBound(d: VariableDefinition): boolean {
  return !!(d.binding?.itemKey || d.binding?.contextItemId);
}

/** Swap each bound var's component for the one inherited from its context item (live). */
function applyInheritedComponents(
  definitions: VariableDefinition[],
  items: ContextItem[],
): VariableDefinition[] {
  let changed = false;
  const out = definitions.map((d) => {
    const cid = d.binding?.contextItemId;
    if (!cid) return d;
    const item = items.find((i) => i.id === cid);
    if (item?.custom_component) {
      changed = true;
      return { ...d, customComponent: item.custom_component };
    }
    return d;
  });
  return changed ? out : definitions;
}

// Per-conversation cached selector instances. The factories below are called INLINE in
// useAppSelector across six layouts; without caching, each render would build a fresh
// createSelector (empty size-1 cache) and recompute + return a new array every render,
// defeating memoization. The Map gives each conversationId one stable memoized selector
// (same pattern as selectIsInstanceReady).
type DefsSelector = (state: RootState) => VariableDefinition[];
const effectiveCache = new Map<string, DefsSelector>();
const visibleCache = new Map<string, DefsSelector>();

export const selectEffectiveVariableDefinitions = (
  conversationId: string,
): DefsSelector => {
  let sel = effectiveCache.get(conversationId);
  if (!sel) {
    sel = createSelector(
      (state: RootState) =>
        state.instanceVariableValues.byConversationId[conversationId]
          ?.definitions,
      selectAllContextItems,
      (definitions, items): VariableDefinition[] => {
        if (!definitions || definitions.length === 0) return EMPTY_DEFS;
        return applyInheritedComponents(definitions, items);
      },
    );
    effectiveCache.set(conversationId, sel);
  }
  return sel;
};

export const selectVisibleInputDefinitions = (
  conversationId: string,
): DefsSelector => {
  let sel = visibleCache.get(conversationId);
  if (!sel) {
    sel = createSelector(
      (state: RootState) =>
        state.instanceVariableValues.byConversationId[conversationId],
      selectAllContextItems,
      (entry, items): VariableDefinition[] => {
        if (!entry || entry.definitions.length === 0) return EMPTY_DEFS;
        const effective = applyInheritedComponents(entry.definitions, items);
        const visible = effective.filter((d) => {
          if (!isBound(d)) return true;
          // Hide a bound var only when it actually resolved to a scope value — then it's a
          // pill. Unresolved bound vars stay as ordinary inputs (no requirement).
          return isEmptyVal(entry.scopeValues[d.name]);
        });
        return visible.length === effective.length ? effective : visible;
      },
    );
    visibleCache.set(conversationId, sel);
  }
  return sel;
};
