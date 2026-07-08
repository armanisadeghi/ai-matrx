"use client";

// Presentational building blocks for the Performance Review demo.
// Kept in their own client module so page.tsx stays a server component and
// only this interactive tree ships as client JS.

import * as React from "react";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Check,
  Pencil,
  X,
} from "lucide-react";
import type { RatingValue } from "./schema";

// ── Section card with a numbered/lettered badge ──────────────────────────────
export function SectionCard({
  badge,
  title,
  description,
  children,
  className,
}: {
  badge: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            {badge}
          </span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {description ? (
          <p className="pl-10 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="p-4 pt-2">{children}</CardContent>
    </Card>
  );
}

// ── Labeled field wrapper ────────────────────────────────────────────────────
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

// ── Add-one-at-a-time list editor ────────────────────────────────────────────
export function ListEditor({
  items,
  placeholder,
  onAdd,
  onEdit,
  onRemove,
  onMove,
}: {
  items: string[];
  placeholder: string;
  onAdd: (text: string) => void;
  onEdit: (index: number, text: string) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const commitAdd = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    onEdit(editingIndex, editingText);
    setEditingIndex(null);
    setEditingText("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          minHeight={44}
          className="min-h-[44px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commitAdd();
            }
          }}
        />
        <Button type="button" onClick={commitAdd} className="flex-none">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
          No items yet — add the first one above.{" "}
          <span className="opacity-70">(⌘/Ctrl + Enter)</span>
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((text, i) => (
            <li
              key={i}
              className="group flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-2.5"
            >
              <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md border border-border bg-card text-[11px] font-bold text-muted-foreground">
                {i + 1}
              </span>

              {editingIndex === i ? (
                <div className="flex flex-1 items-end gap-2">
                  <Textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    autoFocus
                    minHeight={44}
                    className="min-h-[44px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        commitEdit();
                      }
                      if (e.key === "Escape") setEditingIndex(null);
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={commitEdit}
                    aria-label="Save"
                  >
                    <Check className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditingIndex(null)}
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {text}
                  </span>
                  <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 print:hidden">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={i === 0}
                      onClick={() => onMove(i, -1)}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      disabled={i === items.length - 1}
                      onClick={() => onMove(i, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingIndex(i);
                        setEditingText(text);
                      }}
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 hover:text-destructive"
                      onClick={() => onRemove(i)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 1–5 rating scale ─────────────────────────────────────────────────────────
const RATING_COLORS: Record<RatingValue, string> = {
  1: "bg-rose-500 border-rose-500 text-white",
  2: "bg-orange-500 border-orange-500 text-white",
  3: "bg-amber-500 border-amber-500 text-white",
  4: "bg-lime-600 border-lime-600 text-white",
  5: "bg-emerald-600 border-emerald-600 text-white",
};

export function RatingScale({
  value,
  onSelect,
}: {
  value: RatingValue | undefined;
  onSelect: (value: RatingValue) => void;
}) {
  return (
    <div className="inline-flex gap-1">
      {([1, 2, 3, 4, 5] as RatingValue[]).map((v) => {
        const selected = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            aria-label={`Rate ${v}`}
            aria-pressed={selected}
            className={cn(
              "h-8 w-8 rounded-md border text-sm font-bold tabular-nums transition-all",
              selected
                ? RATING_COLORS[v]
                : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary",
            )}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

// ── Category average pill ────────────────────────────────────────────────────
export function AvgBadge({ avg }: { avg: number | null }) {
  if (avg === null) return null;
  return (
    <Badge variant="secondary" className="ml-auto text-[11px]">
      avg {avg.toFixed(1)}
    </Badge>
  );
}

// ── Summary stat tile ────────────────────────────────────────────────────────
export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold leading-tight tracking-tight">
          {value}
          {sub ? (
            <span className="ml-1 text-sm font-medium text-muted-foreground">
              {sub}
            </span>
          ) : null}
        </p>
      </CardContent>
    </Card>
  );
}
