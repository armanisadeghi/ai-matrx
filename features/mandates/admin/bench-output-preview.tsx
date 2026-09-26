"use client";

/**
 * ONE renderer for a bench run's output — shared by the batch result rows, the
 * reference-output disclosure and the ad-hoc "Try it now" panel.
 *
 * Results are ALWAYS drawn by the canonical answer view (Arman, 2026-09-25:
 * "results always in the canonical viewer, never raw"): a kinded artifact by
 * its kind's own component, a structure by `StructuredValueView`, a file URL by
 * `InlineMediaRef`, text as settled markdown — `AnswerValueView`, the same view
 * a member's Test tab uses. It used to print `JSON.stringify` into a `<pre>`
 * cut off at 3,200 characters.
 *
 * The box is bounded so a long answer never pushes the bench off screen; the
 * whole answer is one click away in the Details window, which renders through
 * the same view, so nothing is ever cut off.
 */

import { Maximize2 } from "lucide-react";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { useOpenStructuredValueWindow } from "@/features/overlays/openers/structuredValueWindow";

export function OutputPreview({
  output,
  artifact,
  outputKind = null,
  title = "Test result",
}: {
  output: string;
  artifact: unknown;
  /** The mandate's declared output kind. Default: the artifact's own `__kind`. */
  outputKind?: string | null;
  /** What the window calls this answer. */
  title?: string;
}) {
  const openWindow = useOpenStructuredValueWindow();
  const hasStructure = artifact != null && typeof artifact === "object";
  const hasAnswer = hasStructure || output.trim().length > 0;
  return (
    <div className="relative rounded-md border border-border">
      {hasAnswer ? (
        <button
          type="button"
          className="absolute right-1 top-1 z-10 inline-flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() =>
            openWindow({
              value: hasStructure ? artifact : output,
              title,
            })
          }
          aria-label={`Open the whole ${title.toLowerCase()} in a window`}
        >
          <Maximize2 className="h-3 w-3" aria-hidden />
          Open
        </button>
      ) : null}
      <div className="max-h-80 overflow-auto p-2">
        <AnswerValueView
          value={hasStructure ? artifact : undefined}
          text={output}
          kind={outputKind}
        />
      </div>
    </div>
  );
}
