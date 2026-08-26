"use client";

/**
 * RunSurfaceView — renders an authored Run Surface config (THE SHOW, R1)
 * over a live workflow run: the readouts, trigger-point-driven pages with
 * auto-advance (R2), empty states (R3), and the interrupt card above them.
 *
 * LAYOUT (rebuilt 2026-08-18). The authored `pos {x, y, w, h}` is still the
 * contract the builder writes and this component still honours it — but as a
 * FLOW, not as an absolutely-positioned dashboard grid. The literal Grafana
 * model produced fixed 30px rows, which forced every readout into a short box
 * with its own scrollbar: streamed writing arrived into a ~240px porthole and
 * the whole run read as a wall of tiny panels. Now `w` picks a column span in
 * a 12-column flow, `(y, x)` is the order, and `h` is a MINIMUM height — the
 * content decides the rest, so a step that is writing gets room to be read.
 *
 * Zero page shift: the flow only ever GROWS. A readout that has rendered is
 * never unmounted because data arrived — visibility depends ONLY on trigger
 * points (which fire monotonically within a run) and author config.
 *
 * Mobile is a single column ordered by mobileOrder ?? (y, x) — never a
 * second grid (config.ts law).
 */

import { useEffect, useRef, useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import {
  GRID_COLUMNS,
  GRID_ROW_HEIGHT_PX,
  type Readout,
  type RunSurfaceConfig,
} from "../surface/config";
import {
  hasTriggerFired,
  type TriggerResolutionState,
  type WorkflowDefinitionLike,
} from "../trigger-points";
import {
  selectNodeAggregatePhases,
  selectRunStatus,
  selectRunStickyFacts,
} from "../redux/workflow-runs.selectors";
import { useWorkflowRun } from "../hooks/useWorkflowRun";
import { InterruptCard, RunErrorCard } from "./readout-parts";
import { ReadoutView } from "./ReadoutView";
import { nodeOutputKind } from "./run/node-presentation";
import { KindSlot } from "@/features/content-ir/react/slot/KindSlot";
import {
  TileActionsProvider,
  useTileActionsTarget,
} from "@/components/mardown-display/blocks/generic/tile-actions-slot";

/** nodeId → human label from the definition (label ?? id). */
export function definitionNodeLabels(
  definition: WorkflowDefinitionLike,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const node of definition.nodes) {
    const label = node.data?.label;
    labels[node.id] = typeof label === "string" && label ? label : node.id;
  }
  return labels;
}

/** Author-defined marks are Phase 3+ — none fire yet. */
const EMPTY_MARKS: ReadonlySet<string> = new Set();

function deriveTitle(readout: Readout): string | null {
  if (readout.title) return readout.title;
  switch (readout.source.kind) {
    case "node":
      return readout.source.nodeId;
    case "group":
      return readout.source.label;
    case "childRun":
      return "Sub-workflow";
    case "progressRail":
      return "Progress";
    case "action":
      return null; // the button carries its own label
    case "static":
      return null;
    default:
      return null;
  }
}

/**
 * Mobile single-column comparator. Explicit `mobileOrder` values and the
 * derived (y,x) key live on DIFFERENT scales (small author ints vs. y*25+x),
 * so they are never compared to each other: annotated readouts come FIRST in
 * their authored order, the rest follow in grid (y,x) order.
 */
function compareMobile(a: Readout, b: Readout): number {
  const ea = a.mobileOrder;
  const eb = b.mobileOrder;
  if (ea !== undefined && eb !== undefined) return ea - eb;
  if (ea !== undefined) return -1;
  if (eb !== undefined) return 1;
  const da = a.pos.y * (GRID_COLUMNS + 1) + a.pos.x;
  const db = b.pos.y * (GRID_COLUMNS + 1) + b.pos.x;
  return da - db;
}

type ReadoutRender =
  | { readout: Readout; mode: "content" }
  | { readout: Readout; mode: "placeholder" };

/**
 * Which kind will fill this readout? Only a readout bound to a NODE can
 * answer — a group narrates many nodes, a rail narrates progress, static
 * content is already itself — and only when that node's definition declares
 * an `output_kind`. Known from the DEFINITION, so a correctly-shaped
 * placeholder is available at first paint, before the run has produced
 * anything at all.
 */
function readoutOutputKind(
  readout: Readout,
  definition?: WorkflowDefinitionLike,
): string | null {
  const source = readout.source;
  // NODE only. A `childRun` readout renders a nested run BOARD (or a status
  // disclosure), never that node's kind component — reserving its declared
  // shape would promise a silhouette nothing on that path can ever produce.
  if (source.kind !== "node") return null;
  return nodeOutputKind(definition, source.nodeId);
}

/** The flow grid the authored 24-column `pos.w` maps onto. */
const FLOW_COLUMNS = 12;
/** A tall readout still scrolls internally rather than running off forever. */
const READOUT_MAX_HEIGHT_PX = 560;

