"use client";

/**
 * AnimatedDiffReveal — a human, single-pane diff reader that, when LIVE,
 * animates a known edit landing: the removed span tints destructive (struck),
 * the new text fills into its place tinted success, surrounding text stays
 * plain. When not live (persisted / reloaded) it renders the final diff
 * instantly — no animation.
 *
 * This is the owner's exact mental model for a patch tool: "render the content,
 * highlight the section the agent is removing, then fill it in as the stream
 * comes in." Since an agent patch arrives WHOLE at tool start (the model has
 * already told us old → new), the "stream" is a client-side paced reveal
 * (`useDiffReveal`), not a wait on the backend.
 *
 * It reuses the canonical text-diff engine (`computeTextDiff` + word/char
 * segments) — NOT a hand-rolled or GitHub-style side-by-side. We render the
 * engine's `inline` representation in a compact single-pane reader form: no +/−
 * gutter, no line numbers, no monospace. Removed runs are struck + destructive;
 * added runs are success; an inserted word does NOT mark the rest of the line —
 * the engine's word-level segments classify that correctly.
 *
 * Colors are the standard semantic tokens only: `text-destructive` /
 * `bg-destructive` and `text-success` / `bg-success` (with low-alpha fills), so
 * it themes with the app and never goes off-palette.
 */

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { computeTextDiff } from "./engine/computeTextDiff";
import type { InlineDiffLine, WordSegment } from "./engine/types";
import { useDiffReveal, type DiffRevealOptions } from "./useDiffReveal";

export interface AnimatedDiffRevealProps {
  /** The text before the edit (the diff's left side). */
  before: string;
  /** The text after the edit (the diff's right side / final). */
  after: string;
  /**
   * Live animation control. When `active` is false the final diff renders
   * immediately. Other options pace the reveal — see `DiffRevealOptions`.
   */
  reveal: DiffRevealOptions;
  /** Optional className for the scroll container. */
  className?: string;
}

const ADDED_RUN =
  "rounded-[2px] bg-success/15 text-success-foreground/90 dark:bg-success/25";
const REMOVED_RUN =
  "rounded-[2px] bg-destructive/12 text-destructive line-through decoration-destructive/50 dark:bg-destructive/25";

/** Render one inline diff line as flowing prose with tinted runs. */
function renderInlineLine(line: InlineDiffLine): React.ReactNode {
  const segments = line.segments;
  // Word/char segments present (a modified line) → tint per run.
  if (segments && segments.length > 0) {
    return segments.map((seg: WordSegment, i) => {
      if (seg.type === "unchanged") return <span key={i}>{seg.value}</span>;
      if (seg.type === "added") {
        return (
          <span key={i} className={ADDED_RUN}>
            {seg.value}
          </span>
        );
      }
      return (
        <span key={i} className={REMOVED_RUN}>
          {seg.value}
        </span>
      );
    });
  }
  // Whole-line add / remove (no intra-line segments).
  const content = line.content === "" ? " " : line.content;
  if (line.type === "added") {
    return <span className={ADDED_RUN}>{content}</span>;
  }
  if (line.type === "removed") {
    return <span className={REMOVED_RUN}>{content}</span>;
  }
  return content;
}

export function AnimatedDiffReveal({
  before,
  after,
  reveal,
  className,
}: AnimatedDiffRevealProps) {
  const frame = useDiffReveal(before, after, reveal);

  const result = useMemo(
    () => computeTextDiff(frame.before, frame.modified),
    [frame.before, frame.modified],
  );

  return (
    <div
      className={cn(
        "whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground",
        className,
      )}
      // Mark the live phase so callers / tests can observe the animation state.
      data-diff-phase={frame.phase}
      data-diff-revealing={frame.isRevealing ? "true" : "false"}
    >
      {result.inline.map((line, i) => (
        <div key={i} className="min-h-[1.25rem]">
          {renderInlineLine(line)}
        </div>
      ))}
    </div>
  );
}

export default AnimatedDiffReveal;
