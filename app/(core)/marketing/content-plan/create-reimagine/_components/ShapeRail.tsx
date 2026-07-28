"use client";

/**
 * The Shape rail — the left edge of the bench. Archetype choice and the family
 * dials live here, and EVERY change recomputes the manifest in the same frame.
 * There is no "next" button: the dial and the route list are one object.
 */
import { Layers, ListPlus, Minus, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type {
  Archetype,
  ExpandedArchetype,
} from "../_lib/archetypes";

export interface ShapeRailProps {
  archetypes: Archetype[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  expanded: ExpandedArchetype | null;
  counts: Record<string, number>;
  names: Record<string, string[]>;
  namingOpen: string | null;
  onToggleNaming: (key: string | null) => void;
  onCount: (key: string, value: number) => void;
  onNames: (key: string, value: string[] | null) => void;
  onReset: () => void;
  dirty: boolean;
}

export function ShapeRail(props: ShapeRailProps) {
  const {
    archetypes,
    selectedKey,
    onSelect,
    expanded,
    counts,
    names,
    namingOpen,
    onToggleNaming,
    onCount,
    onNames,
    onReset,
    dirty,
  } = props;

  const selected = archetypes.find((a) => a.key === selectedKey) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Shape
        </h2>
        {dirty ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 gap-1 px-1.5 text-[11px]"
            onClick={onReset}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
        <div className="space-y-1.5">
          {archetypes.map((archetype) => {
            const active = archetype.key === selectedKey;
            return (
              <button
                key={archetype.key}
                type="button"
                onClick={() => onSelect(archetype.key)}
                className={cn(
                  "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                  active
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-card hover:bg-accent",
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {archetype.label}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                    {archetype.pageEstimate}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {archetype.description}
                </p>
                {archetype.origin === "org" ? (
                  <span className="mt-1 inline-block rounded bg-info/15 px-1 text-[10px] font-medium text-info">
                    org override
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {selected && expanded ? (
          <div className="mt-4">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Families — set the counts
            </h3>
            <div className="mt-1.5 space-y-1.5">
              {expanded.families.map((family) => {
                const value = counts[family.key] ?? family.count;
                const supplied = names[family.key];
                const naming = namingOpen === family.key;
                return (
                  <div
                    key={family.key}
                    className="rounded-lg border border-border bg-card px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-foreground">
                        {family.label}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          aria-label={`One fewer ${family.label}`}
                          disabled={value <= 0}
                          onClick={() => onCount(family.key, Math.max(0, value - 1))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          value={String(value)}
                          inputMode="numeric"
                          aria-label={`${family.label} count`}
                          onChange={(event) => {
                            const next = Number.parseInt(event.target.value, 10);
                            onCount(family.key, Number.isNaN(next) ? 0 : Math.max(0, next));
                          }}
                          className="h-6 w-12 px-1 text-center font-mono text-[13px]"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          aria-label={`One more ${family.label}`}
                          onClick={() => onCount(family.key, value + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {family.route}/…
                      </span>
                      {family.materialize === "count_only" ? (
                        <span className="rounded bg-warning/15 px-1 text-[10px] font-medium text-warning">
                          count only — no placeholder pages
                        </span>
                      ) : null}
                      {supplied ? (
                        <span className="ml-auto flex items-center gap-1 rounded bg-success/15 px-1 text-[10px] font-medium text-success">
                          {supplied.length} named
                          <button
                            type="button"
                            aria-label={`Clear ${family.label} names`}
                            onClick={() => onNames(family.key, null)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ) : family.materialize === "pages" ? (
                        <button
                          type="button"
                          className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline"
                          onClick={() => onToggleNaming(naming ? null : family.key)}
                        >
                          <ListPlus className="h-3 w-3" />
                          Name them
                        </button>
                      ) : null}
                    </div>

                    {naming ? (
                      <NameBox
                        label={family.label}
                        initial={supplied ?? []}
                        onCancel={() => onToggleNaming(null)}
                        onApply={(list) => {
                          onNames(family.key, list.length > 0 ? list : null);
                          onToggleNaming(null);
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            <h3 className="mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Core pages — always one each
            </h3>
            <div className="mt-1.5 flex flex-wrap gap-1 px-1">
              {expanded.flat
                .filter((node) => node.group === "core")
                .map((node) => (
                  <span
                    key={node.route}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {node.route}
                  </span>
                ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NameBox({
  label,
  initial,
  onApply,
  onCancel,
}: {
  label: string;
  initial: string[];
  onApply: (names: string[]) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="mt-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const field = form.elements.namedItem("names");
        const raw = field instanceof HTMLTextAreaElement ? field.value : "";
        onApply(
          raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        );
      }}
    >
      <Textarea
        name="names"
        defaultValue={initial.join("\n")}
        rows={5}
        autoFocus
        placeholder={`Paste the real ${label.toLowerCase()} — one per line`}
        className="min-h-0 resize-y text-[13px]"
      />
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
        One per line. This sets both the count and the slugs — routes rewrite
        live below.
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <Button type="submit" size="sm" className="h-6 px-2 text-[11px]">
          Use these names
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
