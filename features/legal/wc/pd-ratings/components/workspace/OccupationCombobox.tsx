"use client";

import * as React from "react";
import { Briefcase, Check, ChevronsUpDown, Loader2 } from "lucide-react";
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
import { useOccupationalCodes } from "../../api/hooks";
import { LookupError } from "./LookupError";

interface OccupationOption {
  code: number;
  label: string;
  industry: string;
}

interface OccupationComboboxProps {
  value: number | null;
  onChange: (code: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function OccupationCombobox({
  value,
  onChange,
  disabled,
  placeholder = "Search occupation or code…",
  className,
}: OccupationComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, error, refetch, isFetching } =
    useOccupationalCodes();

  const options = React.useMemo<OccupationOption[]>(() => {
    if (!data?.codes) return [];
    // Wire shape: Record<JobCode, Record<JobTitle, IndustryCategory>>
    // e.g. { "230": { "Carpenter": "Construction", ... }, ... }
    const flat: OccupationOption[] = [];
    for (const [code, jobs] of Object.entries(data.codes)) {
      const codeNum = Number(code);
      if (Number.isNaN(codeNum)) continue;
      for (const [label, industry] of Object.entries(jobs)) {
        flat.push({ code: codeNum, label, industry });
      }
    }
    flat.sort((a, b) => a.industry.localeCompare(b.industry) || a.code - b.code);
    return flat;
  }, [data]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, OccupationOption[]>();
    for (const opt of options) {
      const list = map.get(opt.industry);
      if (list) list.push(opt);
      else map.set(opt.industry, [opt]);
    }
    return Array.from(map.entries());
  }, [options]);

  const selected = React.useMemo(
    () => options.find((o) => o.code === value),
    [options, value],
  );

  if (error) {
    return (
      <LookupError
        error={error}
        label="occupations"
        onRetry={() => refetch()}
        retrying={isFetching}
        className={className}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn(
            "h-11 w-full justify-between font-normal text-base",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0 truncate">
            <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading occupations…
              </span>
            ) : selected ? (
              <span className="truncate">
                <span className="font-mono text-xs text-muted-foreground mr-1.5">
                  {selected.code}
                </span>
                {selected.label}
              </span>
            ) : (
              <span>{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command
          filter={(rawValue, search) => {
            if (!search) return 1;
            return rawValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search by code or job title…" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>No matches.</CommandEmpty>
            {grouped.map(([industry, jobs]) => (
              <CommandGroup key={industry} heading={industry}>
                {jobs.map((opt) => {
                  const searchable = `${opt.code} ${opt.label} ${opt.industry}`;
                  return (
                    <CommandItem
                      key={`${opt.code}-${opt.label}`}
                      value={searchable}
                      onSelect={() => {
                        onChange(opt.code);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 mr-2",
                          value === opt.code ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">
                        {opt.code}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
