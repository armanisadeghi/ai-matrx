"use client";

// features/bindings/batch/InputCascade.tsx
//
// THE THREE-LEVEL CASCADE (UI-STANDARD P17.1), in this domain's words.
//
// Each holder input is independently:
//
//   · Keep each place's own — whatever that place's answer already says, plus
//     the exact-name match every place gets seeded with. Not a column.
//   · Set for all places — one decision, applied to every place and reconciled
//     against each one's own offer. Not a column.
//   · Per place — a column in the grid, edited row by row. THE DEFAULT, because
//     varying the match per place is the whole point of the tool.
//
// Nothing is ever locked: any input can be flipped back at any moment, and the
// current answer is printed beside the control rather than hidden behind it.

import { InlineBindingEditor } from "@/features/agent-shortcuts/components/batch/BatchBindingCell";
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import type { SurfaceValue, ValueMapping } from "@/features/surfaces/types";
import { cn } from "@/lib/utils";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import { sourceLabelsFor } from "../words";

export type InputMode = "inherit" | "all" | "row";

const MODES: ReadonlyArray<{ id: InputMode; label: string }> = [
  { id: "inherit", label: "Keep each place's own" },
  { id: "all", label: "Set for all places" },
  { id: "row", label: "Per place" },
];

export function InputCascade({
  targets,
  contextKeys,
  holderKind,
  modes,
  allValues,
  commonSurfaceValues,
  disabled,
  onModeChange,
  onAllValueChange,
}: {
  targets: readonly BindingTarget[];
  contextKeys: ReadonlySet<string>;
  holderKind: "agent" | "workflow";
  modes: Readonly<Record<string, InputMode>>;
  allValues: Readonly<Record<string, ValueMapping | null>>;
  /** Values EVERY place offers — the only ones one decision can promise. */
  commonSurfaceValues: readonly SurfaceValue[];
  disabled?: boolean;
  onModeChange: (targetName: string, mode: InputMode) => void;
  onAllValueChange: (targetName: string, mapping: ValueMapping | null) => void;
}) {
  if (targets.length === 0) return null;

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {targets.map((target) => {
        const mode = modes[target.name] ?? "row";
        return (
          <div
            key={target.name}
            className="grid grid-cols-[minmax(140px,1.1fr)_auto_minmax(180px,1.4fr)] items-center gap-3 px-3 py-1.5"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm text-foreground">
                {target.label ?? formatVariableDisplayName(target.name)}
              </span>
              {target.required ? (
                <span className="shrink-0 text-[10px] text-rose-600 dark:text-rose-400">
                  Required
                </span>
              ) : null}
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {contextKeys.has(target.name) ? "context slot" : "variable"}
              </span>
            </div>

            <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={mode === m.id}
                  onClick={() => onModeChange(target.name, m.id)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium transition-colors",
                    mode === m.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="min-w-0">
              {mode === "all" ? (
                <InlineBindingEditor
                  target={target}
                  mapping={allValues[target.name] ?? undefined}
                  availableSurfaceValues={commonSurfaceValues}
                  disabled={disabled}
                  showSourceLabel
                  sourceLabels={sourceLabelsFor(holderKind)}
                  valueFieldLabel="Offered value"
                  valuePlaceholder="Pick a value every place offers…"
                  onChange={(next) => onAllValueChange(target.name, next)}
                />
              ) : (
                <span className="block text-right text-[11px] text-muted-foreground">
                  {mode === "row"
                    ? "edited in the grid below"
                    : "each place keeps its own answer"}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
