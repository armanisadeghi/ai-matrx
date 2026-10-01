"use client";

// components/official/structured-value/KindValueFrontDoor.tsx
//
// THE ONE FRONT DOOR from a raw leaf to the value door. The bottom-layer
// refusals (CodeBlock, the JSON viewers, the value grid, the unknown-event
// card, the JSON card) run the tiny detector synchronously and render this
// only when it says "kind" — so a plain code block or JSON tree never pulls
// the kind stack into its chunk (code-splitting skill, Method B: one shared
// edge, `React.lazy` per the Fragmentation Law, never one `dynamic()` per
// leaf). Measured with `scripts/build-lab/graph-report.ts` closures.

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { AnswerValueViewProps } from "@/components/official/structured-value/AnswerValueView";

const KindValueRenderImpl = lazy(
  () => import("@/components/official/structured-value/KindValueRenderImpl"),
);

export function KindValueFrontDoor(props: AnswerValueViewProps) {
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <KindValueRenderImpl {...props} />
    </Suspense>
  );
}

export default KindValueFrontDoor;
