"use client";

/**
 * OptionCombobox — a single-select over a string option list, searchable.
 *
 * The house choice rule (features/agents/utils/choice-rule.ts): pills for up to
 * four short options, a plain select up to twelve, and THIS above twelve — a
 * list that long is scanned by typing, never by scrolling a pill wall. Groups
 * are optional; a group marked `collapsed` shows behind a "More" row until the
 * person opens it, searches, or its option is the current value.
 *
 * Two trigger looks: `field` (bordered, matches SelectTrigger) and `inline`
 * (borderless, for dense settings rows).
 */

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface OptionComboboxGroup {
  heading?: string;
  options: string[];
  /** Hidden behind a "More" row until opened (or searched, or selected). */
  collapsed?: boolean;
}

export interface OptionComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Flat list — or pass `groups`. */
  options?: readonly string[];
  groups?: OptionComboboxGroup[];
  /** Display text for an option (defaults to the option itself). */
  getLabel?: (option: string) => string;
  /** Secondary text shown muted after the label. */
  getHint?: (option: string) => string | null | undefined;
  /** Leading visual for an option (e.g. a ratio shape). */
  renderIcon?: (option: string) => ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Hide the search box (short grouped lists). */
  searchable?: boolean;
  variant?: "field" | "inline";
  compact?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

export function OptionCombobox({
  value,
  onChange,
  options,
  groups: groupsProp,
  getLabel = (o) => o,
  getHint,
  renderIcon,
  placeholder = "Choose…",
  searchPlaceholder = "Search…",
  searchable = true,
  variant = "field",
  compact = false,
  disabled = false,
  id,
  ariaLabel,
  className,
}: OptionComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showMore, setShowMore] = useState(false);

  const groups: OptionComboboxGroup[] = groupsProp ?? [
    { options: [...(options ?? [])] },
  ];
  const q = query.trim().toLowerCase();
  const matches = (o: string) =>
    !q ||
    o.toLowerCase().includes(q) ||
    getLabel(o).toLowerCase().includes(q) ||
    (getHint?.(o) ?? "").toLowerCase().includes(q);

  const hasValue = value !== "";
  const hint = hasValue ? getHint?.(value) : null;

  const pick = (o: string) => {
    onChange(o);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setShowMore(false);
        }
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            "flex w-full min-w-0 items-center gap-2 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            variant === "field"
              ? cn(
                  "rounded-md border border-input bg-transparent px-3 shadow-xs hover:bg-accent/40",
                  compact ? "h-8 text-xs" : "h-9 text-sm",
                )
              : "h-7 rounded px-1 text-xs font-medium text-foreground/80 hover:text-foreground",
            className,
          )}
        >
          {hasValue && renderIcon?.(value)}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              !hasValue && "text-muted-foreground",
            )}
          >
            {hasValue ? getLabel(value) : placeholder}
            {hint && (
              <span className="ml-1.5 text-muted-foreground">{hint}</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "shrink-0 text-muted-foreground",
              variant === "inline" ? "h-3 w-3" : "h-3.5 w-3.5",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        sizing="content"
        align="start"
        className="p-0"
      >
        <Command shouldFilter={false}>
          {searchable && (
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
            />
          )}
          <CommandList className="max-h-72">
            <CommandEmpty>No match for “{query}”.</CommandEmpty>
            {groups.map((group, gi) => {
              const visible = group.options.filter(matches);
              if (visible.length === 0) return null;
              const folded =
                group.collapsed &&
                !showMore &&
                !q &&
                !group.options.includes(value);
              if (folded) {
                return (
                  <CommandGroup key={`g-${gi}`}>
                    <CommandItem
                      value={`__more_${gi}`}
                      onSelect={() => setShowMore(true)}
                      className="text-muted-foreground"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                      {group.heading ?? "More"}
                      <span className="ml-auto text-xs tabular-nums">
                        {group.options.length}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                );
              }
              return (
                <CommandGroup key={`g-${gi}`} heading={group.heading}>
                  {visible.map((o) => {
                    const selected = o === value;
                    const h = getHint?.(o);
                    return (
                      <CommandItem
                        key={o}
                        value={o}
                        onSelect={() => pick(o)}
                        className="gap-2"
                      >
                        {renderIcon?.(o)}
                        <span className="min-w-0 flex-1 truncate">
                          {getLabel(o)}
                          {h && (
                            <span className="ml-1.5 text-muted-foreground">
                              {h}
                            </span>
                          )}
                        </span>
                        <Check
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            selected ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
