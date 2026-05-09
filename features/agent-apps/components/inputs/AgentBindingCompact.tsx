"use client";

/**
 * AgentBindingCompact
 *
 * Shows the currently bound agent's name with a small "Change" button.
 * Clicking Change opens a popover with a searchable agent list. Picking
 * a different agent fires `onChange(agentId)` and closes the popover.
 *
 * Apps almost never change agents — apps are built FROM agents. The UI
 * should reflect that: the binding is one row, not a sprawling section.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Webhook } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectLiveAgents } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsList } from "@/features/agents/redux/agent-definition/thunks";
import { cn } from "@/lib/utils";

interface AgentBindingCompactProps {
  agentId: string;
  agentName?: string | null;
  onChange: (agentId: string) => void;
  disabled?: boolean;
}

export function AgentBindingCompact({
  agentId,
  agentName,
  onChange,
  disabled,
}: AgentBindingCompactProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  // Fetch the agents list when the popover first opens.
  const liveAgents = useAppSelector(selectLiveAgents);
  useEffect(() => {
    if (open && liveAgents.length === 0) {
      dispatch(fetchAgentsList());
    }
  }, [open, liveAgents.length, dispatch]);

  const userAgents = useMemo(
    () => liveAgents.filter((a) => a.agentType === "user"),
    [liveAgents],
  );

  const handlePick = (id: string) => {
    setOpen(false);
    if (id === agentId) return;
    onChange(id);
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/30 border border-border/60">
      <div className="flex items-center gap-2 min-w-0">
        <Webhook className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">
          {agentName ?? agentId}
        </span>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={disabled}
          >
            Change
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[360px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandInput placeholder="Search agents…" />
            <CommandList>
              <CommandEmpty>No agents.</CommandEmpty>
              {userAgents.map((a) => {
                const isActive = a.id === agentId;
                return (
                  <CommandItem
                    key={a.id}
                    value={`${a.name} ${a.id}`}
                    onSelect={() => handlePick(a.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">{a.name}</span>
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
