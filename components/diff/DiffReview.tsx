"use client";

// components/diff/DiffReview.tsx
//
// Interactive change RESOLVER on the canonical light diff engine. This is not a
// batch of checkboxes — it's a merge tool with a resolution mindset: every hunk
// is pending / applied / rejected. Resolving one (Accept = take the new lines,
// Reject = keep the old) removes it from the pending diffs and shows that region
// as normal resolved text in place (with an Undo to send it back to pending).
// Accept-all / Reject-all clear every remaining pending diff at once. "Apply"
// hands the merged text back via onApply.
//
// Built for real files: the diff is computed ONCE (getDiffStructure) and every
// interaction derives from it with no re-diff; unchanged context is folded to a
// few lines around each change (expandable); Prev/Next jump between changes.
//
// Headless of any source — the caller owns what "apply" means (write a note, a
// code file, a context value, resolve a conflict).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  X,
  GitMerge,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  ListChecks,
  Undo2,
  ChevronsDownUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getDiffStructure,
  mergeFromDecisions,
  type DiffStructureItem,
} from "./text/engine/hunks";
import { GUTTER, LINE_BG } from "./text/diffColors";
import type { TextDiffOptions } from "./text/engine/types";

type HunkStatus = "pending" | "applied" | "rejected";

/** Unchanged lines to keep visible on each side of a change when folding. */
const CONTEXT_LINES = 3;

export interface DiffReviewProps {
  original: string;
  modified: string;
  originalLabel?: string;
  modifiedLabel?: string;
  /** Called with the merged text when the user applies. */
  onApply: (mergedText: string) => void;
  onCancel?: () => void;
  applyLabel?: string;
  diffOptions?: TextDiffOptions;
  className?: string;
}

function Line({
  text,
  sign,
  tone,
}: {
  text: string;
  sign: "+" | "-" | " ";
  tone: "added" | "removed" | "context";
}) {
  return (
    <div
      className={cn(
        "flex items-start font-mono text-xs leading-relaxed",
        tone === "added" && LINE_BG.added,
        tone === "removed" && LINE_BG.removed,
      )}
    >
      <span
        className={cn(
          "w-4 shrink-0 select-none text-center",
          tone === "added" && GUTTER.added,
          tone === "removed" && GUTTER.removed,
          tone === "context" && "text-transparent",
        )}
      >
        {sign}
      </span>
      {/* Wrap is always on: long lines soft-wrap instead of scrolling away. */}
      <span className="flex-1 whitespace-pre-wrap break-words pr-3">
        {text === "" ? " " : text}
      </span>
    </div>
  );
}

