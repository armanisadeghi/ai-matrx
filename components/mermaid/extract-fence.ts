/**
 * Extract the mermaid diagram an agent produced from its streamed output.
 *
 * Agents are taught (the mermaid skill) to return ONE full ```mermaid fence.
 * We take the LAST complete fence (handles a model that narrates then emits),
 * and as a forgiving fallback accept an unfenced whole-output diagram when the
 * text itself parses as a diagram type.
 */

import { detectDiagramType } from "./diagram-type";

const FENCE_RE = /```(?:mermaid|mmd)\s*\n([\s\S]*?)```/gi;

export function extractMermaidFromOutput(output: string): string | null {
  if (!output.trim()) return null;

  let last: string | null = null;
  for (const match of output.matchAll(FENCE_RE)) {
    const body = match[1].replace(/\s+$/, "");
    if (body.trim()) last = body;
  }
  if (last) return last;

  // Fallback: the whole output (minus prose lines) is a bare diagram.
  const trimmed = output.trim();
  if (detectDiagramType(trimmed) !== "unknown") return trimmed;

  return null;
}

/**
 * True once the streamed output contains a complete mermaid fence — lets the
 * workbench show a live preview the moment the diagram seals, before the
 * agent finishes any trailing prose.
 */
export function hasCompleteMermaidFence(output: string): boolean {
  FENCE_RE.lastIndex = 0;
  return FENCE_RE.test(output);
}
