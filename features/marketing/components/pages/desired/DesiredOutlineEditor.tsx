"use client";

/**
 * DesiredOutlineEditor — the "header structure plan" editor: an ordered list
 * of desired headings (h1–h6) with add / remove / indent / outdent / reorder.
 * Controlled; renders in the same visual language as the observed
 * HeadingsOutline so plan and reality read side-by-side. Level discipline is
 * advisory (a skipped level shows the same warning badge as the observed
 * outline) — never a block.
 */

import { useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DesiredHeadingEntry } from "@/features/marketing/types";
import { cn } from "@/lib/utils";

function clampLevel(level: number): number {
  return Math.min(6, Math.max(1, level));
}

export function DesiredOutlineEditor({
  value,
  onChange,
  seedFrom,
}: {
  value: DesiredHeadingEntry[];
  onChange: (next: DesiredHeadingEntry[]) => void;
  /** Observed outline offered as a one-click starting point when empty. */
  seedFrom?: DesiredHeadingEntry[];
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const update = (index: number, patch: Partial<DesiredHeadingEntry>) => {
    onChange(
      value.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  };
  const insertAfter = (index: number) => {
    const level = value[index]?.level ?? 2;
    const next = [...value];
    next.splice(index + 1, 0, { level: clampLevel(level), text: "" });
    onChange(next);
    requestAnimationFrame(() => inputRefs.current[index + 1]?.focus());
  };
  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const skipsAfter = new Set<number>();
  for (let i = 1; i < value.length; i += 1) {
    if (value[i].level > value[i - 1].level + 1) skipsAfter.add(i);
  }

  if (value.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => onChange([{ level: 1, text: "" }])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Start a heading plan
        </Button>
        {seedFrom && seedFrom.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => onChange(seedFrom.map((entry) => ({ ...entry })))}
          >
            Seed from observed outline
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <ol className="grid gap-1">
      {value.map((entry, index) => (
        <li
          key={index}
          className="group flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: `${(clampLevel(entry.level) - 1) * 14}px` }}
        >
          <span
            className={cn(
              "w-6 shrink-0 font-mono text-[10px] uppercase",
              entry.level === 1
                ? "font-semibold text-primary"
                : "text-muted-foreground",
            )}
          >
            h{clampLevel(entry.level)}
          </span>
          <Input
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            value={entry.text}
            onChange={(event) => update(index, { text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                insertAfter(index);
              } else if (event.key === "Tab") {
                event.preventDefault();
                update(index, {
                  level: clampLevel(entry.level + (event.shiftKey ? -1 : 1)),
                });
              }
            }}
            placeholder={`h${clampLevel(entry.level)} heading`}
            className="h-7 text-xs"
          />
          {skipsAfter.has(index) ? (
            <Badge variant="warning" className="shrink-0 text-[9px]">
              skipped level
            </Badge>
          ) : null}
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <IconAction
              label="Outdent"
              disabled={entry.level <= 1}
              onClick={() => update(index, { level: clampLevel(entry.level - 1) })}
            >
              <ChevronLeft className="h-3 w-3" />
            </IconAction>
            <IconAction
              label="Indent"
              disabled={entry.level >= 6}
              onClick={() => update(index, { level: clampLevel(entry.level + 1) })}
            >
              <ChevronRight className="h-3 w-3" />
            </IconAction>
            <IconAction
              label="Move up"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp className="h-3 w-3" />
            </IconAction>
            <IconAction
              label="Move down"
              disabled={index === value.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown className="h-3 w-3" />
            </IconAction>
            <IconAction label="Add below" onClick={() => insertAfter(index)}>
              <Plus className="h-3 w-3" />
            </IconAction>
            <IconAction label="Remove" onClick={() => remove(index)}>
              <Trash2 className="h-3 w-3" />
            </IconAction>
          </div>
        </li>
      ))}
    </ol>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
