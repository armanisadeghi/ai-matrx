"use client";

// CleanupStagedDiff — unified diff with per-hunk accept/reject staging.
// Each change "hunk" carries its own toggle; unchanged runs collapse. Reading
// from the same segment model the apply uses, so what you stage is exactly
// what gets written.

import { useState } from "react";
import { Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  DiffLine,
  DiffSegment,
} from "@/lib/content-cleanup/staging";

const COLLAPSE_THRESHOLD = 6;

interface CleanupStagedDiffProps {
  segments: DiffSegment[];
  acceptedHunks: ReadonlySet<number>;
  onToggleHunk: (index: number, accepted: boolean) => void;
}

/** Render one diff line's text with word-level highlights for its side. */
function LineText({ line, side }: { line: DiffLine; side: "removed" | "added" }) {
  if (line.content === "") {
    return <span className="italic text-muted-foreground/50">blank line</span>;
  }
  if (!line.segments || line.segments.length === 0) {
    return <>{line.content}</>;
  }
  return (
    <>
      {line.segments.map((seg, i) => {
        if (seg.type === "unchanged") return <span key={i}>{seg.value}</span>;
        if (seg.type !== side) return null;
        return (
          <span
            key={i}
            className={cn(
              "rounded-[2px]",
              side === "removed"
                ? "bg-red-300/60 dark:bg-red-500/40"
                : "bg-green-300/60 dark:bg-green-500/40",
            )}
          >
            {seg.value}
          </span>
        );
      })}
    </>
  );
}

function GutterLine({
  num,
  sign,
  tone,
  children,
}: {
  num: number | null;
  sign: string;
  tone: "removed" | "added" | "unchanged";
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[3rem_1.25rem_1fr] text-xs">
      <div className="px-2 py-0.5 border-r border-border/60 text-right font-mono tabular-nums text-muted-foreground/50">
        {num ?? ""}
      </div>
      <div
        className={cn(
          "py-0.5 text-center font-mono select-none",
          tone === "removed" && "text-red-600 dark:text-red-400",
          tone === "added" && "text-green-600 dark:text-green-400",
          tone === "unchanged" && "text-transparent",
        )}
      >
        {sign}
      </div>
      <div
        className={cn(
          "px-2 py-0.5 whitespace-pre-wrap break-words font-mono",
          tone === "removed" &&
            "bg-red-50 text-red-700 dark:bg-red-950/25 dark:text-red-300",
          tone === "added" &&
            "bg-green-50 text-green-700 dark:bg-green-950/25 dark:text-green-300",
          tone === "unchanged" && "text-foreground/70",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function UnchangedBlock({ lines }: { lines: DiffLine[] }) {
  const [expanded, setExpanded] = useState(false);
  if (lines.length <= COLLAPSE_THRESHOLD || expanded) {
    return (
      <>
        {lines.map((l, i) => (
          <GutterLine key={i} num={l.newLineNumber} sign="" tone="unchanged">
            {l.content === "" ? " " : l.content}
          </GutterLine>
        ))}
        {expanded && lines.length > COLLAPSE_THRESHOLD && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex w-full items-center justify-center gap-1 py-1 text-[0.625rem] text-muted-foreground hover:bg-accent/40"
          >
            <ChevronRight className="h-3 w-3" /> Collapse {lines.length} unchanged
            lines
          </button>
        )}
      </>
    );
  }
  const head = lines.slice(0, 2);
  const tail = lines.slice(-2);
  const hidden = lines.length - 4;
  return (
    <>
      {head.map((l, i) => (
        <GutterLine key={`h${i}`} num={l.newLineNumber} sign="" tone="unchanged">
          {l.content === "" ? " " : l.content}
        </GutterLine>
      ))}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-center gap-1 py-1 text-[0.625rem] text-muted-foreground hover:bg-accent/40"
      >
        <ChevronDown className="h-3 w-3" /> {hidden} unchanged line
        {hidden !== 1 ? "s" : ""}
      </button>
      {tail.map((l, i) => (
        <GutterLine key={`t${i}`} num={l.newLineNumber} sign="" tone="unchanged">
          {l.content === "" ? " " : l.content}
        </GutterLine>
      ))}
    </>
  );
}

function HunkBlock({
  index,
  removed,
  added,
  accepted,
  onToggle,
}: {
  index: number;
  removed: DiffLine[];
  added: DiffLine[];
  accepted: boolean;
  onToggle: (index: number, accepted: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "my-1 overflow-hidden rounded-md border",
        accepted
          ? "border-border"
          : "border-dashed border-border/60 opacity-60",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-2 py-1">
        <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Change {index + 1}
        </span>
        <span className="text-[0.625rem] text-muted-foreground">
          {accepted ? "will apply" : "kept as original"}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onToggle(index, true)}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors",
              accepted
                ? "bg-green-600 text-white"
                : "text-muted-foreground hover:bg-accent",
            )}
            aria-pressed={accepted}
          >
            <Check className="h-3 w-3" /> Accept
          </button>
          <button
            type="button"
            onClick={() => onToggle(index, false)}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors",
              !accepted
                ? "bg-muted-foreground/80 text-white"
                : "text-muted-foreground hover:bg-accent",
            )}
            aria-pressed={!accepted}
          >
            <X className="h-3 w-3" /> Reject
          </button>
        </div>
      </div>
      <div>
        {removed.map((l, i) => (
          <GutterLine key={`r${i}`} num={l.oldLineNumber} sign="-" tone="removed">
            <LineText line={l} side="removed" />
          </GutterLine>
        ))}
        {added.map((l, i) => (
          <GutterLine key={`a${i}`} num={l.newLineNumber} sign="+" tone="added">
            <LineText line={l} side="added" />
          </GutterLine>
        ))}
      </div>
    </div>
  );
}

export function CleanupStagedDiff({
  segments,
  acceptedHunks,
  onToggleHunk,
}: CleanupStagedDiffProps) {
  return (
    <div className="rounded-md border border-border bg-card">
      {segments.map((seg, i) => {
        if (seg.kind === "unchanged") {
          return <UnchangedBlock key={`u${i}`} lines={seg.lines} />;
        }
        return (
          <HunkBlock
            key={`hunk-${seg.index}`}
            index={seg.index}
            removed={seg.removed}
            added={seg.added}
            accepted={acceptedHunks.has(seg.index)}
            onToggle={onToggleHunk}
          />
        );
      })}
    </div>
  );
}
