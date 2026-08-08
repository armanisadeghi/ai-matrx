"use client";

import React, { useMemo, useState } from "react";
import { Search, CircuitBoard, Check } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface AgentOption {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isPublic?: boolean;
}

interface SearchableAgentSelectProps {
  agents: AgentOption[];
  value: string | null;
  onChange: (agentId: string) => void;
  placeholder?: string;
  emptyLabel?: string;
}

export function SearchableAgentSelect({
  agents,
  value,
  onChange,
  placeholder = "Search agents…",
  emptyLabel = "No agents found.",
}: SearchableAgentSelectProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        (a.category ?? "").toLowerCase().includes(q),
    );
  }, [agents, query]);

  return (
    <div className="flex flex-col border border-border rounded-md bg-card">
      <div className="flex-shrink-0 flex items-center gap-2 px-2 border-b border-border">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-11 border-0 text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 lg:h-10"
        />
      </div>
      <div className="max-h-72 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            {emptyLabel}
          </div>
        ) : (
          <ul>
            {filtered.map((a) => {
              const selected = a.id === value;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onChange(a.id)}
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <CircuitBoard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {a.name}
                      </div>
                      {a.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {a.description}
                        </div>
                      )}
                    </div>
                    {selected && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
