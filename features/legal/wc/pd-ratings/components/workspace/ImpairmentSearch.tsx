"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, Loader2 } from "lucide-react";
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
import { useImpairments } from "../../api/hooks";
import type { WcImpairmentDefinitionRead } from "../../api/types";
import { LookupError } from "./LookupError";

interface ImpairmentSearchProps {
  value: string | null;
  onChange: (id: string | null, definition: WcImpairmentDefinitionRead | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ImpairmentSearch({
  value,
  onChange,
  disabled,
  placeholder = "Search impairment by name or AMA code…",
  className,
}: ImpairmentSearchProps) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, error, refetch, isFetching } = useImpairments();

  const items = React.useMemo<WcImpairmentDefinitionRead[]>(() => {
    if (!data?.impairments) return [];
    return Object.values(data.impairments).sort((a, b) =>
      a.impairment_number.localeCompare(b.impairment_number),
    );
  }, [data]);

  const selected = React.useMemo(
    () => items.find((i) => i.id === value),
    [items, value],
  );

  if (error) {
    return (
      <LookupError
        error={error}
        label="impairments"
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
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading catalog…
              </span>
            ) : selected ? (
              <span className="truncate">
                <span className="font-mono text-xs text-muted-foreground mr-1.5">
                  {selected.impairment_number}
                </span>
                {selected.name}
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
          <CommandInput placeholder="Search by impairment, body part, or AMA code…" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => {
                // Aliases (abbreviations like "DRE", lay terms, body-part synonyms)
                // are concatenated into the searchable text so users can find an
                // impairment without typing its canonical AMA name verbatim.
                // Source: wc_impairment_definition.search_aliases (DB column,
                // populated by scripts/generate_impairment_aliases.py).
                const aliasesField = (item as { search_aliases?: unknown })
                  .search_aliases;
                const aliases = Array.isArray(aliasesField)
                  ? (aliasesField as string[]).join(" ")
                  : "";
                const searchable = `${item.impairment_number} ${item.name} ${aliases}`;
                return (
                  <CommandItem
                    key={item.id ?? item.impairment_number}
                    value={searchable}
                    onSelect={() => {
                      onChange(item.id ?? null, item);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 mr-2 shrink-0",
                        value === item.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">
                      {item.impairment_number}
                    </span>
                    <span className="truncate">{item.name}</span>
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

export function useImpairmentDefinition(id: string | null | undefined) {
  const { data } = useImpairments();
  return React.useMemo(() => {
    if (!id || !data?.impairments) return null;
    return data.impairments[id] ?? null;
  }, [id, data]);
}
