"use client";

/**
 * CONTEXT BUILDER STATE — the selection a human is assembling, and the bundle
 * it becomes.
 *
 * The invariant here is that the UI's state IS a bundle: every toggle produces
 * a `ResourceSelector`, and the preview runs through the same planner the agent
 * run will use (`previewBundle`/`resolveBundle`). There is no separate "UI
 * shape" that later gets translated — a translation step is exactly where a
 * preview starts lying about what the model will receive.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CATALOG, kindDef } from "../resources/catalog";
import { previewBundle } from "../resources/resolve";
import type {
  ContextBundle,
  ResourceKey,
  ResourceManifest,
  ResourceSelector,
  SelectorFilter,
  SelectorOrder,
} from "../resources/types";
import { getResourceManifest } from "../service/resources";
import { DEFAULT_BUDGET_TOKENS } from "../components/resources/BudgetMeter";

/** Per-kind selection state. Absent from the map = not selected at all. */
export interface KindSelection {
  /** "all" / "filtered" take everything matching; "explicit" pins ids. */
  mode: "all" | "filtered" | "explicit";
  ids: string[];
  filter: SelectorFilter;
  order: SelectorOrder;
  /** Cap on items after ordering. 0/undefined = no cap. */
  topN?: number;
  /**
   * Cap on characters taken from EACH item. The right control for page content:
   * only high-authority sources get read at all, so quality filters remove
   * nothing there, and the real risk is one huge page eating the budget.
   */
  maxCharsPerItem?: number;
}

export type SelectionMap = Map<ResourceKey, KindSelection>;

/** Default per-page ceiling for read page content. ~4k tokens of one page. */
export const DEFAULT_MAX_CHARS_PER_PAGE = 12_000;

const DEFAULT_SELECTION: KindSelection = {
  mode: "filtered",
  ids: [],
  filter: {},
  order: "importance",
};

function toSelector(
  kind: ResourceKey,
  sel: KindSelection,
): ResourceSelector {
  if (sel.mode === "explicit") {
    return {
      kind,
      mode: "explicit",
      ids: sel.ids,
      limit:
        sel.maxCharsPerItem && sel.maxCharsPerItem > 0
          ? { maxCharsPerItem: sel.maxCharsPerItem }
          : undefined,
    };
  }
  const filter: SelectorFilter = { ...sel.filter };
  if (sel.topN && sel.topN > 0) filter.topN = sel.topN;
  const limit =
    sel.maxCharsPerItem && sel.maxCharsPerItem > 0
      ? { maxCharsPerItem: sel.maxCharsPerItem }
      : undefined;
  return {
    kind,
    mode: Object.keys(filter).length > 0 ? "filtered" : "all",
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    order: sel.order,
    limit,
  };
}

