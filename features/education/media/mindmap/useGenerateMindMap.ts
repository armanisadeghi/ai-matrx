"use client";

// features/education/media/mindmap/useGenerateMindMap.ts
//
// Run the Study Mind Map Generator agent → get a `diagram_spec` envelope back,
// via the canonical `useFloatingAgentRun` primitive: the run STREAMS into the
// floating LiveRunWindow, where `diagram_spec` renders as its registered kind
// component while it is written (THE FLOATING LAW — never a spinner while AI
// works). The structured payload is a diagram_spec (nodes + edges) instead of a
// card set. The caller persists the result to study_media and renders it via
// the content-IR diagram renderer.
//
// React Compiler is on: no manual memo.

import { useFloatingAgentRun } from "@/features/agents/hooks/useFloatingAgentRun";
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
  const { run, isRunning, error } = useFloatingAgentRun();

  async function generate(vars: MindMapVariables): Promise<DiagramSpecEnvelope> {
    return run<DiagramSpecEnvelope>({
      agentId: EDU_MEDIA_AGENTS.mindMap,
      label: "Mapping your material",
      surfaceKey: "education-mindmap-create",
      sourceFeature: "education-mindmap",
      variables: {
        source_content: vars.source_content,
        title: vars.title,
        focus: vars.focus ?? "",
      },
      timeoutMs: EXTRACTION_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      failureMessages: {
        streamError: "The mind-map agent failed",
        noJson: "The mind-map agent finished but produced no valid diagram",
        timeout: "Timed out waiting for the mind-map agent",
      },
      coerce: (value) => {
        if (!isDiagramSpec(value)) {
          throw new Error(
            "The mind-map agent finished but produced no valid diagram",
          );
        }
        return value;
      },
    });
  }

  return { generate, isGenerating: isRunning, error };
}
