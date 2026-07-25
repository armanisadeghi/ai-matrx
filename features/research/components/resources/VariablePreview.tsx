"use client";

/**
 * VARIABLE PREVIEW — the entry point to "show me exactly what the agent gets".
 *
 * This is deliberately just a launcher now. The preview itself lives in a full
 * window panel (`researchContextPreviewWindow`), because the thing being
 * previewed is a markdown document of hundreds of thousands of characters and
 * a human has to actually READ it: an "Everything" view alongside the
 * per-variable ones, rendered/raw/split, and the standard content actions
 * (Save to Notes, task, download, full-screen editor).
 *
 * The earlier inline version — collapsible strips in a 22rem sidebar rendering
 * `<pre>` text one variable at a time — could not answer the question it
 * existed to answer.
 */

import { Eye, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTokens } from "@/lib/tokens/estimate";
import { useOpenResearchContextPreview } from "@/features/overlays/openers/researchContextPreviewWindow";
import type { ContextBundle } from "../../resources/types";

interface VariablePreviewProps {
  topicId: string;
  bundle: ContextBundle;
  /** Topic name — seeds the save/export names in the action bar. */
  title?: string;
  /** Estimated tokens for the current selection, shown on the button. */
  estimatedTokens: number;
  disabled?: boolean;
}

export function VariablePreview({
  topicId,
  bundle,
  title,
  estimatedTokens,
  disabled,
}: VariablePreviewProps) {
  const openPreview = useOpenResearchContextPreview();

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-full justify-start gap-1.5 text-xs"
        disabled={disabled || bundle.selectors.length === 0}
        onClick={() => openPreview({ topicId, bundle, title })}
      >
        <Eye className="h-3.5 w-3.5" />
        Preview the full context
        {estimatedTokens > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            ~{formatTokens(estimatedTokens)}
            <Maximize2 className="h-3 w-3" />
          </span>
        )}
      </Button>
      <p className="px-0.5 text-[10px] text-muted-foreground">
        Opens a full window: every variable, rendered or raw, with the usual
        save actions.
      </p>
    </div>
  );
}
