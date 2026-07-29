"use client";

import { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseDecisionTreeJSON } from "@/components/mardown-display/blocks/decision-tree/parseDecisionTreeJSON";
import { resolveJsonPayload, artifactDedupKey } from "../artifact-renderers";
import { useArtifactState } from "../persistence/useArtifactState";
import type { DecisionTreeState } from "@/components/mardown-display/blocks/decision-tree/DecisionTreeBlock";
import DecisionTreeBlock from "@/components/mardown-display/blocks/decision-tree/DecisionTreeBlock";
import type { ArtifactRendererProps } from "../types";
/**
 * Unified renderer for `decision-tree` artifacts — the ONE renderer used by
 * chat, canvas, and artifact-card surfaces. Resolves the payload (serverData ??
 * canvas object ?? parsed raw JSON) and renders the real DecisionTreeBlock.
 *
 * `parseDecisionTreeJSON` takes a raw string; resolveJsonPayload passes the raw
 * string only once streaming is complete (parsing incomplete JSON yields
 * garbage), mirroring the legacy block-loading guard.
 */
export default function DecisionTreeArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const { state, loaded, save } = useArtifactState<
    DecisionTreeState & Record<string, unknown>
  >(artifactId, "generic");

  const decisionTree = useMemo(
    () =>
      resolveJsonPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: (s) => parseDecisionTreeJSON(s),
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!decisionTree) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  // Wait for persisted state to load before rendering so initialState seeds correctly.
  if (artifactId && !loaded) {
    return <MatrxMiniLoader />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <DecisionTreeBlock
        decisionTree={decisionTree}
        taskId={artifactDedupKey(taskId, artifactId)}
        initialState={state ?? undefined}
        onStateChange={save as (state: DecisionTreeState) => void}
      />
    </Suspense>
  );
}
