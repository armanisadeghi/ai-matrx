"use client";

/**
 * panel-primitives — the small shared building blocks of the pipeline stage
 * panels: a titled section card, commit-on-blur fields (autosave rides the
 * payload debounce upstream), a select, and a generic editable row list.
 * Desktop-first density; inputs stay text-base for mobile (zoom floor).
 */

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function PanelSection({
  title,
  badge,
  actions,
  children,
  className,
}: {
  title: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "space-y-3 rounded-xl border border-border bg-card p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-40 flex-1 items-center gap-2 text-sm font-semibold">
          <span className="min-w-0 break-words">{title}</span>
          {badge}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Text input that reports on blur/Enter — pairs with debounced autosave. */
export function CommitField({
  label,
  value,
  placeholder,
  onCommit,
  className,
  type = "text",
}: {
  label?: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  className?: string;
  type?: "text" | "number";
}) {
  const [draft, setDraft] = useState(value);
  // External change (agent rewrite, item switch) → adopt it (the sanctioned
  // adjust-state-during-render pattern; no effect, no cascade).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const input = (
    <input
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={placeholder}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring",
        className,
      )}
    />
  );
  if (!label) return input;
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {input}
    </label>
  );
}

export function CommitTextArea({
  label,
  value,
  placeholder,
  onCommit,
  rows = 3,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }
  const area = (
    <Textarea
      value={draft}
      rows={rows}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      placeholder={placeholder}
      className="text-base"
    />
  );
  if (!label) return area;
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {area}
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  className?: string;
}) {
  const select = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-2 text-base focus:outline-none focus:ring-2 focus:ring-ring",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label) return select;
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {select}
    </label>
  );
}

/** Generic editable row list: render each row, remove per row, add at end. */
export function EditableRows<T>({
  rows,
  onChange,
  render,
  makeNew,
  addLabel,
  empty,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  render: (row: T, update: (next: T) => void) => React.ReactNode;
  makeNew: () => T;
  addLabel: string;
  empty?: string;
}) {
  return (
    <div className="space-y-2">
      {rows.length === 0 && empty && (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {render(row, (next) =>
              onChange(rows.map((r, j) => (j === i ? next : r))),
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground"
            aria-label="Remove row"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => onChange([...rows, makeNew()])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}
