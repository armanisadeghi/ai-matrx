"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseRecipeMarkdown } from "@/components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown";
import {
  type ArtifactRendererProps,
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";
import { useArtifactState } from "../persistence/useArtifactState";
import type { RecipeState } from "@/components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay";

const RecipeViewer = lazy(
  () => import("@/components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay"),
);

/**
 * Unified renderer for `recipe` (cooking_recipe) artifacts — the ONE renderer
 * used by chat, canvas, and artifact-card surfaces. Resolves the payload
 * (serverData ?? canvas object ?? parsed raw markdown) and renders the real
 * RecipeViewer.
 */
export default function RecipeArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const { state, loaded, save } = useArtifactState<
    RecipeState & Record<string, unknown>
  >(artifactId, "generic");

  const recipe = useMemo(
    () =>
      resolveMarkdownPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: parseRecipeMarkdown,
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!recipe) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  // Wait for persisted state to load before rendering so initialState seeds correctly.
  if (artifactId && !loaded) {
    return <MatrxMiniLoader />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <RecipeViewer
        recipe={recipe}
        taskId={artifactDedupKey(taskId, artifactId)}
        initialState={state ?? undefined}
        onStateChange={save as (state: RecipeState) => void}
      />
    </Suspense>
  );
}
