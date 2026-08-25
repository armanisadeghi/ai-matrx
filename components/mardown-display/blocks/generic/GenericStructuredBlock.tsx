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

import React, { useEffect } from "react";
import { Braces } from "lucide-react";
import { GenericStructuredView } from "@ai-matrx/content-ir-react";
import { reconstructRegionValue } from "@ai-matrx/content-ir";
import { ContentIrHostBoundary } from "@/features/content-ir/host/ContentIrHostBoundary";
import { readIrRouteMarker } from "@/features/content-ir/react/kind-route";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";
import { reportKindComponentIncident } from "@/features/content-ir/react/db-component/kindComponentIncident";
import { StructuredValueTabs } from "./StructuredValueTabs";

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

/**
 * REACHING THIS BLOCK IS THE SIGNAL. A registered kind rendered here means the
 * reader got a key/value dump instead of a component — the most common reason a
 * Shape looks bad in front of a user, and one nobody ever learned about because
 * it throws nothing. The server-side generic-floor alarm has filed this exact
 * `error_type` for months, but the server only sees ITS OWN render paths; the
 * overwhelming majority of renders happen in this browser. So the browser files
 * the other half. Deduped per session and again per (kind, error_type,
 * platform, role) in the RPC, so a kind seen by a thousand readers is ONE
 * incident with a count — and production-only, so authoring noise stays out.
 */
function useGenericFloorAlarm(metadata: Record<string, unknown> | undefined) {
  const kind = readEnvelope(metadata)?.root.kind ?? null;
  const reason = readIrRouteMarker(metadata)?.reason ?? null;
  useEffect(() => {
    if (!kind) return;
    reportKindComponentIncident({
      kind,
      errorType: "generic_floor_render",
      message:
        `"${kind}" rendered through the GENERIC structured viewer` +
        (reason === "inactive"
          ? " — a component row exists but is held is_active=false."
          : " — no component is bound, so the reader sees a key/value dump."),
    });
  }, [kind, reason]);
}

const GenericStructuredBlock: React.FC<GenericStructuredBlockProps> = (
  props,
) => {
  useGenericFloorAlarm(props.metadata);
  // The JSON tab's ground truth: the envelope's zero-loss value when one
  // survived, else the raw region source.
  const envelope = readEnvelope(props.metadata);
  const value = envelope ? reconstructRegionValue(envelope) : undefined;
  return (
    <ContentIrHostBoundary>
      <StructuredValueTabs value={value} raw={props.content}>
        <GenericStructuredView {...props} streamingIndicator={StillArriving} />
      </StructuredValueTabs>
    </ContentIrHostBoundary>
  );
};

export default GenericStructuredBlock;
