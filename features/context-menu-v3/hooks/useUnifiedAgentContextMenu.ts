"use client";

import { useMemo, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchUnifiedMenu } from "@/features/agents/redux/agent-shortcuts/thunks";
import { selectAllShortcutsArray } from "@/features/agents/redux/agent-shortcuts/selectors";
import { selectAllCategoriesArray } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import { selectAllContentBlocksArray } from "@/features/agent-connections/redux/skl/content-block-compat";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";
import type { AgentShortcutCategoryRecord } from "@/features/agents/redux/agent-shortcut-categories/types";
import type { AgentContentBlockRecord } from "@/features/agent-connections/redux/skl/content-block-compat";
import type { Scope } from "@/features/agents/redux/shared/scope";
import { resolveRowScope } from "@/features/agents/redux/shared/scope";
import { decideOffer, requirementsOf } from "../model/requirement-gate";

export type AgentMenuEntry =
  | ({ entryType: "agent_shortcut"; scopeLevel: Scope } & AgentShortcutRecord)
  | ({ entryType: "content_block"; scopeLevel: Scope } & AgentContentBlockRecord);

export interface AgentMenuCategoryGroup {
  category: AgentShortcutCategoryRecord & { scopeLevel: Scope };
  items: AgentMenuEntry[];
  children: AgentMenuCategoryGroup[];
}

/**
 * Keys whose POPULATION (not just existence) is checked — the single
 * population-level gate the menu keeps, and the only exception to
 * "availability is the key existing, not the value".
 *
 * Kept because the menu is selection-triggered anyway: "No text selected →
 * nothing to translate → no translate option in the menu" (Arman, INTERVIEW
 * R8). Everything else gates on key-existence only.
 *
 * The value tested is the RESOLVED scope's `selection`, which already carries
 * the platform's `active_text` convention (`value-resolution.ts`): on a
 * surface that knows the acting text, an unhighlighted right-click still has
 * a selection, so these items stay offered. Only a genuinely empty one hides
 * them.
 */
const SELECTION_DEPENDENT_KEYS: ReadonlySet<string> = new Set(["selection"]);

export interface UseUnifiedAgentContextMenuArgs {
  /**
   * Which placement submenus this host renders. LAYOUT ONLY — see
   * `buildCategoryGroups`. It never decides whether an ITEM is available.
   */
  placementTypes: string[];
  /**
   * The Surface Registry `ui_surface.name` (`<client>/<surface>`) this menu is
   * mounted on, or null on a page the platform cannot name. It is the
   * page-level rung of the scope hierarchy and the key to the exclusion valve.
   */
  surfaceName?: string | null;
  /**
   * Every surface value name that has a READ PATH here: the manifest's
   * declared values + the baseline floor + whatever actually landed in the
   * resolved scope. Built by `buildAvailableKeys` in the engine.
   */
  availableKeys: ReadonlySet<string>;
  /** True when the resolved scope carries a non-empty `selection`. */
  hasSelection: boolean;
  /** The surface's exclusion valve (`menu` surface-config namespace). */
  excludedItemIds?: ReadonlySet<string>;
  enabled?: boolean;
  scope?: Scope;
  scopeId?: string | null;
}

export interface UseUnifiedAgentContextMenuResult {
  categoryGroups: AgentMenuCategoryGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const SCOPE_PRIORITY: Record<Scope, number> = {
  task: 5,
  project: 4,
  user: 3,
  organization: 2,
  global: 1,
};

function dedupeByPrecedence<T extends { scopeLevel: Scope }>(
  items: T[],
  keyFn: (item: T) => string | null,
): T[] {
  const winners = new Map<string, T>();
  const passthrough: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key) {
      passthrough.push(item);
      continue;
    }
    const existing = winners.get(key);
    if (!existing) {
      winners.set(key, item);
      continue;
    }
    if (SCOPE_PRIORITY[item.scopeLevel] > SCOPE_PRIORITY[existing.scopeLevel]) {
      winners.set(key, item);
    }
  }
  return [...winners.values(), ...passthrough];
}

