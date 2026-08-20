"use client";

/**
 * The input for a `choice` / `multi_choice` column.
 *
 * One component serves the row modals, the inline cell editor, and anywhere
 * else a choice column is edited — a shape has exactly one input, the same way
 * it has exactly one renderer.
 *
 * Three things it must never do, each one a rule this system already fought
 * for elsewhere:
 *
 *   1. It never REFUSES a value. `allowOther` (default true) keeps free text
 *      available, and an existing off-list value is always shown as the current
 *      selection rather than silently reset to empty. A format may add a better
 *      input; it may never take a working one away.
 *   2. It never renders an empty dropdown when a bound structured list is
 *      loading or unreachable — it says which, because "no options" and "the
 *      list this column points at is gone" are different problems and only one
 *      of them is the user's to fix.
 *   3. It never hides the tiers. A bound list's `group_name` becomes section
 *      headings for free, so a tiered pick list reads as tiered.
 */

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  choicesForRow,
  choiceColorClass,
  useFieldChoices,
} from "@/lib/field-formats/choices";
import type { FieldFormatConfig } from "@/lib/field-formats/types";
import { cn } from "@/utils/cn";

export type ChoiceInputProps = {
  id?: string;
  format: FieldFormatConfig | null | undefined;
  /** Current cell value: a string for `choice`, an array for `multi_choice`. */
  value: unknown;
  multiple: boolean;
  onChange: (next: unknown) => void;
  /**
   * The row being edited. Only DEPENDENT columns read it — one whose options
   * are narrowed by another column's cell (`groupFromField`). Omit it and the
   * column offers every group, which is the correct unconstrained answer.
   */
  row?: Record<string, unknown> | null;
  /** Auto-open on mount — the inline cell editor wants the list up immediately. */
  autoOpen?: boolean;
  /**
   * Called when the user finishes — picked in single mode, or closed the list.
   * Receives the FINAL value explicitly: a single-select picks and closes in one
   * tick, so a caller reading its own state here would read the previous value.
   */
  onDone?: (value: unknown) => void;
  className?: string;
};

function toSelected(value: unknown, multiple: boolean): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (multiple) {
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim()).filter(Boolean);
    }
    return String(value)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  const single = String(value).trim();
  return single === "" ? [] : [single];
}

