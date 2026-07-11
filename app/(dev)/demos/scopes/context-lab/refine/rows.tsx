"use client";

// Shared dense atoms for the refine variations. One row = 26px — roughly half
// the vertical cost of the shipping field's rows. Fixed-size check targets so
// selecting never shifts layout.

import React, { useState } from "react";
import { Check, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** 14px square check glyph — fixed footprint in both states. */
export function CheckGlyph({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background",
      )}
    >
      {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
    </span>
  );
}

/** Radio-style glyph for single-select rows — same 14px footprint. */
export function DotGlyph({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
        on ? "border-primary" : "border-border",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-colors",
          on ? "bg-primary" : "bg-transparent",
        )}
      />
    </span>
  );
}

/** The one dense selectable row. 26px tall, keyboard-operable. */
export function DenseRow({
  on,
  single = false,
  label,
  sub,
  icon,
  textClass,
  right,
  active = false,
  onClick,
  indent = 0,
}: {
  on: boolean;
  single?: boolean;
  label: string;
  /** Dim trailing breadcrumb (e.g. "Client · Titanium"). */
  sub?: string;
  icon?: React.ReactNode;
  textClass?: string;
  right?: React.ReactNode;
  /** Keyboard-highlighted (quick-pick active row). */
  active?: boolean;
  onClick: () => void;
  indent?: number;
}) {
  return (
    <div
      role="option"
      aria-selected={on}
      tabIndex={-1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group flex h-[26px] w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-[13px] leading-none hover:bg-muted",
        active && "bg-accent",
      )}
      style={indent ? { paddingLeft: 6 + indent * 14 } : undefined}
    >
      {single ? <DotGlyph on={on} /> : <CheckGlyph on={on} />}
      {icon}
      <span className={cn("min-w-0 truncate", textClass)}>{label}</span>
      {sub && (
        <span className="min-w-0 shrink-[2] truncate text-[11px] text-muted-foreground/70">
          {sub}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1">{right}</span>
    </div>
  );
}

/** Section micro-header — 22px, uppercase, with optional inline add. */
export function MicroHeader({
  label,
  count,
  onAdd,
  addTitle,
  className,
  icon,
}: {
  label: string;
  count?: number;
  onAdd?: () => void;
  addTitle?: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-[22px] items-center gap-1.5 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className="font-normal opacity-70">{count}</span>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          title={addTitle ?? "Add"}
          className="ml-auto flex h-4 w-4 items-center justify-center rounded hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/** Inline one-line create input (Enter commits, Escape cancels). */
export function InlineCreate({
  placeholder,
  onCommit,
  onCancel,
  indent = 0,
}: {
  placeholder: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  indent?: number;
}) {
  const [v, setV] = useState("");
  return (
    <div
      className="flex h-[28px] items-center gap-1 pr-1"
      style={indent ? { paddingLeft: 6 + indent * 14 } : undefined}
    >
      <Input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) onCommit(v);
          if (e.key === "Escape") onCancel();
          e.stopPropagation();
        }}
        placeholder={placeholder}
        className="h-6 rounded px-1.5 py-0 text-[13px] md:text-[13px]"
        style={{ fontSize: "16px" }}
      />
      <button
        type="button"
        onClick={onCancel}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** "+ New …" ghost row (the add-at-any-level affordance, discoverable in place). */
export function AddRow({
  label,
  onClick,
  indent = 0,
}: {
  label: string;
  onClick: () => void;
  indent?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[24px] w-full items-center gap-2 rounded-md px-1.5 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
      style={indent ? { paddingLeft: 6 + indent * 14 } : undefined}
    >
      <Plus className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** In-list loading row (never a bare spinner filling a panel). */
export function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex h-[26px] items-center gap-2 px-1.5 text-[12px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      {label}
    </div>
  );
}

/** In-list error row with retry — errors are designed, not swallowed. */
export function ErrorRow({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-[26px] items-center gap-2 px-1.5 text-[12px] text-destructive">
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        onClick={onRetry}
        className="ml-auto flex shrink-0 items-center gap-1 rounded px-1 text-[11px] hover:bg-muted"
      >
        <RotateCcw className="h-3 w-3" />
        Retry
      </button>
    </div>
  );
}

/** Empty guidance row. */
export function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex h-[26px] items-center px-1.5 text-[12px] text-muted-foreground/70">
      {label}
    </div>
  );
}
