// features/scheduling/components/form/AgentPicker.tsx
//
// Lightweight agent picker for the schedule form. Queries agx_agent via
// supabase-js (owner-RLS-scoped, so the user only sees agents they own /
// can read). Renders as a Combobox.

"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Bot } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface AgentRow {
  id: string;
  name: string;
  description: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

const PLATFORM_DEFAULT: AgentRow = {
  id: "",
  name: "Platform default agent",
  description: "Use the default agent — no specific configuration.",
};

export function AgentPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("agx_agent")
        .select("id, name, description")
        .order("name", { ascending: true })
        .limit(200);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setAgents([]);
        return;
      }
      setAgents((data ?? []) as AgentRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const match = agents?.find((a) => a.id === value);
    if (match) {
      setSelected(match);
    } else if (value && (!agents || agents.length === 0)) {
      // We have an id but the list isn't loaded — show the id as a fallback.
      setSelected({ id: value, name: value, description: null });
    }
  }, [agents, value]);

  const displayLabel = selected ? selected.name : PLATFORM_DEFAULT.name;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between max-w-md font-normal"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{displayLabel}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0">
        <Command>
          <CommandInput placeholder="Search agents…" />
          <CommandList>
            <CommandEmpty>
              {error ? `Failed to load: ${error}` : "No agents found."}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__default__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    !value ? "opacity-100" : "opacity-0",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{PLATFORM_DEFAULT.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {PLATFORM_DEFAULT.description}
                  </div>
                </div>
              </CommandItem>
              {agents?.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.name} ${a.id}`}
                  onSelect={() => {
                    onChange(a.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === a.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{a.name}</div>
                    {a.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {a.description}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
