"use client";

import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTriggerLegacy as SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow } from "../SettingsRow";
import type {
  SettingsCommonProps,
  SettingsOption,
  SettingsControlSize,
} from "../types";

type Width = "auto" | "sm" | "md" | "lg" | "xl" | "full";

const widthClass: Record<Width, string> = {
  auto: "w-full max-w-full @[40rem]/settings:w-auto @[40rem]/settings:min-w-32",
  sm: "w-32 max-w-full min-w-0",
  md: "w-44 max-w-full min-w-0",
  lg: "w-64 max-w-full min-w-0",
  // The width of the ladder rows' model/voice pickers, so a screen mixing
  // both lines every control up on one edge.
  xl: "w-80 max-w-full min-w-0",
  full: "w-full",
};

const triggerSize: Record<SettingsControlSize, "sm" | "default" | "lg"> = {
  sm: "sm",
  md: "default",
  lg: "lg",
};

const triggerMinHeight: Record<SettingsControlSize, string> = {
  // 44px under touch or below lg — the same condition as the
  // matrx-touch-targets floor, which a min-h utility here would otherwise beat.
  sm: "min-h-7 max-lg:min-h-11 pointer-coarse:min-h-11",
  md: "min-h-9 max-lg:min-h-11 pointer-coarse:min-h-11",
  lg: "min-h-10",
};

export type SettingsSelectProps<T extends string = string> =
  SettingsCommonProps & {
    value: T;
    onValueChange: (value: T) => void;
    /** Read-only: shared vocabularies (agent-writable-settings) are `as const`. */
    options: readonly SettingsOption<T>[];
    placeholder?: string;
    size?: SettingsControlSize;
    width?: Width;
    /** Renders as a stacked layout. Use when the select should span full width. */
    stacked?: boolean;
    last?: boolean;
    /** Long lists: a search box that filters by label and value (case-insensitive contains). */
    searchable?: boolean;
    searchPlaceholder?: string;
  };

/** Case-insensitive contains over the label and the raw value; "/" and "_" read as spaces. */
export function matchesSearch(
  query: string,
  option: { label: string; value: string },
): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[_/]/g, " ");
  const q = norm(query).trim();
  if (!q) return true;
  return norm(option.label).includes(q) || norm(option.value).includes(q);
}

/**
 * Radix Select reads a value of "" as "nothing selected" and shows a blank
 * trigger, so an option whose value IS "" (a "None" choice — e.g. voice
 * emotion) looked unset even while it was the saved choice. Every settings
 * select maps "" to this token on the way in and back to "" on the way out.
 */
const EMPTY_OPTION_VALUE = "__settings-empty-option__";

export function SettingsSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder,
  size = "md",
  width = "md",
  stacked,
  last,
  searchable,
  searchPlaceholder = "Search",
  ...rowProps
}: SettingsSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;
  const variant = stacked ? "stacked" : "inline";
  const effectiveWidth: Width = stacked ? "full" : width;
  // Only a select that OFFERS "" as a choice maps it; elsewhere "" still
  // means "not chosen yet" and the placeholder shows.
  const hasEmptyOption = options.some((opt) => opt.value === "");

  return (
    <SettingsRow
      {...rowProps}
      id={id}
      variant={variant}
      controlLayout="wide"
      last={last}
    >
      {searchable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              id={id}
              role="combobox"
              aria-expanded={open}
              disabled={rowProps.disabled}
              className={`${widthClass[effectiveWidth]} ${triggerMinHeight[size]} flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm disabled:opacity-50`}
            >
              <span className="truncate">
                {options.find((o) => o.value === value)?.label ??
                  placeholder ??
                  value}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent sizing="content" className="p-0" align="end">
            <Command
              filter={(itemValue, search) => {
                const opt = options.find((o) => o.value === itemValue);
                return opt ? (matchesSearch(search, opt) ? 1 : 0) : 0;
              }}
            >
              <CommandInput
                placeholder={searchPlaceholder}
                className="h-9 text-sm"
              />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup className="max-h-72 overflow-auto">
                  {options.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.disabled}
                      onSelect={() => {
                        onValueChange(opt.value as T);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          opt.value === value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {opt.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
      <Select
        value={value === "" && hasEmptyOption ? EMPTY_OPTION_VALUE : value}
        onValueChange={(v) =>
          onValueChange((v === EMPTY_OPTION_VALUE ? "" : v) as T)
        }
        disabled={rowProps.disabled}
      >
        <SelectTrigger
          id={id}
          size={triggerSize[size]}
          className={`${widthClass[effectiveWidth]} h-auto ${triggerMinHeight[size]} whitespace-normal text-left [&>span]:line-clamp-none [&>span]:whitespace-normal`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value === "" ? EMPTY_OPTION_VALUE : opt.value}
              disabled={opt.disabled}
              // Outside ItemText via the prop — a description passed as a
              // child ends up inside the closed trigger and gets clipped.
              description={opt.description}
            >
              <span className="flex items-center gap-2">
                {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
                <span>{opt.label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      )}
    </SettingsRow>
  );
}
