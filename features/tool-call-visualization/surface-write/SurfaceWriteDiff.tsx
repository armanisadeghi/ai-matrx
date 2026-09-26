"use client";

/**
 * SurfaceWriteDiff — THE diff a tool card shows when an agent changed a surface.
 *
 * One component for every tool (Arman, 2026-09-26: "any tool that overwrites
 * [must] show a shared diff view"). It renders the surface-write receipt
 * (`readSurfaceWrite`) through the canonical `@ai-matrx/diff` viewer — never a
 * second diff engine:
 *
 *   - `TextDiff` (the package's light engine) for prose, markdown, JSON:
 *     word- and line-level highlights, unchanged context folded, prev/next
 *     change navigation, unified / split / changes views, light + dark tokens;
 *   - `DiffViewer` for code on a desktop, which routes large or code-language
 *     input to the registered Monaco renderer.
 *
 * Settings are knobs, never taste: the opening view is
 * `agents.tool_cards.diff_default_view` (unified | split | changes). A phone
 * always shows unified — a split diff at 375px is two unreadable columns.
 *
 * "Preview" shows the AFTER rendered through the ONE rich-content engine
 * (`MarkdownStream`) — the same renderer the note itself uses — in the diff's
 * own toolbar, so it adds no row to the card.
 *
 * Large content never freezes the transcript: the diff input is deferred
 * (`useDeferredValue`), so React renders the previous diff while a new one
 * computes, and the package engine caps its quadratic paths.
 */

import { useDeferredValue, useState } from "react";

import { DiffViewer, TextDiff, type TextDiffView } from "@ai-matrx/diff/react";
import MarkdownStream from "@/components/MarkdownStream";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { cn } from "@/lib/utils";

import { DIFF_VIEW_KNOB, diffLanguageOf, type SurfaceWriteReceipt } from "./readSurfaceWrite";


/** Knob value → the package's view name. Unknown / unresolved → unified. */
export function viewFromKnob(value: unknown): TextDiffView {
  if (value === "split") return "split";
  if (value === "changes") return "highlight";
  return "inline";
}

const MODE_LABEL: Record<SurfaceWriteReceipt["mode"], string> = {
  overwrite: "Replaced",
  patch: "Edited",
  append: "Added to end",
  prepend: "Added to start",
  insert: "Inserted",
  create: "Created",
  structured: "Updated fields",
};

export function SurfaceWriteDiff({
  receipt,
  className,
}: {
  receipt: SurfaceWriteReceipt;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const knobView = viewFromKnob(useSessionKnob(DIFF_VIEW_KNOB));
  const [chosenView, setChosenView] = useState<TextDiffView | null>(null);
  const [preview, setPreview] = useState(false);
  const view: TextDiffView = isMobile ? "inline" : (chosenView ?? knobView);

  const before = useDeferredValue(receipt.before);
  const after = useDeferredValue(receipt.after);
  const language = diffLanguageOf(receipt);
  const canPreview = receipt.contentFormat === "markdown" || receipt.contentFormat === "text";

  const slot = (
    <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span>{MODE_LABEL[receipt.mode] ?? "Changed"}</span>
      {receipt.truncated ? (
        <span
          className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
          title={`This change was ${receipt.beforeChars.toLocaleString()} → ${receipt.afterChars.toLocaleString()} characters; the diff shows the first part only. Open the item itself to see all of it.`}
        >
          shortened
        </span>
      ) : null}
      {canPreview ? (
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
          className={cn(
            "rounded px-1.5 py-0.5 font-medium hover:bg-muted hover:text-foreground",
            preview && "bg-muted text-foreground",
          )}
        >
          Preview
        </button>
      ) : null}
    </span>
  );

  return (
    <div
      data-surface-write-diff=""
      data-surface-write-mode={receipt.mode}
      className={cn("w-full overflow-hidden rounded-lg border border-border/60 bg-card text-[13px]", className)}
    >
      {preview ? (
        <div>
          <div className="flex items-center justify-end border-b border-border/60 px-2 py-1">{slot}</div>
          <div className="max-h-96 overflow-auto px-4 py-3">
            <MarkdownStream
              imagePolicy="ai"
              content={receipt.after}
              isStreamActive={false}
              hideCopyButton
              allowFullScreenEditor={false}
            />
          </div>
        </div>
      ) : language && !isMobile ? (
        <DiffViewer
          original={before}
          modified={after}
          language={language}
          engine="auto"
          defaultView={view === "split" ? "split" : "inline"}
          originalLabel="Before"
          modifiedLabel="After"
          className="max-h-96"
        />
      ) : (
        <TextDiff
          original={before}
          modified={after}
          originalLabel="Before"
          modifiedLabel="After"
          view={view}
          onViewChange={setChosenView}
          showLineNumbers={!isMobile}
          toolbarSlot={slot}
          className="max-h-96"
          ariaLabel={`What changed in ${receipt.targetLabel || receipt.targetType}`}
        />
      )}
    </div>
  );
}

export default SurfaceWriteDiff;
