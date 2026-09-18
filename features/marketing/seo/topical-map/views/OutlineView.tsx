"use client";

/**
 * OUTLINE — the map's index screen (vision §2.1: "looks like a file tree …
 * dense, readable by humans and agents. Editable in place on click. Labels
 * only by default; options add counts, status marks, a description snippet.
 * Hover shows a small well-made popover"). Champion: Linear + Notion.
 *
 * AN ADAPTER, NOT A TREE (R11). The drawing is `components/official/topic-tree`;
 * this file turns `selectVisibleMapTopics` into its rows (`outline/useOutlineRows`)
 * and its intentions back into slice actions and writes. Nothing here re-walks
 * the tree, sorts it, or keeps what the user chose: selection, expansion, the
 * filter and the sibling order all live in the workspace slice, which is why
 * the outline is exactly as it was left after a trip to the table.
 *
 * WHAT IS LOCAL, ON PURPOSE: which topics are expanded TO THEIR PAGES. The
 * slice has no field for it yet (a coordinator request is filed in the build
 * register); until it lands, that set resets on a view switch.
 *
 * Every taste comes from `useTopicalMapKnobs()`: `outline_detail`,
 * `outline_hover_popover`, `outline_intent_dots`, `outline_description_max_chars`,
 * `intent_colors`. None is a constant here.
 */

import { useRef, useState } from "react";
import { Files, PanelRight } from "lucide-react";

import { TopicTree, type TopicTreeRow } from "@/components/official/topic-tree/TopicTree";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { ClipboardFallbackDialog } from "@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useOpenTopicPanel } from "@/features/overlays/openers/topicalMapTopicPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { topicalMapErrorText } from "../errors";
import { useMapTree } from "../hooks";
import { useTopicalMapKnobs, type TopicalMapKnobs } from "../knobs";
import { useMapLinks } from "../links";
import {
  selectMapIntentsByPageId,
  selectMapTopicsBySlug,
  selectMapTotals,
  selectMapWorkspace,
} from "../redux/selectors";
import { selectTopic, toggleExpanded } from "../redux/slice";
import type { VisibleMapTopic } from "../redux/types";
import { buildTopicMenuSection } from "../ui/topicMenuSection";
import { MoveTopicDialog } from "./outline/MoveTopicDialog";
import { OutlineDiagnostics } from "./outline/OutlineDiagnostics";
import { OutlineToolbar } from "./outline/OutlineToolbar";
import { TopicActionConfirm, type PendingTopicAction } from "./outline/TopicActionConfirm";
import { TopicHoverCard } from "./outline/TopicHoverCard";
import {
  hiddenPagesRowId,
  pageRowId,
  parsePageRowId,
  topicPageRows,
  topicSlugOfRow,
} from "./outline/topicPageRows";
import { useOutlineEdits } from "./outline/useOutlineEdits";
import { useOutlineRows } from "./outline/useOutlineRows";
import { useTopicPages } from "./outline/useTopicPages";

/**
 * What `map_tree` is asked for. Identical to every other tree view's list so
 * the query cache is shared across a view switch (one key, one read).
 */
export const OUTLINE_TREE_INCLUDE: readonly string[] = ["description", "status", "counts", "facets"];

const SURFACE_NAME = "matrx-user/marketing-topical-map";

export function OutlineView({ mapId, siteId, host, readOnly }: MapViewProps) {
  const include = [...OUTLINE_TREE_INCLUDE];
  const tree = useMapTree(mapId, { include, siteId: siteId ?? undefined });
  const { knobs, loading: knobsLoading, error: knobsError } = useTopicalMapKnobs();
  const totals = useAppSelector(selectMapTotals(mapId));

  if (knobsError) return <TopicalMapFailed what="the map settings" error={knobsError} />;
  if (knobsLoading || !knobs) return <TopicalMapLoading what="the map settings" />;
  if (tree.isPending) return <TopicalMapLoading what="this map's topics" />;
  if (tree.isError) return <TopicalMapFailed what="this map's topics" error={tree.error} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <AssistStrip surfaceName={SURFACE_NAME} />
      {totals.topicsLoaded === 0 ? (
        <TopicalMapEmpty
          title="This map has no topics yet"
          detail="Nothing has been generated or added. A map builder run, or an agent using the topical_map tool, fills the tree; until then there is genuinely nothing to show."
        />
      ) : (
        <OutlineBody
          mapId={mapId}
          siteId={siteId}
          host={host}
          readOnly={readOnly}
          knobs={knobs}
        />
      )}
      <OutlineDiagnostics mapId={mapId} siteId={siteId} />
    </div>
  );
}

