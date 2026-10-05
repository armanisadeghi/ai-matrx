"use client";

import { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseRecipeMarkdown } from "@/components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown";
import {
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";
import { useBlockState } from "@/features/block-state/useBlockState";
import type { RecipeState } from "@/components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay";
import RecipeViewer from "@/components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay";
import type { ArtifactRendererProps } from "../types";
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
  conversationId,
  messageId,
  blockIndex,
}: ArtifactRendererProps) {
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

  // Answer state also rides the next message as one interaction chip (the
  // shape interaction seam); view state never does.
  const { state, loaded, patch: save } = useBlockState<
    RecipeState & Record<string, unknown>
  >({ title: (recipe as { title?: string } | null)?.title ?? null, data: recipe });

  if (!recipe) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  // Wait for persisted state to load before rendering so initialState seeds correctly.
  if (!loaded) {
    return <MatrxMiniLoader />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <RecipeViewer
        recipe={recipe}
        taskId={artifactDedupKey(taskId, artifactId)}
        artifactId={artifactId}
        conversationId={conversationId}
        messageId={messageId}
        blockIndex={blockIndex}
        initialState={state ?? undefined}
        onStateChange={save as (state: RecipeState) => void}
      />
    </Suspense>
  );
}