export function DiffReview({
  original,
  modified,
  originalLabel = "Current",
  modifiedLabel = "Incoming",
  onApply,
  onCancel,
  applyLabel,
  diffOptions,
  className,
}: DiffReviewProps) {
  // Compute the whole diff ONCE. Everything below derives from this — no re-diff
  // on resolve, expand, or navigate.
  const structure = useMemo(
    () => getDiffStructure(original, modified, diffOptions),
    [original, modified, diffOptions],
  );
  const { items, hunkCount } = structure;

  // Per-hunk resolution. Missing === "pending".
  const [status, setStatus] = useState<Record<number, HunkStatus>>({});
  useEffect(() => {
    setStatus({});
  }, [structure]);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useEffect(() => {
    setExpanded(new Set());
  }, [structure]);

  const [flash, setFlash] = useState<number | null>(null);
  const hunkRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const cursorRef = useRef(-1);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusOf = (i: number): HunkStatus => status[i] ?? "pending";

  const counts = useMemo(() => {
    let pending = 0,
      applied = 0,
      rejected = 0;
    for (let i = 0; i < hunkCount; i++) {
      const s = status[i] ?? "pending";
      if (s === "applied") applied++;
      else if (s === "rejected") rejected++;
      else pending++;
    }
    return { pending, applied, rejected };
  }, [status, hunkCount]);

  const acceptedSet = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < hunkCount; i++) {
      if ((status[i] ?? "pending") === "applied") set.add(i);
    }
    return set;
  }, [status, hunkCount]);

  const merged = useMemo(
    () => mergeFromDecisions(items, acceptedSet),
    [items, acceptedSet],
  );

  const resolve = (index: number, s: HunkStatus) =>
    setStatus((prev) => ({ ...prev, [index]: s }));

  const resolveAllPending = (s: "applied" | "rejected") =>
    setStatus((prev) => {
      const next = { ...prev };
      for (let i = 0; i < hunkCount; i++) {
        if ((next[i] ?? "pending") === "pending") next[i] = s;
      }
      return next;
    });

  const flashHunk = (index: number) => {
    hunkRefs.current[index]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    setFlash(index);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1200);
  };
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const gotoChange = (dir: 1 | -1) => {
    if (hunkCount === 0) return;
    const nextCursor =
      dir === 1
        ? (cursorRef.current + 1) % hunkCount
        : (cursorRef.current - 1 + hunkCount) % hunkCount;
    cursorRef.current = nextCursor;
    flashHunk(nextCursor);
  };

  if (hunkCount === 0) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-2 bg-card text-sm text-muted-foreground",
          className,
        )}
      >
        <ListChecks className="h-5 w-5" />
        No changes to review — {originalLabel} and {modifiedLabel} are identical.
      </div>
    );
  }

  const allResolved = counts.pending === 0;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-muted/30 px-2 py-1 text-xs">
        <span className="font-medium">
          <span className={counts.pending ? "text-foreground" : "text-muted-foreground"}>
            {counts.pending} pending
          </span>
          {counts.applied > 0 && (
            <span className="ml-1.5 text-green-600 dark:text-green-400">
              {counts.applied} applied
            </span>
          )}
          {counts.rejected > 0 && (
            <span className="ml-1.5 text-red-600 dark:text-red-400">
              {counts.rejected} rejected
            </span>
          )}
        </span>

        {/* Navigate between changes */}
        <button
          type="button"
          onClick={() => gotoChange(-1)}
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Previous change"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => gotoChange(1)}
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Next change"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-4 w-px bg-border" />

        <button
          type="button"
          onClick={() => resolveAllPending("applied")}
          disabled={counts.pending === 0}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-green-600 transition-colors hover:bg-green-500/10 disabled:opacity-40 dark:text-green-400"
          title="Accept every remaining pending change"
        >
          <Check className="h-3.5 w-3.5" />
          Accept all
        </button>
        <button
          type="button"
          onClick={() => resolveAllPending("rejected")}
          disabled={counts.pending === 0}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400"
          title="Reject every remaining pending change (keep the original)"
        >
          <X className="h-3.5 w-3.5" />
          Reject all
        </button>
        <button
          type="button"
          onClick={() => setStatus({})}
          disabled={counts.applied === 0 && counts.rejected === 0}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          title="Send every change back to pending"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>

        <div className="flex-1" />
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-7">
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => onApply(merged)}
          className="h-7 gap-1.5"
          title={
            allResolved
              ? "Apply the resolved result"
              : `Apply now — ${counts.pending} unresolved change(s) will keep the original`
          }
        >
          <GitMerge className="h-3.5 w-3.5" />
          {applyLabel ?? "Apply"}
        </Button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {items.map((item, idx) =>
          item.kind === "context"
            ? renderContext(item, idx, expanded, setExpanded)
            : renderHunk(
                item,
                statusOf(item.index),
                resolve,
                (el) => (hunkRefs.current[item.index] = el),
                flash === item.index,
              ),
        )}
      </div>
    </div>
  );
}

