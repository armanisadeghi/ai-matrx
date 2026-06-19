"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { ArtifactRendererProps } from "../artifact-renderers";

const ReactCodeBlock = lazy(
  () => import("@/features/dynamic-react/ReactCodeBlock"),
);
const CodeBlock = lazy(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
);

/**
 * Unified renderer for `react` artifacts — a live React component from a
 * ```react / ```jsx / ```tsx fence. A component IS the deliverable, so it
 * materializes (render-by-id, no re-creation).
 *
 * OWNER view → ReactCodeBlock (compiles + runs the component, allowlist-scoped,
 * in-app — the same live behavior as inline chat).
 * PUBLIC view → read-only CodeBlock. NEVER execute attacker-authored React in an
 * anonymous visitor's session.
 */
export default function ReactArtifact({
  raw,
  data,
  isStreamActive,
  isPublic,
}: ArtifactRendererProps) {
  const code =
    typeof data === "string"
      ? data
      : ((data as { code?: string })?.code ?? raw ?? "");
  if (!code) return null;

  if (isPublic) {
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <CodeBlock code={code} language="tsx" fontSize={14} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <ReactCodeBlock
        code={code}
        language="react"
        isComplete={!isStreamActive}
      />
    </Suspense>
  );
}