export interface BuildCategoryGroupsArgs {
  placementTypes: string[];
  surfaceName?: string | null;
  availableKeys: ReadonlySet<string>;
  hasSelection: boolean;
  excludedItemIds?: ReadonlySet<string>;
  shortcuts: AgentShortcutRecord[];
  categories: AgentShortcutCategoryRecord[];
  contentBlocks: AgentContentBlockRecord[];
}

/**
 * THE grouping function — pure and unit-tested
 * (`__tests__/build-category-groups.test.ts`,
 * `../model/__tests__/requirement-gate.test.ts`). Turns the fetched
 * shortcut/category/content-block rows into the nested category tree each
 * placement submenu renders.
 *
 * 🚨 PHASE 6.7 — AVAILABILITY IS DERIVED (THE-MODEL law 3). An item is
 * offered here iff every surface value it consumes has a read path on this
 * surface; then its authored scope (global / domain / page) must reach here;
 * then the surface's exclusion valve gets the last word. The 16 hardcoded
 * `enabled_features` slugs and the RED `legacyMatch` rows they produced are
 * GONE: an item qualifies or is absent, and nothing renders as broken.
 *
 * 🚨 CATEGORIES GROUP, THEY NEVER GATE. A category's `placementType` still
 * decides WHICH placement submenu it renders under — that is layout, and it
 * is the only thing `placementTypes` does here. A category is never dropped
 * for failing a context filter, and an item's availability never consults its
 * category.
 *
 * Guarantees the tests certify:
 *  - the derived gate: missing key → absent; key declared-but-empty → present;
 *  - the hierarchy: global reaches everywhere, a domain reaches its surfaces,
 *    a page-pinned item reaches only its page;
 *  - the valve: an excluded id is absent even though it qualified;
 *  - placement fidelity: a row renders under exactly its category's
 *    placementType;
 *  - nested categories nest under their parent, sorted by sortOrder then label;
 *  - an EMPTY category still returns (with `items: []`) so the UI can render it
 *    greyed — never silently dropped;
 *  - an entry with no agent is kept (the renderer disables it as "Not configured");
 *  - scope precedence dedupe (task > project > user > organization > global).
 */
