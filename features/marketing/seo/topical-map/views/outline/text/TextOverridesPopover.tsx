"use client";

/**
 * views/outline/text/TextOverridesPopover.tsx — the `overrides` argument of
 * `seo.map_outline`, as a control.
 *
 * The function sizes the outline it hands an agent from six integer knobs
 * (`overview_min_nodes`, `overview_max_nodes`, `neighborhood_min_nodes`,
 * `neighborhood_max_nodes`, `outline_description_max_chars`,
 * `outline_max_chars`) and takes a `p_overrides` object keyed BY KNOB KEY that
 * wins over the resolved knob for that call only (`seo._tm_knob`). This
 * popover lets a person try other values and see exactly what an agent would
 * receive — nothing is written; the knob rows are untouched.
 *
 * The fields start at the RESOLVED knob values (the org's, never a constant),
 * and only the ones changed from those are sent.
 */

import { useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

import {
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";

import type { TopicalMapKnobs } from "../../../knobs";

/** The knobs `seo.map_outline` reads, in the order it reads them. */
export const OUTLINE_OVERRIDE_KEYS = [
  "overview_min_nodes",
  "overview_max_nodes",
  "neighborhood_min_nodes",
  "neighborhood_max_nodes",
  "outline_description_max_chars",
  "outline_max_chars",
] as const satisfies readonly (keyof TopicalMapKnobs)[];

export type OutlineOverrideKey = (typeof OUTLINE_OVERRIDE_KEYS)[number];
export type OutlineOverrides = Partial<Record<OutlineOverrideKey, number>>;

const LABELS: Record<OutlineOverrideKey, string> = {
  overview_min_nodes: "Overview: at least",
  overview_max_nodes: "Overview: at most",
  neighborhood_min_nodes: "Around the focus: at least",
  neighborhood_max_nodes: "Around the focus: at most",
  outline_description_max_chars: "Description, max characters",
  outline_max_chars: "Whole outline, max characters",
};

/** Keeps only the entries that differ from the resolved knobs. */
export function diffOverrides(
  knobs: Pick<TopicalMapKnobs, OutlineOverrideKey>,
  draft: Record<OutlineOverrideKey, number>,
): OutlineOverrides {
  const out: OutlineOverrides = {};
  for (const key of OUTLINE_OVERRIDE_KEYS) {
    if (Number.isFinite(draft[key]) && draft[key] !== knobs[key]) out[key] = draft[key];
  }
  return out;
}

export interface TextOverridesPopoverProps {
  knobs: Pick<TopicalMapKnobs, OutlineOverrideKey>;
  overrides: OutlineOverrides;
  onChange: (overrides: OutlineOverrides) => void;
}

export function TextOverridesPopover({ knobs, overrides, onChange }: TextOverridesPopoverProps) {
  const [open, setOpen] = useState(false);
  const active = Object.keys(overrides).length;

  const current = (key: OutlineOverrideKey): number => overrides[key] ?? knobs[key];

  function update(key: OutlineOverrideKey, raw: string): void {
    const value = Number.parseInt(raw, 10);
    const draft = Object.fromEntries(
      OUTLINE_OVERRIDE_KEYS.map((k) => [k, k === key ? value : current(k)]),
    ) as Record<OutlineOverrideKey, number>;
    onChange(diffOverrides(knobs, draft));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={active > 0 ? "secondary" : "outline"}
          className="h-8 text-xs"
          aria-pressed={active > 0}
        >
          <SlidersHorizontal className="mr-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          Sizing
          {active > 0 ? (
            <span className="ml-1 tabular-nums text-muted-foreground">
              {active} {active === 1 ? "override" : "overrides"}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">Try other sizes</p>
          {active > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onChange({})}
            >
              <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
              Reset to the settings
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Applies to this preview only. The settings themselves are unchanged; open Map settings
          to change them for everyone.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {OUTLINE_OVERRIDE_KEYS.map((key) => {
            const overridden = overrides[key] !== undefined;
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <Label htmlFor={`outline-override-${key}`} className="text-xs">
                  {LABELS[key]}
                  {overridden ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      (setting: {knobs[key]})
                    </span>
                  ) : null}
                </Label>
                <Input
                  id={`outline-override-${key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={current(key)}
                  onChange={(event) => update(key, event.target.value)}
                  className="h-7 w-24 text-right text-xs tabular-nums"
                />
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