export function ChoiceInput({
  id,
  format,
  value,
  multiple,
  onChange,
  row,
  autoOpen = false,
  onDone,
  className,
}: ChoiceInputProps) {
  const [open, setOpen] = useState(autoOpen);
  const [query, setQuery] = useState("");
  const resolved = useFieldChoices(format);
  // Narrowed to the tier this row's controlling cell names, when the column is
  // dependent. A pure filter over already-loaded options — no extra fetch.
  const { groups, choices, loading, unavailable, allowOther } = choicesForRow(
    resolved,
    row,
  );
  const narrowedBy =
    resolved.groupFromField && choices.length !== resolved.choices.length
      ? resolved.groupFromField
      : null;

  const selected = toSelected(value, multiple);
  const selectedSet = new Set(selected.map((s) => s.toLowerCase()));

  const byValue = useMemo(() => {
    const map = new Map<string, (typeof choices)[number]>();
    for (const c of choices) map.set(c.value.toLowerCase(), c);
    return map;
  }, [choices]);

  /**
   * A value the user already has that is NOT in the option list still appears
   * as a selected chip — never dropped from the UI just because the options
   * changed under it.
   */
  const offList = selected.filter((s) => !byValue.has(s.toLowerCase()));

  const trimmedQuery = query.trim();
  const canAddOther =
    allowOther &&
    trimmedQuery !== "" &&
    !byValue.has(trimmedQuery.toLowerCase()) &&
    !selectedSet.has(trimmedQuery.toLowerCase());

  /** Normalise a selection to what the cell stores, for both onChange and onDone. */
  const toStored = (next: string[]): unknown => {
    if (next.length === 0) return null;
    return multiple ? next : next[0];
  };

  const commit = (next: string[]) => {
    onChange(toStored(next));
  };

  const pick = (raw: string) => {
    const next = raw.trim();
    if (next === "") return;
    if (multiple) {
      const already = selected.some((s) => s.toLowerCase() === next.toLowerCase());
      commit(
        already
          ? selected.filter((s) => s.toLowerCase() !== next.toLowerCase())
          : [...selected, next],
      );
      setQuery("");
      return;
    }
    const stored = toStored([next]);
    onChange(stored);
    setQuery("");
    setOpen(false);
    onDone?.(stored);
  };

  const label =
    selected.length === 0
      ? "Select…"
      : multiple
        ? `${selected.length} selected`
        : (byValue.get(selected[0].toLowerCase())?.label ?? selected[0]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Closing without picking still finishes the edit; hand back the
          // current selection so the caller never re-derives it from stale state.
          if (!next) onDone?.(toStored(selected));
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 w-full justify-between font-normal"
          >
            <span
              className={cn(
                "truncate",
                selected.length === 0 && "text-muted-foreground",
              )}
            >
              {label}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter>
            <CommandInput
              placeholder={allowOther ? "Search or type a value…" : "Search options…"}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {/* Never an empty dropdown with no explanation — say which of the
                  three situations this is. */}
              {loading && (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  Loading options…
                </div>
              )}

              {!loading && unavailable && (
                <div className="px-3 py-4 text-sm text-amber-600 dark:text-amber-400">
                  This column's pick list can't be opened — it may have been
                  deleted, or it may not be shared with you. Existing values are
                  unaffected and you can still type a value.
                </div>
              )}

              {narrowedBy && (
                <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                  Narrowed by {narrowedBy}. Clear that cell to see every option.
                </div>
              )}

              {!loading && !unavailable && choices.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  No options declared yet.
                  {allowOther ? " Type a value to use one." : ""}
                </div>
              )}

              {!loading &&
                groups.map((group) => (
                  <CommandGroup
                    key={group.group || "__ungrouped"}
                    heading={group.group || undefined}
                  >
                    {group.choices.map((choice) => {
                      const isOn = selectedSet.has(choice.value.toLowerCase());
                      return (
                        <CommandItem
                          key={choice.value}
                          value={choice.value}
                          onSelect={() => pick(choice.value)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-3.5 w-3.5 shrink-0",
                              isOn ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">
                            {choice.label ?? choice.value}
                          </span>
                          {choice.help && (
                            <span className="ml-2 truncate text-xs text-muted-foreground">
                              {choice.help}
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}

              {canAddOther && (
                <CommandGroup>
                  <CommandItem value={trimmedQuery} onSelect={() => pick(trimmedQuery)}>
                    <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
                    Use &ldquo;{trimmedQuery}&rdquo;
                  </CommandItem>
                </CommandGroup>
              )}

              {!loading && !canAddOther && choices.length > 0 && (
                <CommandEmpty>
                  {allowOther
                    ? "Keep typing to use a value that isn't listed."
                    : "No matching option."}
                </CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected chips. Multi-select needs them to remove one without
          reopening; single-select shows one only when it is OFF-LIST, so the
          user can see at a glance that the stored value is not an option. */}
      {(multiple ? selected.length > 0 : offList.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {(multiple ? selected : offList).map((item) => {
            const choice = byValue.get(item.toLowerCase());
            const isOffList = !choice;
            return (
              <Badge
                key={item}
                variant="outline"
                className={cn(
                  "gap-1 px-1.5 py-0.5 text-xs font-normal",
                  isOffList
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                    : choiceColorClass(choice?.color),
                )}
                title={
                  isOffList
                    ? "Not one of this column's options — still saved."
                    : (choice?.help ?? undefined)
                }
              >
                {choice?.label ?? item}
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  className="rounded-sm opacity-60 hover:opacity-100"
                  onClick={() =>
                    commit(
                      selected.filter(
                        (s) => s.toLowerCase() !== item.toLowerCase(),
                      ),
                    )
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ChoiceInput;
