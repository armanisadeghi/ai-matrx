"use client";

/**
 * RunSurfaceView — renders an authored Run Surface config (THE SHOW, R1)
 * over a live workflow run: the 24-column Grafana-model grid of readouts,
 * trigger-point-driven pages with auto-advance (R2), placeholder empty
 * states (R3), and the interrupt card above the grid.
 *
 * Zero page shift: the grid only ever GROWS. A readout that has rendered is
 * never unmounted because data arrived — visibility depends ONLY on trigger
 * points (which fire monotonically within a run) and author config.
 *
 * Mobile is a single column ordered by mobileOrder ?? (y, x) — never a
 * second grid (config.ts law).
 */

import { useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";

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
} from "../redux/workflow-runs.selectors";
import { useWorkflowRun } from "../hooks/useWorkflowRun";
import { InterruptCard } from "./readout-parts";
import { ReadoutView } from "./ReadoutView";

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

function mobileOrderOf(readout: Readout): number {
  return (
    readout.mobileOrder ??
    readout.pos.y * (GRID_COLUMNS + 1) + readout.pos.x
  );
}

type ReadoutRender =
  | { readout: Readout; mode: "content" }
  | { readout: Readout; mode: "placeholder" };

function ReadoutCell({
  runId,
  item,
  mobile,
}: {
  runId: string;
  item: ReadoutRender;
  mobile: boolean;
}) {
  const { readout, mode } = item;
  const title = deriveTitle(readout);
  const style = mobile
    ? undefined
    : {
        gridColumn: `${readout.pos.x + 1} / span ${readout.pos.w}`,
        gridRow: `${readout.pos.y + 1} / span ${readout.pos.h}`,
      };
  return (
    <div
      style={style}
      className="flex min-h-0 flex-col rounded-xl border border-border bg-card"
    >
      {title ? (
        <div className="shrink-0 truncate px-2 pt-1.5 text-[11px] font-medium text-muted-foreground">
          {title}
        </div>
      ) : null}
      <div
        className={
          mobile
            ? "max-h-96 min-h-0 overflow-auto p-2"
            : "min-h-0 flex-1 overflow-auto p-2"
        }
      >
        {mode === "placeholder" ? (
          <div className="h-full min-h-6 w-full animate-pulse rounded-md bg-muted" />
        ) : (
          <ReadoutView runId={runId} readout={readout} />
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
}: {
  runId: string;
  definition: WorkflowDefinitionLike;
  config: RunSurfaceConfig;
  /** A parent adapter already following this run passes false. */
  adopt?: boolean;
}) {
  useWorkflowRun(adopt !== false ? runId : null);
  const isMobile = useIsMobile();
  const runStatus = useAppSelector(selectRunStatus(runId));
  const nodePhases = useAppSelector(selectNodeAggregatePhases(runId));

  const triggerState: TriggerResolutionState = {
    runStatus,
    nodePhases,
    marks: EMPTY_MARKS,
    deliverableNodeId: config.deliverableNodeId ?? null,
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
    ? [...rendered].sort(
        (a, b) => mobileOrderOf(a.readout) - mobileOrderOf(b.readout),
      )
    : rendered;

  return (
    <div className="space-y-2">
      {pages.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {pages.map((page) => {
            const active = page.id === activePageId;
            return (
              <button
                key={page.id}
                type="button"
                onClick={() =>
                  setManual({ pageId: page.id, atFiredIdx: firedIdx })
                }
                className={
                  active
                    ? "rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-xs font-medium text-foreground"
                    : "rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {page.title}
              </button>
            );
          })}
        </div>
      ) : null}

      <InterruptCard runId={runId} />

      {isMobile ? (
        <div className="flex flex-col gap-2">
          {ordered.map((item) => (
            <ReadoutCell
              key={item.readout.id}
              runId={runId}
              item={item}
              mobile
            />
          ))}
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
            gridAutoRows: `${GRID_ROW_HEIGHT_PX}px`,
          }}
        >
          {ordered.map((item) => (
            <ReadoutCell
              key={item.readout.id}
              runId={runId}
              item={item}
              mobile={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
