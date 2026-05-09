"use client";

/**
 * AgentAppCategoryPicker
 *
 * Searchable category picker for `aga_apps.category`. Pulls system options
 * from `aga_categories` (a flat list today) and lets the user pick one or
 * type their own custom value. The selected text is what lands in the row.
 *
 * Future-friendly: when `aga_categories` gains a `parent_id` column the
 * dropdown will expand into a tree view here without callsite changes.
 *
 * Behavior:
 *   - Click trigger → searchable popover with system options.
 *   - Type a query that doesn't match any option → "Create '<query>'" entry
 *     at the bottom commits a custom category as plain text.
 *   - Clear button on the trigger removes the value entirely (null in DB).
 */

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Folder, Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  fetchAgentAppCategories,
  type AgentAppCategoryRow,
} from "@/lib/services/agent-apps-admin-service";

interface AgentAppCategoryPickerProps {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AgentAppCategoryPicker({
  value,
  onChange,
  disabled = false,
  placeholder = "Pick or create a category",
}: AgentAppCategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [systemOptions, setSystemOptions] = useState<AgentAppCategoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load system categories the first time the popover opens.
  useEffect(() => {
    if (!open || systemOptions.length > 0 || loading) return;
    setLoading(true);
    setError(null);
    fetchAgentAppCategories()
      .then((rows) => setSystemOptions(rows))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [open, systemOptions.length, loading]);

  // Did the user's current value match a system entry?
  const matchedSystem = useMemo(
    () =>
      value
        ? systemOptions.find(
            (o) => o.name.toLowerCase() === value.toLowerCase(),
          )
        : undefined,
    [value, systemOptions],
  );

  const filteredSystem = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return systemOptions;
    return systemOptions.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.description ?? "").toLowerCase().includes(q),
    );
  }, [query, systemOptions]);

  const showCreate =
    query.trim().length > 0 &&
    !systemOptions.some(
      (o) => o.name.toLowerCase() === query.trim().toLowerCase(),
    );

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "h-9 w-full flex items-center gap-2 px-3 rounded-md border border-input bg-background hover:bg-muted/50 transition-colors text-left",
            disabled && "opacity-60 cursor-not-allowed",
          )}
        >
          <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span
            className={cn(
              "flex-1 truncate text-sm",
              !value && "text-muted-foreground",
            )}
          >
            {value ?? placeholder}
          </span>
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
              aria-label="Clear category"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          {!matchedSystem && value && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
              custom
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput
            placeholder="Search categories…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Loading…
              </div>
            )}
            {error && (
              <div className="px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {!loading && filteredSystem.length === 0 && !showCreate && (
              <CommandEmpty>No matching categories.</CommandEmpty>
            )}
            {filteredSystem.length > 0 && (
              <CommandGroup heading="System categories">
                {filteredSystem.map((opt) => {
                  const isActive =
                    value && opt.name.toLowerCase() === value.toLowerCase();
                  return (
                    <CommandItem
                      key={opt.id}
                      value={opt.name}
                      onSelect={() => handleSelect(opt.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isActive ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1">{opt.name}</span>
                      {opt.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {opt.description}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {showCreate && (
              <>
                {filteredSystem.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Custom">
                  <CommandItem
                    value={`__create:${query.trim()}`}
                    onSelect={() => handleSelect(query.trim())}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Use &ldquo;{query.trim()}&rdquo; as custom category
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