/**
 * Below this the flow is ONE column whatever the author asked for. The author
 * sizes a readout against the page; the stage is narrower than the page (the
 * journey rail takes its share), so a "half width" readout on a laptop landed
 * at ~360px — narrow enough that a rich kind component (the flashcard deck,
 * the quiz) wrapped its own words. Columns are worth having only when each one
 * is still wide enough to read.
 */
const MIN_STAGE_WIDTH_FOR_COLUMNS_PX = 1100;

/** 24-col author span → 12-col flow span, never narrower than a readable third. */
function flowSpan(w: number): number {
  const span = Math.round((w / GRID_COLUMNS) * FLOW_COLUMNS);
  return Math.min(FLOW_COLUMNS, Math.max(4, span));
}

/** The rendered width of the grid — measured, because the stage's width is a
 * property of the LAYOUT it sits in, not of the viewport. */
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function ReadoutCell({
  runId,
  item,
  mobile,
  fullWidth,
  ensureLane,
  definition,
}: {
  runId: string;
  item: ReadoutRender;
  mobile: boolean;
  /** The stage is too narrow for columns — span everything. */
  fullWidth: boolean;
  ensureLane?: (invocationKey: string, seedText?: string) => string | null;
  definition?: WorkflowDefinitionLike;
}) {
  const { readout, mode } = item;
  const title = deriveTitle(readout);
  // The kind this readout is waiting for, when the definition declares one —
  // read only while placeholding, so a live tile pays nothing for it.
  const placeholderKind =
    mode === "placeholder" ? readoutOutputKind(readout, definition) : null;
  // Header-actions slot: body content (the Preview/JSON toggle) renders its
  // tiny controls on THIS title line instead of spending a body row on them.
  const { target: actionsTarget, targetProps } = useTileActionsTarget();
  // `h` is the author's intent for how much room this deserves — honoured as a
  // floor so a short readout keeps its shape, never as a ceiling that clips
  // live writing.
  const minHeight = Math.min(
    READOUT_MAX_HEIGHT_PX,
    Math.max(64, readout.pos.h * GRID_ROW_HEIGHT_PX),
  );
  const style = mobile
    ? { minHeight }
    : {
        gridColumn: `span ${fullWidth ? FLOW_COLUMNS : flowSpan(readout.pos.w)}`,
        minHeight,
      };

  return (
    <div
      style={style}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card",
        mode === "placeholder"
          ? "border-dashed border-border/70 bg-card/40"
          : "border-border",
      )}
    >
      {title ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
          <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
            {title}
          </h3>
          {/* Body controls (Preview/JSON) land here — on the line that already
              exists — never on a body row of their own. */}
          <span {...targetProps} className="inline-flex shrink-0 items-center" />
          {mode === "placeholder" ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              Coming up
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-y-auto p-3"
        style={{ maxHeight: READOUT_MAX_HEIGHT_PX }}
      >
        {mode === "placeholder" ? (
          // THE RESERVED SLOT. Two grey bars said "something goes here" and
          // nothing more, whatever this readout was about to become. When the
          // authored source names a node whose definition declares an
          // `output_kind`, reserve THAT kind's silhouette instead — the shape
          // the reader is waiting for, still and quiet, in the footprint the
          // author already sized. `chrome="bare"`: this tile draws the frame
          // and the title. Sourceless or kindless readouts keep the bars,
          // which remain the honest answer when nothing is known.
          placeholderKind ? (
            <KindSlot
              slotKey={`${runId}:${readout.id}`}
              kind={placeholderKind}
              phase="reserved"
              chrome="bare"
            />
          ) : (
            <div aria-hidden className="space-y-1.5 pt-0.5">
              <div className="h-2 w-2/3 rounded-full bg-muted/70" />
              <div className="h-2 w-1/2 rounded-full bg-muted/50" />
            </div>
          )
        ) : (
          <TileActionsProvider target={actionsTarget}>
            <ReadoutView
              runId={runId}
              readout={readout}
              ensureLane={ensureLane}
              definition={definition}
            />
          </TileActionsProvider>
        )}
      </div>
    </div>
  );
}

