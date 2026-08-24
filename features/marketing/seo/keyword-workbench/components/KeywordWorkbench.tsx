"use client";

/**
 * THE KEYWORD WORKBENCH (C14).
 *
 * One page where a subject-matter expert finds exactly the keywords they mean
 * and tells the system what those keywords ARE — with the reason, in their own
 * words, at the moment they decide.
 *
 * The four laws it exists to satisfy, all from Arman 2026-08-23:
 *  • P23 — every picker takes new input. The value picker adds what you type.
 *  • P24 — the WHY is captured at the moment of assignment, and stored on the
 *    stamp, because it is the training material an AI learns the pattern from.
 *  • P25 — never lose the view. Drilling opens a floating panel beside the
 *    table you built; it never replaces it.
 *  • P26 — the table is the user's. Any dimension can be a column; every
 *    column sorts and filters; the arrangement saves as a named tab; and a
 *    novel never lives in a cell — the why is an (i) and a right-click that
 *    links to where the rule can be edited.
 *
 * And one negative requirement that shapes the layout more than any of them:
 * "the current page is far too busy at the top with things that add no value…
 * I don't like pages where there are novels written." The top is ONE line of
 * context plus the controls. Everything else is table.
 *
 * WHAT THIS FILE IS NOW (P26 — ONE TABLE, 2026-08-24): the workbench's chrome.
 * The grid itself, its data access, its columns and its URL dialect all moved
 * to `features/marketing/seo/keyword-table/`, because the topic tree's keyword
 * queues had been built as hand-rolled lists and lost every one of them. What
 * stays here is what is genuinely the workbench's: saved-view tabs, the
 * right-click menu, and "assign everything these filters match".
 */

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Network, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import {
  keywordEntityRef,
  useKeywordAssignSurfaces,
  useKeywordMenuSection,
  type KeywordMenuRow,
} from "@/features/marketing/seo/keyword/keyword-actions";
import { gscMetricCopyLines } from "@/features/marketing/search-console/lib/columns";
import { humanLines } from "@/features/marketing/lib/copy-payloads";
import { panelDrillFor } from "@/features/marketing/search-console/lib/drills";
import type { GscBreakdownRow } from "@/features/marketing/search-console/types";
import { formatCount } from "@/features/marketing/search-console/types";
import {
  KeywordTable,
  type KeywordTableSurface,
  type KeywordTableView,
} from "@/features/marketing/seo/keyword-table/KeywordTable";
import {
  WORKBENCH_DEFAULT_COLUMNS,
  liveSearchParams,
  mergeKeywordTableParams,
  parseKeywordTableState,
  stateFromViewState,
  viewStateFor,
  viewStateMatches,
} from "@/features/marketing/seo/keyword-table/state";
import {
  deleteSavedView,
  listSavedViews,
  saveView,
  type SavedView,
} from "@/features/marketing/seo/keyword-table/savedViews";
import { getMatchingKeywordIds } from "@/features/marketing/seo/keyword-workbench/data";
import { SavedViewTabs } from "./SavedViewTabs";

const SURFACE: KeywordTableSurface = {
  id: "keyword-workbench",
  label: "Keyword",
  listLabel: "Keyword workbench",
  location: "Marketing — Keyword workbench",
  // The workbench owns its route, so it keeps the bare (unprefixed) dialect —
  // which is also what every saved view already written stores.
  defaultColumns: WORKBENCH_DEFAULT_COLUMNS,
};

