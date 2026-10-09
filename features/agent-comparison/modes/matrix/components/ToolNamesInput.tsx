"use client";

/**
 * ToolNamesInput — a list of tool names (the contract's `tools_add` /
 * `tools_remove`). Picks come from the canonical tool registry
 * (`fetchAvailableTools` / `selectAllTools`); any other name — a bundle lister
 * such as `bundle:list_google` — is typed and added with Enter.
 */

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";
import { Button } from "@ai-matrx/design-system/controls";
import { loadAvailableTools, selectAllTools, selectToolsStatus, useToolCatalog } from "@ai-matrx/chat/agents/identity/tool-catalog";

export function ToolNamesInput({
  value,
  onChange,
  label,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
}) {
  const dispatch = useAppDispatch();
  const tools = useToolCatalog(selectAllTools);
  const status = useToolCatalog(selectToolsStatus);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open && status === "idle") void loadAvailableTools();
  }, [open, status, dispatch]);

  const add = (name: string) => {
    const n = name.trim();
    if (!n || value.includes(n)) return;
    onChange([...value, n]);
    setQuery("");
  };

  const candidates = filterAndSortBySearch(
    tools.filter((t) => !value.includes(t.name)),
    query,
    [
      { get: (t) => t.name, weight: "title" },
      { get: (t) => t.description, weight: "body" },
      { get: (t) => t.category, weight: "tag" },
    ],
  ).slice(0, 60);

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-0">
      {value.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded border border-border bg-muted/40 type-meta font-mono"
        >
          {name}
          <Button variant="quiet" icon={<X />} aria-label={`Remove ${name}`} title={`Remove ${name}`} onClick={() => onChange(value.filter((v) => v !== name))} />
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" icon={<Plus />} aria-label={label} title={label}>
            Tool
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" width="lg" padding="sm">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(query);
              }
            }}
            placeholder="Search or type a name, Enter adds"
            className="w-full h-8 px-2 mb-2 rounded border border-border bg-background text-sm"
          />
          <div className="max-h-64 overflow-y-auto">
            {status === "loading" && (
              <div className="px-2 py-1.5 type-secondary text-muted-foreground">Loading tools…</div>
            )}
            {status === "failed" && (
              <div className="px-2 py-1.5 type-secondary text-destructive">Tool list did not load</div>
            )}
            {candidates.map((t) => (
              <Button variant="quiet" key={t.id} onClick={() => add(t.name)} className="w-full">
                <span className="type-secondary font-mono truncate">{t.name}</span>
                <span className="type-meta text-muted-foreground shrink-0">{t.category}</span>
              </Button>
            ))}
            {query.trim() && !tools.some((t) => t.name === query.trim()) && (
              <Button variant="quiet" onClick={() => add(query)} className="w-full">
                Add <span className="font-mono">{query.trim()}</span>
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
