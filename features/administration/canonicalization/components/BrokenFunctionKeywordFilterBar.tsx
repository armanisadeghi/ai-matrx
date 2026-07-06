"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { KeywordTagFilterState } from "../utils/brokenFunctionKeywordFilter";

function TagChip({
  tag,
  tone,
  onRemove,
}: {
  tag: string;
  tone: "include" | "exclude";
  onRemove: () => void;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 gap-1 pr-1 font-mono text-[11px]",
        tone === "include"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {tag}
      <button
        type="button"
        className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        onClick={onRemove}
        aria-label={`Remove ${tag}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function TagList({
  label,
  hint,
  tone,
  tags,
  onChange,
}: {
  label: string;
  hint: string;
  tone: "include" | "exclude";
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);

  const addTag = () => {
    const next = input.trim();
    if (!next || tags.includes(next)) {
      setInput("");
      setAdding(false);
      return;
    }
    onChange([...tags, next]);
    setInput("");
    setAdding(true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Escape") {
      setInput("");
      setAdding(false);
    }
  };

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span
          className={cn(
            "text-[11px] font-medium uppercase tracking-wide",
            tone === "include"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-destructive",
          )}
        >
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
        {tags.map((tag) => (
          <TagChip
            key={tag}
            tag={tag}
            tone={tone}
            onRemove={() => onChange(tags.filter((t) => t !== tag))}
          />
        ))}
        {adding ? (
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (input.trim()) addTag();
              else setAdding(false);
            }}
            placeholder="keyword…"
            className="h-6 w-36 border-0 bg-background px-2 text-base shadow-none"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
      </div>
    </div>
  );
}

export function BrokenFunctionKeywordFilterBar({
  value,
  onChange,
  totalCount,
  filteredCount,
  onClear,
}: {
  value: KeywordTagFilterState;
  onChange: (next: KeywordTagFilterState) => void;
  totalCount: number;
  filteredCount: number;
  onClear: () => void;
}) {
  const active = value.include.length > 0 || value.exclude.length > 0;

  return (
    <div className="shrink-0 space-y-2 border-b border-border px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          Keyword filters
        </span>
        <div className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
          {active ? (
            <>
              Showing {filteredCount} of {totalCount}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onClear}
              >
                Clear keywords
              </Button>
            </>
          ) : (
            <span>{totalCount} rows</span>
          )}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <TagList
          label="Include"
          hint="Match any — row must contain at least one"
          tone="include"
          tags={value.include}
          onChange={(include) => onChange({ ...value, include })}
        />
        <TagList
          label="Exclude"
          hint="Match any — row is hidden if it contains one"
          tone="exclude"
          tags={value.exclude}
          onChange={(exclude) => onChange({ ...value, exclude })}
        />
      </div>
    </div>
  );
}
