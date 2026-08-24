"use client";

/**
 * THE KEYWORD ROW'S ACTIONS — ONE definition of "what you can do to a keyword",
 * shared by every surface that shows one.
 *
 * Arman, 2026-08-24: *"I talked at length about how the context menu was
 * essentially everything, but I'm just not seeing some of these things set
 * up."* The measured answer (ADOPTION-SWEEP.md) was that the Keyword Workbench
 * had built the whole set inline and nothing else in the family could reach
 * any of it. This module is the fix that stops that recurring: a surface adds a
 * right-click menu by calling `useKeywordAssignSurfaces` + spreading
 * `keywordMenuSection(...)` into `extraSections`, and it gets the same items,
 * the same write paths, and the same reason field as everywhere else.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Every action delegates:
 *   • a dimension answer (Class included) → `AssignPanel`  → `seo.gsc_set_keyword_stamps`
 *   • a service placement               → `ServiceAssignPanel` → `seo.gsc_set_keyword_topic`
 *   • a pinned level                    → `RulingDialog`   → `seo.gsc_set_keyword_value`
 *
 * And no fake items: an action that cannot run for the right-clicked row
 * (no library keyword behind the query, no site binding) is `disabled` with the
 * reason in its description, never rendered as something that silently no-ops.
 */

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  Gavel,
  Info,
  Network,
  PanelTop,
  Tag,
} from "lucide-react";

import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { useOpenGscWhyScoreWindow } from "@/features/overlays/openers/gscWhyScoreWindow";
import {
  AssignPanel,
  type AssignTarget,
} from "@/features/marketing/seo/keyword-workbench/components/AssignPanel";
import { ServiceAssignPanel } from "@/features/marketing/seo/keyword-workbench/components/ServiceAssignPanel";
import { useSiteServices } from "@/features/marketing/seo/keyword-workbench/hooks/useSiteServices";
import { getFacetDimensionCatalog } from "@/features/marketing/seo/value-system/dimensions/data";
import {
  getValueVocabulary,
  setKeywordValue,
} from "@/features/marketing/seo/value-system/data";
import {
  buildBandMeta,
  humanizeSlug,
  reviewWindow,
} from "@/features/marketing/seo/value-system/lib";
import {
  RulingDialog,
  type RulingDraft,
} from "@/features/marketing/seo/value-system/workbench/RulingDialog";

/** The one thing every keyword surface can say about a right-clicked row. */
export interface KeywordMenuRow {
  /** The phrase, exactly as the row shows it. */
  phrase: string;
  /** The `seo.keyword` id, when the row is mapped to the library. */
  keywordId: string | null;
  /** Pre-resolved level, when the surface already has it (for the label). */
  currentLevel?: string | null;
  /** True when a person already pinned that level. */
  levelIsRuling?: boolean;
}

export interface KeywordAssignSurfaces {
  /** Open the dimension picker. `lockedDimensionSlug` pins it to one dimension. */
  openDimension: (row: KeywordMenuRow, lockedDimensionSlug?: string) => void;
  openService: (row: KeywordMenuRow) => void;
  openLevel: (row: KeywordMenuRow) => void;
  /** True while any assignment surface is on screen. */
  isOpen: boolean;
  busy: boolean;
  /**
   * Render this somewhere the host controls — ABOVE its table, never inside a
   * Radix Dialog. The value picker inside `AssignPanel` opens its own portalled
   * popover, and a Dialog reads that as an outside interaction and closes
   * itself mid-assignment (caught live on the Value Workbench, 2026-08-24).
   */
  node: ReactNode;
}

/**
 * THE ROW'S OWN ENTITY — what a delegated table menu hands v3 so **Attach To**
 * targets the keyword that was right-clicked, not the pane.
 *
 * Return this under `CONTEXT_MENU_ENTITY_KEY` from `resolveContextOnOpen`:
 *
 * ```ts
 * return { content: …, [CONTEXT_MENU_ENTITY_KEY]: keywordEntityRef(row) };
 * ```
 *
 * `null` for a query with no library keyword — there is no record to attach to,
 * so v3 hides Attach rather than offering an item that writes a broken edge.
 * No `resourceType`: a keyword is not a shareable resource, so Share correctly
 * stays hidden (an absent item, never a fake one).
 */
export function keywordEntityRef(
  row: KeywordMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row?.keywordId) return null;
  return { type: "seo_keyword", id: row.keywordId, title: row.phrase };
}

/**
 * Re-read everything a keyword write can move: the stamp reads, the resolver
 * reads (a class stamp changes the score AND the level AND the receipt) and
 * the value workbench's own review query.
 */
