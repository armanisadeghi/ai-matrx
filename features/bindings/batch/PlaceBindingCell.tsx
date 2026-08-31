"use client";

// features/bindings/batch/PlaceBindingCell.tsx
//
// ONE CELL OF THE TRANSPOSED MIDDLE: what feeds ONE holder input at ONE place.
//
// 🚨 Two reuses, no new mechanics:
//   · the INLINE editor is `InlineBindingEditor`, imported from the shortcut
//     batch grid's own cell and given this domain's words — same four sources,
//     same behaviour, named rather than drawn (P3);
//   · ADVANCED opens `BindingMiddleRow` — the FULL card map mode renders, with
//     the example, the absence answer, the per-row problems, the many-to-one
//     strip and "also feed this input…". P17 asks for "an Advanced popover that
//     opens the full card"; a reduced copy would be a second card to keep true.
//
// What this file owns is the SEAM: the shared inline editor speaks one
// `ValueMapping`, while a job binding stores an ORDERED LIST of sources per
// input (D18.2). The inline control owns source 0; every write goes through
// `consumption-writer`, the one writer, exactly as the middle does.

import { AlertTriangle, Loader2 } from "lucide-react";

import { InlineBindingEditor } from "@/features/agent-shortcuts/components/batch/BatchBindingCell";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import {
  isOfferedSource,
  type ConsumptionEntry,
  type ConsumptionMap,
} from "@/features/mandates/provision-shapes";
import { BindingMiddleRow } from "../BindingMiddle";
import {
  applyRowMapping,
  mappingForRow,
  sourcesFor,
} from "../consumption-writer";
import { offeredValuesToSurfaceValues } from "../offered-adapter";
import { sourceLabelsFor } from "../words";
import type { PlaceOfferState } from "./batch-model";

const NOTHING_AUTO_BOUND: ReadonlySet<string> = new Set<string>();

export function PlaceBindingCell({
  placeLabel,
  holderKind,
  offerState,
  target,
  isContext,
  pinnedContext,
  map,
  onChange,
  disabled,
}: {
  /** The place this cell belongs to — the Advanced popover's heading. */
  placeLabel: string;
  holderKind: "agent" | "workflow";
  offerState: PlaceOfferState;
  target: BindingTarget;
  isContext: boolean;
  pinnedContext: readonly string[];
  map: ConsumptionMap;
  onChange: (next: ConsumptionMap) => void;
  disabled?: boolean;
}) {
  if (offerState.status === "loading") {
    return (
      <div className="flex h-7 items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Reading this place…
      </div>
    );
  }
  if (offerState.status === "error") {
    return (
      <div className="flex h-7 items-center gap-1.5 px-1 text-[11px] text-destructive">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        Unreadable — the row says why.
      </div>
    );
  }

  const offered = offerState.offered;
  const sources = sourcesFor(map, target.name);
  const offeredByName = new Map(offered.map((v) => [v.name, v]));
  const deliver: ConsumptionEntry["deliver"] = isContext
    ? "context"
    : "variable";
  const extras = sources.length - 1;
  const awaitingPick =
    sources[0] !== undefined &&
    isOfferedSource(sources[0]) &&
    sources[0].target === "";

  return (
    <div className="space-y-0.5">
      <InlineBindingEditor
        target={target}
        mapping={mappingForRow(sources)}
        availableSurfaceValues={offeredValuesToSurfaceValues(offered)}
        surfaceName={placeLabel}
        disabled={disabled}
        showSourceLabel
        sourceLabels={sourceLabelsFor(holderKind)}
        valueFieldLabel="Offered value"
        valuePlaceholder="Pick an offered value…"
        advancedContent={
          <BindingMiddleRow
            holderKind={holderKind}
            target={target}
            isContext={isContext}
            offered={offered}
            pinnedContext={pinnedContext}
            value={map}
            onChange={onChange}
            autoBound={NOTHING_AUTO_BOUND}
            disabled={disabled}
          />
        }
        onChange={(next) =>
          onChange(
            applyRowMapping({
              map,
              targetName: target.name,
              mapping: next,
              offeredByName,
              deliver,
            }),
          )
        }
      />
      {/* D18.2 — a target may be fed by several offered values, joined with a
          blank line. The cell STATES the join rather than hiding it; Advanced
          is where the order is edited. */}
      {extras > 0 ? (
        <p className="px-1 text-[10px] leading-snug text-muted-foreground">
          + {extras} more {extras === 1 ? "value" : "values"} joined after it
        </p>
      ) : null}
      {awaitingPick ? (
        <p className="px-1 text-[10px] leading-snug text-rose-600 dark:text-rose-400">
          Pick which offered value feeds this.
        </p>
      ) : null}
    </div>
  );
}
