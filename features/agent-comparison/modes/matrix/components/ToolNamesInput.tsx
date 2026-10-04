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
import { selectAllTools, selectToolsStatus } from "@ai-matrx/chat/agents/redux/tools/tools.selectors";
import { fetchAvailableTools } from "@ai-matrx/chat/agents/redux/tools/tools.thunks";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";

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
  const tools = useAppSelector(selectAllTools);
  const status = useAppSelector(selectToolsStatus);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open && status === "idle") void dispatch(fetchAvailableTools());
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
          className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded border border-border bg-muted/40 text-[11px] font-mono"
        >
          {name}
          <button
            type="button"
            aria-label={`Remove ${name}`}
            title={`Remove ${name}`}
            onClick={() => onChange(value.filter((v) => v !== name))}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title={label}
            className="inline-flex items-center gap-1 h-6 px-2 rounded border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Plus className="w-3 h-3" />
            Tool
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
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
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading tools…</div>
            )}
            {status === "failed" && (
              <div className="px-2 py-1.5 text-xs text-destructive">Tool list did not load</div>
            )}
            {candidates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => add(t.name)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left hover:bg-muted"
              >
                <span className="text-xs font-mono truncate">{t.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{t.category}</span>
              </button>
            ))}
            {query.trim() && !tools.some((t) => t.name === query.trim()) && (
              <button
                type="button"
                onClick={() => add(query)}
                className="w-full px-2 py-1 rounded text-left text-xs hover:bg-muted"
              >
                Add <span className="font-mono">{query.trim()}</span>
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
