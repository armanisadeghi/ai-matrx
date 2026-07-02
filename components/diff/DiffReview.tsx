"use client";

// components/diff/DiffReview.tsx
//
// Interactive per-hunk merge on the canonical light diff engine. Turns a
// read-only comparison into an editing tool: the user accepts (take the new
// lines) or rejects (keep the old lines) each hunk, sees the running result,
// and Applies — which hands the merged text back via onApply.
//
// Headless of any source: the caller owns what "apply" means (write to a note,
// a code file, a context value…). It fills its container like the other diff
// cores. For a plain read-only diff use DiffViewer; use THIS when the user
// should selectively merge changes.

import { useEffect, useMemo, useState } from "react";
import { Check, X, GitMerge, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { computeTextDiff } from "./text/engine/computeTextDiff";
import { applyHunks } from "./text/engine/hunks";
import { GUTTER, LINE_BG } from "./text/diffColors";
import type { TextDiffOptions } from "./text/engine/types";

type RenderItem =
  | { kind: "context"; content: string }
  | { kind: "hunk"; index: number; removed: string[]; added: string[] };

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

function buildItems(
  original: string,
  modified: string,
  diffOptions?: TextDiffOptions,
): RenderItem[] {
  const { inline } = computeTextDiff(original, modified, diffOptions);
  const items: RenderItem[] = [];
  let i = 0;
  let hunkIndex = 0;
  while (i < inline.length) {
    const line = inline[i];
    if (line.type === "unchanged") {
      items.push({ kind: "context", content: line.content });
      i++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    while (i < inline.length && inline[i].type !== "unchanged") {
      if (inline[i].type === "removed") removed.push(inline[i].content);
      else added.push(inline[i].content);
      i++;
    }
    items.push({ kind: "hunk", index: hunkIndex, removed, added });
    hunkIndex++;
  }
  return items;
}

function Line({
  text,
  sign,
  tone,
  dim,
}: {
  text: string;
  sign: "+" | "-" | " ";
  tone: "added" | "removed" | "context";
  dim: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start font-mono text-xs leading-relaxed",
        tone === "added" && LINE_BG.added,
        tone === "removed" && LINE_BG.removed,
        dim && "opacity-40",
      )}
    >
      <span
        className={cn(
          "select-none shrink-0 w-4 text-center",
          tone === "added" && GUTTER.added,
          tone === "removed" && GUTTER.removed,
          tone === "context" && "text-transparent",
        )}
      >
        {sign}
      </span>
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
  const items = useMemo(
    () => buildItems(original, modified, diffOptions),
    [original, modified, diffOptions],
  );
  const hunkCount = items.reduce((n, it) => (it.kind === "hunk" ? n + 1 : n), 0);

  // Default: accept every hunk (result === modified). Reset when the inputs
  // change so a reused instance never carries stale decisions.
  const [accepted, setAccepted] = useState<Set<number>>(
    () => new Set(Array.from({ length: hunkCount }, (_, i) => i)),
  );
  useEffect(() => {
    setAccepted(new Set(Array.from({ length: hunkCount }, (_, i) => i)));
  }, [hunkCount, original, modified]);

  const merged = useMemo(
    () => applyHunks(original, modified, accepted, diffOptions),
    [original, modified, accepted, diffOptions],
  );

  const setDecision = (index: number, accept: boolean) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      if (accept) next.add(index);
      else next.delete(index);
      return next;
    });

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

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-2 py-1 text-xs">
        <span className="font-medium text-muted-foreground">
          {accepted.size}/{hunkCount} changes accepted
        </span>
        <button
          type="button"
          onClick={() =>
            setAccepted(new Set(Array.from({ length: hunkCount }, (_, i) => i)))
          }
          className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Accept all
        </button>
        <button
          type="button"
          onClick={() => setAccepted(new Set())}
          className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Reject all
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
        >
          <GitMerge className="h-3.5 w-3.5" />
          {applyLabel ?? `Apply ${accepted.size} change${accepted.size === 1 ? "" : "s"}`}
        </Button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {items.map((it, idx) => {
          if (it.kind === "context") {
            return (
              <Line
                key={`c${idx}`}
                text={it.content}
                sign=" "
                tone="context"
                dim={false}
              />
            );
          }
          const isAccepted = accepted.has(it.index);
          return (
            <div key={`h${it.index}`} className="my-1 border-y border-border/60">
              <div className="flex items-center gap-1 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                <span className="font-medium">Change {it.index + 1}</span>
                <span className="text-green-600 dark:text-green-400">
                  +{it.added.length}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  −{it.removed.length}
                </span>
                <div className="flex-1" />
                <div className="flex items-center overflow-hidden rounded border border-border">
                  <button
                    type="button"
                    onClick={() => setDecision(it.index, true)}
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 transition-colors",
                      isAccepted
                        ? "bg-green-600 text-white"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                    title="Take the new lines"
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision(it.index, false)}
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 transition-colors",
                      !isAccepted
                        ? "bg-red-600 text-white"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                    title="Keep the old lines"
                  >
                    <X className="h-3 w-3" />
                    Reject
                  </button>
                </div>
              </div>
              {it.removed.map((text, k) => (
                <Line
                  key={`r${k}`}
                  text={text}
                  sign="-"
                  tone="removed"
                  dim={isAccepted}
                />
              ))}
              {it.added.map((text, k) => (
                <Line
                  key={`a${k}`}
                  text={text}
                  sign="+"
                  tone="added"
                  dim={!isAccepted}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DiffReview;
