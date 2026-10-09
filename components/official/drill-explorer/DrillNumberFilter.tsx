"use client";

// components/official/drill-explorer/DrillNumberFilter.tsx — KEEP THE GROUPS WHOSE NUMBER IS AT LEAST /
// AT MOST A VALUE (lane DRILL-FLIP-FIXES, VERIFY-DRILL-FINAL L1: the old users usage page filtered any
// number column, e.g. "more than 1,000 requests").
//
// One toolbar control. Each line is a threshold of the contract (`having`: the door keeps the groups
// that meet every line and adds the rest into Other, so the answer still adds up to its total). The
// lines ride beside the question as what the screen carries (`DrillCarried.having`), are asked with
// every request and named by the explorer's "View filters" chip, which clears them. Money is typed in
// the unit the cells print (points, or dollars for an admin who switched) and sent in dollars.
// "At most" / "less than" need the door file drillflip_a_threshold_can_be_at_most.sql.

import { useState } from "react";
import { ListFilter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import type { MatrxDrillMeasure } from "@ai-matrx/design-system/data-table";

import { Button } from "@/components/ui/button";
import { usePointsRate } from "@/components/cost/pointsRate.client";

import type { DrillHaving } from "./types";

/** The four ops the door reads (records 0.58.121+ types them; the door file drillflip_… admits "<=" / "<"). */
type Op = ">=" | ">" | "<=" | "<";
const OPS: Array<{ op: Op; label: string }> = [
  { op: ">=", label: "≥" },
  { op: "<=", label: "≤" },
];

/** The value a person typed, in the unit the cells print, as the door's number (money in dollars). */
export function havingValue(typed: number, unit: string | undefined, money: "points" | "usd", rate: number | null): number | null {
  if (!Number.isFinite(typed)) return null;
  if (unit !== "usd" || money === "usd") return typed;
  return rate && rate > 0 ? typed / rate : null;
}

export function DrillNumberFilter({
  measures,
  units,
  shown,
  having,
  money,
  onChange,
}: {
  /** The screen's Measures (labels and formats). */
  measures: readonly MatrxDrillMeasure[];
  /** Measure key → its unit in the definition. */
  units: Record<string, string | undefined>;
  /** The Measures the answer shows: a threshold reads a number the screen shows. */
  shown: readonly string[];
  having: readonly DrillHaving[];
  money: "points" | "usd";
  onChange: (next: DrillHaving[]) => void;
}) {
  const choices = measures.filter((m) => shown.includes(m.key) && !m.moment);
  const [open, setOpen] = useState(false);
  const [measure, setMeasure] = useState<string>("");
  const [op, setOp] = useState<Op>(">=");
  const [typed, setTyped] = useState("");
  // The SUBSCRIBED rate: the threshold converts the moment the knob lands.
  const rate = usePointsRate();
  const pick = measure && choices.some((m) => m.key === measure) ? measure : choices[0]?.key ?? "";
  const value = havingValue(Number(typed.replace(/,/g, "")), units[pick], money, rate);
  const label = (h: DrillHaving) => {
    const op = h.op as Op;
    const m = measures.find((x) => x.key === h.measure);
    const said = h.value === undefined ? "" : m?.format ? m.format(h.value) : h.value.toLocaleString();
    return `${m?.label ?? h.measure} ${op === ">" ? ">" : op === "<" ? "<" : op === "<=" ? "≤" : "≥"} ${said}`;
  };
  const mine = having.filter((h) => h.value !== undefined && !h.knob);
  if (choices.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button icon={<ListFilter />} type="button" variant="quiet" data-drill-explorer-number-filter> Filter{mine.length > 0 ? ` (${mine.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-2 type-body">
        {mine.length > 0 ? (
          <ul className="mb-2 flex flex-col gap-1">
            {mine.map((h, i) => (
              <li key={`${h.measure}-${i}`} className="flex items-center justify-between gap-2 rounded bg-muted px-2 py-1 type-secondary" data-drill-number-filter-line>
                <span className="truncate">{label(h)}</span>
                <button type="button" aria-label={`Remove ${label(h)}`} onClick={() => onChange(having.filter((x) => x !== h))} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pick || value === null || typed.trim() === "") return;
            onChange([...having, { measure: pick, op, value } as DrillHaving]);
            setTyped("");
          }}
        >
          <select aria-label="Number" value={pick} onChange={(e) => setMeasure(e.target.value)} className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs">
            {choices.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <select aria-label="Compare" value={op} onChange={(e) => setOp(e.target.value as Op)} className="h-7 rounded border border-border bg-background px-1 text-xs">
            {OPS.map((o) => (
              <option key={o.op} value={o.op}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            aria-label="Value"
            inputMode="decimal"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="1,000"
            className="h-7 w-20 rounded border border-border bg-background px-1 text-base lg:text-xs"
          />
          <Button type="submit" variant="outline" disabled={value === null || typed.trim() === ""}>
            Add
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