interface OutlineBodyProps extends MapViewProps {
  knobs: TopicalMapKnobs;
}

function OutlineBody({ mapId, siteId, readOnly, knobs }: OutlineBodyProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const links = useMapLinks();
  const openTopicPanel = useOpenTopicPanel();
  const edits = useOutlineEdits(mapId);
  const topicsBySlug = useAppSelector(selectMapTopicsBySlug(mapId));
  const intents = useAppSelector(selectMapIntentsByPageId(mapId));
  const coverage = useAppSelector(selectMapWorkspace(mapId)).coverageByPageId;

  // Which topics are expanded to their pages — local (see the header).
  const [pagesExpanded, setPagesExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const pages = useTopicPages(mapId, [...pagesExpanded]);

  // The right-clicked row, resolved at open time (one menu serves every row).
  const [menuSlug, setMenuSlug] = useState<string | null>(null);
  const [moveSlug, setMoveSlug] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingTopicAction | null>(null);
  const [clipboardFallback, setClipboardFallback] = useState<string | null>(null);

  const treeHostRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(treeHostRef, { label: "topical-map outline" });

  function openPanel(slug: string): void {
    openTopicPanel({ mapId, slug, siteId });
  }

  function togglePages(slug: string): void {
    setPagesExpanded((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  /** The pages under one topic: real rows, one loading row, or the RPC's sentence. */
  function pageRowsFor(slug: string, depth: number): readonly TopicTreeRow[] {
    const state = pages.get(slug);
    if (!state || state.status === "pending") {
      return [
        {
          id: `${pageRowId(slug, "loading")}`,
          parentId: slug,
          depth: depth + 1,
          label: "Loading pages…",
          hasChildren: false,
          expanded: false,
          selected: false,
          trailing: <SuspenseLoader size="xs" centered={false} />,
        },
      ];
    }
    if (state.status === "error") {
      return [
        {
          id: hiddenPagesRowId(`${slug}:error`),
          parentId: slug,
          depth: depth + 1,
          label: topicalMapErrorText(state.error),
          hasChildren: false,
          expanded: false,
          selected: false,
          trailing: <span className="text-[11px] text-destructive">could not list pages</span>,
        },
      ];
    }
    const rows = topicPageRows({
      slug,
      depth,
      associations: state.associations,
      intents,
      coverage,
      colors: knobs.intent_colors,
      dotsOn: knobs.outline_intent_dots,
    });
    if (rows.length === 0) {
      return [
        {
          id: hiddenPagesRowId(`${slug}:none`),
          parentId: slug,
          depth: depth + 1,
          label: "No pages are attached to this topic on the sites you can view.",
          hasChildren: false,
          expanded: false,
          selected: false,
        },
      ];
    }
    return rows;
  }

  const { rows, topicCount } = useOutlineRows(mapId, {
    detail: knobs.outline_detail,
    descriptionMaxChars: knobs.outline_description_max_chars,
    pagesExpanded,
    pageRowsFor,
    renderPagesChip: (topic: VisibleMapTopic, count: number, open: boolean) => (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          togglePages(topic.slug);
        }}
        aria-pressed={open}
        aria-label={open ? `Hide the pages of ${topic.name}` : `Show the ${count} pages of ${topic.name}`}
        title={open ? "Hide pages" : "Show pages"}
        className={cn(
          "inline-flex h-4 items-center gap-0.5 rounded-sm border px-1 text-[10px] tabular-nums leading-none",
          open
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Files className="h-2.5 w-2.5" aria-hidden />
        {count}
      </button>
    ),
    renderActions: (topic: VisibleMapTopic) => (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openPanel(topic.slug);
        }}
        title="Open topic"
        aria-label={`Open ${topic.name}`}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
          // The tree reveals the actions slot on hover / focus-within; on touch
          // there is no hover, so the door is always visible there.
          isMobile && "opacity-100",
        )}
      >
        <PanelRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    ),
  });

  // ── Intentions from the tree → slice actions and writes ──────────────────

  function onSelect(id: string): void {
    dispatch(selectTopic({ mapId, slug: topicSlugOfRow(id) }));
  }

  function onToggleExpand(id: string): void {
    if (parsePageRowId(id)) return;
    dispatch(toggleExpanded({ mapId, slug: id }));
  }

  const onRenameCommit = readOnly
    ? undefined
    : (id: string, name: string) => {
        if (parsePageRowId(id)) return;
        void edits.rename(id, name, topicsBySlug[id]?.name ?? id);
      };

  const onMove = readOnly
    ? undefined
    : (id: string, newParentId: string | null) => {
        if (parsePageRowId(id)) return; // a page is not a topic; nothing to move
        const target = newParentId === null ? null : topicSlugOfRow(newParentId);
        if (target === id) return;
        edits.move(id, target).catch(() => undefined); // surfaced by the hook's banner
      };

  async function copySlug(slug: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(slug);
    } catch {
      setClipboardFallback(slug);
    }
  }

  /** Opens the tree's own inline editor for `slug`: select it, then press F2 for the user. */
  function requestRename(slug: string): void {
    dispatch(selectTopic({ mapId, slug }));
    window.requestAnimationFrame(() => {
      const tree = treeHostRef.current?.querySelector('[role="tree"]');
      if (!(tree instanceof HTMLElement)) return;
      tree.focus();
      tree.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }));
    });
  }

  const menuTopic = menuSlug ? topicsBySlug[menuSlug] : null;
  const menuSections =
    menuSlug && menuTopic
      ? [
          buildTopicMenuSection({
            mapId,
            slug: menuSlug,
            label: menuTopic.name,
            links,
            actions: readOnly
              ? {
                  onOpenPanel: () => openPanel(menuSlug),
                  onCopySlug: () => void copySlug(menuSlug),
                }
              : {
                  onOpenPanel: () => openPanel(menuSlug),
                  onCopySlug: () => void copySlug(menuSlug),
                  onRename: () => requestRename(menuSlug),
                  onMove: () => setMoveSlug(menuSlug),
                  onRetire: () => setPendingAction({ kind: "retire", slug: menuSlug }),
                  onReject: () => setPendingAction({ kind: "reject", slug: menuSlug }),
                },
          }),
        ]
      : [];

  return (
    <>
      <OutlineToolbar mapId={mapId} visibleTopics={topicCount} />

      {edits.failure ? (
        <div className="relative shrink-0">
          <TopicalMapFailed what={edits.failure.what} error={edits.failure.error} />
          <button
            type="button"
            onClick={edits.dismissFailure}
            className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div ref={treeHostRef} className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card">
        <NonEditableContextMenu
          sourceFeature="marketing"
          surfaceName={SURFACE_NAME}
          enableFloatingIcon={false}
          resolveContextOnOpen={(target) => {
            const rowElement = target?.closest("[data-topic-tree-row]");
            const rowId = rowElement?.getAttribute("data-topic-tree-row") ?? null;
            const slug = rowId ? topicSlugOfRow(rowId) : null;
            setMenuSlug(slug && topicsBySlug[slug] ? slug : null);
            return slug ? { map_id: mapId, topic_slug: slug } : null;
          }}
          extraSections={menuSections}
        >
          {/* Radix `asChild` slots the menu's onContextMenu and ref onto a
              SINGLE element child. `TopicTree` is a function component that
              forwards neither, so the menu was mounted and inert — every
              right-click fell through to the page underneath. A DOM element in
              between takes the handlers and the event bubbles up from the row,
              the same wrapper `features/scheduling/.../ScheduleList.tsx` uses.
              `display: contents` keeps the flex chain intact. */}
          <div className="contents">
            <TopicTree
              rows={rows}
              ariaLabel="Topical map outline"
              density={isMobile ? "comfortable" : "compact"}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onRenameCommit={onRenameCommit}
              onMove={onMove}
              renderHover={
                knobs.outline_hover_popover
                  ? (row) =>
                      parsePageRowId(row.id) ? null : (
                        <TopicHoverCard mapId={mapId} slug={row.id} onOpen={openPanel} />
                      )
                  : undefined
              }
              emptyState="No topic matches this search."
              className="min-h-0 flex-1"
            />
          </div>
        </NonEditableContextMenu>
      </div>

      {readOnly ? null : (
        <>
          <MoveTopicDialog
            mapId={mapId}
            slug={moveSlug}
            onClose={() => setMoveSlug(null)}
            onMove={(slug, parent) => edits.move(slug, parent)}
          />
          <TopicActionConfirm
            mapId={mapId}
            pending={pendingAction}
            busy={edits.removing}
            onCancel={() => setPendingAction(null)}
            onConfirm={(action) => {
              const name = topicsBySlug[action.slug]?.name ?? action.slug;
              const run = action.kind === "retire" ? edits.retire : edits.reject;
              void run(action.slug, name).finally(() => setPendingAction(null));
            }}
          />
        </>
      )}

      <ClipboardFallbackDialog
        open={clipboardFallback !== null}
        onOpenChange={(open) => (open ? undefined : setClipboardFallback(null))}
        url={clipboardFallback ?? ""}
        title="Copy the topic slug"
        description="The clipboard was not available. Press Cmd/Ctrl+C to copy the slug."
      />
    </>
  );
}
