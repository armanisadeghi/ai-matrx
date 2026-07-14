"use client";

// features/education/memory/useGenerateMemoryAid.ts
//
// Run the Study Memory Aid Generator agent → get a `memory_aid` envelope back
// (mnemonics + analogies + memory palace). A thin hook shell over the shared
// `runAgentExtraction` primitive (the same launch+poll the converter generators
// use) — NOT a re-implementation of the launch/poll dance. The caller persists
// the result to study_media and renders it via MemoryAidView.
//
// React Compiler is on: no manual memo.

import { useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { runAgentExtraction } from "@/features/education/convert/runAgentExtraction";
import { EDU_MEMORY_AGENTS } from "./agents";
import { coerceMemoryAid, type MemoryAidPayload } from "./types";

const EXTRACTION_TIMEOUT_MS = 120_000;

export interface MemoryAidVariables {
  source_content: string;
  title: string;
  focus?: string;
}

export interface GenerateMemoryAidResult {
  generate: (vars: MemoryAidVariables) => Promise<MemoryAidPayload>;
  isGenerating: boolean;
  error: string | null;
}

export function useGenerateMemoryAid(): GenerateMemoryAidResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(vars: MemoryAidVariables): Promise<MemoryAidPayload> {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await runAgentExtraction(dispatch, store, {
        agentId: EDU_MEMORY_AGENTS.memoryAid,
        surfaceKey: "education-memory-create",
        // Reuses the "converter one-shot generation" source-feature tag (this is
        // a runAgentExtraction generation, same family as the ingest fan-out).
        sourceFeature: "education-ingest",
        variables: {
          source_content: vars.source_content,
          title: vars.title,
          focus: vars.focus ?? "",
        },
        timeoutMs: EXTRACTION_TIMEOUT_MS,
      });
      const payload = coerceMemoryAid(res.value);
      if (!payload) {
        throw new Error(
          "The memory-aid agent finished but produced no usable aids — try a richer source.",
        );
      }
      return payload;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to generate memory aids";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  return { generate, isGenerating, error };
}
