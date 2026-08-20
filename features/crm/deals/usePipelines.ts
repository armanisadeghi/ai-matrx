"use client";

// features/crm/deals/usePipelines.ts
//
// The pipelines + stages for the deal surfaces — `deal_pipeline` category rows
// (top-level = pipeline, children = stages) read through the CANONICAL
// category hook (`useCategories` → `cat_list`), never a direct
// platform.categories read, then shaped into pipeline trees.

import { useMemo } from "react";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import type { DealPipeline, DealStage } from "./types";
import { buildPipelines } from "./types";

export interface UsePipelinesResult {
  pipelines: DealPipeline[];
  /** Loading state passthrough from the categories cache. */
  isLoading: boolean;
  error: string | null;
  /** Stage lookup across every pipeline (board cells, list cells, history). */
  stageById: Map<string, DealStage>;
  pipelineById: Map<string, DealPipeline>;
}

export function usePipelines(): UsePipelinesResult {
  const { categories, status, error } = useCategories({
    dimension: "deal_pipeline",
  });

  return useMemo(() => {
    const pipelines = buildPipelines(categories);
    const stageById = new Map<string, DealStage>();
    const pipelineById = new Map<string, DealPipeline>();
    for (const p of pipelines) {
      pipelineById.set(p.id, p);
      for (const s of p.stages) stageById.set(s.id, s);
    }
    return {
      pipelines,
      isLoading: status === "idle" || status === "loading",
      error,
      stageById,
      pipelineById,
    };
  }, [categories, status, error]);
}
