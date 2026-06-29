"use client";

/**
 * Presentational building blocks shared by the `note` tool's inline + overlay
 * renderers. Each piece is dumb (props in, JSX out) so both views compose the
 * exact same parts and never drift. Identity is the notes sidebar icon
 * (NotebookPen) plus the notes route accent color (see NOTE_ACCENT).
 */

import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, FileText, Loader2, NotebookPen } from "lucide-react";
import { toast } from "sonner";

import MarkdownStream from "@/components/MarkdownStream";
import { NOTE_ACCENT, type NoteToolMode } from "./useNoteToolData";

// ─────────────────────────────────────────────────────────────────────────────
// Identity header — icon + label (+ trailing controls slot)
// ─────────────────────────────────────────────────────────────────────────────

export function NoteIdentityHeader({
  label,
  size = "sm",
  trailing,
}: {
  label: string;
  size?: "sm" | "lg";
  trailing?: React.ReactNode;
}) {
  const lg = size === "lg";
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span
        className={
          lg
            ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            : "flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        }
        style={{ backgroundColor: `${NOTE_ACCENT}1f` }}
      >
        <NotebookPen
          className={lg ? "h-5 w-5" : "h-4 w-4"}
          style={{ color: NOTE_ACCENT }}
        />
      </span>
      <h3
        className={
          (lg ? "text-base font-semibold " : "text-sm font-semibold ") +
          "truncate text-foreground min-w-0 flex-1"
        }
        title={label}
      >
        {label}
      </h3>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit / Preview toggle — mirrors the notes editor's view-mode control
// ─────────────────────────────────────────────────────────────────────────────

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Eye;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
        (active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function ModeToggle({
  mode,
  onMode,
  editDisabled,
}: {
  mode: NoteToolMode;
  onMode: (m: NoteToolMode) => void;
  editDisabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5">
      <ModeButton
        active={mode === "edit"}
        onClick={() => onMode("edit")}
        icon={FileText}
        label="Edit"
        disabled={editDisabled}
      />
      <ModeButton
        active={mode === "preview"}
        onClick={() => onMode("preview")}
        icon={Eye}
        label="Preview"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Save-status badge
// ─────────────────────────────────────────────────────────────────────────────

export function SaveStatusBadge({
  state,
}: {
  state: "saved" | "dirty" | "saving" | "conflict";
}) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (state === "dirty") {
    return <span className="text-[11px] text-warning">Unsaved changes</span>;
  }
  if (state === "conflict") {
    return (
      <span className="text-[11px] text-destructive">
        Conflict — refresh to reconcile
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Check className="h-3 w-3 text-success" />
      Saved
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible markdown preview
// ─────────────────────────────────────────────────────────────────────────────

export function NotePreview({
  content,
  collapsible,
  collapsedMaxPx = 240,
  fadeFromClass = "from-card",
}: {
  content: string | undefined;
  collapsible: boolean;
  collapsedMaxPx?: number;
  fadeFromClass?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const empty = !content || !content.trim();
  const collapsed = collapsible && !expanded;

  useEffect(() => {
    const el = ref.current;
    if (!el || !collapsible) return undefined;
    // Measure in callbacks (rAF + ResizeObserver), never synchronously in the
    // effect body, so we don't trigger a cascading render on mount.
    const check = () => setOverflowing(el.scrollHeight > collapsedMaxPx + 12);
    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [content, collapsible, collapsedMaxPx]);

  if (empty) {
    return (
      <p className="py-2 text-sm italic text-muted-foreground">
        This note is empty.
      </p>
    );
  }

  return (
    <div>
      <div
        ref={ref}
        className="relative overflow-hidden"
        style={collapsed ? { maxHeight: collapsedMaxPx } : undefined}
      >
        {/* MarkdownStream is the canonical renderer — it processes render
            blocks (mermaid, tables, flashcards, …), unlike the thin
            BasicMarkdownContent wrapper. */}
        <MarkdownStream
          content={content as string}
          isStreamActive={false}
          hideCopyButton
          allowFullScreenEditor={false}
        />
        {collapsed && overflowing ? (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t ${fadeFromClass} to-transparent`}
          />
        ) : null}
      </div>
      {collapsible && overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain markdown editor (Edit mode)
// ─────────────────────────────────────────────────────────────────────────────

export function NoteEditArea({
  value,
  onChange,
  onBlur,
  minHeightPx = 180,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  minHeightPx?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      spellCheck
      placeholder="Write your note in markdown…"
      // 16px on phones avoids iOS focus-zoom; tighter on larger screens.
      className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[16px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[13px]"
      style={{ minHeight: minHeightPx }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata atoms
// ─────────────────────────────────────────────────────────────────────────────

/** Full note UUID + always-visible copy affordance. */
export function IdCopyChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.success("Note ID copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy note ID"
      className="group inline-flex w-full max-w-full items-start gap-1.5 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-left font-mono text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <span className="min-w-0 flex-1 break-all">{id}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-primary" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

/** Labeled metadata cell for the overlay's grid. */
export function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 min-w-0 text-xs text-foreground">{children}</div>
    </div>
  );
}
