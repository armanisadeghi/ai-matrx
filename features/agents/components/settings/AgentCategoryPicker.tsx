"use client";

/**
 * Searchable category picker for agent `category` metadata.
 * Suggests categories already used by other agents and allows custom values.
 */

import { useMemo, useState } from "react";
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

interface AgentCategoryPickerProps {
  value: string;
  onChange: (next: string) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function AgentCategoryPicker({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Pick or create a category",
  className,
}: AgentCategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matchedOption = useMemo(
    () =>
      value
        ? options.find((o) => o.toLowerCase() === value.toLowerCase())
        : undefined,
    [value, options],
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [query, options]);

  const showCreate =
    query.trim().length > 0 &&
    !options.some((o) => o.toLowerCase() === query.trim().toLowerCase());

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "h-9 w-full flex items-center gap-2 px-3 rounded-md border border-input bg-background/50 hover:bg-muted/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-primary/40",
            disabled && "opacity-60 cursor-not-allowed",
            className,
          )}
        >
          <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span
            className={cn(
              "flex-1 truncate text-sm",
              !value && "text-muted-foreground",
            )}
          >
            {value || placeholder}
          </span>
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
              aria-label="Clear category"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          {!matchedOption && value && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
              custom
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput
            placeholder="Search or type a new category…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {filteredOptions.length === 0 && !showCreate && (
              <CommandEmpty>
                Type a name and pick &ldquo;Use as custom category&rdquo;.
              </CommandEmpty>
            )}
            {filteredOptions.length > 0 && (
              <CommandGroup heading="Existing categories">
                {filteredOptions.map((opt) => {
                  const isActive =
                    value && opt.toLowerCase() === value.toLowerCase();
                  return (
                    <CommandItem
                      key={opt}
                      value={opt}
                      onSelect={() => handleSelect(opt)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isActive ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {opt}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {showCreate && (
              <>
                {filteredOptions.length > 0 && <CommandSeparator />}
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