export function invalidateKeywordFacts(
  queryClient: ReturnType<typeof useQueryClient>,
  siteId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "keyword-meaning", siteId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "keyword-stamps", siteId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["marketing", "gsc", "keyword-value-for", siteId],
    }),
    queryClient.invalidateQueries({ queryKey: ["marketing", "value"] }),
  ]);
}

export function useKeywordAssignSurfaces(opts: {
  siteId: string;
  onChanged?: () => void;
}): KeywordAssignSurfaces {
  const { siteId } = opts;
  const queryClient = useQueryClient();
  const [window] = useState(reviewWindow);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [serviceTarget, setServiceTarget] = useState<AssignTarget | null>(null);
  const [draft, setDraft] = useState<RulingDraft | null>(null);
  const [busy, setBusy] = useState(false);

  // Fetched only once a surface is actually asked for — a right-click menu
  // that has never been opened must not cost three RPCs on every table render.
  const catalog = useQuery({
    queryKey: ["marketing", "seo", "dimension-catalog", siteId],
    queryFn: ({ signal }) => getFacetDimensionCatalog(siteId, signal),
    staleTime: 5 * 60_000,
    enabled: Boolean(assignTarget),
  });
  const vocab = useQuery({
    queryKey: ["marketing", "value", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
    staleTime: 5 * 60_000,
    enabled: Boolean(draft),
  });

  const settled = async () => {
    await invalidateKeywordFacts(queryClient, siteId);
    opts.onChanged?.();
  };

  const targetFor = (row: KeywordMenuRow): AssignTarget | null =>
    row.keywordId
      ? { keywordIds: [row.keywordId], label: `“${row.phrase}”` }
      : null;

  const refuse = () =>
    toast.error("This query is not in the keyword library yet", {
      description:
        "Meaning is recorded against a library keyword. Run research on it first.",
    });

  const applyRuling = async (tier: string | null, notes: string) => {
    if (!draft) return;
    setBusy(true);
    try {
      await setKeywordValue(siteId, draft.keywordIds, tier, notes || undefined);
      setDraft(null);
      await settled();
      toast.success(
        tier
          ? `Ruled ${draft.label} as ${humanizeSlug(tier)}`
          : `Cleared your ruling on ${draft.label}`,
        {
          description: tier
            ? "Your ruling beats every computed signal until you clear it."
            : "The arithmetic decides again.",
        },
      );
    } catch (error) {
      toast.error("Could not save the ruling", {
        description: extractErrorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    isOpen: Boolean(assignTarget || serviceTarget || draft),
    openDimension: (row, lockedDimensionSlug) => {
      const target = targetFor(row);
      if (!target) {
        refuse();
        return;
      }
      setAssignTarget(
        lockedDimensionSlug ? { ...target, lockedDimensionSlug } : target,
      );
    },
    openService: (row) => {
      const target = targetFor(row);
      if (!target) {
        refuse();
        return;
      }
      setServiceTarget(target);
    },
    openLevel: (row) => {
      if (!row.keywordId) {
        refuse();
        return;
      }
      setDraft({
        keywordIds: [row.keywordId],
        label: `“${row.phrase}”`,
        mode: "set",
        tier: row.levelIsRuling ? (row.currentLevel ?? null) : null,
      });
    },
    node: (
      <>
        {assignTarget ? (
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <AssignPanel
              siteId={siteId}
              dimensions={catalog.data ?? []}
              dimensionsLoading={catalog.isLoading}
              target={assignTarget}
              onCancel={() => setAssignTarget(null)}
              onDone={(result, picked) => {
                setAssignTarget(null);
                void settled();
                toast.success(
                  result.cleared > 0
                    ? `Removed ${picked.valueLabel} from ${result.cleared.toLocaleString()} keyword${result.cleared === 1 ? "" : "s"}.`
                    : `${picked.dimensionLabel}: ${picked.valueLabel} on ${result.written.toLocaleString()} keyword${result.written === 1 ? "" : "s"}${result.notesSaved ? " — your reason is saved with them." : "."}`,
                );
              }}
            />
          </div>
        ) : null}
        {serviceTarget ? (
          <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <ServiceAssign
              siteId={siteId}
              window={window}
              target={serviceTarget}
              onCancel={() => setServiceTarget(null)}
              onDone={(placed) => {
                setServiceTarget(null);
                void settled();
                toast.success(
                  placed.topicId
                    ? `Placed under ${placed.name}.`
                    : "Taken off the service tree.",
                );
              }}
            />
          </div>
        ) : null}
        {draft ? (
          <RulingDialog
            siteId={siteId}
            draft={draft}
            metas={buildBandMeta(vocab.data ?? [])}
            busy={busy}
            onCancel={() => setDraft(null)}
            onApply={(tier, notes) => void applyRuling(tier, notes)}
          />
        ) : null}
      </>
    ),
  };
}

/**
 * The service picker's three catalog reads are worth ~3 RPCs, so they must not
 * fire on every table that merely COULD open one. Mounting the hook inside a
 * component that only exists while the picker is open is the whole point.
 */
function ServiceAssign({
  siteId,
  window,
  target,
  onCancel,
  onDone,
}: {
  siteId: string;
  window: { start: string; end: string };
  target: AssignTarget;
  onCancel: () => void;
  onDone: (placed: { topicId: string | null; name: string }) => void;
}) {
  const services = useSiteServices(siteId, window.start, window.end);
  return (
    <ServiceAssignPanel
      siteId={siteId}
      services={services}
      target={target}
      onCancel={onCancel}
      onDone={(_result, placed) => onDone(placed)}
    />
  );
}

/**
 * THE SECTION every keyword surface puts in `extraSections`. `getRow` is called
 * at select time and reads whatever the surface's `resolveContextOnOpen`
 * stashed, so one menu per pane serves every row (never one menu per row).
 */
export function useKeywordMenuSection(opts: {
  siteId: string;
  siteName?: string | null;
  brandId?: string | null;
  organizationId?: string | null;
  surfaces: KeywordAssignSurfaces;
  /** The row the menu was opened on, resolved at select time. */
  getRow: () => KeywordMenuRow | null;
  /** Omit the "Open Keyword Intelligence" door (the window's own menu does). */
  includeIntelDoor?: boolean;
  /** Label for the section heading. */
  label?: string;
}): ContextMenuExtraSection {
  const openKeywordWindow = useOpenKeywordWindow();
  const openWhyScore = useOpenGscWhyScoreWindow();
  const openDrilldown = useOpenGscDrilldownWindow();
  const { siteId, surfaces, getRow } = opts;

  const withRow =
    (fn: (row: KeywordMenuRow) => void) => () => {
      const row = getRow();
      if (!row) {
        toast.error("Right-click a keyword row to act on it.");
        return;
      }
      fn(row);
    };

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "kw-set-class",
      label: "Set the class…",
      icon: Tag,
      description:
        "Money, educational, brand or mismatched — and say why, in your words",
      onSelect: withRow((row) => surfaces.openDimension(row, "traffic_class")),
    },
    {
      kind: "item",
      id: "kw-set-service",
      label: "Which service?",
      icon: Network,
      description:
        "Place this keyword under the service, product or thing it is really about",
      onSelect: withRow((row) => surfaces.openService(row)),
    },
    {
      kind: "item",
      id: "kw-set-dimension",
      label: "Answer a dimension…",
      icon: BrainCircuit,
      description:
        "Any dimension — or type a new value and it becomes one (P23)",
      onSelect: withRow((row) => surfaces.openDimension(row)),
    },
    {
      kind: "item",
      id: "kw-pin-level",
      label: "Pin a level…",
      icon: Gavel,
      description: "Your ruling beats every computed signal until you clear it",
      onSelect: withRow((row) => surfaces.openLevel(row)),
    },
    {
      kind: "item",
      id: "kw-why",
      label: "Why this score",
      icon: Info,
      description: "The full receipt, with a door to every rule behind it",
      onSelect: withRow((row) => {
        if (!row.keywordId) {
          toast.error("This query has no library keyword, so it has no score.");
          return;
        }
        openWhyScore({
          siteId,
          siteName: opts.siteName ?? null,
          brandId: opts.brandId ?? null,
          keywordId: row.keywordId,
          keyword: row.phrase,
        });
      }),
    },
    {
      kind: "item",
      id: "kw-pages",
      label: "See pages for this keyword",
      icon: PanelTop,
      description:
        "Opens beside this table in a floating panel — you never lose the view",
      onSelect: withRow((row) => {
        openDrilldown({
          siteId,
          siteName: opts.siteName ?? null,
          dimension: "page",
          filters: { query_eq: row.phrase },
          title: `Pages for “${row.phrase}”`,
        });
      }),
    },
  ];

  if (opts.includeIntelDoor !== false) {
    items.push({
      kind: "item",
      id: "kw-intel",
      label: "Open Keyword Intelligence",
      icon: BrainCircuit,
      description:
        "Everything the platform knows about this keyword, in a floating window",
      onSelect: withRow((row) => {
        openKeywordWindow({
          phrase: row.phrase,
          siteId,
          brandId: opts.brandId ?? undefined,
          organizationId: opts.organizationId ?? undefined,
        });
      }),
    });
  }

  return {
    id: "keyword-intelligence",
    label: opts.label ?? "This keyword",
    icon: Tag,
    anchor: "after-compare",
    items,
  };
}
