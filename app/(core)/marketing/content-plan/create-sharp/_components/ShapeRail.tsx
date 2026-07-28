"use client";

/**
 * The dials: pick a shape, then turn the counts. Everything here is a cause;
 * the right pane is the effect. Deliberately the narrow column — the decision
 * is small, the consequence is what deserves the room.
 */
import { Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { Archetype } from "../_lib/archetypes";

const MAX_COUNT = 500;

export function ShapeRail({
  archetypes,
  selectedKey,
  onSelect,
  counts,
  defaultCounts,
  onCountChange,
  onResetCounts,
  committedKey,
  overriddenKeys,
}: {
  archetypes: Archetype[];
  selectedKey: string;
  onSelect: (key: string) => void;
  counts: Record<string, number>;
  defaultCounts: Record<string, number>;
  onCountChange: (familyKey: string, value: number) => void;
  onResetCounts: () => void;
  /** The shape this plan is already committed to, if any. */
  committedKey: string | null;
  overriddenKeys: string[];
}) {
  const selected = archetypes.find((item) => item.key === selectedKey) ?? null;
  const dirty = Object.keys(counts).some(
    (key) => counts[key] !== defaultCounts[key],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 scrollbar-thin">
        <section>
          <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Shape
          </h2>
          <div className="space-y-1.5">
            {archetypes.map((archetype) => {
              const active = archetype.key === selectedKey;
              return (
                <button
                  key={archetype.key}
                  type="button"
                  onClick={() => onSelect(archetype.key)}
                  aria-pressed={active}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    active
                      ? "border-primary/60 bg-primary/10 shadow-[var(--elevation-1)]"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        active
                          ? "font-semibold text-foreground"
                          : "font-medium text-foreground"
                      }`}
                    >
                      {archetype.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {archetype.pageEstimate || "—"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">
                    {archetype.description}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {archetype.key === committedKey ? (
                      <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                        Current shape
                      </span>
                    ) : null}
                    {overriddenKeys.includes(archetype.key) ? (
                      <span className="rounded bg-info/15 px-1.5 py-0.5 text-[10px] font-medium text-info">
                        Org override
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {selected && selected.families.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-2 px-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Counts
              </h2>
              {dirty ? (
                <button
                  type="button"
                  onClick={onResetCounts}
                  className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              ) : null}
            </div>
            <div className="space-y-1">
              {selected.families.map((family) => {
                const value = counts[family.key] ?? 0;
                return (
                  <div
                    key={family.key}
                    className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-foreground">
                        {family.label}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        /{family.slug}
                        {family.materialize === "count_only"
                          ? " · count only"
                          : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Fewer ${family.label}`}
                        disabled={value <= 0}
                        className="h-7 w-7 p-0"
                        onClick={() =>
                          onCountChange(family.key, Math.max(0, value - 1))
                        }
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Input
                        aria-label={`${family.label} count`}
                        value={String(value)}
                        inputMode="numeric"
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, "");
                          const next = digits === "" ? 0 : Number(digits);
                          onCountChange(
                            family.key,
                            Math.min(MAX_COUNT, next),
                          );
                        }}
                        className="h-7 w-12 px-0 text-center font-mono text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`More ${family.label}`}
                        disabled={value >= MAX_COUNT}
                        className="h-7 w-7 p-0"
                        onClick={() =>
                          onCountChange(
                            family.key,
                            Math.min(MAX_COUNT, value + 1),
                          )
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
