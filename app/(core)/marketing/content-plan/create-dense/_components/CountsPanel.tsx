"use client";

/**
 * Level 1: the counts that ARE the work order, and the readiness checklist
 * they drive. Editing a family count re-expands the archetype in place — the
 * route preview, the page total, and every `=<family>.count` foundation
 * requirement all move on the same keystroke.
 */
import { Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { ExpandedArchetype } from "../_lib/archetypes";
import type { ChecklistItem, ItemState } from "../_lib/readiness";

const STATE_CLASSES: Record<ItemState, string> = {
  met: "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  partial: "border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  unmet: "border-destructive/20 bg-destructive/15 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

const STATE_DOT: Record<ItemState, string> = {
  met: "bg-emerald-500",
  partial: "bg-amber-500",
  unmet: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

function SectionHeader({
  label,
  right,
}: {
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-2.5 py-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="ml-auto flex items-center gap-1.5">{right}</div>
    </div>
  );
}

function CountStepper({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label="Decrease"
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="flex h-6 w-6 items-center justify-center rounded-l border border-r-0 border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <Minus className="h-3 w-3" />
      </button>
      <Input
        value={String(value)}
        disabled={disabled}
        inputMode="numeric"
        aria-label="Count"
        onChange={(event) => {
          const digits = event.target.value.replace(/[^0-9]/g, "");
          const next = digits === "" ? 0 : Number.parseInt(digits, 10);
          if (Number.isFinite(next)) onChange(Math.min(next, 2000));
        }}
        className="h-6 w-12 rounded-none border-border px-1 text-center text-xs tabular-nums shadow-none focus-visible:ring-1"
      />
      <button
        type="button"
        aria-label="Increase"
        disabled={disabled}
        onClick={() => onChange(Math.min(2000, value + 1))}
        className="flex h-6 w-6 items-center justify-center rounded-r border border-l-0 border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

export function CountsPanel({
  expanded,
  counts,
  defaultCounts,
  onCountChange,
  onResetCounts,
  checklist,
  checklistLoading,
}: {
  expanded: ExpandedArchetype;
  counts: Record<string, number>;
  defaultCounts: Record<string, number>;
  onCountChange: (key: string, next: number) => void;
  onResetCounts: () => void;
  checklist: ChecklistItem[];
  checklistLoading: boolean;
}) {
  const dirty = Object.keys(defaultCounts).some(
    (key) => (counts[key] ?? defaultCounts[key]) !== defaultCounts[key],
  );

  const grouped: { title: string; items: ChecklistItem[] }[] = [
    { title: "Gate", items: checklist.filter((item) => item.group === "gate") },
    { title: "Pages", items: checklist.filter((item) => item.group === "pages") },
    {
      title: "Foundation",
      items: checklist.filter((item) => item.group === "foundation"),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <SectionHeader
        label="Families × counts"
        right={
          dirty ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 gap-1 px-1.5 text-[11px]"
              onClick={onResetCounts}
            >
              <RotateCcw className="h-3 w-3" />
              reset
            </Button>
          ) : null
        }
      />

      <div className="shrink-0 border-b border-border">
        {expanded.families.length === 0 ? (
          <p className="px-2.5 py-3 text-xs text-muted-foreground">
            This archetype declares no families — it is core pages only.
          </p>
        ) : (
          expanded.families.map((family) => (
            <div
              key={family.key}
              className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm text-foreground">{family.label}</span>
                  {family.materialize === "count_only" ? (
                    <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
                      count only
                    </span>
                  ) : null}
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {family.route}/{family.materialize === "pages" ? "*" : "…"}
                </span>
              </div>
              <CountStepper
                value={counts[family.key] ?? family.count}
                onChange={(next) => onCountChange(family.key, next)}
              />
            </div>
          ))
        )}
      </div>

      <SectionHeader
        label="Readiness"
        right={
          <span className="text-xs tabular-nums text-muted-foreground">
            {checklist.filter((item) => item.state === "met").length}/{checklist.length}
          </span>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {checklistLoading ? (
          <div className="space-y-1.5 p-2.5">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-6 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          grouped.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.title}>
                <div className="bg-muted/30 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </div>
                {group.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-start gap-2 border-b border-border/60 px-2.5 py-1.5"
                  >
                    <span
                      className={cn(
                        "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                        STATE_DOT[item.state],
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {item.label}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none tabular-nums",
                            STATE_CLASSES[item.state],
                          )}
                        >
                          {item.state === "unknown"
                            ? "unknown"
                            : `${item.actual}/${item.required}`}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground" title={item.detail}>
                        {item.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
