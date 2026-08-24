"use client";

/**
 * The workbench's two assigning cells and its range control.
 *
 * The Class cell is a DROPDOWN THAT ASSIGNS, not a chip that describes
 * (Arman: "'Decided by' as a column is meaningless on its own"). Picking a
 * value writes it immediately — one gesture, no dialog — and "Assign with a
 * reason…" is right underneath for the times the WHY matters (P24).
 *
 * A stamp cell is the same idea for a dimension column, plus a filter door:
 * clicking the value you see narrows the table to everything like it, which
 * is what a person actually wants the moment they spot a pattern.
 */

import { Check, Eraser, Filter, Lock, PenLine, Plus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/styles/themes/utils";
import type { FacetValue } from "@/features/marketing/seo/value-system/dimensions/data";
import { humanizeSlug } from "@/features/marketing/seo/value-system/lib";

/** Where a stamp came from, in two words a non-technical reader can act on. */
function sourceHint(source: string | null): string | null {
  switch (source) {
    case "human":
      return "you";
    case "matcher":
      return "a matcher";
    case "classifier":
    case "ai":
      return "AI";
    default:
      return null;
  }
}

export function StampCell({
  label,
  source,
  notes,
  onAssign,
  onFilter,
}: {
  label: string | null;
  source: string | null;
  notes: string | null;
  onAssign: () => void;
  onFilter?: () => void;
}) {
  const hint = sourceHint(source);
  return (
    <span className="group/cell flex min-w-0 items-center gap-1">
      {label ? (
        <button
          type="button"
          onClick={onFilter}
          disabled={!onFilter}
          title={
            notes
              ? `${notes}${hint ? ` — stamped by ${hint}` : ""}`
              : hint
                ? `Stamped by ${hint}. Click to filter to everything like it.`
                : "Click to filter to everything like it."
          }
          className={cn(
            "min-w-0 truncate rounded px-1 py-0.5 text-[11px] text-foreground",
            onFilter && "hover:bg-accent",
          )}
        >
          {label}
          {hint && hint !== "you" ? (
            <span className="ml-1 text-[10px] text-muted-foreground">{hint}</span>
          ) : null}
        </button>
      ) : (
        <span className="px-1 text-[11px] text-muted-foreground">—</span>
      )}
      <button
        type="button"
        onClick={onAssign}
        aria-label={label ? "Change this value" : "Assign a value"}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/cell:opacity-100"
      >
        {label ? <PenLine className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
      </button>
      {onFilter && label ? (
        <Filter className="hidden h-3 w-3 shrink-0 text-muted-foreground/60 group-hover/cell:inline" />
      ) : null}
    </span>
  );
}

export function ClassCell({
  current,
  source,
  options,
  disabled,
  onPick,
  onAssignWithReason,
  onMakeYourOwn,
  onClear,
}: {
  current: string | null;
  source: string | null;
  options: FacetValue[];
  disabled?: boolean;
  onPick: (value: FacetValue) => void;
  onAssignWithReason: () => void;
  /** P11's door: open the assign panel with no dimension locked. */
  onMakeYourOwn: () => void;
  /**
   * TAKE IT BACK. A control that can only ever move you to another wrong
   * answer is not a control. Only offered once something is actually set.
   */
  onClear?: () => void;
}) {
  const active = options.find((v) => v.key === current);
  const hint = sourceHint(source);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 max-w-full justify-start gap-1 px-1 text-[11px] font-normal"
        >
          <span className="truncate">
            {active?.label ?? (current ? humanizeSlug(current) : "Unclassified")}
          </span>
          {hint && hint !== "you" ? (
            <span className="text-[10px] text-muted-foreground">{hint}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          Class — click to set it now
        </DropdownMenuLabel>
        {options.map((value) => (
          <DropdownMenuItem
            key={value.value_id}
            className="text-xs"
            onSelect={() => onPick(value)}
          >
            <Check
              className={cn(
                "mr-2 h-3.5 w-3.5",
                value.key === current ? "opacity-100" : "opacity-0",
              )}
            />
            {value.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {current && onClear ? (
          <DropdownMenuItem className="text-xs" onSelect={onClear}>
            <Eraser className="mr-2 h-3.5 w-3.5" />
            Clear this class
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="text-xs" onSelect={onAssignWithReason}>
          <PenLine className="mr-2 h-3.5 w-3.5" />
          Assign with a reason…
        </DropdownMenuItem>
        {/*
          P11 — THE ONE VOCABULARY A SITE MAY NOT WIDEN, AND IT IS STILL NOT A
          DEAD END. Class is shared by every business so cross-site learning
          can exist at all; a silent list with no way out is exactly the break
          P23 was written about, so the control SAYS why and hands over the
          door — make your own dimension and answer it your way.
        */}
        <DropdownMenuItem className="text-xs" onSelect={onMakeYourOwn}>
          <Lock className="mr-2 h-3.5 w-3.5" />
          Need a different answer? Make it your own dimension…
        </DropdownMenuItem>
        <p className="px-2 pb-1 pt-0.5 text-[10px] leading-snug text-muted-foreground">
          Class is shared by every business, so its choices are set
          platform-wide.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