export function buildCategoryGroups(
  args: BuildCategoryGroupsArgs,
): AgentMenuCategoryGroup[] {
  const {
    placementTypes,
    surfaceName = null,
    availableKeys,
    hasSelection,
    excludedItemIds,
    shortcuts,
    categories,
    contentBlocks,
  } = args;
  if (placementTypes.length === 0) return [];

  // LAYOUT: which placement submenus this host draws.
  const placementSet = new Set(placementTypes);

  const scopedCategories = categories
    .filter((c) => c.isActive !== false && placementSet.has(c.placementType))
    .map((c) => ({ ...c, scopeLevel: resolveRowScope(c) }));
  const scopedShortcuts = shortcuts
    .filter((s) => s.isActive !== false)
    .map((s) => ({
      ...s,
      entryType: "agent_shortcut" as const,
      scopeLevel: resolveRowScope(s),
    }));
  const scopedBlocks = contentBlocks
    .filter((b) => b.isActive !== false)
    .map((b) => ({
      ...b,
      entryType: "content_block" as const,
      scopeLevel: resolveRowScope(b),
    }));

  const offerCtx = {
    surfaceName,
    availableKeys,
    excludedItemIds,
  };

  const filteredShortcuts = scopedShortcuts.filter((s) => {
    if (!decideOffer(s, offerCtx).offered) return false;
    // The ONE population check (see SELECTION_DEPENDENT_KEYS).
    if (hasSelection) return true;
    return !requirementsOf(s).some((key) => SELECTION_DEPENDENT_KEYS.has(key));
  });

  // Content blocks are static insertable text — they consume nothing, so the
  // gate offers them everywhere. They still pass through the valve.
  const filteredBlocks = scopedBlocks.filter(
    (b) => !excludedItemIds?.has(b.id),
  );

  const dedupedShortcuts = dedupeByPrecedence(filteredShortcuts, (s) => {
    if (s.keyboardShortcut) return `kbd:${s.keyboardShortcut}`;
    return `label:${s.categoryId}:${s.label}`;
  });

  const dedupedBlocks = dedupeByPrecedence(
    filteredBlocks,
    (b) => `block:${b.categoryId ?? "_none"}:${b.blockId}`,
  );

  const byCategory = new Map<string, AgentMenuEntry[]>();
  for (const s of dedupedShortcuts) {
    if (!byCategory.has(s.categoryId)) byCategory.set(s.categoryId, []);
    byCategory.get(s.categoryId)!.push(s as AgentMenuEntry);
  }
  for (const b of dedupedBlocks) {
    const cid = b.categoryId;
    if (!cid) continue;
    if (!byCategory.has(cid)) byCategory.set(cid, []);
    byCategory.get(cid)!.push(b as AgentMenuEntry);
  }

  // CATEGORIES GROUP, NEVER GATE: every active category whose placement this
  // host renders is kept, empty or not. (An empty category still renders
  // greyed — Arman must see where new items will land the moment he creates
  // one.) Nothing here inspects the category's own `enabledFeatures`; the
  // column no longer decides anything.
  const dedupedCategories = dedupeByPrecedence(
    scopedCategories,
    (c) => `${c.placementType}:${c.parentCategoryId ?? "_root"}:${c.label}`,
  );

  const nodeMap = new Map<string, AgentMenuCategoryGroup>();
  for (const cat of dedupedCategories) {
    nodeMap.set(cat.id, {
      category: cat,
      items: (byCategory.get(cat.id) ?? [])
        .slice()
        .sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0)),
      children: [],
    });
  }

  const roots: AgentMenuCategoryGroup[] = [];
  for (const cat of dedupedCategories) {
    const node = nodeMap.get(cat.id)!;
    if (cat.parentCategoryId && nodeMap.has(cat.parentCategoryId)) {
      nodeMap.get(cat.parentCategoryId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: AgentMenuCategoryGroup[]) => {
    nodes.sort(
      (a, b) =>
        (a.category.sortOrder ?? 0) - (b.category.sortOrder ?? 0) ||
        a.category.label.localeCompare(b.category.label),
    );
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);

  return roots;
}

export function useUnifiedAgentContextMenu(
  args: UseUnifiedAgentContextMenuArgs,
): UseUnifiedAgentContextMenuResult {
  const {
    placementTypes,
    surfaceName = null,
    availableKeys,
    hasSelection,
    excludedItemIds,
    enabled = true,
    scope = "global",
    scopeId = null,
  } = args;

  const dispatch = useAppDispatch();

  const shortcuts = useAppSelector(selectAllShortcutsArray);
  const categories = useAppSelector(selectAllCategoriesArray);
  const contentBlocks = useAppSelector(selectAllContentBlocksArray);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || placementTypes.length === 0) return;
    try {
      setLoading(true);
      setError(null);
      await dispatch(fetchUnifiedMenu({ scope, scopeId })).unwrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load menu");
    } finally {
      setLoading(false);
    }
  }, [dispatch, enabled, placementTypes.length, scope, scopeId]);

  // Intentionally NO mount-time useEffect that fires refresh(). The menu is
  // one of the most expensive fetches in the system — it must only run when
  // the user actually engages. UnifiedAgentContextMenu calls `refresh()`
  // from its `onOpenChange` handler. The fetchUnifiedMenu thunk dedupes
  // internally (module-level inflight map + scope-loaded condition) so
  // rapid opens + multi-mounted menus all resolve to a single HTTP call.

  const categoryGroups = useMemo<AgentMenuCategoryGroup[]>(() => {
    if (!enabled) return [];
    return buildCategoryGroups({
      placementTypes,
      surfaceName,
      availableKeys,
      hasSelection,
      excludedItemIds,
      shortcuts,
      categories,
      contentBlocks,
    });
  }, [
    enabled,
    placementTypes,
    categories,
    shortcuts,
    contentBlocks,
    surfaceName,
    availableKeys,
    hasSelection,
    excludedItemIds,
  ]);

  return {
    categoryGroups,
    loading: loading && categoryGroups.length === 0,
    error,
    refresh,
  };
}
