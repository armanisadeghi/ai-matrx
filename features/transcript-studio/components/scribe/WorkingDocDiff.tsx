"use client";

/**
 * WorkingDocDiff — "what the agent last changed" viewer for a working document.
 *
 * DEFAULT view is a SINGLE-PANE rendering of the document with the agent's
 * new/changed regions highlighted inline (the canonical light diff engine's
 * "highlight" view) — not the standard two-pane diff. The engine's own toolbar
 * exposes the click-through to the full split / inline two-pane views for
 * comparing versions. The actual diffing is done entirely by the canonical
 * `DiffViewer` core (`components/diff`) — this component is only chrome + the
 * accept/dismiss affordance.
 *
 * Generic and opt-in: it takes plain before/after strings, so both the Scribe
 * working-doc surface and the War Room tile share it through
 * WorkingDocumentHeader. Render it only when a real before-snapshot and a newer
 * after exist (see useWorkingDocChanges).
 */

import { Check, GitCompare, X } from "lucide-react";
import { DiffViewer } from "@/components/diff/DiffViewer";
import {
  computeTextDiff,
  summarizeTextDiff,
} from "@/components/diff/text/engine/computeTextDiff";

interface WorkingDocDiffProps {
  /** Document content the user last saw (the "before"). */
  before: string;
  /** Current document content after the agent's edit (the "after"). */
  after: string;
  /** Optional document title for the header. */
  title?: string | null;
  /** Dismiss without acknowledging (keeps the change flagged). */
  onClose: () => void;
  /**
   * Acknowledge the change as seen, then close. When omitted only Close is
   * shown. "Keep changes" — the agent's edits already live in the doc; this
   * just clears the "unseen" marker (it does not write or revert anything).
   */
  onAccept?: () => void;
}

export function WorkingDocDiff({
  before,
  after,
  title,
  onClose,
  onAccept,
}: WorkingDocDiffProps) {
  const summary = summarizeTextDiff(computeTextDiff(before, after).stats);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-textured">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-12 w-full items-center gap-2">
          <GitCompare className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {title?.trim() || "Working document"} — changes
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              The agent&apos;s new and changed text is highlighted. Toggle Split
              or Inline above to compare versions.
            </span>
          </div>
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
            {summary}
          </span>
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground active:opacity-90"
            >
              <Check className="h-4 w-4" />
              Keep changes
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close changes"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-foreground active:bg-accent"
          >
            <X className="h-4 w-4" />
            Close
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <DiffViewer
          original={before}
          modified={after}
          engine="light"
          language="markdown"
          originalLabel="Before"
          modifiedLabel="After (agent's edit)"
          defaultView="highlight"
          className="flex-1 min-w-0"
        />
      </div>
    </div>
  );
}
