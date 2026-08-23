"use client";

/**
 * The Matrix binding of the provisional-render safety net and the "still
 * arriving" affordance (streaming partial kinds).
 *
 * Both live in `@ai-matrx/content-ir-react`: the boundary catches a component
 * that throws on a provisional value, SCREAMS to the Error Inspector, drops the
 * kind back to withhold for the session, and falls back to that kind's loading
 * skeleton; the frame rides a `ShimmerText` chip on the block's top edge with
 * no layout cost. Read the semantics there.
 */

import type { ReactNode } from "react";
import {
  ProvisionalKindBoundary as SharedProvisionalKindBoundary,
  ProvisionalKindFrame as SharedProvisionalKindFrame,
} from "@ai-matrx/content-ir-react";
import { ContentIrHostBoundary } from "../host/ContentIrHostBoundary";

export function ProvisionalKindBoundary(props: {
  kind: string;
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <ContentIrHostBoundary>
      <SharedProvisionalKindBoundary {...props} />
    </ContentIrHostBoundary>
  );
}

export function ProvisionalKindFrame({ children }: { children: ReactNode }) {
  return (
    <ContentIrHostBoundary>
      <SharedProvisionalKindFrame>{children}</SharedProvisionalKindFrame>
    </ContentIrHostBoundary>
  );
}
