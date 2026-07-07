"use client";

// features/education/media/mindmap/useGenerateMindMap.ts
//
// Run the Study Mind Map Generator agent → get a `diagram_spec` envelope back.
// Mirrors flashcards' useGenerateCards (launchAgentExecution direct/autoRun +
// waitForExtraction), but the structured payload is a diagram_spec (nodes +
// edges) instead of a card set. The caller persists the result to study_media
// and renders it via the content-IR diagram renderer.
//
// React Compiler is on: no manual memo.

import { useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { RootState } from "@/lib/redux/store";
import { EDU_MEDIA_AGENTS } from "./agents";

const EXTRACTION_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 250;

export interface MindMapVariables {
  source_content: string;
  title: string;
  focus?: string;
}

/** The raw diagram_spec object the agent emits (validated shape lives in the kind). */
export interface DiagramSpecEnvelope {
  __kind: "diagram_spec";
  title: string;
  type?: string;
  description?: string | null;
  nodes: unknown[];
  edges: unknown[];
}

export interface GenerateMindMapResult {
  generate: (vars: MindMapVariables) => Promise<DiagramSpecEnvelope>;
  isGenerating: boolean;
  error: string | null;
}

function isDiagramSpec(v: unknown): v is DiagramSpecEnvelope {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { __kind?: unknown }).__kind === "diagram_spec" &&
    Array.isArray((v as { nodes?: unknown }).nodes)
  );
}

export function useGenerateMindMap(): GenerateMindMapResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function waitForExtraction(requestId: string): Promise<DiagramSpecEnvelope> {
    const start = Date.now();
    while (Date.now() - start < EXTRACTION_TIMEOUT_MS) {
      const state = store.getState() as RootState;
      if (selectJsonExtractionComplete(requestId)(state)) {
        const snapshot = selectFirstExtractedObject(requestId)(state);
        if (!snapshot || !isDiagramSpec(snapshot.value)) {
          throw new Error("The mind-map agent finished but produced no valid diagram");
        }
        return snapshot.value;
      }
      const status = selectRequestStatus(requestId)(state);
      if (status === "error") {
        const reqError = selectRequestError(requestId)(state);
        throw new Error(
          reqError?.user_message ?? reqError?.message ?? "The mind-map agent failed",
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Timed out waiting for the mind-map agent");
  }

  async function generate(vars: MindMapVariables): Promise<DiagramSpecEnvelope> {
    setIsGenerating(true);
    setError(null);
    try {
      const { requestId } = await dispatch(
        launchAgentExecution({
          surfaceKey: "education-mindmap-create",
          agentId: EDU_MEDIA_AGENTS.mindMap,
          sourceFeature: "education-mindmap",
          jsonExtraction: { enabled: true },
          runtime: {
            variables: {
              source_content: vars.source_content,
              title: vars.title,
              focus: vars.focus ?? "",
            },
          },
          config: { autoRun: true, displayMode: "direct" },
        }),
      ).unwrap();

      if (!requestId) throw new Error("Agent launch did not return a request id");
      return await waitForExtraction(requestId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to generate mind map";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  return { generate, isGenerating, error };
}