function renderContext(
  block: Extract<DiffStructureItem, { kind: "context" }>,
  key: number,
  expanded: Set<number>,
  setExpanded: React.Dispatch<React.SetStateAction<Set<number>>>,
) {
  const lead = block.hasPrevHunk ? CONTEXT_LINES : 0;
  const trail = block.hasNextHunk ? CONTEXT_LINES : 0;
  const n = block.lines.length;
  const isExpanded = expanded.has(key);

  if (isExpanded || n <= lead + trail + 1) {
    return (
      <div key={`c${key}`}>
        {block.lines.map((t, i) => (
          <Line key={i} text={t} sign=" " tone="context" />
        ))}
      </div>
    );
  }

  const head = block.lines.slice(0, lead);
  const tail = block.lines.slice(n - trail);
  const hidden = n - lead - trail;

  return (
    <div key={`c${key}`}>
      {head.map((t, i) => (
        <Line key={`h${i}`} text={t} sign=" " tone="context" />
      ))}
      <button
        type="button"
        onClick={() => setExpanded((prev) => new Set(prev).add(key))}
        className="flex w-full items-center gap-1.5 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Expand hidden unchanged lines"
      >
        <ChevronsDownUp className="h-3 w-3" />
        Expand {hidden} unchanged line{hidden === 1 ? "" : "s"}
      </button>
      {tail.map((t, i) => (
        <Line key={`t${i}`} text={t} sign=" " tone="context" />
      ))}
    </div>
  );
}

function renderHunk(
  hunk: Extract<DiffStructureItem, { kind: "hunk" }>,
  status: HunkStatus,
  resolve: (index: number, s: HunkStatus) => void,
  ref: (el: HTMLDivElement | null) => void,
  flashing: boolean,
) {
  const wrap = (children: React.ReactNode, border: string) => (
    <div
      key={`h${hunk.index}`}
      ref={ref}
      className={cn(
        "my-1 border-y border-border/60 transition-shadow",
        border,
        flashing && "ring-2 ring-primary/60",
      )}
    >
      {children}
    </div>
  );

  if (status === "applied") {
    // Resolved → reads like normal content (the new text), with an Undo chip.
    return wrap(
      <>
        <div className="flex items-center gap-1 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-700 dark:text-green-400">
          <Check className="h-3 w-3" /> Applied
          <button
            type="button"
            onClick={() => resolve(hunk.index, "pending")}
            className="ml-auto inline-flex items-center gap-1 rounded px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Undo — send this change back to pending"
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
        </div>
        {hunk.added.map((t, i) => (
          <Line key={i} text={t} sign=" " tone="context" />
        ))}
      </>,
      "border-l-2 border-l-green-500/50",
    );
  }

  if (status === "rejected") {
    return wrap(
      <>
        <div className="flex items-center gap-1 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
          <X className="h-3 w-3" /> Rejected — kept original
          <button
            type="button"
            onClick={() => resolve(hunk.index, "pending")}
            className="ml-auto inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground"
            title="Undo — send this change back to pending"
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
        </div>
        {hunk.removed.map((t, i) => (
          <Line key={i} text={t} sign=" " tone="context" />
        ))}
      </>,
      "border-l-2 border-l-muted-foreground/30",
    );
  }

  // Pending → the diff + resolve controls.
  return wrap(
    <>
      <div className="flex items-center gap-1 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
        <span className="font-medium">Change {hunk.index + 1}</span>
        <span className="text-green-600 dark:text-green-400">
          +{hunk.added.length}
        </span>
        <span className="text-red-600 dark:text-red-400">
          −{hunk.removed.length}
        </span>
        <div className="ml-auto flex items-center overflow-hidden rounded border border-border">
          <button
            type="button"
            onClick={() => resolve(hunk.index, "applied")}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-green-600 hover:text-white"
            title="Accept — take the new lines"
          >
            <Check className="h-3 w-3" /> Accept
          </button>
          <button
            type="button"
            onClick={() => resolve(hunk.index, "rejected")}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-red-600 hover:text-white"
            title="Reject — keep the old lines"
          >
            <X className="h-3 w-3" /> Reject
          </button>
        </div>
      </div>
      {hunk.removed.map((t, i) => (
        <Line key={`r${i}`} text={t} sign="-" tone="removed" />
      ))}
      {hunk.added.map((t, i) => (
        <Line key={`a${i}`} text={t} sign="+" tone="added" />
      ))}
    </>,
    "",
  );
}

export default DiffReview;