export function KeywordWorkbench() {
  const { site, brandId, sitePath } = useMarketingSite();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const openDrilldown = useOpenGscDrilldownWindow();

  const state = parseKeywordTableState(params);
  /**
   * The arrangement AS IT IS NOW. Every handler below reads through this rather
   * than the render's `state`: with the React Compiler on, a memoized handler
   * can close over an older `useSearchParams()`, and a saved view built from a
   * stale arrangement stores something the person never chose (measured
   * 2026-08-24 — "Save this view" stored an empty arrangement, and reopening
   * the view then did nothing at all).
   */
  const liveState = () => parseKeywordTableState(liveSearchParams(params));

  const views = useQuery({
    queryKey: ["marketing", "seo", "keyword-views", site.id],
    queryFn: ({ signal }) => listSavedViews(site.id, undefined, signal),
    staleTime: 60_000,
  });
  const activeView =
    (views.data ?? []).find((v) => v.id === state.viewId) ?? null;

  const [viewsBusy, setViewsBusy] = useState(false);
  const [renaming, setRenaming] = useState<SavedView | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const clickedRow = useRef<GscBreakdownRow | null>(null);
  /** The live table, for chrome that renders outside it (the right-click menu). */
  const view = useRef<KeywordTableView | null>(null);

  /**
   * 🚨 ONE DEFINITION OF THE KEYWORD'S ACTIONS (2026-08-24). This page built
   * the whole set inline, which is exactly why nothing else in the family
   * could reach any of it — the finding that opened ADOPTION-SWEEP.md. The
   * items now come from `keyword-actions.tsx`, the same module the Value
   * Workbench and the Keyword Intelligence window consume, so an item added
   * once appears on all three.
   *
   * What stays this page's own is only the MOUNTING: the table already owns a
   * bulk-aware assign panel that remembers the last-used value, so it hands
   * that panel to the shared hook as a delegate instead of getting a second
   * one, and its pages drill inherits the table's live range and filters.
   */
  const menuRow = (): KeywordMenuRow | null => {
    const row = clickedRow.current;
    return row?.keyword_id
      ? { phrase: row.key, keywordId: row.keyword_id }
      : row
        ? { phrase: row.key, keywordId: null }
        : null;
  };
  const surfaces = useKeywordAssignSurfaces({
    siteId: site.id,
    delegate: {
      openDimension: (row, lockedDimensionSlug) =>
        view.current?.openAssign(
          row.keywordId ? [row.keywordId] : [],
          `“${row.phrase}”`,
          lockedDimensionSlug,
        ),
      openService: (row) =>
        view.current?.openServiceAssign(
          row.keywordId ? [row.keywordId] : [],
          `“${row.phrase}”`,
        ),
    },
  });
  const keywordSection = useKeywordMenuSection({
    siteId: site.id,
    siteName: site.domain,
    brandId,
    organizationId: site.organization_id,
    surfaces,
    getRow: menuRow,
    openPages: () => openPagesPanel(),
  });

  /**
   * THE BACK BUTTON IS UNDO. Opening a saved view is a discrete decision, so it
   * PUSHES — `router.replace` used to overwrite the entry, which left Back
   * exiting the workbench entirely.
   */
  const openView = (view: SavedView | null) => {
    const current = liveState();
    const next = view
      ? { ...stateFromViewState(view.state, current), viewId: view.id }
      : { ...parseKeywordTableState(new URLSearchParams()), viewId: null };
    const qs = mergeKeywordTableParams(
      liveSearchParams(params),
      next,
    ).toString();
    router.push(`${sitePath}/keywords${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const runViewWrite = async (fn: () => Promise<unknown>, done: string) => {
    setViewsBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "seo", "keyword-views", site.id],
      });
      toast.success(done);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that view.",
      );
    } finally {
      setViewsBusy(false);
    }
  };

  /**
   * "Assign all 4,471 matching" — the ONE place a bulk write escapes the page
   * on screen. It asks the server which keywords the live filters match rather
   * than assuming the fifty in the browser are all of them.
   */
  const selectAllMatching = async (
    view: KeywordTableView,
    intent: "stamp" | "service",
  ) => {
    setSelectingAll(true);
    try {
      const match = await getMatchingKeywordIds(
        site.id,
        view.periods,
        view.filters,
        view.search,
      );
      if (match.keywordIds.length === 0) {
        toast.info("Nothing matches these filters yet.");
        return;
      }
      const label = `${match.keywordIds.length.toLocaleString()} keywords`;
      if (intent === "service") view.openServiceAssign(match.keywordIds, label);
      else view.openAssign(match.keywordIds, label);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not work out everything your filters match.",
      );
    } finally {
      setSelectingAll(false);
    }
  };

  const openPagesPanel = () => {
    const row = clickedRow.current;
    if (!row) {
      toast.error("Right-click a keyword row to open its pages.");
      return;
    }
    const drill = panelDrillFor("query", row);
    const current = liveState();
    openDrilldown({
      siteId: site.id,
      siteName: site.domain,
      dimension: drill.dimension,
      filters: { ...current.filters, ...drill.filters },
      range: current.range,
      customFrom: current.customFrom,
      customTo: current.customTo,
      compare: current.compare,
      title: drill.label,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 bg-textured p-3">
      {/* The shared keyword actions' own surface — here that is only the
          ruling dialog ("Pin a level…"), because the dimension and service
          panels are delegated to the table's. */}
      {surfaces.isOpen ? <div className="shrink-0">{surfaces.node}</div> : null}
      {/* THE THIN TOP — one line of context, then controls. Nothing else. */}
      <SavedViewTabs
        views={views.data ?? []}
        loading={views.isLoading}
        activeId={state.viewId}
        dirty={!!activeView && !viewStateMatches(state, activeView.state)}
        busy={viewsBusy}
        onOpen={openView}
        onSaveNew={() => setSavingNew(true)}
        onUpdate={(view) =>
          void runViewWrite(
            () =>
              saveView({
                siteId: site.id,
                id: view.id,
                name: view.name,
                state: viewStateFor(liveState()),
                shared: view.shared,
              }),
            `“${view.name}” now opens on this arrangement.`,
          )
        }
        onRename={(view) => setRenaming(view)}
        onToggleShared={(view) =>
          void runViewWrite(
            () =>
              saveView({
                siteId: site.id,
                id: view.id,
                name: view.name,
                state: view.state as Record<string, string>,
                shared: !view.shared,
              }),
            view.shared
              ? `“${view.name}” is yours again.`
              : `“${view.name}” is shared with your team.`,
          )
        }
        onMove={(view, direction) => {
          const ordered = [...(views.data ?? [])];
          const index = ordered.findIndex((v) => v.id === view.id);
          const swap = ordered[index + direction];
          if (!swap) return;
          void runViewWrite(
            () =>
              Promise.all([
                saveView({
                  siteId: site.id,
                  id: view.id,
                  name: view.name,
                  state: view.state as Record<string, string>,
                  shared: view.shared,
                  position: swap.position ?? index + direction + 1,
                }),
                saveView({
                  siteId: site.id,
                  id: swap.id,
                  name: swap.name,
                  state: swap.state as Record<string, string>,
                  shared: swap.shared,
                  position: view.position ?? index + 1,
                }),
              ]),
            "Reordered.",
          );
        }}
        onDelete={(view) => {
          void (async () => {
            const ok = await confirm({
              title: `Delete “${view.name}”?`,
              description:
                "The view goes away. The keywords, stamps and reasons behind it are untouched.",
              confirmLabel: "Delete view",
              variant: "destructive",
            });
            if (!ok) return;
            await runViewWrite(
              () => deleteSavedView(site.id, view.id),
              `“${view.name}” deleted.`,
            );
            if (liveState().viewId === view.id) openView(null);
          })();
        }}
      />

      <KeywordTable
        siteId={site.id}
        siteDomain={site.domain}
        brandId={brandId}
        surface={SURFACE}
        className="flex min-h-0 flex-1 flex-col gap-2"
        viewRef={view}
        toolbarLeading={(live) =>
          live.total > live.rows.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 whitespace-nowrap text-xs"
                onClick={() => void selectAllMatching(live, "stamp")}
                disabled={selectingAll}
              >
                {selectingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Tag className="h-3.5 w-3.5" />
                )}
                Assign all {formatCount(live.total)} matching
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 whitespace-nowrap text-xs"
                onClick={() => void selectAllMatching(live, "service")}
                disabled={selectingAll}
              >
                <Network className="h-3.5 w-3.5" />
                Offering for all {formatCount(live.total)}
              </Button>
            </div>
          ) : null
        }
        selectionActions={({
          keywordIds,
          openAssign,
          openServiceAssign,
          quickAssign,
          lastUsed,
          clear,
        }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={keywordIds.length === 0}
              onClick={() =>
                openAssign(
                  keywordIds,
                  `${keywordIds.length.toLocaleString()} keyword${keywordIds.length === 1 ? "" : "s"}`,
                )
              }
            >
              <Tag className="h-3.5 w-3.5" />
              Assign…
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={keywordIds.length === 0}
              onClick={() =>
                openServiceAssign(
                  keywordIds,
                  `${keywordIds.length.toLocaleString()} keyword${keywordIds.length === 1 ? "" : "s"}`,
                )
              }
            >
              <Network className="h-3.5 w-3.5" />
              Offering…
            </Button>
            {lastUsed ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={keywordIds.length === 0}
                onClick={() => quickAssign(keywordIds, lastUsed)}
              >
                {lastUsed.valueLabel}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={clear}
            >
              Clear {keywordIds.length}
            </Button>
          </div>
        )}
        wrapTable={(table) => (
          <NonEditableContextMenu
            sourceFeature="marketing"
            contextData={{ content: "" }}
            resolveContextOnOpen={(target) => {
              const key = target
                ?.closest("[data-row-id]")
                ?.getAttribute("data-row-id");
              const row =
                (key && view.current?.rows.find((r) => r.key === key)) || null;
              clickedRow.current = row;
              if (!row) return null;
              return {
                // The ROW's entity owns Attach To — one menu serves every row,
                // so the pane must never be the target.
                [CONTEXT_MENU_ENTITY_KEY]: keywordEntityRef(menuRow()),
                content: humanLines(gscMetricCopyLines("Keyword", "query", row)),
              };
            }}
            extraSections={[
              {
                ...keywordSection,
                /* This page's ONE genuinely local item, in front of the shared
                   set: repeat the value you assigned last with no dialog at
                   all (P23). It exists only here because only this table
                   remembers a last-used value. */
                items: [
                  ...(view.current?.lastUsed
                    ? [
                        {
                          kind: "item" as const,
                          id: "kw-quick-assign",
                          label: `${view.current.lastUsed.dimensionLabel}: ${view.current.lastUsed.valueLabel}`,
                          icon: Tag,
                          description:
                            "Assign the value you used last — one click, no dialog",
                          onSelect: () => {
                            const row = clickedRow.current;
                            const picked = view.current?.lastUsed;
                            if (!row?.keyword_id || !picked) {
                              toast.error(
                                "Right-click a keyword row to assign it.",
                              );
                              return;
                            }
                            view.current?.quickAssign([row.keyword_id], picked);
                          },
                        },
                      ]
                    : []),
                  ...keywordSection.items,
                ],
              },
            ]}
          >
            {/* `asChild` needs a real DOM element to hang the handler on. */}
            <div className="flex h-full min-h-0 flex-col">{table}</div>
          </NonEditableContextMenu>
        )}
      />

      {savingNew ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setSavingNew(false);
          }}
          title="Name this view"
          description="Filters, columns and sort are saved. It becomes a tab you and your team can come back to."
          placeholder="e.g. Local buyers with no page yet"
          confirmLabel="Save view"
          onConfirm={async (name) => {
            setSavingNew(false);
            await runViewWrite(async () => {
              const current = liveState();
              const created = await saveView({
                siteId: site.id,
                name,
                state: viewStateFor(current),
              });
              const qs = mergeKeywordTableParams(liveSearchParams(params), {
                ...current,
                viewId: created.id,
              }).toString();
              router.push(`${sitePath}/keywords${qs ? `?${qs}` : ""}`, {
                scroll: false,
              });
            }, `“${name}” saved.`);
          }}
        />
      ) : null}

      {renaming ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          title="Rename view"
          defaultValue={renaming.name}
          confirmLabel="Rename"
          onConfirm={async (name) => {
            const view = renaming;
            setRenaming(null);
            if (!view) return;
            await runViewWrite(
              () =>
                saveView({
                  siteId: site.id,
                  id: view.id,
                  name,
                  state: view.state as Record<string, string>,
                  shared: view.shared,
                }),
              `Renamed to “${name}”.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
