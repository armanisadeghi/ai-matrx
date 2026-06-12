"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import { BASELINE_VALUES } from "@/features/surfaces/manifests/_baseline.manifest";
import {
  SurfaceVariableBinding,
  type BindingTarget,
} from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import type { SurfaceValue, ValueMapping } from "@/features/surfaces/types";
import { ScalarValueControl } from "./BatchFieldControls";
import { BatchBindingCell } from "./BatchBindingCell";
import {
  getFieldDef,
  rowAttention,
  rowInheritedScalar,
  type BatchContext,
  type BatchRow,
  type BatchScalarFieldKey,
} from "./batchModel";

function splitLocal(name: string): string {
  const idx = name.indexOf("/");
  return idx < 0 ? name : name.slice(idx + 1);
}
function prettify(s: string): string {
  return s
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
                      <ScalarFillButton
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
                    <BindingFillButton
                      target={t}
                      onApply={(m) => onFillBinding(t.name, m)}
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
                        <StatusDot att={att} />
                      )}
                      <KindBadge kind={row.kind} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {row.existingLabel ||
                            prettify(splitLocal(row.surfaceName))}
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

function KindBadge({ kind }: { kind: "create" | "update" }) {
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center h-4 px-1 rounded text-[9px] font-semibold uppercase tracking-wide",
        kind === "create"
          ? "bg-primary/10 text-primary"
          : "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      )}
      title={
        kind === "create"
          ? "Will create a new shortcut"
          : "Will update the existing shortcut"
      }
    >
      {kind === "create" ? "Add" : "Upd"}
    </span>
  );
}

function StatusDot({
  att,
}: {
  att: { unmapped: number; requiredUnmapped: number };
}) {
  if (att.requiredUnmapped > 0) {
    return (
      <span title={`${att.requiredUnmapped} required unmapped`}>
        <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
      </span>
    );
  }
  if (att.unmapped > 0) {
    return (
      <span title={`${att.unmapped} unmapped`}>
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
      </span>
    );
  }
  return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
}

// ─── Fill-down controls ────────────────────────────────────────────────────

function ScalarFillButton({
  renderControl,
  onApply,
}: {
  renderControl: (value: unknown, set: (v: unknown) => void) => React.ReactNode;
  onApply: (value: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<unknown>(undefined);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-primary shrink-0"
          title="Fill this column for every row"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 space-y-2">
        <p className="text-[11px] text-muted-foreground">
          Set this value on every row.
        </p>
        {renderControl(value, setValue)}
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => {
            onApply(value);
            setOpen(false);
          }}
        >
          Apply to all rows
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function BindingFillButton({
  target,
  onApply,
}: {
  target: BindingTarget;
  onApply: (mapping: ValueMapping | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ValueMapping | null>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-primary shrink-0"
          title="Fill this variable for every row"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 space-y-2">
        <p className="text-[11px] text-muted-foreground">
          Apply one binding to every row. Direct values, prompts, and defaults
          fill cleanly; surface values only match where the name exists.
        </p>
        <SurfaceVariableBinding
          target={target}
          mapping={draft ?? undefined}
          availableSurfaceValues={BASELINE_ONLY}
          onChange={setDraft}
        />
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => {
            onApply(draft);
            setOpen(false);
          }}
        >
          Apply to all rows
        </Button>
      </PopoverContent>
    </Popover>
  );
}
