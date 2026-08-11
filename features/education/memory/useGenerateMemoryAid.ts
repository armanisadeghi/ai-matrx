"use client";

// features/education/memory/useGenerateMemoryAid.ts
//
// Run the Study Memory Aid Generator agent → get a `memory_aid` envelope back
// (mnemonics + analogies + memory palace). A thin hook shell over the canonical
// `useFloatingAgentRun` primitive: the aids STREAM into the floating
// LiveRunWindow as they are written (THE FLOATING LAW — never a spinner while
// AI works). The caller persists the result to study_media and renders it via
// MemoryAidView.
//
// React Compiler is on: no manual memo.

import { useFloatingAgentRun } from "@/features/agents/hooks/useFloatingAgentRun";
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
  const { run, isRunning, error } = useFloatingAgentRun();

  async function generate(vars: MemoryAidVariables): Promise<MemoryAidPayload> {
    return run<MemoryAidPayload>({
      agentId: EDU_MEMORY_AGENTS.memoryAid,
      label: "Building your memory aids",
      surfaceKey: "education-memory-create",
      // Reuses the "converter one-shot generation" source-feature tag (this is
      // the same generation family as the ingest fan-out).
      sourceFeature: "education-ingest",
      variables: {
        source_content: vars.source_content,
        title: vars.title,
        focus: vars.focus ?? "",
      },
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      failureMessages: {
        streamError: "The memory-aid agent failed before returning any aids",
        noJson:
          "The memory-aid agent finished but produced no usable aids — try a richer source.",
        timeout: "Timed out waiting for the memory-aid agent",
      },
      coerce: (value) => {
        const payload = coerceMemoryAid(value);
        if (!payload) {
          throw new Error(
            "The memory-aid agent finished but produced no usable aids — try a richer source.",
          );
        }
        return payload;
      },
    });
  }

  return { generate, isGenerating: isRunning, error };
}
