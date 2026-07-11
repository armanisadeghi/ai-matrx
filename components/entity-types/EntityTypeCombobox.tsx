"use client";

// components/entity-types/EntityTypeCombobox.tsx
//
// Canonical searchable picker for a platform entity TYPE (an entity_types
// token). Lists every registered token in a wide tabular row (icon · full
// label · token · schema.table), searchable by any of those. Returns the
// token string. Pairs with EntityTypeChip.
//
// The candidate set is the generated registry, so a token that isn't FK-valid
// for platform.associations can never be picked — the write can't fail on a
// bad token. Consume this instead of hand-rolling a token <select>.
//
// Optional `disabledTokens` greys out rows (e.g. pairs that already have a
// relationship rule) with a reason badge — they stay visible for search but
// cannot be selected.

import { useState } from "react";
import { Check, ChevronsUpDown, HelpCircle } from "lucide-react";

import {
  ENTITY_TYPE_METADATA,
  type EntityTypeToken,
} from "@/types/generated/entity-types.generated";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { cn } from "@/lib/utils";
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

/** token → reason shown on the disabled row (e.g. "Already have this rule"). */
export type EntityTypeDisabledMap = ReadonlyMap<string, string>;

interface Props {
  value: string | null;
  onChange: (token: EntityTypeToken) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Tokens that cannot be selected. Pass a Map for a per-row reason badge,
   * or a Set to disable without a reason.
   */
  disabledTokens?: EntityTypeDisabledMap | ReadonlySet<string>;
  /** Extra width for the popover (default is wide enough for full labels). */
  contentClassName?: string;
}

const ALL_TOKENS: EntityTypeToken[] = (
  Object.keys(ENTITY_TYPE_METADATA) as EntityTypeToken[]
).sort((a, b) =>
  ENTITY_TYPE_METADATA[a].label.localeCompare(ENTITY_TYPE_METADATA[b].label),
);

function disabledReason(
  token: string,
  disabledTokens: Props["disabledTokens"],
): string | null {
  if (!disabledTokens) return null;
  if (disabledTokens instanceof Map) {
    return disabledTokens.has(token)
      ? (disabledTokens.get(token) ?? "Unavailable")
      : null;
  }
  return disabledTokens.has(token) ? "Unavailable" : null;
}

export function EntityTypeCombobox({
  value,
  onChange,
  placeholder = "Select entity type…",
  disabled,
  className,
  disabledTokens,
  contentClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected =
    value && value in ENTITY_TYPE_METADATA
      ? getEntityInfo(value as EntityTypeToken)
      : null;
  const SelectedIcon = selected?.Icon ?? HelpCircle;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-8 w-full justify-between font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {selected ? (
              <>
                <SelectedIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{selected.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {selected.token}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-[min(36rem,calc(100vw-1.5rem))] p-0",
          contentClassName,
        )}
        align="start"
      >
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            placeholder="Search name, token, or table…"
            className="h-9"
          />
          <CommandList className="max-h-[min(22rem,50dvh)]">
            <CommandEmpty>No entity type found.</CommandEmpty>
            <CommandGroup className="p-0">
              {/* Column headers — sticky so they stay visible while scrolling */}
              <div
                className="sticky top-0 z-10 grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_1.5rem] gap-2 border-b border-border bg-popover px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                aria-hidden
              >
                <span>Name</span>
                <span>Token</span>
                <span>Table</span>
                <span />
              </div>
              {ALL_TOKENS.map((token) => {
                const info = getEntityInfo(token);
                const reason = disabledReason(token, disabledTokens);
                const isDisabled = reason !== null;
                const isSelected = value === token;
                return (
                  <CommandItem
                    // value drives Command's fuzzy match: label + token + table
                    value={`${info.label} ${token} ${info.schema}.${info.table}`}
                    key={token}
                    disabled={isDisabled}
                    onSelect={() => {
                      if (isDisabled) return;
                      onChange(token);
                      setOpen(false);
                    }}
                    className={cn(
                      "cursor-pointer rounded-none px-2 py-1.5 aria-selected:bg-accent",
                      isDisabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <div className="grid w-full grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_1.5rem] items-center gap-2">
                      <span className="flex min-w-0 items-start gap-2">
                        <info.Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="whitespace-normal break-words text-sm leading-snug">
                          {info.label}
                          {isDisabled ? (
                            <span className="ml-1.5 inline-block whitespace-nowrap rounded border border-border bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
                              {reason}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="min-w-0 break-all font-mono text-[11px] text-muted-foreground">
                        {token}
                      </span>
                      <span className="min-w-0 break-all font-mono text-[10px] text-muted-foreground/80">
                        {info.schema}.{info.table}
                      </span>
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 justify-self-end",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
