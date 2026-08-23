"use client";

/**
 * The Matrix binding of the OFFICIAL fallback renderer for a resolved `__kind`
 * block that has no registered component (Shape System ruling R6).
 *
 * The view lives in `@ai-matrx/content-ir-react` (`GenericStructuredView`):
 * envelope-first value recovery, the honest "no custom view yet" / "registered
 * but held inactive" distinction, and the zero-data-loss verbatim backstop when
 * nothing parsed. Its body renders through THIS app's structured-value floor
 * (`StructuredValueView`) via the host seam — the reason a Study Pack step is a
 * readable document instead of a JSON dump.
 *
 * Bare by construction (THE WRAPPER LAW): every host that routes a block here
 * already draws chrome.
 */

import React from "react";
import { Braces } from "lucide-react";
import { GenericStructuredView } from "@ai-matrx/content-ir-react";
import { ContentIrHostBoundary } from "@/features/content-ir/host/ContentIrHostBoundary";

export interface GenericStructuredBlockProps {
  /** The raw region source — the zero-loss floor when no envelope survived. */
  content: string;
  /** Carries `__ir` (the parsed envelope) and `__ir_route` (the seam marker). */
  metadata?: Record<string, unknown>;
  className?: string;
}

const StillArriving = (
  <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
    <Braces className="h-3.5 w-3.5 shrink-0 animate-pulse" />
    <span>Still arriving…</span>
  </div>
);

const GenericStructuredBlock: React.FC<GenericStructuredBlockProps> = (
  props,
) => (
  <ContentIrHostBoundary>
    <GenericStructuredView {...props} streamingIndicator={StillArriving} />
  </ContentIrHostBoundary>
);

export default GenericStructuredBlock;
