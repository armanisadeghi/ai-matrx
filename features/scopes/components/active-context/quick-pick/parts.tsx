"use client";

// Shared atoms for the Quick-Pick set — fixed-geometry check targets
// (zero layout shift on select), kind glyphs, loading/empty/error panes, an
// inline-create row, and the common footer (commit vs live-emit semantics).

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Check,
  FolderOpen,
  Hash,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import {
  commitSelection,
  MODE_LABEL,
  summarizeSelection,
  type PickerMode,
  type PickNode,
  type SelectionEngine,
} from "./engine";

/* ── glyphs ──────────────────────────────────────────────────────────────── */

/** Fixed 16×16 check target — glyph swaps, dimensions never change. */
export function CheckGlyph({ on, round }: { on: boolean; round?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center border",
        round ? "rounded-full" : "rounded",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background",
      )}
    >
      <Check className={cn("h-3 w-3", on ? "opacity-100" : "opacity-0")} />
    </span>
  );
}

/** Kind-appropriate glyph in a fixed 16px box. */
export function KindGlyph({ node }: { node: PickNode }) {
  if (node.kind === "org")
    return <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (node.kind === "project")
    return (
      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    );
  if (node.kind === "task")
    return <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (node.kind === "item")
    return (
      <Hash
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          node.color?.fg ?? "text-muted-foreground",
        )}
      />
    );
  if (node.kind === "type") {
    const Icon = resolveIcon(node.iconName);
    return (
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          node.color?.fg ?? "text-muted-foreground",
        )}
      />
    );
  }
  // scope → colored dot of its type
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        node.color?.swatch ?? "bg-muted-foreground",
      )}
      style={{ margin: "0 3px" }}
    />
  );
}

/* ── panes ───────────────────────────────────────────────────────────────── */

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1.5 p-2" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded bg-muted" />
          <div
            className="h-3 animate-pulse rounded bg-muted"
            style={{ width: `${45 + ((i * 17) % 40)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function ErrorPane({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 text-center">
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <div className="text-xs text-destructive">
        {message ?? "Something went wrong loading your context."}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
      >
        <RefreshCw className="h-3 w-3" /> Retry
      </button>
    </div>
  );
}

export function EmptyPane({ text }: { text: string }) {
  return (
    <div className="px-3 py-4 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

/* ── inline create ───────────────────────────────────────────────────────── */

export function InlineCreate({
  placeholder,
  initial = "",
  onCommit,
  onCancel,
  autoFocus = true,
}: {
  placeholder: string;
  initial?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const [v, setV] = useState(initial);
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <Input
        autoFocus={autoFocus}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) {
            e.preventDefault();
            e.stopPropagation();
            onCommit(v);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder={placeholder}
        className="h-7 flex-1 text-xs"
        style={{ fontSize: "16px" }}
      />
      <button
        type="button"
        onClick={() => v.trim() && onCommit(v)}
        className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/85"
      >
        <Plus className="h-3 w-3" /> Add
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ── footer: assignment commits, active/filter emit live ────────────────── */

export function PickerFooter({
  engine,
  mode,
  dense,
  /** Demo/debug only — production Surface-A engines write inside `toggle`. */
  onLiveEmit,
}: {
  engine: SelectionEngine;
  mode: PickerMode;
  dense?: boolean;
  onLiveEmit?: (nodes: SelectionEngine["nodes"]) => void;
}) {
  const live = mode !== "assignment";
  const first = useRef(true);
  useEffect(() => {
    if (!live || !onLiveEmit) return;
    if (first.current) {
      first.current = false;
      return;
    }
    onLiveEmit(engine.nodes);
  }, [live, onLiveEmit, engine.nodes]);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-t border-border",
        dense ? "px-2 py-1" : "px-2.5 py-1.5",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {engine.count === 0
          ? engine.single
            ? "Pick one"
            : "Nothing selected"
          : summarizeSelection(engine.nodes)}
      </span>
      {engine.count > 0 && (
        <button
          type="button"
          onClick={engine.clear}
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Clear
        </button>
      )}
      {live ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/40 px-2 py-0.5 text-[10px] font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Live · {MODE_LABEL[mode]}
        </span>
      ) : (
        <button
          type="button"
          disabled={engine.count === 0}
          onClick={() => commitSelection(mode, engine.nodes)}
          className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-40"
        >
          {MODE_LABEL[mode]}
          {engine.count > 0 ? ` (${engine.count})` : ""}
        </button>
      )}
    </div>
  );
}