export function RunSurfaceView({
  runId,
  definition,
  config,
  adopt = true,
  hideRunStatusCards = false,
  hideProgressRails = false,
}: {
  runId: string;
  definition: WorkflowDefinitionLike;
  config: RunSurfaceConfig;
  /** A parent adapter already following this run passes false. */
  adopt?: boolean;
  /**
   * The hosting surface already renders the run's failure/interrupt state
   * (RunStage does, with the full explanation card), so this view must not
   * render a second copy of it. Standalone and nested consumers leave it off
   * and keep the built-in cards — a run surface must never be silent about a
   * stopped run.
   */
  hideRunStatusCards?: boolean;
  /**
   * The host already narrates progress somewhere better (RunStage hoists the
   * authored rail into its always-visible journey), so the per-page rail
   * readouts would be a second, smaller copy of the same thing beside the
   * content. Standalone consumers leave this off and keep their rails.
   */
  hideProgressRails?: boolean;
}) {
  const { ensureLane } = useWorkflowRun(adopt !== false ? runId : null);
  // Bound to THIS surface's run for the readouts below. A non-adopting
  // surface (nested child) has no handle — promotion stays parent-owned.
  const promoteLane =
    adopt !== false
      ? (invocationKey: string, seedText?: string) =>
          ensureLane(runId, invocationKey, seedText)
      : undefined;
  const isMobile = useIsMobile();
  const { ref: gridRef, width: gridWidth } = useMeasuredWidth();
  const runStatus = useAppSelector(selectRunStatus(runId));
  const nodePhases = useAppSelector(selectNodeAggregatePhases(runId));
  const sticky = useAppSelector(selectRunStickyFacts(runId));

  const triggerState: TriggerResolutionState = {
    runStatus,
    nodePhases,
    marks: EMPTY_MARKS,
    deliverableNodeId: config.deliverableNodeId ?? null,
    // Sticky facts keep fired triggers fired — live phases regress on retry
    // and resume, which used to snap pages back and collapse appeared
    // readouts to placeholders (the zero-page-shift law).
    sticky,
  };

  // ── Pages: trigger-driven auto-advance, manual choice wins until a LATER
  // page's trigger fires (derived — no effect, no re-render loop). ─────────
  const pages = config.pages;
  let firedIdx = -1;
  for (let i = 0; i < pages.length; i += 1) {
    const activateOn = pages[i].activateOn;
    if (activateOn && hasTriggerFired(activateOn, definition, triggerState)) {
      firedIdx = i;
    }
  }
  const [manual, setManual] = useState<{
    pageId: string;
    atFiredIdx: number;
  } | null>(null);
  const manualWins = manual !== null && firedIdx <= manual.atFiredIdx;
  const activePageId =
    pages.length === 0
      ? null
      : manualWins && manual !== null
        ? manual.pageId
        : pages[Math.max(firedIdx, 0)].id;
  const firstPageId = pages.length > 0 ? pages[0].id : null;

  // ── Visibility + page filter → render list (placeholders hold space). ───
  const rendered: ReadoutRender[] = [];
  for (const readout of config.readouts) {
    if (hideProgressRails && readout.source.kind === "progressRail") continue;
    if (pages.length > 0) {
      const pageId = readout.pageId ?? firstPageId;
      if (pageId !== activePageId) continue;
    }
    const visibility = readout.visibility;
    if (
      visibility?.hideOn &&
      hasTriggerFired(visibility.hideOn, definition, triggerState)
    ) {
      continue;
    }
    if (
      visibility?.appearOn &&
      !hasTriggerFired(visibility.appearOn, definition, triggerState)
    ) {
      // Absent `empty` means "placeholder" (config.ts default) — the builder
      // encodes the placeholder choice by OMITTING the key, so only an
      // explicit "hidden" may collapse the box (zero page shift).
      if (visibility.empty !== "hidden") {
        rendered.push({ readout, mode: "placeholder" });
      }
      continue;
    }
    rendered.push({ readout, mode: "content" });
  }

  const ordered = isMobile
    ? [...rendered].sort((a, b) => compareMobile(a.readout, b.readout))
    : rendered;

  return (
    <div className="space-y-3">
      {pages.length > 1 ? (
        // A segmented control, not a row of loose outlines: the pages are one
        // choice, and the run moves through them on its own.
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
          {pages.map((page) => {
            const active = page.id === activePageId;
            return (
              <button
                key={page.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() =>
                  setManual({ pageId: page.id, atFiredIdx: firedIdx })
                }
                className={cn(
                  "min-h-8 rounded-md px-3 text-xs font-medium transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {page.title}
              </button>
            );
          })}
        </div>
      ) : null}

      {hideRunStatusCards ? null : (
        <>
          <RunErrorCard
            runId={runId}
            nodeLabels={definitionNodeLabels(definition)}
          />
          <InterruptCard runId={runId} />
        </>
      )}

      {isMobile ? (
        <div className="flex flex-col gap-3">
          {ordered.map((item) => (
            <ReadoutCell
              key={item.readout.id}
              runId={runId}
              item={item}
              mobile
              fullWidth
              ensureLane={promoteLane}
              definition={definition}
            />
          ))}
        </div>
      ) : (
        <div
          ref={gridRef}
          className="grid items-start gap-3"
          style={{
            gridTemplateColumns: `repeat(${FLOW_COLUMNS}, minmax(0, 1fr))`,
          }}
        >
          {ordered.map((item) => (
            <ReadoutCell
              key={item.readout.id}
              runId={runId}
              item={item}
              mobile={false}
              fullWidth={
                gridWidth !== null && gridWidth < MIN_STAGE_WIDTH_FOR_COLUMNS_PX
              }
              ensureLane={promoteLane}
              definition={definition}
            />
          ))}
        </div>
      )}
    </div>
  );
}
