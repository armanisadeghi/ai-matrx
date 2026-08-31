"use client";

import { CheckCircle2, X } from "lucide-react";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import { BASELINE_VALUES } from "@/features/surfaces/manifests/_baseline.manifest";
import {
  SurfaceVariableBinding,
  type BindingTarget,
} from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import type { SurfaceValue, ValueMapping } from "@/features/surfaces/types";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import { ScalarValueControl } from "./BatchFieldControls";
import { BatchBindingCell } from "./BatchBindingCell";
import {
  FillDownButton,
  RowKindBadge,
  RowStatusDot,
} from "./BatchGridParts";
import {
  getFieldDef,
  rowAttention,
  rowInheritedScalar,
  type BatchContext,
  type BatchRow,
  type BatchScalarFieldKey,
} from "./batchModel";

const BASELINE_ONLY: SurfaceValue[] = Object.values(BASELINE_VALUES).sort(
  (a, b) => (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000),
);

interface Props {
  ctx: BatchContext;
  rows: readonly BatchRow[];
  /** All binding targets — used for per-row attention. */
  targets: readonly BindingTarget[];
  /** Binding targets whose mode is "row" — these become columns. */
  bindingColumns: readonly BindingTarget[];
  perRowFieldKeys: readonly BatchScalarFieldKey[];
  categoryOptions: ReadonlyArray<{ value: string; label: string }>;
  attentionOnly: boolean;
  /** Hide rows already written this session. */
  hideComplete: boolean;
  /** Row keys successfully written this session. */
  appliedKeys: ReadonlySet<string>;
  onRowOverrideChange: (
    rowKey: string,
    fieldKey: BatchScalarFieldKey,
    value: unknown,
  ) => void;
  onRowMappingChange: (
    rowKey: string,
    targetName: string,
    mapping: ValueMapping | null,
  ) => void;
  onRemoveRow: (rowKey: string) => void;
  onFillScalar: (fieldKey: BatchScalarFieldKey, value: unknown) => void;
  onFillBinding: (targetName: string, mapping: ValueMapping | null) => void;
}

export function BatchGrid({
  ctx,
  rows,
  targets,
  bindingColumns,
  perRowFieldKeys,
  categoryOptions,
  attentionOnly,
  hideComplete,
  appliedKeys,
  onRowOverrideChange,
  onRowMappingChange,
  onRemoveRow,
  onFillScalar,
  onFillBinding,
}: Props) {
  const visibleRows = rows.filter((r) => {
    if (hideComplete && appliedKeys.has(r.key)) return false;
    if (attentionOnly && rowAttention(ctx, r, targets).unmapped === 0)
      return false;
    return true;
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
        Select surfaces above to build the grid.
      </div>
    );
  }

  const hasColumns = perRowFieldKeys.length > 0 || bindingColumns.length > 0;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-r border-border min-w-[220px]">
                Surface
              </th>

              {perRowFieldKeys.map((key) => {
                const def = getFieldDef(key);
                return (
                  <th
                    key={key}
                    className="px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground border-b border-border min-w-[160px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{def.label}</span>
                      <FillDownButton
                        title="Fill this column for every row"
                        limits="Set this value on every row."
                        width="w-64"
                        onApply={(v) => onFillScalar(key, v)}
                        renderControl={(value, set) => (
                          <ScalarValueControl
                            def={def}
                            value={value}
                            onChange={set}
                            dynamicOptions={
                              def.control.kind === "dynamic-select"
                                ? categoryOptions
                                : undefined
                            }
                          />
                        )}
                      />
                    </div>
                  </th>
                );
              })}

              {bindingColumns.map((t) => (
                <th
                  key={t.name}
                  className="px-2 py-2 text-left text-[11px] font-semibold text-muted-foreground border-b border-border min-w-[210px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate" title={t.name}>
                      {t.label ?? formatVariableDisplayName(t.name)}
                    </span>
                    {t.required && (
                      <span className="text-rose-500" title="Required">
                        *
                      </span>
                    )}
                    <FillDownButton
                      title="Fill this variable for every row"
                      limits="Apply one binding to every row. Direct values, prompts, and defaults fill cleanly; surface values only match where the name exists."
                      width="w-80"
                      onApply={(m) =>
                        onFillBinding(t.name, (m ?? null) as ValueMapping | null)
                      }
                      renderControl={(value, set) => (
                        <SurfaceVariableBinding
                          target={t}
                          mapping={(value as ValueMapping | undefined) ?? undefined}
                          availableSurfaceValues={BASELINE_ONLY}
                          onChange={(next) => set(next)}
                        />
                      )}
                    />
                  </div>
                </th>
              ))}

              <th className="px-2 py-2 border-b border-border w-10" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const att = rowAttention(ctx, row, targets);
              const done = appliedKeys.has(row.key);
              return (
                <tr
                  key={row.key}
                  className={done ? "opacity-50 hover:opacity-100" : "hover:bg-accent/30"}
                >
                  {/* Surface cell (sticky) */}
                  <td className="sticky left-0 z-10 bg-background px-3 py-1.5 border-b border-r border-border align-middle">
                    <div className="flex items-center gap-2 min-w-0">
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <RowStatusDot att={att} />
                      )}
                      <RowKindBadge
                        kind={row.kind}
                        addTitle="Will create a new shortcut"
                        updateTitle="Will update the existing shortcut"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {row.existingLabel ||
                            getSurfaceDisplayLabel(row.surfaceName)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          {row.surfaceName}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Scalar cells — default to the inherited value */}
                  {perRowFieldKeys.map((key) => {
                    const def = getFieldDef(key);
                    const value =
                      row.overrides[key] !== undefined
                        ? row.overrides[key]
                        : rowInheritedScalar(ctx, row, key);
                    return (
                      <td
                        key={key}
                        className="px-2 py-1.5 border-b border-border align-middle"
                      >
                        <ScalarValueControl
                          def={def}
                          value={value}
                          onChange={(v) => onRowOverrideChange(row.key, key, v)}
                          dynamicOptions={
                            def.control.kind === "dynamic-select"
                              ? categoryOptions
                              : undefined
                          }
                          compact
                        />
                      </td>
                    );
                  })}

                  {/* Binding cells */}
                  {bindingColumns.map((t) => (
                    <td
                      key={t.name}
                      className="px-2 py-1.5 border-b border-border align-middle"
                    >
                      <BatchBindingCell
                        surfaceName={row.surfaceName}
                        target={t}
                        mapping={row.valueMappings[t.name]}
                        onChange={(m) => onRowMappingChange(row.key, t.name, m)}
                      />
                    </td>
                  ))}

                  <td className="px-1 py-1.5 border-b border-border text-center align-middle">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(row.key)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Remove from batch"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hasColumns && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/30 border-t border-border">
          No per-row columns yet — every field is inherited or set for all. Flip
          a field to <span className="font-medium">Per-row</span> above to edit
          it here.
        </div>
      )}
      {attentionOnly && visibleRows.length === 0 && (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground border-t border-border">
          <CheckCircle2 className="h-4 w-4 inline mr-1 text-emerald-500" />
          Every row is fully mapped.
        </div>
      )}
    </div>
  );
}