/** Selection → the draft bundle, with one binding per distinct variable. */
export function selectionToBundle(
  selection: SelectionMap,
  opts: {
    topicId: string;
    name?: string;
    maxTokens?: number | null;
    /** Variable overrides keyed by kind; falls back to the catalog default. */
    variables?: Partial<Record<ResourceKey, string>>;
    /** Delivery overrides keyed by kind; "direct" when absent. */
    deliveries?: Partial<Record<ResourceKey, "direct" | "context">>;
  },
): ContextBundle {
  // Catalog order, not insertion order: the budget walk drops from the END, so
  // "which resources survive" must be a stable, explainable ordering rather
  // than whatever sequence the user happened to click in.
  const selectors: ResourceSelector[] = [];
  const variableByKind = new Map<ResourceKey, string>();
  for (const def of CATALOG) {
    const sel = selection.get(def.key);
    if (!sel) continue;
    selectors.push(toSelector(def.key, sel));
    variableByKind.set(
      def.key,
      opts.variables?.[def.key] ?? def.defaultVariable,
    );
  }

  // Bindings group by variable AND delivery: one variable can legitimately
  // take some kinds as injected text and others as lazy context refs, and
  // those are two distinct bindings on the wire.
  const byVariable = new Map<
    string,
    { variable: string; delivery: "direct" | "context"; kinds: ResourceKey[] }
  >();
  for (const [kind, variable] of variableByKind) {
    const delivery = opts.deliveries?.[kind] ?? "direct";
    const groupKey = `${variable}\u0000${delivery}`;
    const group = byVariable.get(groupKey) ?? { variable, delivery, kinds: [] };
    group.kinds.push(kind);
    byVariable.set(groupKey, group);
  }

  const now = new Date().toISOString();
  return {
    id: "draft",
    entityType: "research_topic",
    entityId: opts.topicId,
    name: opts.name ?? "Untitled selection",
    description: null,
    slug: null,
    selectors,
    bindings: Array.from(byVariable.values(), ({ variable, delivery, kinds }) => ({
      variable,
      kinds,
      ...(delivery === "context" ? { delivery } : {}),
    })),
    budget: opts.maxTokens ? { maxTokens: opts.maxTokens } : null,
    agentId: null,
    isSystem: false,
    organizationId: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** A saved bundle → editable selection state. */
export function bundleToSelection(bundle: ContextBundle): SelectionMap {
  const map: SelectionMap = new Map();
  for (const selector of bundle.selectors) {
    const filter = { ...(selector.filter ?? {}) };
    const topN = filter.topN;
    delete filter.topN;
    map.set(selector.kind, {
      mode: selector.mode,
      ids: selector.ids ?? [],
      filter,
      order: selector.order ?? "importance",
      topN,
      maxCharsPerItem: selector.limit?.maxCharsPerItem,
    });
  }
  return map;
}

/** Variable overrides carried by a saved bundle's bindings. */
export function bundleVariables(
  bundle: ContextBundle,
): Partial<Record<ResourceKey, string>> {
  const out: Partial<Record<ResourceKey, string>> = {};
  for (const binding of bundle.bindings) {
    for (const kind of binding.kinds) out[kind] = binding.variable;
  }
  return out;
}

/** Delivery overrides carried by a saved bundle's bindings. */
export function bundleDeliveries(
  bundle: ContextBundle,
): Partial<Record<ResourceKey, "direct" | "context">> {
  const out: Partial<Record<ResourceKey, "direct" | "context">> = {};
  for (const binding of bundle.bindings) {
    if (binding.delivery !== "context") continue;
    for (const kind of binding.kinds) out[kind] = "context";
  }
  return out;
}

export interface UseContextBuilder {
  manifest: ResourceManifest | null;
  loading: boolean;
  error: string | null;
  reload: () => void;

  selection: SelectionMap;
  /** Whole-kind toggle: on selects everything matching the kind's defaults. */
  toggleKind: (kind: ResourceKey, on: boolean) => void;
  /** Per-item toggle — switches the kind to explicit mode. */
  toggleItem: (kind: ResourceKey, itemId: string, on: boolean) => void;
  patchKind: (kind: ResourceKey, patch: Partial<KindSelection>) => void;
  /** Replace the whole selection (loading a bundle). */
  setSelection: (next: SelectionMap) => void;
  clear: () => void;

  variables: Partial<Record<ResourceKey, string>>;
  setVariable: (kind: ResourceKey, variable: string) => void;

  /** Per-kind delivery. Absent = "direct" (inject the text). */
  deliveries: Partial<Record<ResourceKey, "direct" | "context">>;
  setDelivery: (kind: ResourceKey, delivery: "direct" | "context") => void;
  /** Replace all delivery overrides (loading a bundle). */
  setDeliveries: (
    next: Partial<Record<ResourceKey, "direct" | "context">>,
  ) => void;

  budgetTokens: number | null;
  setBudgetTokens: (tokens: number | null) => void;

  /** The draft bundle — what a run or a save would use, verbatim. */
  draft: ContextBundle;
  /** Zero-read preview: item counts, chars and estimated tokens per kind. */
  preview: ReturnType<typeof previewBundle> | null;
}

export function useContextBuilder(topicId: string): UseContextBuilder {
  const [loaded, setLoaded] = useState<{
    key: string;
    manifest: ResourceManifest | null;
    error: string | null;
  } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selection, setSelectionState] = useState<SelectionMap>(new Map());
  const [variables, setVariables] = useState<
    Partial<Record<ResourceKey, string>>
  >({});
  const [deliveries, setDeliveriesState] = useState<
    Partial<Record<ResourceKey, "direct" | "context">>
  >({});
  // The default ceiling is deliberately named and surfaced in the meter — an
  // unexplained cap that silently drops resources is the exact complaint this
  // system exists to avoid.
  const [budgetTokens, setBudgetTokens] = useState<number | null>(
    DEFAULT_BUDGET_TOKENS,
  );

  /**
   * Manifest load. `loading` is DERIVED from whether the result we hold answers
   * the request we are on, rather than set synchronously in the effect body — a
   * synchronous setState in an effect is a cascading render.
   */
  const requestKey = `${topicId}:${reloadKey}`;
  useEffect(() => {
    let cancelled = false;
    getResourceManifest(topicId)
      .then((m) => {
        if (!cancelled) setLoaded({ key: requestKey, manifest: m, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoaded({
          key: requestKey,
          manifest: null,
          error: e instanceof Error ? e.message : "Failed to load resources",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, requestKey]);

  const manifest = loaded?.key === requestKey ? loaded.manifest : null;
  const error = loaded?.key === requestKey ? loaded.error : null;
  const loading = loaded?.key !== requestKey;

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const toggleKind = useCallback((kind: ResourceKey, on: boolean) => {
    setSelectionState((prev) => {
      const next = new Map(prev);
      if (!on) {
        next.delete(kind);
        return next;
      }
      const def = kindDef(kind);
      // Sensible defaults per kind: curation and quality filters ON for source
      // work, current-only for versioned artifacts. The user can loosen them —
      // but a fresh selection should never quietly include excluded sources.
      const filter: SelectorFilter = {};
      if (def?.granularity === "source") filter.includedOnly = true;
      if (kind === "page.content") filter.goodScrapeOnly = true;
      if (kind === "page.analysis") {
        filter.currentOnly = true;
        filter.successOnly = true;
      }
      if (
        kind === "synthesis.keyword" ||
        kind === "synthesis.tag" ||
        kind === "synthesis.topic" ||
        kind === "document.report"
      ) {
        filter.currentOnly = true;
        filter.successOnly = true;
      }
      next.set(kind, {
        ...DEFAULT_SELECTION,
        filter,
        order: def?.granularity === "source" ? "importance" : "recent",
        // Page content defaults to a per-page cap, not a count cap: a topic
        // rarely has enough reads for a count to bind, and one 200k-character
        // page would otherwise take the whole budget.
        maxCharsPerItem:
          kind === "page.content" ? DEFAULT_MAX_CHARS_PER_PAGE : undefined,
      });
      return next;
    });
  }, []);

  const toggleItem = useCallback(
    (kind: ResourceKey, itemId: string, on: boolean) => {
      setSelectionState((prev) => {
        const next = new Map(prev);
        const current = next.get(kind);
        const ids = new Set(current?.mode === "explicit" ? current.ids : []);
        if (on) ids.add(itemId);
        else ids.delete(itemId);
        if (ids.size === 0) {
          next.delete(kind);
          return next;
        }
        next.set(kind, {
          ...(current ?? DEFAULT_SELECTION),
          mode: "explicit",
          ids: Array.from(ids),
        });
        return next;
      });
    },
    [],
  );

  const patchKind = useCallback(
    (kind: ResourceKey, patch: Partial<KindSelection>) => {
      setSelectionState((prev) => {
        const current = prev.get(kind);
        if (!current) return prev;
        const next = new Map(prev);
        next.set(kind, { ...current, ...patch });
        return next;
      });
    },
    [],
  );

  const setSelection = useCallback((nextSelection: SelectionMap) => {
    setSelectionState(new Map(nextSelection));
  }, []);

  const clear = useCallback(() => setSelectionState(new Map()), []);

  const setVariable = useCallback((kind: ResourceKey, variable: string) => {
    setVariables((prev) => ({ ...prev, [kind]: variable }));
  }, []);

  const setDelivery = useCallback(
    (kind: ResourceKey, delivery: "direct" | "context") => {
      setDeliveriesState((prev) => ({ ...prev, [kind]: delivery }));
    },
    [],
  );

  const setDeliveries = useCallback(
    (next: Partial<Record<ResourceKey, "direct" | "context">>) => {
      setDeliveriesState({ ...next });
    },
    [],
  );

  const draft = useMemo(
    () =>
      selectionToBundle(selection, {
        topicId,
        maxTokens: budgetTokens,
        variables,
        deliveries,
      }),
    [selection, topicId, budgetTokens, variables, deliveries],
  );

  const preview = useMemo(
    () => (manifest ? previewBundle(manifest, draft) : null),
    [manifest, draft],
  );

  return {
    manifest,
    loading,
    error,
    reload,
    selection,
    toggleKind,
    toggleItem,
    patchKind,
    setSelection,
    clear,
    variables,
    setVariable,
    deliveries,
    setDelivery,
    setDeliveries,
    budgetTokens,
    setBudgetTokens,
    draft,
    preview,
  };
}
