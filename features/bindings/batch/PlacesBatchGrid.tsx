"use client";

// features/bindings/batch/PlacesBatchGrid.tsx
//
// THE MIDDLE, TRANSPOSED (UI-STANDARD P17). Places are rows, the holder's
// inputs are columns, and every cell is the same four-source picker the middle
// uses — with an Advanced popover onto the full card.
//
// The three parts that make a batch grid better than N single edits come from
// `BatchGridParts`, shared with the shortcut grid: the health dot and its rule,
// the ADD/UPD badge, and the fill-down that states its own limits. This file
// composes them over this domain's nouns; it invents none of them.
//
// Every refusal is printed ON THE ROW THAT CAUSED IT (P7). A red row says, in
// domain words, exactly what stands in the way — the grid never sends a person
// hunting for a coloured dot's meaning.

import { Fragment } from "react";
import { AlertTriangle, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import {
  FillDownButton,
  RowKindBadge,
  RowStatusDot,
} from "@/features/agent-shortcuts/components/batch/BatchGridParts";
import {
  SurfaceVariableBinding,
  type BindingTarget,
} from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import type { ValueMapping } from "@/features/surfaces/types";
import type {
  ConsumptionMap,
  OfferedValue,
} from "@/features/mandates/provision-shapes";
import { PlaceBindingCell } from "./PlaceBindingCell";
import { offeredValuesToSurfaceValues } from "../offered-adapter";
import { sourceLabelsFor, FILL_DOWN_LIMITS } from "../words";
import type { PlaceHealth, PlaceOfferState, PlaceRow } from "./batch-model";

const STATUS_WORDS = {
  red: (n: number) =>
    `${n} required ${n === 1 ? "input is" : "inputs are"} still unmapped here`,
  amber: (n: number) => `${n} ${n === 1 ? "input needs" : "inputs need"} a look`,
  green: "This place is ready to write",
};

export interface PlacesBatchGridProps {
  rows: readonly PlaceRow[];
  holderKind: "agent" | "workflow";
  /** Inputs flipped to per-row — these are the columns. */
  columns: readonly BindingTarget[];
  contextKeys: ReadonlySet<string>;
  offerOf: (key: string) => PlaceOfferState;
  healthOf: (key: string) => PlaceHealth;
  mapOf: (key: string) => ConsumptionMap;
  pinnedContextOf: (key: string) => readonly string[];
  /**
   * Values EVERY place in the batch offers. The fill-down picker shows these
   * and only these, because a value one place has and another does not cannot
   * be promised to every row — the same reason the shortcut grid's fill-down
   * offers baseline values alone.
   */
  commonOffered: readonly OfferedValue[];
  /** Places already written this pass — dimmed, never removed under the eye. */
  appliedKeys: ReadonlySet<string>;
  attentionOnly: boolean;
  disabled?: boolean;
  onMapChange: (key: string, next: ConsumptionMap) => void;
  onRemoveRow: (key: string) => void;
  onFillDown: (targetName: string, mapping: ValueMapping | null) => void;
}

export function PlacesBatchGrid({
  rows,
  holderKind,
  columns,
  contextKeys,
  commonOffered,
  offerOf,
  healthOf,
  mapOf,
  pinnedContextOf,
  appliedKeys,
  attentionOnly,
  disabled,
  onMapChange,
  onRemoveRow,
  onFillDown,
}: PlacesBatchGridProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        No places in this batch yet — pick the jobs this holder should fulfil
        above, and they become rows here.
      </div>
    );
  }

  const commonSurfaceValues = offeredValuesToSurfaceValues(commonOffered);
  const visible = attentionOnly
    ? rows.filter((row) => healthOf(row.key).tone !== "green")
    : rows;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-10 min-w-[240px] border-b border-r border-border bg-muted/50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Place
              </th>
              {columns.map((target) => (
                <th
                  key={target.name}
                  className="min-w-[230px] border-b border-border px-2 py-2 text-left align-top text-[11px] font-semibold text-muted-foreground"
                >
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold text-foreground">
                        {target.label ?? formatVariableDisplayName(target.name)}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                        {target.required ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            Required
                          </span>
                        ) : (
                          <span>Optional</span>
                        )}
                        <span>·</span>
                        <span>
                          {contextKeys.has(target.name)
                            ? "context slot"
                            : "variable"}
                        </span>
                      </div>
                    </div>
                    <div className="ml-auto pt-0.5">
                      <FillDownButton
                        label="Fill down"
                        title={`Feed this input the same way at every place`}
                        limits={FILL_DOWN_LIMITS}
                        width="w-96"
                        applyLabel="Fill every place"
                        onApply={(value) =>
                          onFillDown(
                            target.name,
                            (value as ValueMapping | undefined) ?? null,
                          )
                        }
                        renderControl={(value, set) => (
                          <SurfaceVariableBinding
                            target={target}
                            mapping={(value as ValueMapping | undefined) ?? undefined}
                            availableSurfaceValues={commonSurfaceValues}
                            sourceLabels={sourceLabelsFor(holderKind)}
                            valueFieldLabel="Offered value"
                            onChange={(next) => set(next)}
                          />
                        )}
                      />
                    </div>
                  </div>
                </th>
              ))}
              <th className="w-10 border-b border-border px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const health = healthOf(row.key);
              const done = appliedKeys.has(row.key);
              const sentences = [
                ...health.blockers,
                ...health.problems,
                ...health.unfedRequired.map(
                  (name) =>
                    `"${name}" is required and nothing feeds it, and the holder has no default of its own.`,
                ),
              ];
              return (
                <Fragment key={row.key}>
                  <tr className={done ? "opacity-60" : "hover:bg-accent/30"}>
                    <td className="sticky left-0 z-10 border-b border-r border-border bg-background px-3 py-1.5 align-middle">
                      <div className="flex min-w-0 items-center gap-2">
                        <RowStatusDot att={toAttention(health)} words={STATUS_WORDS} />
                        <RowKindBadge
                          kind={row.kind}
                          addTitle="No answer at this rung yet — this writes a new one"
                          updateTitle="This replaces the answer already written at this rung"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">
                            {row.label}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="truncate font-mono">
                              {row.mandateKey}
                            </span>
                            {row.offeredCount !== null ? (
                              <span className="shrink-0">
                                · offers {row.offeredCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {done ? (
                          <span className="ml-auto shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400">
                            written
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {columns.map((target) => (
                      <td
                        key={target.name}
                        className="border-b border-border px-2 py-1.5 align-middle"
                      >
                        <PlaceBindingCell
                          placeLabel={row.label}
                          holderKind={holderKind}
                          offerState={offerOf(row.key)}
                          target={target}
                          isContext={contextKeys.has(target.name)}
                          pinnedContext={pinnedContextOf(row.key)}
                          map={mapOf(row.key)}
                          disabled={disabled || done}
                          onChange={(next) => onMapChange(row.key, next)}
                        />
                      </td>
                    ))}

                    <td className="border-b border-border px-1 py-1.5 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => onRemoveRow(row.key)}
                        className="text-muted-foreground hover:text-destructive"
                        title={`Remove ${row.label} from this batch`}
                        aria-label={`Remove ${row.label} from this batch`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>

                  {/* P7 — the reason, on the row that caused it. */}
                  {sentences.length > 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length + 2}
                        className={cn(
                          "border-b border-border px-3 py-1.5 text-[11.5px] leading-relaxed",
                          health.tone === "red"
                            ? "bg-destructive/5 text-destructive"
                            : "bg-amber-500/5 text-amber-700 dark:text-amber-400",
                        )}
                      >
                        <ul className="space-y-0.5">
                          {sentences.map((sentence) => (
                            <li
                              key={sentence}
                              className="flex items-start gap-1.5"
                            >
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{sentence}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {columns.length === 0 ? (
        <div className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          No per-place columns yet — every input is inherited or set once for
          all places. Flip an input to <span className="font-medium">Per place</span>{" "}
          above to vary it here.
        </div>
      ) : null}
      {attentionOnly && visible.length === 0 ? (
        <div className="border-t border-border px-3 py-6 text-center text-xs text-muted-foreground">
          Every place in this batch is ready to write.
        </div>
      ) : null}
    </div>
  );
}

function toAttention(health: PlaceHealth) {
  return {
    unmapped:
      health.unmapped + health.unfedRequired.length + health.problems.length,
    requiredUnmapped:
      health.requiredUnmapped +
      health.problems.length +
      health.blockers.length,
  };
}
