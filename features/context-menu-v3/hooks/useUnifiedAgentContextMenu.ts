"use client";

import { useMemo, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchUnifiedMenu } from "@/features/agents/redux/agent-shortcuts/thunks";
import { selectAllShortcutsArray } from "@/features/agents/redux/agent-shortcuts/selectors";
import { selectAllCategoriesArray } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import { selectAllContentBlocksArray } from "@/features/agents/redux/agent-content-blocks/selectors";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";
import type { AgentShortcutCategoryRecord } from "@/features/agents/redux/agent-shortcut-categories/types";
import type { AgentContentBlockRecord } from "@/features/agents/redux/agent-content-blocks/types";
import type { Scope } from "@/features/agents/redux/shared/scope";
import { resolveRowScope } from "@/features/agents/redux/shared/scope";

export type AgentMenuEntry =
  | ({
      entryType: "agent_shortcut";
      scopeLevel: Scope;
      /**
       * True when this entry is only visible because of the LEGACY
       * `enabledFeatures`/untagged fallback — i.e. it did NOT match the
       * current surface's `surfaceName`. Surfaced in red so we can find
       * what to backfill before retiring the old mechanism.
       */
      legacyMatch: boolean;
    } & AgentShortcutRecord)
  | ({
      entryType: "content_block";
      scopeLevel: Scope;
      legacyMatch: boolean;
    } & AgentContentBlockRecord);

export interface AgentMenuCategoryGroup {
  category: AgentShortcutCategoryRecord & { scopeLevel: Scope };
  items: AgentMenuEntry[];
  children: AgentMenuCategoryGroup[];
}

export interface UseUnifiedAgentContextMenuArgs {
  placementTypes: string[];
  /**
   * Contexts to ADD to the default `{general}` allow-set.
   * Example: `['code-editor']` makes code-editor shortcuts visible alongside general ones.
   */
  addedContexts?: string[];
  /**
   * Contexts to REMOVE from the allow-set after `addedContexts` is applied.
   * Example: `['general']` with `addedContexts: ['code-editor']` → only code-editor shortcuts.
   */
  excludedContexts?: string[];
  /**
   * The Surface Registry `ui_surface.name` (`<client>/<surface>`) this menu
   * is mounted on. When provided, shortcuts whose `surfaceName` matches are
   * shown as first-class (modern) matches; everything else that still shows
   * does so via the legacy `enabledFeatures`/untagged path and is flagged
   * `legacyMatch` (rendered red). When omitted, surface matching can't run,
   * so every visible item is treated as a legacy match.
   */
  surfaceName?: string | null;
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

function higherPriority(a: Scope, b: Scope): Scope {
  return SCOPE_PRIORITY[a] >= SCOPE_PRIORITY[b] ? a : b;
}

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

// Allowed-feature set: `{general} ∪ addedContexts − excludedContexts`.
// An item is visible iff its `enabledFeatures` intersects the set, OR the
// item has no `enabledFeatures` declared (legacy data — treated as general).
function buildAllowedContexts(
  addedContexts: string[] | undefined,
  excludedContexts: string[] | undefined,
): Set<string> {
  const allowed = new Set<string>(["general"]);
  for (const c of addedContexts ?? []) allowed.add(c);
  for (const c of excludedContexts ?? []) allowed.delete(c);
  return allowed;
}

// Does the item qualify via the LEGACY context mechanism?
// (enabledFeatures intersects the allow-set, or it's untagged → general.)
function matchesAllowedContexts(
  item: { enabledFeatures?: string[] | null },
  allowed: Set<string>,
): boolean {
  if (allowed.size === 0) return false;
  const ec = item.enabledFeatures;
  if (!ec || ec.length === 0) {
    // Legacy rows with no features declared — treat as general.
    return allowed.has("general");
  }
  for (const c of ec) {
    if (allowed.has(c)) return true;
  }
  return false;
}

// "Both" matching: an item is visible if it matches the current surface by
// `surfaceName` (modern, NOT legacy) OR via the legacy context path. Returns
// whether the item is visible and whether it only qualified via the legacy
// path (so the UI can flag it red).
function classifyVisibility(
  item: { enabledFeatures?: string[] | null; surfaceName?: string | null },
  allowed: Set<string>,
  surfaceName: string | null,
): { visible: boolean; legacy: boolean } {
  if (surfaceName && item.surfaceName && item.surfaceName === surfaceName) {
    return { visible: true, legacy: false };
  }
  // A shortcut that declares a home surface and NO explicit contexts is
  // exclusive to that surface — don't leak it onto every page via the
  // untagged→general fallback. Declaring enabledFeatures alongside a
  // surfaceName still opts it into other contexts deliberately.
  if (
    item.surfaceName &&
    item.surfaceName !== surfaceName &&
    (!item.enabledFeatures || item.enabledFeatures.length === 0)
  ) {
    return { visible: false, legacy: false };
  }
  if (matchesAllowedContexts(item, allowed)) {
    return { visible: true, legacy: true };
  }
  return { visible: false, legacy: false };
}

export function useUnifiedAgentContextMenu(
  args: UseUnifiedAgentContextMenuArgs,
): UseUnifiedAgentContextMenuResult {
  const {
    placementTypes,
    addedContexts,
    excludedContexts,
    surfaceName = null,
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
    if (!enabled || placementTypes.length === 0) return [];

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

    const allowedContexts = buildAllowedContexts(
      addedContexts,
      excludedContexts,
    );

    // Shortcuts: "both" matching (surfaceName OR legacy context), tagging the
    // legacy-only ones so the menu can render them red.
    const filteredShortcuts = scopedShortcuts.flatMap((s) => {
      const { visible, legacy } = classifyVisibility(
        s,
        allowedContexts,
        surfaceName,
      );
      return visible ? [{ ...s, legacyMatch: legacy }] : [];
    });
    // Content blocks are static insertable text — no surfaceName/enabledFeatures
    // today, so they always pass through and are never flagged legacy.
    const filteredBlocks = scopedBlocks.map((b) => ({
      ...b,
      legacyMatch: false,
    }));

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

    // Category inclusion: keep a category if it passes the legacy context
    // allow-set OR it actually holds a visible item (so a surface-matched
    // shortcut is never orphaned by a category that the context filter would
    // have dropped). Pull in ancestors so the submenu tree can nest.
    const catById = new Map(scopedCategories.map((c) => [c.id, c]));
    const keepCategoryIds = new Set<string>();
    for (const c of scopedCategories) {
      if (matchesAllowedContexts(c, allowedContexts)) keepCategoryIds.add(c.id);
    }
    for (const cid of byCategory.keys()) {
      let cur = catById.get(cid);
      while (cur && !keepCategoryIds.has(cur.id)) {
        keepCategoryIds.add(cur.id);
        cur = cur.parentCategoryId
          ? catById.get(cur.parentCategoryId)
          : undefined;
      }
    }
    const filteredCategories = scopedCategories.filter((c) =>
      keepCategoryIds.has(c.id),
    );

    const dedupedCategories = dedupeByPrecedence(
      filteredCategories,
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
  }, [
    enabled,
    placementTypes,
    categories,
    shortcuts,
    contentBlocks,
    addedContexts,
    excludedContexts,
    surfaceName,
  ]);

  return {
    categoryGroups,
    loading: loading && categoryGroups.length === 0,
    error,
    refresh,
  };
}
