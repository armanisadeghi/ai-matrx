"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { safeJsonParse } from "@/components/mardown-display/chat-markdown/block-registry/json-parse-utils";
import {
  type ArtifactRendererProps,
  resolveJsonPayload,
} from "../artifact-renderers";

// Canvas mode: spreads math_problem fields directly — matches CanvasBody:
//   `<MathProblem id="canvas-preview" {...data.math_problem} />`
const MathProblem = lazy(
  () => import("@/features/math/components/MathProblem"),
);

// Inline / artifact mode: accepts the full `{ math_problem: {...} }` payload —
// matches BlockRenderer: `<MathProblemBlock problemData={block.serverData} />`
const MathProblemBlock = lazy(
  () => import("@/components/mardown-display/blocks/math/MathProblemBlock"),
);

/**
 * Unified renderer for `math_problem` (canvasType "math_problem") artifacts.
 *
 * Payload shape: `{ math_problem: { title, problem_statement, solutions, … } }`
 *
 * - mode === "canvas": `<MathProblem id="canvas-preview" {...payload.math_problem} />`
 * - else:             `<MathProblemBlock problemData={payload} />`
 */
export default function MathProblemArtifact({
  raw,
  data,
  serverData,
  isStreamActive,
  mode,
}: ArtifactRendererProps) {
  const payload = useMemo(
    () =>
      resolveJsonPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: (s) => safeJsonParse(s),
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!payload) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  if (mode === "canvas") {
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <MathProblem id="canvas-preview" {...(payload as any).math_problem} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <MathProblemBlock problemData={payload as any} />
    </Suspense>
  );
}
