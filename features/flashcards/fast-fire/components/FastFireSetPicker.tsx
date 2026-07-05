// features/flashcards/fast-fire/components/FastFireSetPicker.tsx
//
// Searchable set picker for FastFire setup — dropdown with filter + sort (name /
// date). Uses the same Popover + Command combobox pattern as OccupationCombobox.

"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Layers } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { FcSetRow } from "@/features/flashcards/data/types";

type SetSort = "name" | "date";

const SORT_OPTIONS: { id: SetSort; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "date", label: "Date" },
];

function matchesSetQuery(set: FcSetRow, q: string): boolean {
  if (!q) return true;
  const haystack = [set.name, set.topic, set.lesson, set.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function sortSets(sets: FcSetRow[], sort: SetSort): FcSetRow[] {
  const copy = [...sets];
  if (sort === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    copy.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }
  return copy;
}

function formatSetDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function FastFireSetPicker({
  sets,
  value,
  onChange,
  disabled,
  placeholder = "Select a flashcard set…",
}: {
  sets: FcSetRow[];
  value: string | null;
  onChange: (setId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SetSort>("date");

  const selected = sets.find((s) => s.id === value) ?? null;

  const visibleSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? sets.filter((s) => matchesSetQuery(s, q)) : sets;
    return sortSets(filtered, sort);
  }, [sets, search, sort]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-11 w-full justify-between bg-background font-normal text-base",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
            {selected ? (
              <span className="truncate">{selected.name}</span>
            ) : (
              <span>{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search sets…"
            value={search}
            onValueChange={setSearch}
            className="text-base"
          />
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <span className="mr-0.5 text-[11px] text-muted-foreground">
              Sort
            </span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSort(opt.id)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  sort === opt.id
                    ? "bg-orange-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <CommandList className="max-h-64">
            <CommandEmpty>No sets match your search.</CommandEmpty>
            <CommandGroup>
              {visibleSets.map((set) => {
                const searchable = [
                  set.name,
                  set.description,
                  set.topic,
                  set.lesson,
                ]
                  .filter(Boolean)
                  .join(" ");
                const dateLabel = formatSetDate(set.updated_at);
                return (
                  <CommandItem
                    key={set.id}
                    value={searchable}
                    onSelect={() => {
                      onChange(set.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="flex items-start gap-2 py-2"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        value === set.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {set.name}
                      </div>
                      {(set.description || dateLabel) && (
                        <div className="truncate text-xs text-muted-foreground">
                          {set.description ?? dateLabel}
                        </div>
                      )}
                    </div>
                    {set.description && dateLabel && (
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {dateLabel}
                      </span>
                    )}
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
