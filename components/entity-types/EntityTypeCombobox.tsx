"use client";

// components/entity-types/EntityTypeCombobox.tsx
//
// Canonical searchable picker for a platform entity TYPE (an entity_types
// token). Lists every registered token with its icon + label + raw token,
// searchable by either. Returns the token string. Pairs with EntityTypeChip.
//
// The candidate set is the generated registry, so a token that isn't FK-valid
// for platform.associations can never be picked — the write can't fail on a
// bad token. Consume this instead of hand-rolling a token <select>.

import { useMemo, useState } from "react";
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

interface Props {
  value: string | null;
  onChange: (token: EntityTypeToken) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const ALL_TOKENS: EntityTypeToken[] = (
  Object.keys(ENTITY_TYPE_METADATA) as EntityTypeToken[]
).sort((a, b) =>
  ENTITY_TYPE_METADATA[a].label.localeCompare(ENTITY_TYPE_METADATA[b].label),
);

export function EntityTypeCombobox({
  value,
  onChange,
  placeholder = "Select entity type…",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => (value && value in ENTITY_TYPE_METADATA ? getEntityInfo(value as EntityTypeToken) : null),
    [value],
  );
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
          className={cn("h-8 justify-between font-normal", className)}
        >
          <span className="flex items-center gap-1.5 truncate">
            {selected ? (
              <>
                <SelectedIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{selected.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
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
      <PopoverContent className="w-72 p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search entity types…" className="h-9" />
          <CommandList>
            <CommandEmpty>No entity type found.</CommandEmpty>
            <CommandGroup>
              {ALL_TOKENS.map((token) => {
                const info = getEntityInfo(token);
                return (
                  <CommandItem
                    // value drives Command's fuzzy match: label + token
                    value={`${info.label} ${token}`}
                    key={token}
                    onSelect={() => {
                      onChange(token);
                      setOpen(false);
                    }}
                  >
                    <info.Icon className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">{info.label}</span>
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      {token}
                    </span>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        value === token ? "opacity-100" : "opacity-0",
                      )}
                    />
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
